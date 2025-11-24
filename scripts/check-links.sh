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
# Note: grep -c returns 1 when no matches found, but still outputs "0"
# We need to capture the output regardless of exit code
BROKEN_COUNT=$(grep -c "^http" "$REPORT_PATH" 2>/dev/null) || BROKEN_COUNT=0

# Set outputs
echo "report_path=$REPORT_PATH" >> "$GITHUB_OUTPUT"
echo "broken_links_count=$BROKEN_COUNT" >> "$GITHUB_OUTPUT"

if [[ $MUFFET_EXIT_CODE -eq 0 ]]; then
    echo "success=true" >> "$GITHUB_OUTPUT"
    echo "::notice::All links are valid!"

    # Write success to step summary
    {
        echo "## Link Check Results"
        echo ""
        echo "**Status:** :white_check_mark: All links are valid!"
        echo "**URL:** ${INPUT_URL}"
    } >> "$GITHUB_STEP_SUMMARY"
else
    echo "success=false" >> "$GITHUB_OUTPUT"
    echo "::warning::Found broken links. See report for details."

    # Write failure to step summary
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
