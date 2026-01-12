const { app } = require('electron');

// ============================================================================
// ELECTRON APP CONFIGURATION
// ============================================================================

function initializeApp() {
    // Check for squirrel startup
    if (require('electron-squirrel-startup')) {
        app.quit();
        return false;
    }

    // Enable HEVC decoder support
    app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
    
    // Disable CORS for streaming
    app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
    
    // Disable autofill
    app.commandLine.appendSwitch('disable-autofill');

    return true;
}

function getUserDataPath() {
    return app.getPath('userData');
}

function isPackaged() {
    return app.isPackaged;
}

module.exports = {
    initializeApp,
    getUserDataPath,
    isPackaged
};
