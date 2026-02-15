const fs = require('fs');

const USERNAME = 'imprakharshukla';
const CONCURRENCY = 5; // Lower to avoid rate limits

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

async function getRepos(token) {
  const repos = [];
  let page = 1;
  const headers = { Authorization: `Bearer ${token}` };
  
  while (true) {
    const data = await fetchWithRetry(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`,
      headers
    );
    if (!data || !data.length) break;
    repos.push(...data.map(r => r.full_name));
    page++;
  }
  return repos;
}

async function getRepoStats(repo, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const data = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/stats/contributors`,
    headers
  );
  
  if (!data || !Array.isArray(data)) return { additions: 0, deletions: 0 };
  
  const userStats = data.find(c => c.author?.login?.toLowerCase() === USERNAME.toLowerCase());
  if (!userStats) return { additions: 0, deletions: 0 };
  
  let additions = 0, deletions = 0;
  for (const week of userStats.weeks || []) {
    additions += week.a || 0;
    deletions += Math.abs(week.d || 0);
  }
  return { additions, deletions };
}

async function processInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    process.stdout.write(`\rProcessed ${Math.min(i + batchSize, items.length)}/${items.length} repos`);
    await new Promise(r => setTimeout(r, 500)); // Small delay between batches
  }
  console.log();
  return results;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN required');
  
  console.log('Fetching repos...');
  const repos = await getRepos(token);
  console.log(`Found ${repos.length} repos`);
  
  console.log('Fetching line stats (parallel)...');
  const stats = await processInBatches(repos, CONCURRENCY, repo => getRepoStats(repo, token));
  
  const totalAdditions = stats.reduce((sum, s) => sum + s.additions, 0);
  const totalDeletions = stats.reduce((sum, s) => sum + s.deletions, 0);
  const linesChanged = totalAdditions + totalDeletions;
  
  // GraphQL for other stats
  const query = `query($username: String!) {
    user(login: $username) {
      name
      contributionsCollection { contributionCalendar { totalContributions } }
      repositories(ownerAffiliations: OWNER, first: 100) {
        totalCount
        nodes { stargazerCount forkCount }
      }
    }
  }`;
  
  const gqlRes = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { username: USERNAME } }),
  });
  const gqlData = await gqlRes.json();
  const user = gqlData.data.user;
  
  const output = {
    name: user.name,
    stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
    forks: user.repositories.nodes.reduce((sum, r) => sum + r.forkCount, 0),
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    lines_changed: linesChanged,
    views: 0,
    repos: user.repositories.totalCount,
  };
  
  console.log('\nGenerated:', JSON.stringify(output, null, 2));
  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/overview.json', JSON.stringify(output, null, 4));
  console.log('Saved to generated/overview.json');
}

const start = Date.now();
main()
  .then(() => console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`))
  .catch(e => console.error('Error:', e.message));
