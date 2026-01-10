const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchM3U: (data) => ipcRenderer.invoke('fetch-m3u', data),
  loadLocalM3U: (profileId) => ipcRenderer.invoke('load-local-m3u', profileId),
  launchVLC: (url, path, title) => ipcRenderer.invoke('launch-vlc', url, path, title),
  selectVlcPath: () => ipcRenderer.invoke('select-vlc-path'),
  castScan: () => ipcRenderer.invoke('cast-scan'),
  castPlay: (device, url) => ipcRenderer.invoke('cast-play', device, url),
  castStop: (device) => ipcRenderer.invoke('cast-stop', device),
  testIptvApi: (data) => ipcRenderer.invoke('test-iptv-api', data),
  checkImageCache: (data) => ipcRenderer.invoke('check-image-cache', data),
  cacheImage: (data) => ipcRenderer.invoke('cache-image', data),
  cleanupProfileImages: (data) => ipcRenderer.invoke('cleanup-profile-images', data),
  onCastDeviceFound: (callback) => ipcRenderer.on('cast-device-found', (event, name) => callback(name)),
  onM3UData: (callback) => ipcRenderer.on('m3u-batch', (event, data) => callback(data)),
  onProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
  onDownloadLog: (callback) => ipcRenderer.on('download-log', (event, msg) => callback(msg)),
  removeProgressListeners: () => ipcRenderer.removeAllListeners('download-progress'),
  config: {
      load: () => ipcRenderer.invoke('get-config'),
      save: (data) => ipcRenderer.invoke('save-config', data)
  },
  platform: process.platform
});
