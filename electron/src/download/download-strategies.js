const fs = require('fs');
const http = require('http');
const axios = require('axios');
const { spawn } = require('child_process');
const { DOWNLOAD_TIMEOUT, DEFAULT_USER_AGENT, ELECTRON_DOWNLOAD_TIMEOUT } = require('../config/constants');
const { formatSpeed } = require('../utils/format-utils');
const { getMainWindow } = require('../core/window-manager');
const { sendDownloadProgress, getActiveDownloads } = require('./download-manager');

// ============================================================================
// DOWNLOAD STRATEGIES
// ============================================================================

// Strategy 1: Direct Download
async function downloadDirect(id, url, filePath) {
    return new Promise(async (resolve, reject) => {
        console.log(`[Download ${id}] Direct download: Initiating axios GET request...`);

        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                headers: {
                    'User-Agent': DEFAULT_USER_AGENT
                },
                onDownloadProgress: (progressEvent) => {
                    handleDirectDownloadProgress(id, progressEvent, response, reject);
                }
            });

            console.log(`[Download ${id}] Direct download: Response received, status ${response.status}`);
            console.log(`[Download ${id}] Direct download: Creating write stream and piping data...`);

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            writer.on('finish', () => {
                console.log(`[Download ${id}] Direct download: Write stream finished`);
                const activeDownloads = getActiveDownloads();
                delete activeDownloads[id];
                sendDownloadProgress(id, 100, '0 KB/s', 'completed');
                resolve();
            });

            writer.on('error', (error) => {
                console.error(`[Download ${id}] Direct download: Write stream error:`, error.message);
                const activeDownloads = getActiveDownloads();
                delete activeDownloads[id];
                reject(error);
            });

        } catch (error) {
            console.error(`[Download ${id}] Direct download: Axios error:`, error.message);
            if (error.response) {
                console.error(`[Download ${id}] Direct download: HTTP status ${error.response.status}`);
            }
            const activeDownloads = getActiveDownloads();
            delete activeDownloads[id];
            reject(error);
        }
    });
}

function handleDirectDownloadProgress(id, progressEvent, response, reject) {
    const activeDownloads = getActiveDownloads();
    
    if (activeDownloads[id]?.cancelled) {
        response.data.destroy();
        reject(new Error('Download cancelled'));
        return;
    }

    const total = progressEvent.total;
    const current = progressEvent.loaded;
    const progress = total ? (current / total) * 100 : 0;

    // Calculate speed
    const now = Date.now();
    const lastTime = activeDownloads[id]?.lastTime || now;
    const lastLoaded = activeDownloads[id]?.lastLoaded || 0;
    const elapsed = (now - lastTime) / 1000;
    const bytes = current - lastLoaded;
    const speed = elapsed > 0 ? bytes / elapsed : 0;

    activeDownloads[id] = {
        ...activeDownloads[id],
        lastTime: now,
        lastLoaded: current
    };

    const speedText = formatSpeed(speed);
    sendDownloadProgress(id, progress, speedText, 'downloading');
}

// Strategy 2: HLS Download using ffmpeg
async function downloadHLS(id, url, filePath) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = 'ffmpeg'; // Assumes ffmpeg is in PATH

        const args = [
            '-i', url,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-y',
            filePath
        ];

        console.log(`[Download] ffmpeg command: ${ffmpegPath} ${args.join(' ')}`);

        const ffmpeg = spawn(ffmpegPath, args);
        const activeDownloads = getActiveDownloads();

        if (activeDownloads[id]) {
            activeDownloads[id].process = ffmpeg;
        }

        let duration = 0;

        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            duration = parseFfmpegDuration(output, duration);
            handleFfmpegProgress(id, output, duration);
        });

        ffmpeg.on('close', (code) => {
            delete activeDownloads[id];

            if (code === 0) {
                sendDownloadProgress(id, 100, '0 KB/s', 'completed');
                resolve();
            } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (error) => {
            delete activeDownloads[id];
            reject(error);
        });
    });
}

function parseFfmpegDuration(output, currentDuration) {
    const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);

    if (!durationMatch) {
        return currentDuration;
    }

    const hours = parseInt(durationMatch[1]);
    const minutes = parseInt(durationMatch[2]);
    const seconds = parseInt(durationMatch[3]);

    return hours * 3600 + minutes * 60 + seconds;
}

function handleFfmpegProgress(id, output, duration) {
    if (duration === 0) {
        return;
    }

    const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);

    if (!timeMatch) {
        return;
    }

    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const seconds = parseInt(timeMatch[3]);
    const currentTime = hours * 3600 + minutes * 60 + seconds;
    const progress = (currentTime / duration) * 100;

    sendDownloadProgress(id, Math.min(progress, 99), 'Processing...', 'downloading');
}

// Strategy 3: Stream Recording
async function downloadStream(id, url, filePath) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let bytesDownloaded = 0;

        const request = http.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const writer = fs.createWriteStream(filePath);
            response.pipe(writer);

            response.on('data', (chunk) => {
                const shouldCancel = handleStreamDownloadChunk(
                    id,
                    chunk,
                    bytesDownloaded,
                    startTime,
                    response,
                    writer,
                    reject
                );

                if (!shouldCancel) {
                    bytesDownloaded += chunk.length;
                }
            });

            writer.on('finish', () => {
                const activeDownloads = getActiveDownloads();
                delete activeDownloads[id];
                sendDownloadProgress(id, 100, '0 KB/s', 'completed');
                resolve();
            });

            writer.on('error', (error) => {
                const activeDownloads = getActiveDownloads();
                delete activeDownloads[id];
                reject(error);
            });
        });

        request.on('error', (error) => {
            const activeDownloads = getActiveDownloads();
            delete activeDownloads[id];
            reject(error);
        });

        const activeDownloads = getActiveDownloads();
        if (activeDownloads[id]) {
            activeDownloads[id].request = request;
        }
    });
}

function handleStreamDownloadChunk(id, chunk, bytesDownloaded, startTime, response, writer, reject) {
    const activeDownloads = getActiveDownloads();
    
    if (activeDownloads[id]?.cancelled) {
        response.destroy();
        writer.close();
        reject(new Error('Download cancelled'));
        return true; // Cancelled
    }

    bytesDownloaded += chunk.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = bytesDownloaded / elapsed;

    sendDownloadProgress(id, 50, formatSpeed(speed), 'downloading');
    return false; // Not cancelled
}

// Strategy 4: Electron Native Download
async function downloadElectron(id, url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`[Download ${id}] Using Electron native download API`);

        const mainWindow = getMainWindow();

        if (!mainWindow) {
            reject(new Error('Main window not available'));
            return;
        }

        const activeDownloads = getActiveDownloads();
        
        if (activeDownloads[id]?.cancelled) {
            reject(new Error('Download cancelled'));
            return;
        }

        mainWindow.webContents.downloadURL(url);

        let timeoutHandle;
        const onDownloadStarted = setupElectronDownloadListener(
            id,
            url,
            filePath,
            resolve,
            reject,
            () => clearTimeout(timeoutHandle)
        );

        mainWindow.webContents.session.on('will-download', onDownloadStarted);

        // Set timeout in case download never triggers
        timeoutHandle = setTimeout(() => {
            mainWindow.webContents.session.removeListener('will-download', onDownloadStarted);
            reject(new Error('Download timeout - no download started within 30 seconds'));
        }, ELECTRON_DOWNLOAD_TIMEOUT);
    });
}

function setupElectronDownloadListener(id, url, filePath, resolve, reject, clearTimeoutFn) {
    const mainWindow = getMainWindow();
    
    return (downloadEvent, item, webContents) => {
        const itemUrl = item.getURL();
        console.log(`[Download ${id}] Download item received for URL: ${itemUrl.substring(0, 60)}...`);

        if (itemUrl !== url) {
            console.log(`[Download ${id}] URL mismatch, ignoring this download item`);
            return; // Not our download
        }

        clearTimeoutFn();

        // Clean up listener
        mainWindow.webContents.session.removeListener('will-download', arguments.callee);

        item.setSavePath(filePath);
        console.log(`[Download ${id}] Native download started, saving to: ${filePath}`);

        const activeDownloads = getActiveDownloads();
        if (activeDownloads[id]) {
            activeDownloads[id].item = item;
        }

        item.on('updated', (updateEvent, state) => {
            handleElectronDownloadUpdate(id, item, state);
        });

        item.once('done', (doneEvent, state) => {
            handleElectronDownloadComplete(id, state, resolve, reject);
        });
    };
}

function handleElectronDownloadUpdate(id, item, state) {
    const activeDownloads = getActiveDownloads();
    
    if (activeDownloads[id]?.cancelled) {
        item.cancel();
        return;
    }

    if (state === 'interrupted') {
        console.log(`[Download ${id}] Interrupted but may be resumable`);
        return;
    }

    if (state === 'progressing' && !item.isPaused()) {
        const total = item.getTotalBytes();
        const received = item.getReceivedBytes();
        const progress = total > 0 ? (received / total) * 100 : 0;

        sendDownloadProgress(id, Math.min(progress, 99), 'Downloading...', 'downloading');
    }

    if (state === 'progressing' && item.isPaused()) {
        console.log(`[Download ${id}] Paused`);
    }
}

function handleElectronDownloadComplete(id, state, resolve, reject) {
    const activeDownloads = getActiveDownloads();
    delete activeDownloads[id];

    if (state === 'completed') {
        console.log(`[Download ${id}] Native download completed successfully`);
        sendDownloadProgress(id, 100, '0 KB/s', 'completed');
        resolve();
    } else {
        console.error(`[Download ${id}] Native download failed with state: ${state}`);
        reject(new Error(`Download ${state}`));
    }
}

module.exports = {
    downloadDirect,
    downloadHLS,
    downloadStream,
    downloadElectron
};
