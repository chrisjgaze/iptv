const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { MAX_CONCURRENT_IMAGE_DOWNLOADS, IMAGE_DOWNLOAD_TIMEOUT, DEFAULT_USER_AGENT } = require('../config/constants');
const { getProfileCachePaths } = require('./profile-service');
const { fileExists } = require('../utils/file-utils');

// ============================================================================
// IMAGE CACHING SERVICE
// ============================================================================

const imageQueue = [];
let activeImageDownloads = 0;

async function processImageQueue() {
    const canProcessMore = activeImageDownloads < MAX_CONCURRENT_IMAGE_DOWNLOADS;
    const hasQueuedImages = imageQueue.length > 0;

    if (!canProcessMore || !hasQueuedImages) {
        return;
    }

    activeImageDownloads++;
    const { url, profileId, resolve } = imageQueue.shift();

    try {
        const paths = getProfileCachePaths(profileId);
        const filePath = getImageCachePath(paths.images, url);

        if (!fileExists(filePath)) {
            await downloadImage(url, filePath);
        }

        resolve(true);
    } catch (e) {
        console.error(`Failed to cache image: ${url}`, e.message);
        resolve(false);
    } finally {
        activeImageDownloads--;
        processImageQueue();
    }
}

async function downloadImage(url, filePath) {
    const res = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: IMAGE_DOWNLOAD_TIMEOUT,
        headers: { 'User-Agent': DEFAULT_USER_AGENT }
    });

    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function getImageCachePath(imageDir, url) {
    const filename = crypto.createHash('md5').update(url).digest('hex');
    return path.join(imageDir, filename);
}

function checkImageCache(url, profileId) {
    if (!url || !profileId) {
        return null;
    }

    const paths = getProfileCachePaths(profileId);
    const filePath = getImageCachePath(paths.images, url);

    return fileExists(filePath) ? `file://${filePath}` : null;
}

function checkImageCacheBatch(urls, profileId) {
    if (!urls || !profileId) {
        return {};
    }

    const paths = getProfileCachePaths(profileId);
    const results = {};

    urls.forEach(url => {
        if (!url) {
            return;
        }

        const filePath = getImageCachePath(paths.images, url);

        if (fileExists(filePath)) {
            results[url] = `file://${filePath}`;
        }
    });

    return results;
}

function cacheImage(url, profileId) {
    if (!url || !profileId) {
        return Promise.resolve(false);
    }

    // Check if already cached
    const paths = getProfileCachePaths(profileId);
    const filePath = getImageCachePath(paths.images, url);

    if (fileExists(filePath)) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        imageQueue.push({ url, profileId, resolve });
        processImageQueue();
    });
}

function cleanupProfileImages(profileId, validUrls) {
    try {
        console.log(`Cleaning up images for profile: ${profileId}`);
        const paths = getProfileCachePaths(profileId);

        if (!fileExists(paths.images)) {
            return { success: true, deletedCount: 0 };
        }

        const validHashes = new Set(
            validUrls
                .filter(url => !!url)
                .map(url => crypto.createHash('md5').update(url).digest('hex'))
        );

        const files = fs.readdirSync(paths.images);
        let deletedCount = 0;

        files.forEach(file => {
            const isMD5Hash = file.match(/^[a-f0-9]{32}$/i);
            const isOrphaned = !validHashes.has(file);

            if (isMD5Hash && isOrphaned) {
                try {
                    fs.unlinkSync(path.join(paths.images, file));
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete orphaned image ${file}:`, e);
                }
            }
        });

        console.log(`Cleaned up ${deletedCount} unused images.`);
        return { success: true, deletedCount };
    } catch (error) {
        console.error('Image cleanup error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    checkImageCache,
    checkImageCacheBatch,
    cacheImage,
    cleanupProfileImages
};
