const core = require('@actions/core');
const { waitForReady } = require('./wait');
const { installMuffet, runMuffet } = require('./muffet');

async function run() {
    try {
        // Get inputs
        const url = core.getInput('url', { required: true });
        const timeout = parseInt(core.getInput('timeout') || '30', 10);
        const maxConnections = parseInt(core.getInput('max-connections') || '10', 10);
        const maxConnectionsPerHost = parseInt(core.getInput('max-connections-per-host') || '5', 10);
        const bufferSize = parseInt(core.getInput('buffer-size') || '16384', 10);
        const maxRedirects = parseInt(core.getInput('max-redirects') || '10', 10);
        const excludeInput = core.getInput('exclude') || '';
        const exclude = excludeInput.split('\n').map(s => s.trim()).filter(Boolean);
        const includeBrowserHeaders = core.getInput('include-browser-headers') !== 'false';
        const skipTlsVerification = core.getInput('skip-tls-verification') === 'true';
        const failOnError = core.getInput('fail-on-error') !== 'false';
        const verbose = core.getInput('verbose') === 'true';

        // Wait-for-ready inputs
        const waitForUrl = core.getInput('wait-for-url') === 'true';
        const waitForContent = core.getInput('wait-for-content') || '';
        const waitTimeout = parseInt(core.getInput('wait-timeout') || '300', 10);
        const waitInterval = parseInt(core.getInput('wait-interval') || '5', 10);

        // Step 1: Wait for URL to be ready (if configured)
        if (waitForUrl || waitForContent) {
            core.info('');
            core.info('='.repeat(60));
            core.info('WAITING FOR URL TO BE READY');
            core.info('='.repeat(60));

            const waitResult = await waitForReady(url, {
                waitForUrl: waitForUrl || !!waitForContent,
                waitForContent,
                timeout: waitTimeout,
                interval: waitInterval,
                skipTlsVerification
            });

            if (!waitResult.success) {
                core.setOutput('success', 'false');
                core.setOutput('broken-links-count', '0');
                core.setFailed(waitResult.error);
                return;
            }

            core.info('URL is ready, proceeding with link check...');
            core.info('');
        }

        // Step 2: Install muffet
        const muffetPath = await installMuffet();

        // Step 3: Run link check
        const result = await runMuffet(muffetPath, url, {
            timeout,
            maxConnections,
            maxConnectionsPerHost,
            bufferSize,
            maxRedirects,
            exclude,
            includeBrowserHeaders,
            skipTlsVerification,
            verbose
        });

        // Set outputs
        const success = result.exitCode === 0;
        core.setOutput('success', success.toString());
        core.setOutput('broken-links-count', result.brokenCount.toString());
        core.setOutput('report-path', result.reportPath);

        // Write to step summary
        await writeSummary(url, success, result.brokenCount, result.output);

        // Handle result
        if (success) {
            core.notice('All links are valid!');
        } else {
            core.warning(`Found ${result.brokenCount} broken links. See report for details.`);

            if (failOnError) {
                core.setFailed(`Link check failed with ${result.brokenCount} broken links`);
            }
        }

    } catch (error) {
        core.setFailed(`Action failed: ${error.message}`);
    }
}

async function writeSummary(url, success, brokenCount, output) {
    const summary = core.summary;

    summary.addHeading('Link Check Results', 2);
    summary.addEOL();

    if (success) {
        summary.addRaw('**Status:** :white_check_mark: All links are valid!');
    } else {
        summary.addRaw('**Status:** :x: Found broken links');
    }
    summary.addEOL();
    summary.addRaw(`**URL:** ${url}`);
    summary.addEOL();

    if (!success) {
        summary.addRaw(`**Broken Links:** ${brokenCount}`);
        summary.addEOL();
        summary.addEOL();
        summary.addHeading('Details', 3);
        summary.addCodeBlock(output, 'text');
    }

    await summary.write();
}

run();
