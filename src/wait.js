const core = require('@actions/core');
const https = require('https');
const http = require('http');

/**
 * Wait for a URL to be accessible and optionally contain specific content
 * @param {string} url - URL to check
 * @param {Object} options - Wait options
 * @param {boolean} options.waitForUrl - Whether to wait for URL accessibility
 * @param {string} options.waitForContent - Regex pattern to match in content
 * @param {number} options.timeout - Maximum time to wait in seconds
 * @param {number} options.interval - Time between retries in seconds
 * @param {boolean} options.skipTlsVerification - Skip TLS certificate verification
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function waitForReady(url, options) {
    const {
        waitForUrl = false,
        waitForContent = '',
        timeout = 300,
        interval = 5,
        skipTlsVerification = false
    } = options;

    // If neither wait option is enabled, return immediately
    if (!waitForUrl && !waitForContent) {
        return { success: true };
    }

    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    const intervalMs = interval * 1000;
    const contentRegex = waitForContent ? new RegExp(waitForContent) : null;

    core.info(`Waiting for URL to be ready: ${url}`);
    if (contentRegex) {
        core.info(`Looking for content matching: ${waitForContent}`);
    }
    core.info(`Timeout: ${timeout}s, Interval: ${interval}s`);

    let attempt = 0;
    while (Date.now() - startTime < timeoutMs) {
        attempt++;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        core.info(`Attempt ${attempt} (${elapsed}s elapsed)...`);

        try {
            const result = await fetchUrl(url, skipTlsVerification);

            if (result.statusCode === 200) {
                core.info(`URL is accessible (HTTP ${result.statusCode})`);

                // If we need to check content
                if (contentRegex) {
                    if (contentRegex.test(result.body)) {
                        core.info(`Content match found!`);
                        return { success: true, content: result.body };
                    } else {
                        core.info(`Content not yet matching, will retry...`);
                    }
                } else {
                    // No content check needed, URL is accessible
                    return { success: true, content: result.body };
                }
            } else {
                core.info(`HTTP ${result.statusCode}, will retry...`);
            }
        } catch (error) {
            core.info(`Request failed: ${error.message}, will retry...`);
        }

        // Wait before next attempt
        await sleep(intervalMs);
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    const errorMsg = contentRegex
        ? `Timeout after ${totalTime}s: Content matching '${waitForContent}' not found`
        : `Timeout after ${totalTime}s: URL not accessible`;

    core.error(errorMsg);
    return { success: false, error: errorMsg };
}

/**
 * Fetch a URL and return status code and body
 */
function fetchUrl(url, skipTlsVerification = false) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 30000,
            rejectUnauthorized: !skipTlsVerification
        };

        const req = protocol.get(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: body
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { waitForReady };
