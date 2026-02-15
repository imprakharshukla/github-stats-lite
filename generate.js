const fs = require('fs');

async function fetchStats() {
  const token = process.env.GITHUB_TOKEN;
  const username = 'imprakharshukla';
  
  // GraphQL query to get all stats in one go
  const query = `
    query($username: String!) {
      user(login: $username) {
        name
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
        }
        repositories(ownerAffiliations: OWNER, first: 100, privacy: PUBLIC) {
          totalCount
          nodes {
            stargazerCount
            forkCount
          }
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
  const user = data.data.user;
  
  const stats = {
    name: user.name,
    stars: user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    forks: user.repositories.nodes.reduce((sum, repo) => sum + repo.forkCount, 0),
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    lines_changed: 0, // Skip - too expensive
    views: 0, // Skip - requires separate API calls
    repos: user.repositories.totalCount,
  };
  
  console.log('Generated stats:', stats);
  
  // Write to file
  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/overview.json', JSON.stringify(stats, null, 4));
  console.log('Written to generated/overview.json');
}

fetchStats().catch(console.error);
