const fs = require('fs');
const path = require('path');

// ============================================================================
// FILE SYSTEM UTILITIES
// ============================================================================

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function fileExists(filePath) {
    return fs.existsSync(filePath);
}

function getFileExtension(url) {
    return path.extname(url) || '.mp4';
}

function buildFilePath(directory, name, extension) {
    return path.join(directory, `${name}${extension}`);
}

module.exports = {
    ensureDirectoryExists,
    fileExists,
    getFileExtension,
    buildFilePath
};
