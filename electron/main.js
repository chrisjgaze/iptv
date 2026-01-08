const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const url = require('url');
const os = require('os');
const ChromecastAPI = require('chromecast-api');

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
// This bypasses User-Agent blocks and CORS issues on the Chromecast side.
const PROXY_PORT = 5181;
const proxyServer = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname === '/stream' && parsedUrl.query.url) {
        const streamUrl = parsedUrl.query.url;
        console.log(`Proxying stream for Chromecast: ${streamUrl}`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // Forward Range header if present (important for some players)
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

            // Forward status and headers
            res.statusCode = response.status;
            
            const contentTypes = {
                'ts': 'video/mp2t',
                'm3u8': 'application/x-mpegURL',
                'mp4': 'video/mp4',
                'mkv': 'video/x-matroska'
            };

            // Determine content type
            let contentType = response.headers['content-type'];
            if (!contentType || contentType === 'application/octet-stream') {
                const ext = streamUrl.split('.').pop().split('?')[0];
                contentType = contentTypes[ext] || 'video/mp2t';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*'); // Allow Chromecast to fetch
            
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            if (response.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            }
            if (response.headers['content-range']) {
                res.setHeader('Content-Range', response.headers['content-range']);
            }
            
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

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Enable experimental codec support (HEVC/H.265) if hardware allows
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors'); // Optional: Helps with some stream fetching

let mainWindow;
// Define cache paths
const USER_DATA_PATH = app.getPath('userData');
const CACHE_FILE_PATH = path.join(USER_DATA_PATH, 'playlist.m3u');
const IMAGE_CACHE_DIR = path.join(USER_DATA_PATH, 'images');

// Ensure image cache directory exists
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

// Chromecast Manager
const castClient = new ChromecastAPI();
let castDevices = {};
let activeCastDeviceName = null;

castClient.on('device', function (device) {
    // Determine a friendly name
    const name = device.friendlyName || device.name;
    if (!castDevices[name]) {
        console.log(`Chromecast found: ${name}`);
        castDevices[name] = device;
        // Notify renderer if window is open
        if (mainWindow) {
            mainWindow.webContents.send('cast-device-found', name);
        }
    }
});

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Often needed for fetching images from various sources in local players
    },
  });

  // In production, load the index.html. In dev, load localhost.
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- IPC Handlers ---

// Fetch M3U content (Bypasses CORS) and cache it
ipcMain.handle('fetch-m3u', async (event, url) => {
  try {
    console.log(`Fetching M3U from: ${url}`);
    
    let lastLoaded = 0;
    let lastTime = Date.now();
    let speed = 0;

    const response = await axios.get(url, {
      timeout: 300000, // 5 minutes timeout
      responseType: 'text',
      headers: {
        'User-Agent': 'IPTVApp/1.0 ElectronFetcher'
      },
      onDownloadProgress: (progressEvent) => {
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTime;
        
        // Calculate speed every 500ms to avoid UI spam
        if (timeDiff >= 500) {
          const loadedDiff = progressEvent.loaded - lastLoaded;
          speed = (loadedDiff / timeDiff) * 1000; // Bytes per second
          
          lastLoaded = progressEvent.loaded;
          lastTime = currentTime;

          // Send progress to renderer
          if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
              connected: true,
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              speed: speed
            });
          }
        }
      }
    });

    // Save to disk on success
    try {
        fs.writeFileSync(CACHE_FILE_PATH, response.data);
        console.log(`M3U cached to: ${CACHE_FILE_PATH}`);
    } catch (fsError) {
        console.error("Failed to cache M3U:", fsError);
        // We don't fail the fetch just because caching failed, but good to know
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error fetching M3U:', error.message);
    return { success: false, error: error.message };
  }
});

// Load local M3U from cache
ipcMain.handle('load-local-m3u', async () => {
    try {
        if (fs.existsSync(CACHE_FILE_PATH)) {
            console.log(`Loading M3U from cache: ${CACHE_FILE_PATH}`);
            const data = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
            return { success: true, data };
        }
        return { success: false, error: 'No cache file found' };
    } catch (error) {
        console.error('Error loading local M3U:', error);
        return { success: false, error: error.message };
    }
});

// Launch VLC
ipcMain.handle('launch-vlc', async (event, streamUrl, customVlcPath) => {
  try {
    // Default paths based on OS
    let vlcPath = customVlcPath;
    
    if (!vlcPath) {
        if (process.platform === 'win32') {
            vlcPath = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
        } else if (process.platform === 'darwin') {
            vlcPath = '/Applications/VLC.app/Contents/MacOS/VLC';
        } else {
            vlcPath = 'vlc'; // Linux assumes in PATH
        }
    }

    console.log(`Launching VLC: ${vlcPath} -> ${streamUrl}`);
    
    // Spawn VLC detached
    const subprocess = spawn(vlcPath, [streamUrl], {
      detached: true,
      stdio: 'ignore'
    });
    
    subprocess.unref();
    return { success: true };
  } catch (error) {
    console.error('Error launching VLC:', error);
    return { success: false, error: error.message };
  }
});

// --- Chromecast Handlers ---

ipcMain.handle('cast-scan', async () => {
    // Trigger a fresh search if needed, but the listener is already active.
    // We update the list just in case.
    castClient.update(); 
    return Object.keys(castDevices);
});

ipcMain.handle('cast-play', async (event, deviceName, streamUrl) => {
    const device = castDevices[deviceName];
    if (!device) {
        return { success: false, error: 'Device not found' };
    }

    try {
        activeCastDeviceName = deviceName;
        const localIP = getLocalIP();
        const proxyUrl = `http://${localIP}:${PROXY_PORT}/stream?url=${encodeURIComponent(streamUrl)}`;
        
        console.log(`Casting to ${deviceName} via Proxy: ${proxyUrl}`);
        
        // Simple promise wrapper for the play function
        return new Promise((resolve) => {
            device.play(proxyUrl, (err) => {
                if (err) {
                    console.error("Cast Error:", err);
                    resolve({ success: false, error: err.message || 'Failed to start playback' });
                } else {
                    console.log('Cast playing...');
                    resolve({ success: true });
                }
            });
        });
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('cast-stop', async (event, deviceName) => {
    const nameToStop = deviceName || activeCastDeviceName;
    const device = castDevices[nameToStop];
    
    if (!device) {
        console.log("Stop requested but no active device found to stop.");
        return { success: false };
    }

    try {
        console.log(`Hard Stop: Stopping cast on ${nameToStop}`);
        return new Promise((resolve) => {
            // Close the connection and stop the receiver app
            device.stop(() => {
                if (nameToStop === activeCastDeviceName) activeCastDeviceName = null;
                resolve({ success: true });
            });
        });
    } catch (e) {
        console.error("Stop cast error:", e);
        return { success: false, error: e.message };
    }
});

// --- Image Caching Handlers ---

function getHash(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

ipcMain.handle('check-image-cache', async (event, url) => {
    if (!url) return null;
    const hash = getHash(url);
    const filePath = path.join(IMAGE_CACHE_DIR, hash);
    
    if (fs.existsSync(filePath)) {
        // Return file protocol URL
        return `file://${filePath}`;
    }
    return null;
});

ipcMain.handle('cache-image', async (event, url) => {
    if (!url) return;
    const hash = getHash(url);
    const filePath = path.join(IMAGE_CACHE_DIR, hash);

    if (fs.existsSync(filePath)) return; // Already cached

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e) {
        // console.error(`Failed to cache image ${url}:`, e.message); 
        // Silent fail is fine, we just use remote
    }
});
