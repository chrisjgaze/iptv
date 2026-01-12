const { spawn } = require('child_process');
const { DEFAULT_VLC_PATHS, VLC_CLOSE_DELAY } = require('../config/constants');
const { loadConfig } = require('../services/config-service');

// ============================================================================
// VLC PLAYER MANAGEMENT
// ============================================================================

let vlcProcess = null;

function determineVlcPath(customPath) {
    if (customPath) {
        return customPath;
    }

    const config = loadConfig();
    if (config.vlcPath) {
        return config.vlcPath;
    }

    // Default paths by platform
    return DEFAULT_VLC_PATHS[process.platform] || DEFAULT_VLC_PATHS.linux;
}

async function closeExistingVlcProcess() {
    if (!vlcProcess || vlcProcess.killed) {
        return;
    }

    console.log(`Closing existing VLC process to reuse window...`);
    vlcProcess.kill();
    vlcProcess = null;

    // Wait for VLC to close
    await new Promise(resolve => setTimeout(resolve, VLC_CLOSE_DELAY));
}

function buildVlcArgs(streamUrl, title) {
    const args = [streamUrl, '--one-instance', '--playlist-enqueue'];

    if (title) {
        args.push(`--meta-title=${title}`);
    }

    return args;
}

async function launchVLC(streamUrl, customVlcPath, title) {
    try {
        const vlcPath = determineVlcPath(customVlcPath);

        await closeExistingVlcProcess();

        console.log(`Launching VLC: ${vlcPath} -> ${streamUrl}`);

        const args = buildVlcArgs(streamUrl, title);
        vlcProcess = spawn(vlcPath, args, { stdio: 'ignore' });

        vlcProcess.on('exit', () => {
            console.log(`VLC process exited`);
            vlcProcess = null;
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function isVLCRunning() {
    return vlcProcess !== null && !vlcProcess.killed;
}

module.exports = {
    launchVLC,
    isVLCRunning
};
