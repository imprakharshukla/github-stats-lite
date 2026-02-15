const fs = require('fs');

const USERNAME = 'imprakharshukla';
const CONCURRENCY = 5;

async function fetchWithRetry(url, headers, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 202) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) return null;
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (e) {
      if (i === retries - 1) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

async function graphql(token, query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// Get ALL repos: owned + org + contributed to
async function getAllRepos(token) {
  const repos = new Set();
  const headers = { Authorization: `Bearer ${token}` };
  
  // 1. User's own repos (including private)
  let page = 1;
  while (true) {
    const data = await fetchWithRetry(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      headers
    );
    if (!data || !data.length) break;
    data.forEach(r => repos.add(r.full_name));
    page++;
  }
  
  // 2. Orgs the user is part of
  const orgs = await fetchWithRetry('https://api.github.com/user/orgs', headers);
  if (orgs && orgs.length) {
    for (const org of orgs) {
      let orgPage = 1;
      while (true) {
        const orgRepos = await fetchWithRetry(
          `https://api.github.com/orgs/${org.login}/repos?per_page=100&page=${orgPage}`,
          headers
        );
        if (!orgRepos || !orgRepos.length) break;
        orgRepos.forEach(r => repos.add(r.full_name));
        orgPage++;
      }
    }
  }
  
  return Array.from(repos);
}

// Get all-time contributions (paginate through years)
async function getAllTimeContributions(token) {
  let total = 0;
  const currentYear = new Date().getFullYear();
  const startYear = 2015; // GitHub joined year estimate
  
  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    
    const query = `query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar { totalContributions }
        }
      }
    }`;
    
    const data = await graphql(token, query, { username: USERNAME, from, to });
    if (data.data?.user?.contributionsCollection?.contributionCalendar) {
      const yearContribs = data.data.user.contributionsCollection.contributionCalendar.totalContributions;
      total += yearContribs;
      if (yearContribs > 0) console.log(`  ${year}: ${yearContribs} contributions`);
    }
  }
  return total;
}

async function getRepoStats(repo, token) {
  const headers = { Authorization: `Bearer ${token}` };
  
  // ALWAYS get stars/forks from repo metadata
  const repoData = await fetchWithRetry(`https://api.github.com/repos/${repo}`, headers);
  const stars = repoData?.stargazers_count || 0;
  const forks = repoData?.forks_count || 0;
  
  // Get line stats (may be 0 if user hasn't contributed)
  const data = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/stats/contributors`,
    headers
  );
  
  let additions = 0, deletions = 0;
  if (data && Array.isArray(data)) {
    const userStats = data.find(c => c.author?.login?.toLowerCase() === USERNAME.toLowerCase());
    if (userStats) {
      for (const week of userStats.weeks || []) {
        additions += week.a || 0;
        deletions += Math.abs(week.d || 0);
      }
    }
  }
  
  return { additions, deletions, stars, forks };
}

async function processInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    process.stdout.write(`\rProcessed ${Math.min(i + batchSize, items.length)}/${items.length} repos`);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log();
  return results;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN required');
  
  console.log('Fetching all-time contributions...');
  const contributions = await getAllTimeContributions(token);
  console.log(`Total all-time contributions: ${contributions}`);
  
  console.log('\nFetching all repos (owned + org + collaborator)...');
  const repos = await getAllRepos(token);
  console.log(`Found ${repos.length} repos`);
  
  console.log('\nFetching line stats + stars/forks...');
  const stats = await processInBatches(repos, CONCURRENCY, repo => getRepoStats(repo, token));
  
  const totalAdditions = stats.reduce((sum, s) => sum + s.additions, 0);
  const totalDeletions = stats.reduce((sum, s) => sum + s.deletions, 0);
  const totalStars = stats.reduce((sum, s) => sum + s.stars, 0);
  const totalForks = stats.reduce((sum, s) => sum + s.forks, 0);
  
  const output = {
    name: 'Prakhar Shukla',
    stars: totalStars,
    forks: totalForks,
    contributions: contributions,
    lines_changed: totalAdditions + totalDeletions,
    views: 0,
    repos: repos.length,
  };
  
  console.log('\nGenerated:', JSON.stringify(output, null, 2));
  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/overview.json', JSON.stringify(output, null, 4));
  console.log('Saved to generated/overview.json');
}

const start = Date.now();
main()
  .then(() => console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s`))
  .catch(e => console.error('Error:', e.message));
