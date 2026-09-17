const STORAGE_KEY = 'gargantua.preferences.v1';

function webApi() {
  return Object.freeze({
    platform: 'web',
    async getAppInfo() { return { name: 'Gargantua', version: 'web', platform: 'web' }; },
    async loadPreferences() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
    },
    async savePreferences(value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return value;
    },
    async savePng(arrayBuffer, suggestedName) {
      const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'image/png' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { canceled: false, fileName: suggestedName };
    },
    async copyPng(arrayBuffer) {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image copying is unavailable in this browser.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([arrayBuffer], { type: 'image/png' }) })]);
      return true;
    },
    async toggleFullscreen() {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      return Boolean(document.fullscreenElement);
    },
    onFullscreenChanged(callback) {
      const listener = () => callback(Boolean(document.fullscreenElement));
      document.addEventListener('fullscreenchange', listener);
      return () => document.removeEventListener('fullscreenchange', listener);
    },
  });
}

export function createPlatformApi() {
  return window.gargantuaDesktop || webApi();
}
