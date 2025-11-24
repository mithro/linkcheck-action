const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MUFFET_VERSION = '2.10.7';

/**
 * Install muffet binary
 * @returns {Promise<string>} Path to muffet binary
 */
async function installMuffet() {
    core.startGroup('Installing muffet');

    // Check cache first
    let muffetPath = tc.find('muffet', MUFFET_VERSION);

    if (!muffetPath) {
        core.info(`Downloading muffet v${MUFFET_VERSION}...`);

        // Determine platform and architecture
        const platform = os.platform();
        const arch = os.arch();

        let downloadUrl;
        let extractedName = 'muffet';

        if (platform === 'linux' && arch === 'x64') {
            downloadUrl = `https://github.com/raviqqe/muffet/releases/download/v${MUFFET_VERSION}/muffet_linux_amd64.tar.gz`;
        } else if (platform === 'darwin' && arch === 'x64') {
            downloadUrl = `https://github.com/raviqqe/muffet/releases/download/v${MUFFET_VERSION}/muffet_darwin_amd64.tar.gz`;
        } else if (platform === 'darwin' && arch === 'arm64') {
            downloadUrl = `https://github.com/raviqqe/muffet/releases/download/v${MUFFET_VERSION}/muffet_darwin_arm64.tar.gz`;
        } else if (platform === 'win32') {
            downloadUrl = `https://github.com/raviqqe/muffet/releases/download/v${MUFFET_VERSION}/muffet_windows_amd64.zip`;
            extractedName = 'muffet.exe';
        } else {
            throw new Error(`Unsupported platform: ${platform}/${arch}`);
        }

        // Download
        const downloadPath = await tc.downloadTool(downloadUrl);

        // Extract
        let extractedPath;
        if (downloadUrl.endsWith('.zip')) {
            extractedPath = await tc.extractZip(downloadPath);
        } else {
            extractedPath = await tc.extractTar(downloadPath);
        }

        // Cache for future runs
        muffetPath = await tc.cacheDir(extractedPath, 'muffet', MUFFET_VERSION);
    }

    const muffetBinary = path.join(muffetPath, os.platform() === 'win32' ? 'muffet.exe' : 'muffet');

    // Make executable on Unix
    if (os.platform() !== 'win32') {
        await exec.exec('chmod', ['+x', muffetBinary]);
    }

    // Verify installation
    await exec.exec(muffetBinary, ['--version']);

    core.endGroup();
    return muffetBinary;
}

/**
 * Run muffet link checker
 * @param {string} muffetPath - Path to muffet binary
 * @param {string} url - URL to check
 * @param {Object} options - Muffet options
 * @returns {Promise<{exitCode: number, output: string, brokenCount: number}>}
 */
async function runMuffet(muffetPath, url, options) {
    const {
        timeout = 30,
        maxConnections = 10,
        maxConnectionsPerHost = 5,
        bufferSize = 16384,
        maxRedirects = 10,
        exclude = [],
        includeBrowserHeaders = true,
        skipTlsVerification = false,
        verbose = false
    } = options;

    // Build arguments
    const args = [
        `--timeout=${timeout}`,
        `--max-connections=${maxConnections}`,
        `--max-connections-per-host=${maxConnectionsPerHost}`,
        `--buffer-size=${bufferSize}`,
        `--max-redirections=${maxRedirects}`,
        '--color=never'
    ];

    // Add exclusion patterns
    for (const pattern of exclude) {
        if (pattern.trim()) {
            args.push(`--exclude=${pattern.trim()}`);
        }
    }

    // Add browser headers
    if (includeBrowserHeaders) {
        args.push('--header=User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        args.push('--header=Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
        args.push('--header=Accept-Language:en-US,en;q=0.9');
        args.push('--header=Cache-Control:no-cache');
    }

    // Skip TLS verification
    if (skipTlsVerification) {
        args.push('--skip-tls-verification');
    }

    // Verbose mode
    if (verbose) {
        args.push('--verbose');
    }

    // Add URL
    args.push(url);

    core.startGroup('Muffet Configuration');
    core.info(`URL: ${url}`);
    core.info(`Arguments: ${args.join(' ')}`);
    core.endGroup();

    // Create report directory
    const reportDir = path.join(process.env.GITHUB_WORKSPACE || '.', '.linkcheck');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }
    const reportPath = path.join(reportDir, 'muffet-report.txt');

    // Run muffet and capture output
    let output = '';
    let exitCode = 0;

    core.startGroup('Link Check Results');
    try {
        exitCode = await exec.exec(muffetPath, args, {
            ignoreReturnCode: true,
            listeners: {
                stdout: (data) => {
                    output += data.toString();
                    process.stdout.write(data);
                },
                stderr: (data) => {
                    output += data.toString();
                    process.stderr.write(data);
                }
            }
        });
    } catch (error) {
        core.warning(`Muffet execution error: ${error.message}`);
        exitCode = 1;
    }
    core.endGroup();

    // Write report
    fs.writeFileSync(reportPath, output);

    // Count broken links (lines starting with http)
    const brokenCount = output.split('\n').filter(line => line.match(/^https?:\/\//)).length;

    return {
        exitCode,
        output,
        brokenCount,
        reportPath
    };
}

module.exports = { installMuffet, runMuffet };
