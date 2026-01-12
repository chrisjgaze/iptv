const { app, BrowserWindow } = require('electron');

// Config
const { initializeApp, getUserDataPath } = require('./src/config/app-config');

// Core
const { initializeErrorLogging } = require('./src/core/error-logger');
const { createWindow } = require('./src/core/window-manager');

// Services
const profileService = require('./src/services/profile-service');
const configService = require('./src/services/config-service');

// Server
const { startProxyServer } = require('./src/server/proxy-server');

// Players
const { initializeChromecast } = require('./src/players/chromecast-player');

// IPC
const { registerAllHandlers } = require('./src/ipc/ipc-handlers');

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

// Initialize error logging first
initializeErrorLogging(__dirname);

// Initialize app configuration
const appInitialized = initializeApp();

if (!appInitialized) {
    // Squirrel startup - app will quit
    process.exit(0);
}

// ============================================================================
// APP EVENT HANDLERS
// ============================================================================

app.on('ready', () => {
    // Get user data path
    const userDataPath = getUserDataPath();
    
    // Initialize services
    profileService.initialize(userDataPath);
    configService.initialize(userDataPath);
    
    // Create main window
    createWindow();
    
    // Start proxy server for Chromecast
    startProxyServer();
    
    // Initialize Chromecast discovery
    initializeChromecast();
    
    // Register all IPC handlers
    registerAllHandlers();
    
    console.log('Application ready');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

app.on('before-quit', () => {
    console.log('Application shutting down...');
});