# linkcheck-action

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test Action](https://github.com/mithro/linkcheck-action/actions/workflows/test.yml/badge.svg)](https://github.com/mithro/linkcheck-action/actions/workflows/test.yml)

A reusable GitHub Action for checking broken links on websites using [muffet](https://github.com/raviqqe/muffet).

## Features

- Fast recursive link checking using muffet
- Configurable timeouts, connection limits, and exclusion patterns
- Browser-like headers to avoid bot detection
- Detailed reports in GitHub Step Summary
- Support for GitHub Pages, ReadTheDocs, and any website

## Quick Start

```yaml
- uses: mithro/linkcheck-action@main
  with:
    url: 'https://your-site.com'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | - | URL to check for broken links |
| `timeout` | No | `30` | HTTP request timeout in seconds |
| `max-connections` | No | `10` | Maximum concurrent connections |
| `max-connections-per-host` | No | `5` | Maximum connections per host |
| `buffer-size` | No | `16384` | Buffer size in bytes |
| `exclude` | No | `.*mailto:.*`<br>`.*linkedin\.com.*` | Newline-separated regex patterns to exclude |
| `include-browser-headers` | No | `true` | Send Chrome-like headers |
| `max-redirects` | No | `10` | Maximum redirects to follow |
| `skip-tls-verification` | No | `false` | Skip TLS certificate verification |
| `fail-on-error` | No | `true` | Fail workflow on broken links |
| `verbose` | No | `false` | Show all URLs, not just failures |

## Outputs

| Output | Description |
|--------|-------------|
| `success` | `true` if no broken links found |
| `broken-links-count` | Number of broken links |
| `report-path` | Path to detailed report file |

## Examples

### Basic Usage

```yaml
name: Link Check
on:
  push:
    branches: [main]

jobs:
  linkcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: mithro/linkcheck-action@main
        with:
          url: 'https://your-site.com'
```

### With Custom Exclusions

```yaml
- uses: mithro/linkcheck-action@main
  with:
    url: 'https://your-site.com'
    exclude: |
      .*mailto:.*
      .*linkedin\.com.*
      .*twitter\.com.*
      .*github\.com/.*/(issues|pulls).*
```

### GitHub Pages After Deployment

```yaml
name: Link Check After Deploy
on:
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]

jobs:
  linkcheck:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: mithro/linkcheck-action@main
        with:
          url: 'https://username.github.io/repo/'
```

### ReadTheDocs Preview

```yaml
name: Link Check PR Preview
on:
  pull_request:

jobs:
  linkcheck:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for build
        run: sleep 120

      - uses: mithro/linkcheck-action@main
        with:
          url: 'https://project--${{ github.event.pull_request.number }}.org.readthedocs.build/'
          skip-tls-verification: 'true'
```

### Non-Blocking Check

```yaml
- uses: mithro/linkcheck-action@main
  id: linkcheck
  with:
    url: 'https://your-site.com'
    fail-on-error: 'false'

- name: Report results
  run: |
    echo "Found ${{ steps.linkcheck.outputs.broken-links-count }} broken links"
```

### With PR Comment

```yaml
- uses: mithro/linkcheck-action@main
  id: linkcheck
  with:
    url: 'https://preview.site.com/pr-${{ github.event.pull_request.number }}/'
    fail-on-error: 'false'

- name: Comment on PR
  if: always()
  uses: actions/github-script@v7
  with:
    script: |
      const success = '${{ steps.linkcheck.outputs.success }}' === 'true';
      const body = success
        ? ':white_check_mark: All links are valid!'
        : ':x: Found broken links. See workflow run for details.';
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: body
      });
```

## Common Exclusion Patterns

```yaml
exclude: |
  .*mailto:.*                    # Email links
  .*linkedin\.com.*              # LinkedIn (requires auth)
  .*twitter\.com.*               # Twitter/X (rate limiting)
  .*github\.com/.*/issues.*      # GitHub issues (dynamic)
  .*github\.com/.*/pulls.*       # GitHub PRs (dynamic)
  .*localhost.*                  # Local development links
  .*127\.0\.0\.1.*               # Local development links
```

## Default Configuration

This action uses sensible defaults based on the [wafer-space](https://github.com/wafer-space) repositories:

- **Timeout:** 30 seconds per request
- **Connections:** 10 total, 5 per host
- **Headers:** Chrome 122 browser simulation
- **Exclusions:** mailto links and LinkedIn (requires authentication)

## Links

- [muffet documentation](https://raviqqe.com/muffet/)
- [muffet GitHub](https://github.com/raviqqe/muffet)

## License

Apache 2.0 - see [LICENSE](LICENSE) for details.
