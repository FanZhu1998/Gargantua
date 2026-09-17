'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gargantuaDesktop', Object.freeze({
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  loadPreferences: () => ipcRenderer.invoke('preferences:load'),
  savePreferences: preferences => ipcRenderer.invoke('preferences:save', preferences),
  savePng: (arrayBuffer, suggestedName) => ipcRenderer.invoke('screenshot:save', { bytes: new Uint8Array(arrayBuffer), suggestedName }),
  copyPng: arrayBuffer => ipcRenderer.invoke('screenshot:copy', new Uint8Array(arrayBuffer)),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  onFullscreenChanged: callback => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required.');
    const listener = (_event, value) => callback(value === true);
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
}));
