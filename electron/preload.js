const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchM3U: (url) => ipcRenderer.invoke('fetch-m3u', url),
  loadLocalM3U: () => ipcRenderer.invoke('load-local-m3u'),
  launchVLC: (url, path, title) => ipcRenderer.invoke('launch-vlc', url, path, title),
  castScan: () => ipcRenderer.invoke('cast-scan'),
  castPlay: (device, url) => ipcRenderer.invoke('cast-play', device, url),
  castStop: (device) => ipcRenderer.invoke('cast-stop', device),
  checkImageCache: (url) => ipcRenderer.invoke('check-image-cache', url),
  cacheImage: (url) => ipcRenderer.invoke('cache-image', url),
  onCastDeviceFound: (callback) => ipcRenderer.on('cast-device-found', (event, name) => callback(name)),
  onProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
  onDownloadLog: (callback) => ipcRenderer.on('download-log', (event, msg) => callback(msg)),
  removeProgressListeners: () => ipcRenderer.removeAllListeners('download-progress'),
  platform: process.platform
});
