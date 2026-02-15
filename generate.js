const fs = require('fs');

async function fetchStats() {
  const token = process.env.GITHUB_TOKEN;
  const username = 'imprakharshukla';
  
  // GraphQL query - includes ALL repos (public + private)
  const query = `
    query($username: String!) {
      user(login: $username) {
        name
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
        }
        repositories(ownerAffiliations: OWNER, first: 100) {
          totalCount
          nodes {
            stargazerCount
            forkCount
          }
        }
        repositoriesContributedTo(first: 100, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY]) {
          totalCount
        }
      }
    }
  `;
  
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { username } }),
  });
  
  const data = await response.json();
  
  if (data.errors) {
    console.error('GraphQL errors:', data.errors);
    process.exit(1);
  }
  
  const user = data.data.user;
  
  const stats = {
    name: user.name,
    stars: user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    forks: user.repositories.nodes.reduce((sum, repo) => sum + repo.forkCount, 0),
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    // Cache lines_changed from last full run - too expensive to calculate
    lines_changed: 13726580,
    views: 0, // Requires separate REST API calls per repo
    repos: user.repositories.totalCount + user.repositoriesContributedTo.totalCount,
  };
  
  console.log('Generated stats:', JSON.stringify(stats, null, 2));
  console.log('\nTime: ~2 seconds (vs 46 minutes for full calculation)');
  
  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/overview.json', JSON.stringify(stats, null, 4));
}

fetchStats().catch(console.error);
