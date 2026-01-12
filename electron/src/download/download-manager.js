const path = require('path');
const { DOWNLOAD_FORCE_CANCEL_DELAY } = require('../config/constants');
const { getProfileCachePaths } = require('../services/profile-service');
const { ensureDirectoryExists } = require('../utils/file-utils');
const { sanitizeFilename } = require('../utils/format-utils');
const { windowExists, getMainWindow } = require('../core/window-manager');
const {
    downloadDirect,
    downloadHLS,
    downloadStream,
    downloadElectron
} = require('./download-strategies');

// ============================================================================
// DOWNLOAD QUEUE MANAGER
// ============================================================================

const activeDownloads = {};
const downloadQueue = [];
let currentDownload = null;

function getActiveDownloads() {
    return activeDownloads;
}

function finishDownloadTask(id) {
    const isCurrentTask = currentDownload && currentDownload.id === id;

    if (!isCurrentTask) {
        console.log(`[Queue] finishTask called for ${id}, but currentDownload is ${currentDownload ? currentDownload.id : 'null'}. Skipping.`);
        return;
    }

    console.log(`[Queue] Task ${id} finished. Clearing currentDownload.`);
    currentDownload = null;

    // Schedule next task on next tick to avoid deep recursion
    setImmediate(() => processDownloadQueue());
}

async function processDownloadQueue() {
    console.log(`[Queue] processDownloadQueue called. Current: ${currentDownload ? currentDownload.id : 'none'}, Queue size: ${downloadQueue.length}`);

    if (currentDownload) {
        return; // Already processing a download
    }

    if (downloadQueue.length === 0) {
        console.log(`[Queue] Queue is empty.`);
        return;
    }

    const downloadTask = downloadQueue.shift();
    currentDownload = downloadTask;
    const { id, url, name, profileId } = downloadTask;

    console.log(`\n========== DOWNLOAD START: ${name} (${id}) ==========`);

    try {
        await executeDownload(id, url, name, profileId);
        console.log(`========== DOWNLOAD COMPLETE: ${id} ==========`);
    } catch (error) {
        handleDownloadError(id, error);
    } finally {
        delete activeDownloads[id];
        finishDownloadTask(id);
    }
}

async function executeDownload(id, url, name, profileId) {
    if (!windowExists()) {
        throw new Error('Main window not available');
    }

    // Initialize tracking
    activeDownloads[id] = { cancelled: false };

    if (!profileId) {
        throw new Error('Profile ID is missing');
    }

    const paths = getProfileCachePaths(profileId);
    const downloadsDir = paths.downloads;
    ensureDirectoryExists(downloadsDir);

    const filePath = buildDownloadFilePath(downloadsDir, name, url);

    // Send initial progress
    sendDownloadProgress(id, 0, '0 KB/s', 'downloading');

    const strategies = buildDownloadStrategies(url, id, filePath);
    await executeDownloadStrategies(id, strategies);
}

function buildDownloadFilePath(downloadsDir, name, url) {
    const sanitizedName = sanitizeFilename(name);
    const ext = url.includes('.m3u8') ? '.mp4' : path.extname(url) || '.mp4';
    return path.join(downloadsDir, `${sanitizedName}${ext}`);
}

function buildDownloadStrategies(url, id, filePath) {
    const strategies = [];

    if (url.includes('.m3u8')) {
        strategies.push({
            name: 'HLS (ffmpeg)',
            fn: () => downloadHLS(id, url, filePath)
        });
        strategies.push({
            name: 'Stream Recording',
            fn: () => downloadStream(id, url, filePath)
        });
    } else if (url.includes('/live/')) {
        strategies.push({
            name: 'Stream Recording',
            fn: () => downloadStream(id, url, filePath)
        });
        strategies.push({
            name: 'Direct Download',
            fn: () => downloadDirect(id, url, filePath)
        });
    } else {
        strategies.push({
            name: 'Direct Download',
            fn: () => downloadDirect(id, url, filePath)
        });
        strategies.push({
            name: 'Stream Recording',
            fn: () => downloadStream(id, url, filePath)
        });
    }

    strategies.push({
        name: 'Electron Native',
        fn: () => downloadElectron(id, url, filePath)
    });

    return strategies;
}

async function executeDownloadStrategies(id, strategies) {
    let lastError = null;

    for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i];

        if (activeDownloads[id]?.cancelled) {
            console.log(`[Download ${id}] Cancelled before strategy ${strategy.name}`);
            throw new Error('Download cancelled');
        }

        console.log(`[Download ${id}] Trying Strategy: ${strategy.name}`);

        try {
            await strategy.fn();
            console.log(`[Download ${id}] ✓ ${strategy.name} Success`);
            return; // Success - exit
        } catch (err) {
            lastError = err;
            console.log(`[Download ${id}] ✗ ${strategy.name} Failed: ${err.message}`);

            const isCancelled = err.message === 'Download cancelled' || activeDownloads[id]?.cancelled;
            if (isCancelled) {
                throw new Error('Download cancelled');
            }
        }
    }

    // All strategies failed
    throw lastError || new Error('All download strategies failed');
}

function handleDownloadError(id, error) {
    console.error(`========== DOWNLOAD ERROR: ${id} ==========`, error.message);

    const isCancelled = error.message === 'Download cancelled' || activeDownloads[id]?.cancelled;
    const status = isCancelled ? 'cancelled' : 'error';
    const errorMessage = isCancelled ? null : error.message;

    sendDownloadProgress(id, 0, '0 KB/s', status, errorMessage);
}

function sendDownloadProgress(id, progress, speed, status, error = null) {
    if (!windowExists()) {
        return;
    }

    const mainWindow = getMainWindow();
    mainWindow.webContents.send('download-progress', {
        id,
        progress,
        speed,
        status,
        ...(error && { error })
    });
}

function addToQueue(id, url, name, profileId) {
    downloadQueue.push({ id, url, name, profileId });
    console.log(`[Queue] ➕ Added "${name}" (${id}) to queue. Total in queue: ${downloadQueue.length}. Current active: ${currentDownload ? currentDownload.id : 'none'}`);

    processDownloadQueue();

    return { success: true, queued: true };
}

function cancelDownload(id) {
    console.log(`\n[Cancel] ⛔ Request to cancel: ${id}`);

    const isActiveDownload = currentDownload && currentDownload.id === id;

    if (isActiveDownload) {
        handleActiveCancelDownload(id);
    } else {
        handleQueuedCancelDownload(id);
    }

    return { success: true };
}

function handleActiveCancelDownload(id) {
    console.log(`[Cancel] ⛔ This is the ACTIVE download. Queue size before cancel: ${downloadQueue.length}`);

    // Mark as cancelled
    if (activeDownloads[id]) {
        activeDownloads[id].cancelled = true;
        killDownloadProcesses(id);
    }

    // Send cancelled status immediately
    sendDownloadProgress(id, 0, '0 KB/s', 'cancelled');

    // Force stop if cleanup is slow
    setTimeout(() => {
        const stillActive = currentDownload && currentDownload.id === id;

        if (stillActive) {
            console.log(`[Cancel] ⚡ Forcing stop of ${id} (cleanup was slow).`);
            delete activeDownloads[id];
            finishDownloadTask(id);
        }
    }, DOWNLOAD_FORCE_CANCEL_DELAY);
}

function killDownloadProcesses(id) {
    const download = activeDownloads[id];

    if (!download) {
        return;
    }

    if (download.process) {
        download.process.kill();
        console.log(`[Cancel] ✓ Killed ffmpeg process`);
    }

    if (download.request) {
        download.request.destroy();
        console.log(`[Cancel] ✓ Destroyed HTTP request`);
    }

    if (download.item) {
        download.item.cancel();
        console.log(`[Cancel] ✓ Cancelled Electron download`);
    }
}

function handleQueuedCancelDownload(id) {
    const queueIndex = downloadQueue.findIndex(item => item.id === id);

    if (queueIndex === -1) {
        console.log(`[Queue] ⚠️ Could not find ${id} in queue (size: ${downloadQueue.length}). Current active: ${currentDownload ? currentDownload.id : 'none'}`);
        return;
    }

    const removedItem = downloadQueue.splice(queueIndex, 1)[0];
    console.log(`[Queue] ➖ Removed "${removedItem.name}" from queue. Queue size: ${downloadQueue.length + 1} → ${downloadQueue.length}`);

    sendDownloadProgress(id, 0, '0 KB/s', 'cancelled');
}

module.exports = {
    addToQueue,
    cancelDownload,
    getActiveDownloads,
    sendDownloadProgress
};
