# GitHub Stats Lite

Lightweight alternative to the full github-stats workflow. Generates contribution stats in ~5 minutes instead of 46 minutes.

## What it does

- Fetches **all-time contributions** (2015-present) via GitHub GraphQL API
- Counts **stars and forks** from all repos (owned + org + collaborator)
- Calculates **lines changed** using GitHub's pre-computed `/stats/contributors` endpoint (the fast way)
- Outputs `generated/overview.json`

## Why it's faster

The old approach iterated through every commit to count lines. This uses GitHub's pre-computed stats, reducing API calls from tens of thousands to ~440.

## Usage

```bash
GITHUB_TOKEN=$(gh auth token) node generate.js
```

Or let GitHub Actions run it daily (see `.github/workflows/generate.yml`).

## Output

```json
{
  "name": "Prakhar Shukla",
  "stars": 3772,
  "forks": 797,
  "contributions": 9382,
  "lines_changed": 15567654,
  "views": 0,
  "repos": 220
}
```
