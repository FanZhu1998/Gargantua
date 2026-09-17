'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, screen, session } = require('electron');
const path = require('node:path');
const { readFile, writeFile, rename, mkdir } = require('node:fs/promises');
const squirrelStartup = require('electron-squirrel-startup');
const { APP_IDENTITY } = require('./app-identity.cjs');
const { registerSingleInstance } = require('./app-lifecycle.cjs');
const { sanitizePreferences, sanitizeWindowState } = require('./preferences.cjs');

if (process.env.GARGANTUA_TEST_USER_DATA) app.setPath('userData', path.resolve(process.env.GARGANTUA_TEST_USER_DATA));
if (process.platform === 'win32') app.setAppUserModelId(APP_IDENTITY.appUserModelId);

protocol.registerSchemesAsPrivileged([{
  scheme: 'gargantua',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);
const testWithoutOsSandbox = !app.isPackaged && process.env.GARGANTUA_TEST_NO_OS_SANDBOX === '1';
if (!testWithoutOsSandbox) app.enableSandbox();

const rendererRoot = path.join(__dirname, '..', 'renderer');
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; object-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
let mainWindow = null;
let saveWindowTimer = null;
const shouldStartApplication = !squirrelStartup && registerSingleInstance(app, () => mainWindow);

function dataPath(name) { return path.join(app.getPath('userData'), name); }

async function readJson(name, sanitize) {
  try { return sanitize(JSON.parse(await readFile(dataPath(name), 'utf8'))); }
  catch { return sanitize({}); }
}

async function writeJson(name, value) {
  await mkdir(app.getPath('userData'), { recursive: true });
  const destination = dataPath(name);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
}

function assertTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  if (event.sender !== mainWindow?.webContents || !url.startsWith('gargantua://app/')) {
    throw new Error('Untrusted renderer request.');
  }
}

function pngBuffer(value) {
  const buffer = ArrayBuffer.isView(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    : Buffer.from(value || []);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < signature.length || buffer.length > 64 * 1024 * 1024 || !buffer.subarray(0, 8).equals(signature)) {
    throw new TypeError('Invalid PNG image.');
  }
  return buffer;
}

function safeScreenshotName(value) {
  return typeof value === 'string' && /^gargantua-[0-9-]{10,32}\.png$/i.test(value)
    ? value
    : 'gargantua.png';
}

function registerIpc() {
  ipcMain.handle('app:get-info', event => {
    assertTrustedSender(event);
    return { name: app.getName(), version: app.getVersion(), platform: process.platform };
  });
  ipcMain.handle('preferences:load', async event => {
    assertTrustedSender(event);
    return readJson('preferences.json', sanitizePreferences);
  });
  ipcMain.handle('preferences:save', async (event, value) => {
    assertTrustedSender(event);
    const clean = sanitizePreferences(value);
    await writeJson('preferences.json', clean);
    return clean;
  });
  ipcMain.handle('screenshot:save', async (event, payload) => {
    assertTrustedSender(event);
    const buffer = pngBuffer(payload?.bytes);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save black hole image',
      defaultPath: path.join(app.getPath('pictures'), safeScreenshotName(payload?.suggestedName)),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, buffer, { flag: 'w' });
    return { canceled: false, fileName: path.basename(result.filePath) };
  });
  ipcMain.handle('screenshot:copy', (event, value) => {
    assertTrustedSender(event);
    const image = nativeImage.createFromBuffer(pngBuffer(value));
    if (image.isEmpty()) throw new TypeError('The screenshot could not be decoded.');
    require('electron').clipboard.writeImage(image);
    return true;
  });
  ipcMain.handle('window:toggle-fullscreen', event => {
    assertTrustedSender(event);
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
}

async function registerAppProtocol() {
  protocol.handle('gargantua', async request => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.host !== 'app') return new Response('Not found', { status: 404 });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
    catch { return new Response('Bad request', { status: 400 }); }
    const candidate = path.resolve(rendererRoot, `.${pathname}`);
    const contentType = contentTypes.get(path.extname(candidate));
    if (!candidate.startsWith(`${rendererRoot}${path.sep}`) || !contentType) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const body = await readFile(candidate);
      return new Response(body, { status: 200, headers: {
        'Content-Type': contentType,
        'Content-Security-Policy': contentSecurityPolicy,
        'Cache-Control': 'no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function boundsAreVisible(bounds) {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
  return screen.getAllDisplays().some(({ workArea }) => bounds.x < workArea.x + workArea.width - 80 && bounds.x + bounds.width > workArea.x + 80 && bounds.y < workArea.y + workArea.height - 80 && bounds.y + bounds.height > workArea.y + 80);
}

async function createWindow() {
  const saved = await readJson('window-state.json', sanitizeWindowState);
  const initialBounds = boundsAreVisible(saved) ? saved : { width: 1360, height: 860 };
  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 820,
    minHeight: 640,
    show: false,
    backgroundColor: '#07090b',
    title: 'Gargantua',
    icon: path.join(__dirname, '..', '..', 'assets', 'generated', 'icon-256.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  if (saved.maximized) mainWindow.maximize();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('gargantua://app/')) event.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:fullscreen-changed', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:fullscreen-changed', false));
  const scheduleWindowSave = () => {
    clearTimeout(saveWindowTimer);
    saveWindowTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
      const bounds = mainWindow.getNormalBounds();
      writeJson('window-state.json', { ...bounds, maximized: mainWindow.isMaximized() }).catch(() => {});
    }, 250);
  };
  mainWindow.on('resize', scheduleWindowSave);
  mainWindow.on('move', scheduleWindowSave);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL('gargantua://app/index.html');
}

if (shouldStartApplication) app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  registerIpc();
  await registerAppProtocol();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => {
  dialog.showErrorBox('Gargantua could not start', error?.message || String(error));
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => clearTimeout(saveWindowTimer));
