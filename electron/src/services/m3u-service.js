const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const { M3U_BATCH_SIZE, IPTV_USER_AGENT } = require('../config/constants');
const { fileExists } = require('../utils/file-utils');
const { getProfileCachePaths } = require('./profile-service');
const { windowExists, getMainWindow } = require('../core/window-manager');

// ============================================================================
// M3U PARSING SERVICE
// ============================================================================

async function parseM3UProgressive(filePath, profileId) {
    if (!fileExists(filePath)) {
        return;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let streamsBatch = [];
    let categories = new Set();
    let currentStream = null;
    let totalProcessed = 0;

    for await (const line of rl) {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
            continue;
        }

        if (trimmedLine.startsWith('#EXTINF:')) {
            currentStream = parseExtinfLine(trimmedLine, categories);
        } else if (trimmedLine.startsWith('#EXTGRP:')) {
            updateStreamGroup(currentStream, trimmedLine, categories);
        } else if (isStreamUrl(trimmedLine) && currentStream) {
            currentStream.url = trimmedLine;
            streamsBatch.push(currentStream);
            currentStream = null;
            totalProcessed++;

            if (streamsBatch.length >= M3U_BATCH_SIZE) {
                sendStreamBatch(profileId, streamsBatch, categories, false);
                streamsBatch = [];
            }
        }
    }

    // Send final batch
    sendStreamBatch(profileId, streamsBatch, categories, true, totalProcessed);
}

function parseExtinfLine(line, categories) {
    const stream = { raw: line };

    const groupMatch = line.match(/group-title="([^"]*)"/i);
    const groupTitle = groupMatch ? groupMatch[1].trim() : "Uncategorized";
    stream.group_title = groupTitle || "Uncategorized";
    categories.add(stream.group_title);

    const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
    if (logoMatch) {
        stream.tvg_logo = logoMatch[1].trim();
    }

    const parts = line.split(',');
    stream.name = parts.length > 1 ? parts[parts.length - 1].trim() : "Unknown";

    return stream;
}

function updateStreamGroup(stream, line, categories) {
    if (!stream) {
        return;
    }

    const groupName = line.replace('#EXTGRP:', '').trim();

    if (groupName) {
        stream.group_title = groupName;
        categories.add(groupName);
    }
}

function isStreamUrl(line) {
    return !line.startsWith('#');
}

function sendStreamBatch(profileId, streams, categories, isFinal, total = 0) {
    if (!windowExists()) {
        return;
    }

    const mainWindow = getMainWindow();
    mainWindow.webContents.send('m3u-batch', {
        profileId,
        streams,
        categories: Array.from(categories),
        isFinal,
        ...(isFinal && { total })
    });
}

async function loadLocalM3U(profileId) {
    const paths = getProfileCachePaths(profileId);

    if (!fileExists(paths.m3u)) {
        return { success: false, error: 'No cache file found' };
    }

    parseM3UProgressive(paths.m3u, profileId);
    return { success: true, started: true };
}

async function fetchAndCacheM3U(url, profileId) {
    const paths = getProfileCachePaths(profileId);

    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: { 'User-Agent': IPTV_USER_AGENT }
    });

    const writer = fs.createWriteStream(paths.m3u);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            parseM3UProgressive(paths.m3u, profileId);
            resolve({ success: true, started: true });
        });
        writer.on('error', reject);
    });
}

module.exports = {
    parseM3UProgressive,
    loadLocalM3U,
    fetchAndCacheM3U
};
