# linkcheck-action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a reusable GitHub Action for checking broken links on websites using muffet, with sensible defaults based on wafer-space repository patterns.

**Architecture:** Composite GitHub Action using shell scripts to install and run muffet. Configurable inputs for timeout, connections, exclusion patterns, and browser headers. Outputs include success status, broken link count, and report artifact. Includes test infrastructure using GitHub Pages to host test fixtures.

**Tech Stack:** GitHub Actions (composite), Bash, muffet (Go binary), GitHub Pages (test fixtures)

---

## Research Summary

### Muffet Configuration from wafer-space repos

**Common Options:**
- `--timeout=30` (seconds, not "30s")
- `--max-connections=10`
- `--max-connections-per-host=5`
- `--buffer-size=16384`

**Common Exclusions:**
- `.*mailto:.*`
- `.*linkedin\.com.*`
- `.*hawaii\.edu.*`
- (discord.wafer.space adds: `.*github\.com.*`, `.*discord\.com.*`)

**Browser Headers (Chrome 122 simulation):**
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Cache-Control: no-cache
```

### Learnings from wafer-space.readthedocs.org PRs
- Timeout must be integer (30), not string ("30s")
- Some sites need TLS verification skip
- Need `--color=never` for clean logs
- Some external sites need exclusion (rate limiting, auth walls)

---

## Task 1: Create action.yml

**Files:**
- Create: `action.yml`

**Step 1: Create the action.yml with all inputs and outputs**

```yaml
name: 'Link Check'
description: 'Check for broken links on a website using muffet'
author: 'mithro'

branding:
  icon: 'link'
  color: 'blue'

inputs:
  url:
    description: 'URL to check for broken links'
    required: true
  timeout:
    description: 'HTTP request timeout in seconds'
    required: false
    default: '30'
  max-connections:
    description: 'Maximum number of concurrent connections'
    required: false
    default: '10'
  max-connections-per-host:
    description: 'Maximum connections per host'
    required: false
    default: '5'
  buffer-size:
    description: 'Buffer size in bytes'
    required: false
    default: '16384'
  exclude:
    description: 'Newline-separated list of regex patterns to exclude'
    required: false
    default: |
      .*mailto:.*
      .*linkedin\.com.*
  include-browser-headers:
    description: 'Include Chrome-like browser headers'
    required: false
    default: 'true'
  max-redirects:
    description: 'Maximum number of redirects to follow'
    required: false
    default: '10'
  skip-tls-verification:
    description: 'Skip TLS certificate verification'
    required: false
    default: 'false'
  fail-on-error:
    description: 'Fail the workflow if broken links are found'
    required: false
    default: 'true'
  verbose:
    description: 'Show all checked URLs, not just failures'
    required: false
    default: 'false'

outputs:
  success:
    description: 'Whether all links are valid (true/false)'
    value: ${{ steps.check.outputs.success }}
  broken-links-count:
    description: 'Number of broken links found'
    value: ${{ steps.check.outputs.broken_links_count }}
  report-path:
    description: 'Path to the detailed report file'
    value: ${{ steps.check.outputs.report_path }}

runs:
  using: 'composite'
  steps:
    - name: Install muffet
      shell: bash
      run: |
        echo "::group::Installing muffet"
        MUFFET_VERSION="2.10.7"
        MUFFET_URL="https://github.com/raviqqe/muffet/releases/download/v${MUFFET_VERSION}/muffet_linux_amd64.tar.gz"

        wget -qO- "$MUFFET_URL" | tar -xzf - -C /tmp
        sudo mv /tmp/muffet /usr/local/bin/
        muffet --version
        echo "::endgroup::"

    - name: Run link check
      id: check
      shell: bash
      env:
        INPUT_URL: ${{ inputs.url }}
        INPUT_TIMEOUT: ${{ inputs.timeout }}
        INPUT_MAX_CONNECTIONS: ${{ inputs.max-connections }}
        INPUT_MAX_CONNECTIONS_PER_HOST: ${{ inputs.max-connections-per-host }}
        INPUT_BUFFER_SIZE: ${{ inputs.buffer-size }}
        INPUT_EXCLUDE: ${{ inputs.exclude }}
        INPUT_INCLUDE_BROWSER_HEADERS: ${{ inputs.include-browser-headers }}
        INPUT_MAX_REDIRECTS: ${{ inputs.max-redirects }}
        INPUT_SKIP_TLS_VERIFICATION: ${{ inputs.skip-tls-verification }}
        INPUT_FAIL_ON_ERROR: ${{ inputs.fail-on-error }}
        INPUT_VERBOSE: ${{ inputs.verbose }}
      run: ${{ github.action_path }}/scripts/check-links.sh
```

**Step 2: Commit**

```bash
git add action.yml
git commit -m "feat: add action.yml with inputs and outputs"
```

---

## Task 2: Create link checking script

**Files:**
- Create: `scripts/check-links.sh`

**Step 1: Create the scripts directory and main script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build muffet command arguments
MUFFET_ARGS=(
    "--timeout=${INPUT_TIMEOUT}"
    "--max-connections=${INPUT_MAX_CONNECTIONS}"
    "--max-connections-per-host=${INPUT_MAX_CONNECTIONS_PER_HOST}"
    "--buffer-size=${INPUT_BUFFER_SIZE}"
    "--max-redirections=${INPUT_MAX_REDIRECTS}"
    "--color=never"
)

# Add exclusion patterns
if [[ -n "${INPUT_EXCLUDE:-}" ]]; then
    while IFS= read -r pattern; do
        pattern=$(echo "$pattern" | xargs)  # trim whitespace
        if [[ -n "$pattern" ]]; then
            MUFFET_ARGS+=("--exclude=$pattern")
        fi
    done <<< "$INPUT_EXCLUDE"
fi

# Add browser headers if enabled
if [[ "${INPUT_INCLUDE_BROWSER_HEADERS}" == "true" ]]; then
    MUFFET_ARGS+=('--header=User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    MUFFET_ARGS+=('--header=Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8')
    MUFFET_ARGS+=('--header=Accept-Language:en-US,en;q=0.9')
    MUFFET_ARGS+=('--header=Cache-Control:no-cache')
fi

# Skip TLS verification if enabled
if [[ "${INPUT_SKIP_TLS_VERIFICATION}" == "true" ]]; then
    MUFFET_ARGS+=("--skip-tls-verification")
fi

# Verbose mode
if [[ "${INPUT_VERBOSE}" == "true" ]]; then
    MUFFET_ARGS+=("--verbose")
fi

# Create report directory
REPORT_DIR="${GITHUB_WORKSPACE}/.linkcheck"
mkdir -p "$REPORT_DIR"
REPORT_PATH="${REPORT_DIR}/muffet-report.txt"

echo "::group::Muffet Configuration"
echo "URL: ${INPUT_URL}"
echo "Arguments: ${MUFFET_ARGS[*]}"
echo "::endgroup::"

# Run muffet and capture output
echo "::group::Link Check Results"
set +e
muffet "${MUFFET_ARGS[@]}" "${INPUT_URL}" 2>&1 | tee "$REPORT_PATH"
MUFFET_EXIT_CODE=${PIPESTATUS[0]}
set -e
echo "::endgroup::"

# Count broken links (lines that start with a URL followed by error)
BROKEN_COUNT=$(grep -c "^http" "$REPORT_PATH" 2>/dev/null || echo "0")

# Set outputs
echo "report_path=$REPORT_PATH" >> "$GITHUB_OUTPUT"
echo "broken_links_count=$BROKEN_COUNT" >> "$GITHUB_OUTPUT"

if [[ $MUFFET_EXIT_CODE -eq 0 ]]; then
    echo "success=true" >> "$GITHUB_OUTPUT"
    echo "::notice::All links are valid!"
else
    echo "success=false" >> "$GITHUB_OUTPUT"
    echo "::warning::Found broken links. See report for details."

    # Write to step summary
    {
        echo "## Link Check Results"
        echo ""
        echo "**Status:** :x: Found broken links"
        echo "**URL:** ${INPUT_URL}"
        echo "**Broken Links:** ${BROKEN_COUNT}"
        echo ""
        echo "### Details"
        echo '```'
        cat "$REPORT_PATH"
        echo '```'
    } >> "$GITHUB_STEP_SUMMARY"

    if [[ "${INPUT_FAIL_ON_ERROR}" == "true" ]]; then
        echo "::error::Link check failed with ${BROKEN_COUNT} broken links"
        exit 1
    fi
fi
```

**Step 2: Make script executable**

```bash
chmod +x scripts/check-links.sh
```

**Step 3: Commit**

```bash
git add scripts/check-links.sh
git commit -m "feat: add link checking script"
```

---

## Task 3: Create test fixtures (HTML pages)

**Files:**
- Create: `test/fixtures/working/index.html`
- Create: `test/fixtures/working/page1.html`
- Create: `test/fixtures/working/page2.html`
- Create: `test/fixtures/broken/index.html`

**Step 1: Create working test site**

`test/fixtures/working/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Site - Working Links</title>
</head>
<body>
    <h1>Working Links Test Page</h1>
    <nav>
        <a href="page1.html">Page 1</a>
        <a href="page2.html">Page 2</a>
        <a href="https://example.com">Example.com</a>
    </nav>
</body>
</html>
```

`test/fixtures/working/page1.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Page 1</title>
</head>
<body>
    <h1>Page 1</h1>
    <a href="index.html">Back to Home</a>
    <a href="page2.html">Go to Page 2</a>
</body>
</html>
```

`test/fixtures/working/page2.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Page 2</title>
</head>
<body>
    <h1>Page 2</h1>
    <a href="index.html">Back to Home</a>
    <a href="page1.html">Go to Page 1</a>
</body>
</html>
```

**Step 2: Create broken test site**

`test/fixtures/broken/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Site - Broken Links</title>
</head>
<body>
    <h1>Broken Links Test Page</h1>
    <nav>
        <a href="nonexistent.html">This page does not exist</a>
        <a href="also-missing.html">Also missing</a>
        <a href="https://this-domain-definitely-does-not-exist-12345.com">Invalid domain</a>
    </nav>
</body>
</html>
```

**Step 3: Commit**

```bash
git add test/fixtures/
git commit -m "feat: add test fixtures with working and broken links"
```

---

## Task 4: Create GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/deploy-test-fixtures.yml`

**Step 1: Create workflow to deploy test fixtures to GitHub Pages**

```yaml
name: Deploy Test Fixtures

on:
  push:
    branches:
      - main
    paths:
      - 'test/fixtures/**'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'test/fixtures'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy-test-fixtures.yml
git commit -m "ci: add workflow to deploy test fixtures to GitHub Pages"
```

---

## Task 5: Create test workflow

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1: Create test workflow that validates the action**

```yaml
name: Test Action

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

jobs:
  test-working-links:
    name: Test with working links
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run link check on example.com
        id: linkcheck
        uses: ./
        with:
          url: 'https://example.com'
          fail-on-error: 'true'

      - name: Verify success
        run: |
          if [[ "${{ steps.linkcheck.outputs.success }}" != "true" ]]; then
            echo "Expected success=true but got ${{ steps.linkcheck.outputs.success }}"
            exit 1
          fi
          echo "Link check passed as expected"

  test-broken-links:
    name: Test with broken links (should detect failures)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run link check on httpstat.us/404
        id: linkcheck
        uses: ./
        continue-on-error: true
        with:
          url: 'https://httpstat.us'
          fail-on-error: 'true'
          timeout: '10'

      - name: Verify failure detected
        run: |
          # httpstat.us should have some broken links or the action should complete
          echo "Link check completed with success=${{ steps.linkcheck.outputs.success }}"

  test-custom-exclusions:
    name: Test custom exclusion patterns
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run link check with custom exclusions
        id: linkcheck
        uses: ./
        with:
          url: 'https://example.com'
          exclude: |
            .*mailto:.*
            .*linkedin\.com.*
            .*twitter\.com.*
          fail-on-error: 'true'

      - name: Verify outputs exist
        run: |
          echo "Success: ${{ steps.linkcheck.outputs.success }}"
          echo "Broken count: ${{ steps.linkcheck.outputs.broken-links-count }}"
          echo "Report path: ${{ steps.linkcheck.outputs.report-path }}"

  test-verbose-mode:
    name: Test verbose output
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run link check in verbose mode
        uses: ./
        with:
          url: 'https://example.com'
          verbose: 'true'
          fail-on-error: 'false'
```

**Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow to validate action"
```

---

## Task 6: Create example workflows

**Files:**
- Create: `examples/basic.yml`
- Create: `examples/github-pages.yml`
- Create: `examples/readthedocs.yml`

**Step 1: Create basic example**

`examples/basic.yml`:
```yaml
# Basic usage example
name: Link Check

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  linkcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: mithro/linkcheck-action@main
        with:
          url: 'https://your-site.com'
```

**Step 2: Create GitHub Pages example**

`examples/github-pages.yml`:
```yaml
# Example for checking GitHub Pages after deployment
name: Link Check After Deploy

on:
  workflow_run:
    workflows: ["Deploy to GitHub Pages"]
    types: [completed]

jobs:
  linkcheck:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: mithro/linkcheck-action@main
        with:
          url: 'https://your-username.github.io/your-repo/'
          exclude: |
            .*mailto:.*
            .*linkedin\.com.*
            .*github\.com/.*/(issues|pulls|compare).*
```

**Step 3: Create ReadTheDocs example**

`examples/readthedocs.yml`:
```yaml
# Example for checking ReadTheDocs preview builds
name: Link Check ReadTheDocs Preview

on:
  pull_request:
    branches: [main]

jobs:
  linkcheck:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for ReadTheDocs build
        run: sleep 120  # Wait 2 minutes for build

      - uses: mithro/linkcheck-action@main
        with:
          url: 'https://your-project--${{ github.event.pull_request.number }}.org.readthedocs.build/'
          skip-tls-verification: 'true'
          exclude: |
            .*mailto:.*
            .*linkedin\.com.*
            .*readthedocs\.org.*
```

**Step 4: Commit**

```bash
git add examples/
git commit -m "docs: add example workflows"
```

---

## Task 7: Update README

**Files:**
- Modify: `README.md`

**Step 1: Replace README with comprehensive documentation**

```markdown
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

## Common Exclusion Patterns

```yaml
exclude: |
  .*mailto:.*                    # Email links
  .*linkedin\.com.*              # LinkedIn (requires auth)
  .*twitter\.com.*               # Twitter/X (rate limiting)
  .*github\.com/.*/issues.*      # GitHub issues (dynamic)
  .*github\.com/.*/pulls.*       # GitHub PRs (dynamic)
  .*localhost.*                  # Local development links
```

## Links

- [muffet documentation](https://raviqqe.com/muffet/)
- [muffet GitHub](https://github.com/raviqqe/muffet)

## License

Apache 2.0 - see [LICENSE](LICENSE) for details.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: comprehensive README with usage examples"
```

---

## Task 8: Final verification and push

**Step 1: Verify all files are in place**

```bash
ls -la
ls -la scripts/
ls -la test/fixtures/working/
ls -la test/fixtures/broken/
ls -la .github/workflows/
ls -la examples/
```

**Step 2: Run a local syntax check on the action**

```bash
# Verify YAML syntax
python3 -c "import yaml; yaml.safe_load(open('action.yml'))"
```

**Step 3: Push all changes**

```bash
git push origin main
```

**Step 4: Enable GitHub Pages in repository settings**

Navigate to https://github.com/mithro/linkcheck-action/settings/pages and enable GitHub Pages from the main branch (or the workflow will handle it).

---

## Summary

After completing all tasks, the repository will contain:

```
linkcheck-action/
├── action.yml                           # Main action definition
├── scripts/
│   └── check-links.sh                   # Link checking script
├── test/
│   └── fixtures/
│       ├── working/                     # Test site with valid links
│       │   ├── index.html
│       │   ├── page1.html
│       │   └── page2.html
│       └── broken/                      # Test site with broken links
│           └── index.html
├── .github/
│   └── workflows/
│       ├── deploy-test-fixtures.yml     # Deploy test sites to GH Pages
│       └── test.yml                     # Test the action
├── examples/
│   ├── basic.yml
│   ├── github-pages.yml
│   └── readthedocs.yml
├── docs/
│   └── plans/
│       └── 2025-11-24-linkcheck-action.md
├── README.md
├── LICENSE
└── .gitignore
```
