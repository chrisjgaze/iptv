const { ipcMain, dialog } = require('electron');
const { getMainWindow } = require('../core/window-manager');

// Services
const { loadLocalM3U, fetchAndCacheM3U } = require('../services/m3u-service');
const { callXCAPI } = require('../services/xc-api-service');
const { 
    checkImageCache, 
    checkImageCacheBatch, 
    cacheImage, 
    cleanupProfileImages 
} = require('../services/image-cache-service');
const { loadConfig, saveConfig } = require('../services/config-service');

// Players
const { launchVLC } = require('../players/vlc-player');
const { initializeChromecast, scanForDevices, playOnChromecast, stopChromecast } = require('../players/chromecast-player');

// Download
const { addToQueue, cancelDownload } = require('../download/download-manager');

// ============================================================================
// IPC HANDLERS REGISTRATION
// ============================================================================

function registerAllHandlers() {
    // M3U Handlers
    registerM3UHandlers();
    
    // API Handlers
    registerAPIHandlers();
    
    // Image Cache Handlers
    registerImageHandlers();
    
    // Config Handlers
    registerConfigHandlers();
    
    // Player Handlers
    registerPlayerHandlers();
    
    // Download Handlers
    registerDownloadHandlers();
    
    console.log('[IPC] All handlers registered');
}

// ============================================================================
// M3U HANDLERS
// ============================================================================

function registerM3UHandlers() {
    ipcMain.handle('load-local-m3u', async (event, profileId) => {
        try {
            return await loadLocalM3U(profileId);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fetch-m3u', async (event, { url, profileId }) => {
        try {
            return await fetchAndCacheM3U(url, profileId);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

// ============================================================================
// API HANDLERS
// ============================================================================

function registerAPIHandlers() {
    ipcMain.handle('xc-api', async (event, params) => {
        return await callXCAPI(params);
    });
}

// ============================================================================
// IMAGE CACHE HANDLERS
// ============================================================================

function registerImageHandlers() {
    // Single image check
    ipcMain.handle('check-image-cache', async (event, { url, profileId }) => {
        return checkImageCache(url, profileId); //
    });

    // Batch image check - THIS IS WHAT LOADS YOUR LOGOS
    // Changed key to 'check-image-cache-batch' to match standard naming
    ipcMain.handle('check-image-cache-batch', async (event, { urls, profileId }) => {
        // urls: Array of XC image strings, profileId: active profile string
        return checkImageCacheBatch(urls, profileId); //
    });

    // Manually trigger a download/cache for an image
    ipcMain.handle('cache-image', async (event, { url, profileId }) => {
        return await cacheImage(url, profileId); //
    });

    ipcMain.handle('cleanup-profile-images', async (event, { profileId, validUrls }) => {
        return cleanupProfileImages(profileId, validUrls); //
    });
}

// ============================================================================
// CONFIG HANDLERS
// ============================================================================

function registerConfigHandlers() {
    ipcMain.handle('get-config', async () => {
        try {
            return loadConfig();
        } catch (error) {
            console.error('Error loading config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('save-config', async (event, config) => {
        return saveConfig(config);
    });

    ipcMain.handle('select-vlc-path', async () => {
        const mainWindow = getMainWindow();
        
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select VLC Executable',
            properties: ['openFile'],
            filters: [
                { name: 'Executables', extensions: ['exe', 'app', 'bin'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    });
}

// ============================================================================
// PLAYER HANDLERS
// ============================================================================

function registerPlayerHandlers() {
    // VLC
    ipcMain.handle('launch-vlc', async (event, streamUrl, customVlcPath, title) => {
        return await launchVLC(streamUrl, customVlcPath, title);
    });

    // Chromecast
    ipcMain.handle('cast-scan', async () => {
        return scanForDevices();
    });

    ipcMain.handle('cast-play', async (event, deviceName, streamUrl) => {
        return await playOnChromecast(deviceName, streamUrl);
    });

    ipcMain.handle('cast-stop', async (event, deviceName) => {
        return await stopChromecast(deviceName);
    });
}

// ============================================================================
// DOWNLOAD HANDLERS
// ============================================================================

function registerDownloadHandlers() {
    ipcMain.handle('start-download', async (event, { id, url, name, profileId }) => {
        return addToQueue(id, url, name, profileId);
    });

    ipcMain.handle('cancel-download', async (event, { id }) => {
        return cancelDownload(id);
    });
}

module.exports = {
    registerAllHandlers
};
