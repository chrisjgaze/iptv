const ChromecastAPI = require('chromecast-api');
const { PROXY_PORT } = require('../config/constants');
const { getLocalIP } = require('../utils/network-utils');
const { getMainWindow } = require('../core/window-manager');

// ============================================================================
// CHROMECAST PLAYER MANAGEMENT
// ============================================================================

const castClient = new ChromecastAPI();

// Cache devices by friendly name
let castDevices = {};
let activeCastDeviceName = null;

// Polling state
let pollTimer = null;

// Queue of device names discovered before the UI is ready to receive events
const pendingDeviceNames = new Set();
let flushHookAttached = false;

/**
 * Initialize Chromecast discovery listener (call once at app startup).
 */
function initializeChromecast() {
    // Avoid registering multiple times if initializeChromecast is called twice
    castClient.removeAllListeners('device');
    castClient.on('device', handleDeviceFound);
    startDevicePolling();

    console.log('[Chromecast] Service initialized');
}

/**
 * Internal: send the "cast-device-found" event to renderer.
 * If the window isn't ready, queue and flush later.
 */
function notifyRendererDeviceFound(name) {
    const win = getMainWindow();

    if (!win || win.isDestroyed()) {
        // No window yet: queue it
        pendingDeviceNames.add(name);
        console.log('[Chromecast] No main window; queued device for later:', name);
        return;
    }

    const wc = win.webContents;

    // If the window is still loading, queue + flush after load
    if (wc.isLoading()) {
        pendingDeviceNames.add(name);
        console.log('[Chromecast] Window loading; queued device:', name);

        // Attach a single flush hook
        attachFlushOnLoad(win);
        return;
    }

    // Window ready: send immediately
    console.log('[Chromecast] Sending cast-device-found to renderer:', name);
    wc.send('cast-device-found', name);
}

/**
 * Internal: attach did-finish-load handler once, then flush queued devices.
 */
function attachFlushOnLoad(win) {
    if (flushHookAttached) return;
    flushHookAttached = true;

    const wc = win.webContents;

    wc.once('did-finish-load', () => {
        flushHookAttached = false;
        flushPendingDeviceNames();
    });
}

/**
 * Flush any queued device-found events to the renderer.
 */
function flushPendingDeviceNames() {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    const wc = win.webContents;
    if (wc.isLoading()) return;

    if (pendingDeviceNames.size === 0) return;

    console.log('[Chromecast] Flushing queued devices:', Array.from(pendingDeviceNames));

    for (const name of pendingDeviceNames) {
        wc.send('cast-device-found', name);
    }
    pendingDeviceNames.clear();
}

/**
 * Called by chromecast-api when a device is discovered.
 */
function handleDeviceFound(device) {
    const name = device.friendlyName || device.name;
    if (!name) return;

    if (castDevices[name]) {
        return; // Already registered
    }

    console.log(`[Chromecast] Found device: ${name} at ${device.host}`);
    castDevices[name] = device;

    // Notify UI (reliably)
    notifyRendererDeviceFound(name);
}

/**
 * Start polling for devices (calls castClient.update() repeatedly).
 * Useful if discovery is flaky on your network or you want ongoing updates.
 */
function startDevicePolling(intervalMs = 3000) {
    if (pollTimer) {
        console.log('[Chromecast] Polling already running');
        return;
    }

    console.log(`[Chromecast] Starting device polling every ${intervalMs}ms`);

    // Kick once immediately
    try {
        castClient.update();
    } catch (e) {
        console.error('[Chromecast] Poll update error (initial):', e);
    }

    pollTimer = setInterval(() => {
        try {
            castClient.update();
        } catch (e) {
            console.error('[Chromecast] Poll update error:', e);
        }
    }, intervalMs);
}

/**
 * Stop polling for devices.
 */
function stopDevicePolling() {
    if (!pollTimer) return;

    clearInterval(pollTimer);
    pollTimer = null;

    console.log('[Chromecast] Device polling stopped');
}

/**
 * One-shot scan trigger (fires discovery; returns currently known device names).
 * Note: discovery is async; new devices may arrive after this returns via event.
 */
function scanForDevices() {
    console.log('[Chromecast] Scan requested (trigger update)');
    castClient.update();
    return Object.keys(castDevices);
}

/**
 * Optional helper if you want to clear the cache (e.g. when switching networks).
 */
function clearDeviceCache() {
    castDevices = {};
    activeCastDeviceName = null;
    pendingDeviceNames.clear();
    console.log('[Chromecast] Device cache cleared');
}

function buildProxyUrl(streamUrl) {
    const localIP = getLocalIP();
    return `http://${localIP}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
}

async function playOnChromecast(deviceName, streamUrl) {
    const device = castDevices[deviceName];

    if (!device) {
        console.error(`[Cast] Playback failed: Device "${deviceName}" not found in cache.`);
        return { success: false, error: 'Device not found' };
    }

    activeCastDeviceName = deviceName;
    const proxyUrl = buildProxyUrl(streamUrl);

    console.log(`[Cast] Sending stream to ${deviceName}...`);
    console.log(`[Cast] Original URL: ${streamUrl}`);
    console.log(`[Cast] Proxy URL: ${proxyUrl}`);

    return new Promise((resolve) => {
        device.play(proxyUrl, (err) => {
            if (err) {
                console.error(`[Cast] Playback Error on ${deviceName}:`, err.message);
                resolve({ success: false, error: err.message });
            } else {
                console.log(`[Cast] Playback started successfully on ${deviceName}`);
                resolve({ success: true });
            }
        });
    });
}

async function stopChromecast(deviceName) {
    const name = deviceName || activeCastDeviceName;
    const device = castDevices[name];

    if (!device) {
        return { success: false };
    }

    return new Promise((resolve) => {
        device.stop(() => {
            if (name === activeCastDeviceName) {
                activeCastDeviceName = null;
            }
            resolve({ success: true });
        });
    });
}

function getActiveCastDevice() {
    return activeCastDeviceName;
}

function getAllDevices() {
    return Object.keys(castDevices);
}

module.exports = {
    initializeChromecast,

    // Scanning / polling
    scanForDevices,
    startDevicePolling,
    stopDevicePolling,
    clearDeviceCache,

    // Playback
    playOnChromecast,
    stopChromecast,

    // State
    getActiveCastDevice,
    getAllDevices,
};
