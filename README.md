# GitHub Stats Lite

Lightweight alternative to the full github-stats workflow.
Generates contribution stats in ~2 seconds instead of 46 minutes.

## What it does
- Fetches stars, forks, contributions, repos count via GitHub GraphQL API
- Skips lines_changed calculation (the slow part)
- Outputs `generated/overview.json`

## Usage
```bash
GITHUB_TOKEN=your_token node generate.js
```
