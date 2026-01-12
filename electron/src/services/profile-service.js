const fs = require('fs');
const path = require('path');
const { TRENDY_ID } = require('../config/constants');
const { ensureDirectoryExists, fileExists } = require('../utils/file-utils');

// ============================================================================
// PROFILE & CACHE MANAGEMENT
// ============================================================================

let USER_DATA_PATH = null;

function initialize(userDataPath) {
    USER_DATA_PATH = userDataPath;
    migrateLegacyFiles();
}

function getProfileCachePaths(profileId) {
    if (!USER_DATA_PATH) {
        throw new Error('Profile service not initialized');
    }

    const profileDir = path.join(USER_DATA_PATH, 'profiles', profileId);
    ensureDirectoryExists(profileDir);

    const imageDir = path.join(profileDir, 'images');
    ensureDirectoryExists(imageDir);

    const downloadsDir = path.join(profileDir, 'downloads');
    ensureDirectoryExists(downloadsDir);

    return {
        profile: profileDir,
        m3u: path.join(profileDir, 'playlist.m3u'),
        images: imageDir,
        downloads: downloadsDir
    };
}

function migrateLegacyFiles() {
    if (!USER_DATA_PATH) {
        return;
    }

    const legacyM3U = path.join(USER_DATA_PATH, 'playlist.m3u');
    const legacyImageDir = path.join(USER_DATA_PATH, 'images');
    const targetPaths = getProfileCachePaths(TRENDY_ID);

    try {
        migrateLegacyM3U(legacyM3U, targetPaths.m3u);
        migrateLegacyImages(legacyImageDir, targetPaths.images);
    } catch (err) {
        console.error("Migration failed:", err);
    }
}

function migrateLegacyM3U(legacyPath, targetPath) {
    const legacyExists = fileExists(legacyPath);
    const targetExists = fileExists(targetPath);

    if (legacyExists && !targetExists) {
        console.log("Migrating legacy M3U file...");
        fs.renameSync(legacyPath, targetPath);
    }
}

function migrateLegacyImages(legacyDir, targetDir) {
    if (!fileExists(legacyDir)) {
        return;
    }

    const files = fs.readdirSync(legacyDir);

    if (files.length === 0) {
        return;
    }

    console.log(`Migrating ${files.length} legacy images...`);

    files.forEach(file => {
        const oldPath = path.join(legacyDir, file);
        const newPath = path.join(targetDir, file);

        if (fileExists(newPath)) {
            fs.unlinkSync(oldPath); // Clean up duplicate
        } else {
            fs.renameSync(oldPath, newPath);
        }
    });

    // Try to remove empty directory
    try {
        fs.rmdirSync(legacyDir);
    } catch (e) {
        // Directory not empty or other error - ignore
    }
}

module.exports = {
    initialize,
    getProfileCachePaths
};
