const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const url = require('url');
const os = require('os');
const ChromecastAPI = require('chromecast-api');

// --- CRITICAL ERROR LOGGING ---
const LOG_FILE = path.join(__dirname, 'startup_error.log');

function logToFile(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {
        // Can't log if fs fails
    }
}

process.on('uncaughtException', (error) => {
    const msg = `UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}`;
    console.error(msg);
    logToFile(msg);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const msg = `UNHANDLED REJECTION: ${reason}`;
    console.error(msg);
    logToFile(msg);
});

logToFile("App starting...");

// --- Helpers ---

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// --- Local Proxy Server for Chromecast ---
const PROXY_PORT = 5181;
const proxyServer = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/stream' && parsedUrl.query.url) {
        const streamUrl = parsedUrl.query.url;
        console.log(`Proxying stream for Chromecast: ${streamUrl}`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        try {
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 30000
            });

            res.statusCode = response.status;
            
            const contentTypes = {
                'ts': 'video/mp2t',
                'm3u8': 'application/x-mpegURL',
                'mp4': 'video/mp4',
                'mkv': 'video/x-matroska'
            };

            let contentType = response.headers['content-type'];
            if (!contentType || contentType === 'application/octet-stream') {
                const ext = streamUrl.split('.').pop().split('?')[0];
                contentType = contentTypes[ext] || 'video/mp2t';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
            
            response.data.pipe(res);

            req.on('close', () => {
                if (response.data.destroy) response.data.destroy();
            });
        } catch (e) {
            console.error("Proxy error:", e.message);
            res.statusCode = 500;
            res.end(`Proxy Error: ${e.message}`);
        }
    } else {
        res.statusCode = 404;
        res.end();
    }
});

proxyServer.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`Stream proxy for Chromecast listening on http://${getLocalIP()}:${PROXY_PORT}`);
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// --- Cache & Profile Logic ---
const USER_DATA_PATH = app.getPath('userData');
const LEGACY_CACHE_FILE = path.join(USER_DATA_PATH, 'playlist.m3u');
const LEGACY_IMAGE_DIR = path.join(USER_DATA_PATH, 'images');
const TRENDY_ID = "1704700000000";

const getProfileCachePaths = (profileId) => {
    if (profileId === TRENDY_ID) {
        return { m3u: LEGACY_CACHE_FILE, images: LEGACY_IMAGE_DIR };
    }
    
    const profileDir = path.join(USER_DATA_PATH, 'profiles', profileId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
    
    const imageDir = path.join(profileDir, 'images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

    return { m3u: path.join(profileDir, 'playlist.m3u'), images: imageDir };
};

if (!fs.existsSync(LEGACY_IMAGE_DIR)) fs.mkdirSync(LEGACY_IMAGE_DIR, { recursive: true });

// --- Window Management ---
let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false 
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Chromecast Manager ---
const castClient = new ChromecastAPI();
let castDevices = {};
let activeCastDeviceName = null;

castClient.on('device', function (device) {
    const name = device.friendlyName || device.name;
    if (!castDevices[name]) {
        castDevices[name] = device;
        if (mainWindow) mainWindow.webContents.send('cast-device-found', name);
    }
});

const readline = require('readline');

// ... (existing logging and helpers) ...

// --- IPC Handlers ---

// Progressive M3U Parser
const parseM3UProgressive = async (filePath, profileId) => {
    if (!fs.existsSync(filePath)) return;

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
        const l = line.trim();
        if (!l) continue;

        if (l.startsWith('#EXTINF:')) {
            currentStream = { raw: l };
            const groupMatch = l.match(/group-title="([^"]*)"/i);
            const groupTitle = groupMatch ? groupMatch[1].trim() : "Uncategorized";
            currentStream.group_title = groupTitle || "Uncategorized";
            categories.add(currentStream.group_title);

            const logoMatch = l.match(/tvg-logo="([^"]*)"/i);
            if (logoMatch) currentStream.tvg_logo = logoMatch[1].trim();

            const parts = l.split(',');
            currentStream.name = parts.length > 1 ? parts[parts.length - 1].trim() : "Unknown";
        } else if (l.startsWith('#EXTGRP:') && currentStream) {
            const groupName = l.replace('#EXTGRP:', '').trim();
            if (groupName) {
                currentStream.group_title = groupName;
                categories.add(groupName);
            }
        } else if (!l.startsWith('#') && currentStream) {
            currentStream.url = l;
            streamsBatch.push(currentStream);
            currentStream = null;
            totalProcessed++;

            // Send in batches of 5000 to keep UI responsive but minimize IPC overhead
            if (streamsBatch.length >= 5000) {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('m3u-batch', {
                        profileId,
                        streams: streamsBatch,
                        categories: Array.from(categories),
                        isFinal: false
                    });
                }
                streamsBatch = [];
            }
        }
    }

    // Send final batch
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('m3u-batch', {
            profileId,
            streams: streamsBatch,
            categories: Array.from(categories),
            isFinal: true,
            total: totalProcessed
        });
    }
};

ipcMain.handle('load-local-m3u', async (event, profileId) => {
    try {
        const paths = getProfileCachePaths(profileId);
        if (fs.existsSync(paths.m3u)) {
            // Start progressive loading in background
            parseM3UProgressive(paths.m3u, profileId);
            return { success: true, started: true };
        }
        return { success: false, error: 'No cache file found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Fetch M3U content (Bypasses CORS) and cache it
ipcMain.handle('fetch-m3u', async (event, { url, profileId }) => {
  try {
    const paths = getProfileCachePaths(profileId);
    
    // Use axios to stream the download directly to disk
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: { 'User-Agent': 'IPTVApp/1.0 ElectronFetcher' }
    });

    const writer = fs.createWriteStream(paths.m3u);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            // Once written, start progressive parse from disk
            parseM3UProgressive(paths.m3u, profileId);
            resolve({ success: true, started: true });
        });
        writer.on('error', reject);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// VLC Launcher
ipcMain.handle('launch-vlc', async (event, streamUrl, customVlcPath, title) => {
  try {
    let vlcPath = customVlcPath;
    if (!vlcPath) {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = parseINI(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            vlcPath = config.vlcPath;
        }
    }
    
    if (!vlcPath) {
        vlcPath = process.platform === 'win32' ? 'C:\\\\Program Files\\\\VideoLAN\\\\VLC\\\\vlc.exe' : (process.platform === 'darwin' ? '/Applications/VLC.app/Contents/MacOS/VLC' : 'vlc');
    }

    console.log(`Launching VLC: ${vlcPath} -> ${streamUrl}`);
    
    const args = [streamUrl];
    if (title) args.push(`--meta-title=${title}`);
    const subprocess = spawn(vlcPath, args, { detached: true, stdio: 'ignore' });
    subprocess.unref();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Config Manager
const CONFIG_FILE = path.join(USER_DATA_PATH, 'config.ini');

const stringifyINI = (config) => {
    let output = "[Settings]\n";
    output += "activeProfileId=" + (config.activeProfileId || "") + "\n";
    output += "vlcPath=" + (config.vlcPath || "") + "\n\n";
    (config.profiles || []).forEach(p => {
        output += `[Profile_${p.id}]\nid=${p.id}\nname=${p.name}\nusername=${p.username}\npassword=${p.password}\nservers=${(p.servers || []).join(',')}\n\n`;
    });
    return output;
};

const parseINI = (data) => {
    const lines = data.split(/\r?\n/);
    const config = { profiles: [], activeProfileId: null, vlcPath: null };
    let currentProfile = null;
    let currentSection = null;

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith(';')) return;
        const sectionMatch = line.match(/^\s*\[(.+?)\]\s*$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1];
            if (currentSection.startsWith('Profile_')) {
                currentProfile = {};
                config.profiles.push(currentProfile);
            } else {
                currentProfile = null;
            }
            return;
        }
        const [key, ...valParts] = line.split('=');
        const value = valParts.join('=').trim();
        if (currentSection === 'Settings') {
            if (key === 'activeProfileId') config.activeProfileId = value || null;
            if (key === 'vlcPath') config.vlcPath = value || null;
        } else if (currentProfile) {
            if (key === 'servers') currentProfile[key] = value ? value.split(',') : [];
            else currentProfile[key] = value;
        }
    });
    return config;
};

ipcMain.handle('get-config', async () => {
    if (fs.existsSync(CONFIG_FILE)) return parseINI(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    const initial = { activeProfileId: TRENDY_ID, vlcPath: process.platform === 'win32' ? 'C:\\\\Program Files\\\\VideoLAN\\\\VLC\\\\vlc.exe' : '', profiles: [{ id: TRENDY_ID, name: "Trendystream", username: "c91392c3e194", password: "7657840f7676", servers: ["http://vpn.tsclean.cc","http://line.tsclean.cc","http://line.protv.cc:8000","http://line.beetx.cc"] }] };
    fs.writeFileSync(CONFIG_FILE, stringifyINI(initial));
    return initial;
});

ipcMain.handle('select-vlc-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select VLC Executable',
        properties: ['openFile'],
        filters: [
            { name: 'Executables', extensions: ['exe', 'app', 'bin'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        fs.writeFileSync(CONFIG_FILE, stringifyINI(config));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Download Manager
const downloadItems = new Map();
const DOWNLOAD_DIR = path.join(USER_DATA_PATH, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

ipcMain.handle('start-download', async (event, { url, filename, id }) => {
    return new Promise((resolve) => {
        const log = (msg) => { 
            console.log(`[DL ${id}] ${msg}`);
            if (mainWindow) mainWindow.webContents.send('download-log', `[${filename}] ${msg}`); 
        };

        log(`Initiating native download: ${url}`);
        
        const filePath = path.join(DOWNLOAD_DIR, `${filename.replace(/[^a-z0-9]/gi, '_')}.mp4`);
        
        mainWindow.webContents.downloadURL(url);

        const onDownloadStarted = (event, item, webContents) => {
            if (item.getURL() !== url) return; // Not our item
            
            // Clean up listener for next download
            mainWindow.webContents.session.removeListener('will-download', onDownloadStarted);
            
            downloadItems.set(id, item);
            item.setSavePath(filePath);

            log(`Download started. Saving to: ${filePath}`);

            item.on('updated', (event, state) => {
                if (state === 'interrupted') {
                    log('Download interrupted but can be resumed.');
                } else if (state === 'progressing') {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        const total = item.getTotalBytes();
                        const loaded = item.getReceivedBytes();
                        const progress = total > 0 ? loaded / total : 0;
                        
                        mainWindow.webContents.send('download-progress-update', { 
                            id, 
                            loaded, 
                            total, 
                            progress, 
                            rate: 0, // Native API doesn't give rate directly easily
                            status: 'downloading' 
                        });
                    }
                }
            });

            item.once('done', (event, state) => {
                downloadItems.delete(id);
                if (state === 'completed') {
                    log('Download completed successfully.');
                    if (mainWindow) mainWindow.webContents.send('download-complete', { id, filePath });
                    resolve({ success: true, filePath });
                } else {
                    log(`Download failed: ${state}`);
                    resolve({ success: false, error: state });
                }
            });
        };

        mainWindow.webContents.session.on('will-download', onDownloadStarted);
    });
});

ipcMain.handle('cancel-download', async (event, id) => {
    if (downloadItems.has(id)) {
        const item = downloadItems.get(id);
        item.cancel();
        downloadItems.delete(id);
        return { success: true };
    }
    return { success: false };
});

// Image Caching
ipcMain.handle('check-image-cache', async (event, { url, profileId }) => {
    if (!url || !profileId) return null;
    const paths = getProfileCachePaths(profileId);
    const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
    return fs.existsSync(filePath) ? `file://${filePath}` : null;
});

ipcMain.handle('cache-image', async (event, { url, profileId }) => {
    if (!url || !profileId) return;
    const paths = getProfileCachePaths(profileId);
    const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
    if (fs.existsSync(filePath)) return;
    try {
        const res = await axios({ url, method: 'GET', responseType: 'stream', timeout: 10000 });
        res.data.pipe(fs.createWriteStream(filePath));
    } catch (e) {}
});

ipcMain.handle('cleanup-profile-images', async (event, { profileId, validUrls }) => {
    try {
        console.log(`IPC: cleanup-profile-images for profile: ${profileId}`);
        const paths = getProfileCachePaths(profileId);
        if (!fs.existsSync(paths.images)) return { success: true, deletedCount: 0 };

        // Convert URLs to hashes for comparison
        const validHashes = new Set(validUrls.filter(u => !!u).map(u => crypto.createHash('md5').update(u).digest('hex')));
        
        const files = fs.readdirSync(paths.images);
        let deletedCount = 0;

        files.forEach(file => {
            // Only check files that look like md5 hashes
            if (file.match(/^[a-f0-9]{32}$/i) && !validHashes.has(file)) {
                try {
                    fs.unlinkSync(path.join(paths.images, file));
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete orphaned image ${file}:`, e);
                }
            }
        });

        console.log(`IPC: Cleaned up ${deletedCount} unused images.`);
        return { success: true, deletedCount };
    } catch (error) {
        console.error('IPC ERROR: cleanup-profile-images:', error);
        return { success: false, error: error.message };
    }
});

// Chromecast Handlers
ipcMain.handle('cast-scan', async () => { castClient.update(); return Object.keys(castDevices); });
ipcMain.handle('cast-play', async (event, deviceName, streamUrl) => {
    const device = castDevices[deviceName];
    if (!device) return { success: false, error: 'Device not found' };
    activeCastDeviceName = deviceName;
    const proxyUrl = `http://${getLocalIP()}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
    return new Promise((resolve) => { device.play(proxyUrl, (err) => resolve(err ? { success: false, error: err.message } : { success: true })); });
});
ipcMain.handle('cast-stop', async (event, deviceName) => {
    const name = deviceName || activeCastDeviceName;
    const device = castDevices[name];
    if (!device) return { success: false };
    return new Promise((resolve) => { device.stop(() => { if (name === activeCastDeviceName) activeCastDeviceName = null; resolve({ success: true }); }); });
});