'use strict';

function focusWindow(window) {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  return true;
}

function registerSingleInstance(app, getWindow) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => focusWindow(getWindow()));
  return true;
}

module.exports = { focusWindow, registerSingleInstance };
