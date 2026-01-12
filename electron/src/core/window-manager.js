const { BrowserWindow } = require('electron');
const path = require('path');
const { isPackaged } = require('../config/app-config');

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload.js'),
            autoHideMenuBar: true,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        },
    });

    const isDev = !isPackaged();

    if (isDev) {
        mainWindow.loadURL('http://localhost:5180');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
    }

    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

function windowExists() {
    return mainWindow && !mainWindow.isDestroyed();
}

module.exports = {
    createWindow,
    getMainWindow,
    windowExists
};
