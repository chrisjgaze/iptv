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
app.commandLine.appendSwitch('disable-autofill');

// --- Cache & Profile Logic ---
const USER_DATA_PATH = app.getPath('userData');
const TRENDY_ID = "1704700000000";

const getProfileCachePaths = (profileId) => {
    const profileDir = path.join(USER_DATA_PATH, 'profiles', profileId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const imageDir = path.join(profileDir, 'images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

    return {
        profile: profileDir,
        m3u: path.join(profileDir, 'playlist.m3u'),
        images: imageDir
    };
};

// Migration logic: Move legacy files to the unified profile structure
const migrateLegacyFiles = () => {
    const legacyM3U = path.join(USER_DATA_PATH, 'playlist.m3u');
    const legacyImageDir = path.join(USER_DATA_PATH, 'images');
    const targetPaths = getProfileCachePaths(TRENDY_ID);

    try {
        // Migrate M3U
        if (fs.existsSync(legacyM3U) && !fs.existsSync(targetPaths.m3u)) {
            console.log("Migrating legacy M3U file...");
            fs.renameSync(legacyM3U, targetPaths.m3u);
        }

        // Migrate Images
        if (fs.existsSync(legacyImageDir)) {
            const files = fs.readdirSync(legacyImageDir);
            if (files.length > 0) {
                console.log(`Migrating ${files.length} legacy images...`);
                files.forEach(file => {
                    const oldPath = path.join(legacyImageDir, file);
                    const newPath = path.join(targetPaths.images, file);
                    if (!fs.existsSync(newPath)) {
                        fs.renameSync(oldPath, newPath);
                    } else {
                        fs.unlinkSync(oldPath); // Clean up if already exists in target
                    }
                });
            }
            // Only remove if empty to be safe, or just leave the empty dir
            try { fs.rmdirSync(legacyImageDir); } catch(e) {}
        }
    } catch (err) {
        console.error("Migration failed:", err);
    }
};

migrateLegacyFiles();

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
        console.log(`[Chromecast] Found device: ${name} at ${device.host}`);
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

// XC API Proxy with 60s Caching
const apiCache = new Map();
const CACHE_TTL = 86400000; // 24 hours (24 * 60 * 60 * 1000)

ipcMain.handle('xc-api', async (event, { server, username, password, action, extraParams = {}, bypassCache = false }) => {
    // Create a unique key based on the request parameters
    const cacheKey = JSON.stringify({ server, username, action, extraParams });
    const now = Date.now();

    if (bypassCache) console.log(`[Cache] Manual bypass for ${action}`);

    // Check cache
    if (!bypassCache && apiCache.has(cacheKey)) {
        const entry = apiCache.get(cacheKey);
        const age = now - entry.timestamp;
        if (age < CACHE_TTL) {
            console.log(`[Cache] HIT: ${action} (Age: ${(age/1000).toFixed(1)}s)`);
            return { success: true, data: entry.data, fromCache: true };
        } else {
            console.log(`[Cache] EXPIRED: ${action} (Age: ${(age/1000).toFixed(1)}s)`);
        }
    } else if (!bypassCache) {
        console.log(`[Cache] MISS: ${action}`);
    }

    try {
        const base = server.replace(/\/$/, "");
        const url = new URL(`${base}/player_api.php`);
        url.searchParams.append('username', username);
        url.searchParams.append('password', password);
        url.searchParams.append('action', action);
        
        Object.entries(extraParams).forEach(([key, val]) => {
            url.searchParams.append(key, val);
        });

        const response = await axios.get(url.toString(), { 
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        // Store in cache
        apiCache.set(cacheKey, { data: response.data, timestamp: now });

        return { success: true, data: response.data, fromCache: false };
    } catch (error) {
        console.error(`XC API Error (${action}):`, error.message);
        return { success: false, error: error.message };
    }
});

// VLC Launcher (reuses same window)
let vlcProcess = null;

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
        vlcPath = process.platform === 'win32' ? 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' : (process.platform === 'darwin' ? '/Applications/VLC.app/Contents/MacOS/VLC' : 'vlc');
    }

    // Close existing VLC process if running
    if (vlcProcess && !vlcProcess.killed) {
        console.log(`Closing existing VLC process to reuse window...`);
        vlcProcess.kill();
        vlcProcess = null;
        // Wait a bit for VLC to close
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Launching VLC: ${vlcPath} -> ${streamUrl}`);

    const args = [streamUrl, '--one-instance', '--playlist-enqueue'];
    if (title) args.push(`--meta-title=${title}`);
    vlcProcess = spawn(vlcPath, args, { stdio: 'ignore' });

    // Clean up reference when VLC closes
    vlcProcess.on('exit', () => {
        console.log(`VLC process exited`);
        vlcProcess = null;
    });

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
        output += `[Profile_${p.id}]\nid=${p.id}\nname=${p.name}\nusername=${p.username}\npassword=${p.password}\nservers=${(p.servers || []).join(',')}\nfavorites=${(p.favorites || []).join(',')}\n\n`;
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
            if (key === 'servers' || key === 'favorites') {
                currentProfile[key] = value ? value.split(',') : [];
            } else {
                currentProfile[key] = value;
            }
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

// Old download handler removed - see improved implementation below (line ~730)

// Image Caching with Concurrency Queue
const imageQueue = [];
let activeImageDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 5;

const processImageQueue = async () => {
    if (activeImageDownloads >= MAX_CONCURRENT_DOWNLOADS || imageQueue.length === 0) return;

    activeImageDownloads++;
    const { url, profileId, resolve } = imageQueue.shift();

    try {
        const paths = getProfileCachePaths(profileId);
        const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
        
        if (!fs.existsSync(filePath)) {
            const res = await axios({ 
                url, 
                method: 'GET', 
                responseType: 'stream', 
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            const writer = fs.createWriteStream(filePath);
            res.data.pipe(writer);
            await new Promise((resW, rejW) => {
                writer.on('finish', resW);
                writer.on('error', rejW);
            });
        }
        resolve(true);
    } catch (e) {
        console.error(`Failed to cache image: ${url}`, e.message);
        resolve(false);
    } finally {
        activeImageDownloads--;
        processImageQueue(); // Pick up next task
    }
};

ipcMain.handle('check-image-cache', async (event, { url, profileId }) => {
    if (!url || !profileId) return null;
    const paths = getProfileCachePaths(profileId);
    const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
    return fs.existsSync(filePath) ? `file://${filePath}` : null;
});

ipcMain.handle('check-image-cache-batch', async (event, { urls, profileId }) => {
    if (!urls || !profileId) return {};
    const paths = getProfileCachePaths(profileId);
    const results = {};
    
    urls.forEach(url => {
        if (!url) return;
        const filename = crypto.createHash('md5').update(url).digest('hex');
        const filePath = path.join(paths.images, filename);
        if (fs.existsSync(filePath)) {
            results[url] = `file://${filePath}`;
        }
    });
    
    return results;
});

ipcMain.handle('cache-image', async (event, { url, profileId }) => {
    if (!url || !profileId) return;
    
    // Check if already cached first to avoid unnecessary queuing
    const paths = getProfileCachePaths(profileId);
    const filePath = path.join(paths.images, crypto.createHash('md5').update(url).digest('hex'));
    if (fs.existsSync(filePath)) return;

    return new Promise((resolve) => {
        imageQueue.push({ url, profileId, resolve });
        processImageQueue();
    });
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
ipcMain.handle('cast-scan', async () => { 
    console.log("[Chromecast] Starting network scan...");
    castClient.update(); 
    return Object.keys(castDevices); 
});
ipcMain.handle('cast-play', async (event, deviceName, streamUrl) => {
    const device = castDevices[deviceName];
    if (!device) {
        console.error(`[Cast] Playback failed: Device "${deviceName}" not found in cache.`);
        return { success: false, error: 'Device not found' };
    }
    activeCastDeviceName = deviceName;
    const proxyUrl = `http://${getLocalIP()}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
    
    console.log(`[Cast] Sending stream to ${deviceName}...`);
    console.log(`[Cast] Original URL: ${streamUrl}`);
    console.log(`[Cast] Proxy URL: ${proxyUrl}`);

    return new Promise((resolve) => { 
        device.play(proxyUrl, (err) => {
            if (err) {
                console.error(`[Cast] Playback Error on ${deviceName}:`, err.message);
                resolve({ success: false, error: err.message });
            } else {
                console.log(`[Cast] Playback started successfully on ${deviceName}`);
                resolve({ success: true });
            }
        }); 
    });
});
ipcMain.handle('cast-stop', async (event, deviceName) => {
    const name = deviceName || activeCastDeviceName;
    const device = castDevices[name];
    if (!device) return { success: false };
    return new Promise((resolve) => { device.stop(() => { if (name === activeCastDeviceName) activeCastDeviceName = null; resolve({ success: true }); }); });
});

// Download management with Queue (only 1 active download at a time)
const activeDownloads = {};
const downloadQueue = [];
let currentDownload = null;

const finishTask = (id) => {
    if (currentDownload && currentDownload.id === id) {
        console.log(`[Queue] Task ${id} finished (natural or error). Clearing currentDownload.`);
        currentDownload = null;
        // Schedule next check on next tick to avoid deep recursion
        setImmediate(() => processDownloadQueue());
    } else {
        console.log(`[Queue] finishTask called for ${id}, but currentDownload is ${currentDownload ? currentDownload.id : 'null'}. Skipping.`);
    }
};

const processDownloadQueue = async () => {
    console.log(`[Queue] processDownloadQueue called. Current: ${currentDownload ? currentDownload.id : 'none'}, Queue size: ${downloadQueue.length}`);

    if (currentDownload) {
        return;
    }

    if (downloadQueue.length === 0) {
        console.log(`[Queue] Queue is empty.`);
        return;
    }

    const downloadTask = downloadQueue.shift();
    currentDownload = downloadTask;
    const { id, url, name, profileId } = downloadTask;

    console.log(`\n========== DOWNLOAD START: ${name} (${id}) ==========`);

    try {
        // Get event from mainWindow
        if (!mainWindow || mainWindow.isDestroyed()) {
            throw new Error('Main window not available');
        }
        const event = { sender: mainWindow.webContents };

        // Initialize tracking early
        activeDownloads[id] = { cancelled: false };

        // Validate profileId
        if (!profileId) {
            throw new Error('Profile ID is missing');
        }

        const paths = getProfileCachePaths(profileId);
        const downloadsDir = path.join(paths.profile, 'downloads');

        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        // Sanitize filename
        const sanitizedName = name.replace(/[^a-z0-9\s\-_.()]/gi, '_');
        const ext = url.includes('.m3u8') ? '.mp4' : path.extname(url) || '.mp4';
        const filePath = path.join(downloadsDir, `${sanitizedName}${ext}`);

        // Send initial progress
        event.sender.send('download-progress', {
            id,
            progress: 0,
            speed: '0 KB/s',
            status: 'downloading'
        });

        const strategies = [];
        if (url.includes('.m3u8')) {
            strategies.push({ name: 'HLS (ffmpeg)', fn: () => downloadHLS(event, id, url, filePath) });
            strategies.push({ name: 'Stream Recording', fn: () => downloadStream(event, id, url, filePath) });
        } else if (url.includes('/live/')) {
            strategies.push({ name: 'Stream Recording', fn: () => downloadStream(event, id, url, filePath) });
            strategies.push({ name: 'Direct Download', fn: () => downloadDirect(event, id, url, filePath) });
        } else {
            strategies.push({ name: 'Direct Download', fn: () => downloadDirect(event, id, url, filePath) });
            strategies.push({ name: 'Stream Recording', fn: () => downloadStream(event, id, url, filePath) });
        }
        strategies.push({ name: 'Electron Native', fn: () => downloadElectron(event, id, url, filePath) });

        let success = false;
        let lastError = null;

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            
            if (activeDownloads[id]?.cancelled) {
                console.log(`[Download ${id}] Cancelled before strategy ${strategy.name}`);
                throw new Error('Download cancelled');
            }

            console.log(`[Download ${id}] Trying Strategy: ${strategy.name}`);
            try {
                await strategy.fn();
                success = true;
                console.log(`[Download ${id}] ✓ ${strategy.name} Success`);
                break;
            } catch (err) {
                lastError = err;
                console.log(`[Download ${id}] ✗ ${strategy.name} Failed: ${err.message}`);
                if (err.message === 'Download cancelled' || activeDownloads[id]?.cancelled) {
                    throw new Error('Download cancelled');
                }
            }
        }

        if (!success) {
            throw lastError || new Error('All download strategies failed');
        }

        console.log(`========== DOWNLOAD COMPLETE: ${id} ==========`);

    } catch (error) {
        console.error(`========== DOWNLOAD ERROR: ${id} ==========`, error.message);
        const isCancel = error.message === 'Download cancelled' || activeDownloads[id]?.cancelled;
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', {
                id,
                progress: 0,
                speed: '0 KB/s',
                status: isCancel ? 'cancelled' : 'error',
                error: isCancel ? null : error.message
            });
        }
    } finally {
        delete activeDownloads[id];
        finishTask(id);
    }
};

ipcMain.handle('start-download', async (event, { id, url, name, profileId }) => {
    // Add to queue
    downloadQueue.push({ id, url, name, profileId });
    console.log(`[Queue] ➕ Added "${name}" (${id}) to queue. Total in queue: ${downloadQueue.length}. Current active: ${currentDownload ? currentDownload.id : 'none'}`);

    // Trigger queue processing
    processDownloadQueue();

    return { success: true, queued: true };
});

// Strategy 1: Direct download
async function downloadDirect(event, id, url, filePath) {
    return new Promise(async (resolve, reject) => {
        console.log(`[Download ${id}] Direct download: Initiating axios GET request...`);
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                onDownloadProgress: (progressEvent) => {
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
                    const elapsed = (now - (activeDownloads[id]?.lastTime || now)) / 1000;
                    const bytes = current - (activeDownloads[id]?.lastLoaded || 0);
                    const speed = elapsed > 0 ? bytes / elapsed : 0;

                    activeDownloads[id] = {
                        ...activeDownloads[id],
                        lastTime: now,
                        lastLoaded: current
                    };

                    const speedText = formatSpeed(speed);

                    event.sender.send('download-progress', {
                        id,
                        progress,
                        speed: speedText,
                        status: 'downloading'
                    });
                }
            });

            console.log(`[Download ${id}] Direct download: Response received, status ${response.status}`);
            console.log(`[Download ${id}] Direct download: Creating write stream and piping data...`);

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            writer.on('finish', () => {
                console.log(`[Download ${id}] Direct download: Write stream finished`);
                delete activeDownloads[id];
                event.sender.send('download-progress', {
                    id,
                    progress: 100,
                    speed: '0 KB/s',
                    status: 'completed'
                });
                resolve();
            });

            writer.on('error', (error) => {
                console.error(`[Download ${id}] Direct download: Write stream error:`, error.message);
                delete activeDownloads[id];
                reject(error);
            });

        } catch (error) {
            console.error(`[Download ${id}] Direct download: Axios error:`, error.message);
            if (error.response) {
                console.error(`[Download ${id}] Direct download: HTTP status ${error.response.status}`);
            }
            delete activeDownloads[id];
            reject(error);
        }
    });
}

// Strategy 2: HLS download using ffmpeg
async function downloadHLS(event, id, url, filePath) {
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
        if (activeDownloads[id]) activeDownloads[id].process = ffmpeg;

        let duration = 0;
        let progress = 0;

        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();

            // Parse duration
            const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
            if (durationMatch) {
                duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
            }

            // Parse progress
            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
            if (timeMatch && duration > 0) {
                const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                progress = (currentTime / duration) * 100;

                event.sender.send('download-progress', {
                    id,
                    progress: Math.min(progress, 99),
                    speed: 'Processing...',
                    status: 'downloading'
                });
            }
        });

        ffmpeg.on('close', (code) => {
            delete activeDownloads[id];
            if (code === 0) {
                event.sender.send('download-progress', {
                    id,
                    progress: 100,
                    speed: '0 KB/s',
                    status: 'completed'
                });
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

// Strategy 3: Stream recording
async function downloadStream(event, id, url, filePath) {
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
                if (activeDownloads[id]?.cancelled) {
                    response.destroy();
                    writer.close();
                    reject(new Error('Download cancelled'));
                    return;
                }

                bytesDownloaded += chunk.length;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = bytesDownloaded / elapsed;

                event.sender.send('download-progress', {
                    id,
                    progress: 50, // Unknown total for streams
                    speed: formatSpeed(speed),
                    status: 'downloading'
                });
            });

            writer.on('finish', () => {
                delete activeDownloads[id];
                event.sender.send('download-progress', {
                    id,
                    progress: 100,
                    speed: '0 KB/s',
                    status: 'completed'
                });
                resolve();
            });

            writer.on('error', (error) => {
                delete activeDownloads[id];
                reject(error);
            });
        });

        request.on('error', (error) => {
            delete activeDownloads[id];
            reject(error);
        });

        if (activeDownloads[id]) activeDownloads[id].request = request;
    });
}

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

// Strategy 4: Electron Native Download (final fallback)
async function downloadElectron(event, id, url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`[Download ${id}] Using Electron native download API`);

        if (!mainWindow) {
            reject(new Error('Main window not available'));
            return;
        }

        if (activeDownloads[id]?.cancelled) {
            reject(new Error('Download cancelled'));
            return;
        }

        mainWindow.webContents.downloadURL(url);

        const onDownloadStarted = (downloadEvent, item, webContents) => {
            const itemUrl = item.getURL();
            console.log(`[Download ${id}] Download item received for URL: ${itemUrl.substring(0, 60)}...`);

            if (itemUrl !== url) {
                console.log(`[Download ${id}] URL mismatch, ignoring this download item`);
                return; // Not our download
            }

            // Clean up listener
            mainWindow.webContents.session.removeListener('will-download', onDownloadStarted);

            item.setSavePath(filePath);
            console.log(`[Download ${id}] Native download started, saving to: ${filePath}`);

            if (activeDownloads[id]) activeDownloads[id].item = item;

            item.on('updated', (updateEvent, state) => {
                if (activeDownloads[id]?.cancelled) {
                    item.cancel();
                    return;
                }
                if (state === 'interrupted') {
                    console.log(`[Download ${id}] Interrupted but may be resumable`);
                } else if (state === 'progressing') {
                    if (item.isPaused()) {
                        console.log(`[Download ${id}] Paused`);
                    } else {
                        const total = item.getTotalBytes();
                        const received = item.getReceivedBytes();
                        const progress = total > 0 ? (received / total) * 100 : 0;

                        event.sender.send('download-progress', {
                            id,
                            progress: Math.min(progress, 99),
                            speed: 'Downloading...',
                            status: 'downloading'
                        });
                    }
                }
            });

            item.once('done', (doneEvent, state) => {
                delete activeDownloads[id];

                if (state === 'completed') {
                    console.log(`[Download ${id}] Native download completed successfully`);
                    event.sender.send('download-progress', {
                        id,
                        progress: 100,
                        speed: '0 KB/s',
                        status: 'completed'
                    });
                    resolve();
                } else {
                    console.error(`[Download ${id}] Native download failed with state: ${state}`);
                    reject(new Error(`Download ${state}`));
                }
            });
        };

        mainWindow.webContents.session.on('will-download', onDownloadStarted);

        // Set timeout in case download never triggers
        const timeout = setTimeout(() => {
            mainWindow.webContents.session.removeListener('will-download', onDownloadStarted);
            reject(new Error('Download timeout - no download started within 30 seconds'));
        }, 30000);

        // Clear timeout if download starts
        const originalListener = onDownloadStarted;
        const wrappedListener = (...args) => {
            clearTimeout(timeout);
            originalListener(...args);
        };
        mainWindow.webContents.session.on('will-download', wrappedListener);
    });
}

ipcMain.handle('cancel-download', async (event, { id }) => {
    console.log(`\n[Cancel] ⛔ Request to cancel: ${id}`);

    // Check if it's the currently downloading item
    if (currentDownload && currentDownload.id === id) {
        console.log(`[Cancel] ⛔ This is the ACTIVE download. Queue size before cancel: ${downloadQueue.length}`);

        // Mark as cancelled in activeDownloads - this will be detected by the download strategy
        if (activeDownloads[id]) {
            activeDownloads[id].cancelled = true;

            // Kill processes immediately
            if (activeDownloads[id].process) {
                activeDownloads[id].process.kill();
                console.log(`[Cancel] ✓ Killed ffmpeg process`);
            }
            if (activeDownloads[id].request) {
                activeDownloads[id].request.destroy();
                console.log(`[Cancel] ✓ Destroyed HTTP request`);
            }
            if (activeDownloads[id].item) {
                activeDownloads[id].item.cancel();
                console.log(`[Cancel] ✓ Cancelled Electron download`);
            }
        }

        // Send cancelled status immediately
        event.sender.send('download-progress', {
            id,
            progress: 0,
            speed: '0 KB/s',
            status: 'cancelled'
        });

        // Force stop by clearing current download and starting next if cleanup is slow
        setTimeout(() => {
            if (currentDownload && currentDownload.id === id) {
                console.log(`[Cancel] ⚡ Forcing stop of ${id} (cleanup was slow).`);
                delete activeDownloads[id];
                finishTask(id);
            }
        }, 1000); // 1s safety margin for cleanup
    } else {
        // Remove from queue if it's waiting
        const queueIndex = downloadQueue.findIndex(item => item.id === id);
        if (queueIndex !== -1) {
            const removedItem = downloadQueue.splice(queueIndex, 1)[0];
            console.log(`[Queue] ➖ Removed "${removedItem.name}" from queue. Queue size: ${downloadQueue.length + 1} → ${downloadQueue.length}`);

            // Send cancelled status
            event.sender.send('download-progress', {
                id,
                progress: 0,
                speed: '0 KB/s',
                status: 'cancelled'
            });
        } else {
            console.log(`[Queue] ⚠️  Could not find ${id} in queue (size: ${downloadQueue.length}). Current active: ${currentDownload ? currentDownload.id : 'none'}`);
        }
    }

    return { success: true };
});