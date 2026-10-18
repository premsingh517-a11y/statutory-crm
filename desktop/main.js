// NeuSource Statutory CRM — Windows desktop app (Electron)
// Runs the same portal inside its own window. Three ways to work:
//   local  — data on this computer (default)
//   client — connect to the main office PC that runs the CRM
//   online — data in an online PostgreSQL database (e.g. Neon)
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const APP_NAME = 'NeuSource Statutory CRM';
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.neusource.statutorycrm');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const USER = app.getPath('userData');
const CFG_FILE = path.join(USER, 'config.json');
const DATA_DIR = path.join(USER, 'pgdata');
const BACKUP_DIR = path.join(USER, 'backups');
const LOG_DIR = path.join(USER, 'logs');
const ICON = path.join(__dirname, 'icon.png');
const DEFAULTS = { mode: 'local', port: 3000, lan: false, serverUrl: '', databaseUrl: '', downloads: '' };

function readCfg() { try { return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'))); } catch (e) { return Object.assign({}, DEFAULTS); } }
function writeCfg(c) { fs.mkdirSync(USER, { recursive: true }); fs.writeFileSync(CFG_FILE, JSON.stringify(c, null, 2)); }
let cfg = readCfg();
if (!cfg.sessionSecret) { cfg.sessionSecret = crypto.randomBytes(32).toString('hex'); writeCfg(cfg); }

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const isPgDir = d => { try { return fs.existsSync(path.join(d, 'PG_VERSION')); } catch (e) { return false; } };
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

// --- local data housekeeping (runs before the database opens) ---
function prepareLocalData() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  // import data from the old portal folder (chosen from the menu, done on restart)
  if (cfg.importFrom) {
    const from = cfg.importFrom; delete cfg.importFrom; writeCfg(cfg);
    if (isPgDir(from)) {
      if (isPgDir(DATA_DIR)) fs.renameSync(DATA_DIR, path.join(BACKUP_DIR, 'before-import_' + stamp()));
      fs.cpSync(from, DATA_DIR, { recursive: true });
      cfg.justImported = true; writeCfg(cfg);
    }
  }
  // automatic backup once a day (at the first start of the day); keep the latest 7
  const today = path.join(BACKUP_DIR, 'auto_' + stamp().slice(0, 10));
  if (isPgDir(DATA_DIR) && !fs.existsSync(today)) {
    try {
      fs.cpSync(DATA_DIR, today, { recursive: true });
      const autos = fs.readdirSync(BACKUP_DIR).filter(n => n.startsWith('auto_')).sort();
      autos.slice(0, Math.max(0, autos.length - 7)).forEach(n => fs.rmSync(path.join(BACKUP_DIR, n), { recursive: true, force: true }));
    } catch (e) { console.error('Backup failed:', e.message); }
  }
}

// --- start the portal server inside the app ---
let baseUrl = '', actualPort = 0;
async function startServer() {
  process.env.DATA_DIR = DATA_DIR;
  process.env.LOG_DIR = LOG_DIR;
  process.env.SESSION_SECRET = cfg.sessionSecret;
  if (cfg.mode === 'online' && cfg.databaseUrl) process.env.DATABASE_URL = cfg.databaseUrl; else delete process.env.DATABASE_URL;
  const { start } = require(path.join(__dirname, '..', 'server.js'));
  const host = cfg.lan ? '0.0.0.0' : '127.0.0.1';
  let lastErr;
  for (let p = Number(cfg.port) || 3000, tries = 0; tries < 15; p++, tries++) {
    try { await start(p, host); actualPort = p; baseUrl = 'http://127.0.0.1:' + p; return; }
    catch (e) { lastErr = e; if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw lastErr;
}

// --- window ---
let win = null, settingsWin = null;
function createWindow(url) {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1000, minHeight: 640, show: false, icon: ICON, title: APP_NAME,
    backgroundColor: '#faf7f5', webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('page-title-updated', e => e.preventDefault());
  // links to other websites open in the normal browser
  win.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https?:/i.test(u)) shell.openExternal(u); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(url)) { e.preventDefault(); shell.openExternal(u); } });
  win.webContents.on('did-fail-load', (e, code, desc, failedUrl) => {
    if (code === -3) return; // aborted (normal)
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: failedUrl || url, mode: cfg.mode } });
  });
  win.loadURL(url);
}

// Word / ZIP / Excel downloads go straight to Downloads\NeuSource CRM
function setupDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    const dir = cfg.downloads || path.join(app.getPath('downloads'), 'NeuSource CRM');
    fs.mkdirSync(dir, { recursive: true });
    const name = item.getFilename(), ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    let target = path.join(dir, name);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, base + ' (' + i + ')' + ext);
    item.setSavePath(target);
    item.once('done', (ev, state) => {
      if (state !== 'completed') return;
      if (Notification.isSupported()) {
        const n = new Notification({ title: 'Saved: ' + path.basename(target), body: 'In ' + dir + ' — click to open the folder', icon: ICON });
        n.on('click', () => shell.showItemInFolder(target)); n.show();
      }
    });
  });
}

function openSettings() {
  if (settingsWin) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 680, height: 720, parent: win || undefined, modal: !!win, icon: ICON, title: 'Settings — ' + APP_NAME, resizable: true, autoHideMenuBar: true,
    backgroundColor: '#ffffff', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  settingsWin.setMenu(null);
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
}
ipcMain.handle('cfg:get', () => ({ cfg: Object.assign({}, cfg, { sessionSecret: undefined }), lan: lanAddresses(), port: actualPort, dataDir: DATA_DIR, version: app.getVersion(), downloadsDefault: path.join(app.getPath('downloads'), 'NeuSource CRM') }));
ipcMain.handle('cfg:save', (e, next) => {
  const keep = ['mode', 'port', 'lan', 'serverUrl', 'databaseUrl', 'downloads'];
  keep.forEach(k => { if (k in next) cfg[k] = next[k]; });
  cfg.port = Math.min(65535, Math.max(1024, parseInt(cfg.port, 10) || 3000));
  writeCfg(cfg);
  app.relaunch(); app.exit(0);
});
ipcMain.handle('dl:choose', async () => {
  const r = await dialog.showOpenDialog(settingsWin, { title: 'Folder for downloaded documents', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? '' : r.filePaths[0];
});

async function importOldData() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Select the "data" folder of the old portal (the folder that contains "pgdata")', properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return;
  let pick = r.filePaths[0];
  if (!isPgDir(pick) && isPgDir(path.join(pick, 'pgdata'))) pick = path.join(pick, 'pgdata');
  if (!isPgDir(pick) && isPgDir(path.join(pick, 'data', 'pgdata'))) pick = path.join(pick, 'data', 'pgdata');
  if (!isPgDir(pick)) return dialog.showMessageBox(win, { type: 'warning', title: 'Not found', message: 'No portal data was found in this folder.', detail: 'Choose the old portal folder (statutory-crm), its "data" folder, or "data\\pgdata".' });
  const ok = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Import and restart', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Import data',
    message: 'Import clients, CA firms, users and templates from the old portal?',
    detail: 'The data now in this app is kept as a backup first. Close the old portal (START.bat window) before importing.\n\nFrom: ' + pick,
  });
  if (ok.response !== 0) return;
  cfg.importFrom = pick; writeCfg(cfg);
  app.relaunch(); app.exit(0);
}

function teamInfo() {
  if (cfg.mode === 'client') return dialog.showMessageBox(win, { type: 'info', title: 'Team access', message: 'This computer is connected to the main office PC.', detail: 'Address: ' + cfg.serverUrl + '\n\nChange this in Settings.' });
  const ips = lanAddresses();
  if (!cfg.lan) {
    return dialog.showMessageBox(win, {
      type: 'info', buttons: ['Allow office PCs to connect', 'Close'], defaultId: 0, cancelId: 1, title: 'Team access',
      message: 'Only this computer can use the CRM right now.',
      detail: 'To let other executives on the same office Wi-Fi / network use this CRM and its data, allow office PCs to connect. Keep this computer on while they work. Windows may ask to allow the app through the firewall — choose "Private networks" and Allow.',
    }).then(r => { if (r.response === 0) { cfg.lan = true; writeCfg(cfg); app.relaunch(); app.exit(0); } });
  }
  return dialog.showMessageBox(win, {
    type: 'info', buttons: ['Copy address', 'Stop team access', 'Close'], defaultId: 0, cancelId: 2, title: 'Team access',
    message: 'Office PCs can connect to this computer.',
    detail: (ips.length ? 'On the other PCs, install this app → Settings → "Connect to the main office PC" and enter:\n\n' + ips.map(ip => 'http://' + ip + ':' + actualPort).join('\n') + '\n\n(or open that address in Chrome).' : 'This computer is not on a network right now.') + '\n\nKeep this computer on and the app open while others work.',
  }).then(r => {
    if (r.response === 0 && ips[0]) require('electron').clipboard.writeText('http://' + ips[0] + ':' + actualPort);
    if (r.response === 1) { cfg.lan = false; writeCfg(cfg); app.relaunch(); app.exit(0); }
  });
}

function buildMenu() {
  const local = cfg.mode === 'local';
  const tpl = [
    { label: 'File', submenu: [
      { label: 'Open downloads folder', click: () => { const d = cfg.downloads || path.join(app.getPath('downloads'), 'NeuSource CRM'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); } },
      { type: 'separator' },
      { label: 'Import data from old portal…', enabled: local, click: importOldData },
      { label: 'Open backups folder', enabled: local, click: () => { fs.mkdirSync(BACKUP_DIR, { recursive: true }); shell.openPath(BACKUP_DIR); } },
      { label: 'Open data folder', enabled: local, click: () => shell.openPath(USER) },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
      { type: 'separator' },
      { role: 'quit', label: 'Exit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { label: 'Reload', accelerator: 'F5', click: () => win && win.webContents.reload() },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'Developer tools' },
    ] },
    { label: 'Team', submenu: [{ label: 'Team access on office network…', click: teamInfo }, { label: 'Settings…', click: openSettings }] },
    { label: 'Help', submenu: [
      { label: 'Open error log', click: () => { const f = path.join(LOG_DIR, 'error.log'); fs.existsSync(f) ? shell.openPath(f) : dialog.showMessageBox(win, { message: 'No errors have been logged.' }); } },
      { label: 'About', click: () => dialog.showMessageBox(win, { type: 'info', title: 'About', icon: ICON, message: APP_NAME + '  v' + app.getVersion(),
        detail: 'NeuSource Startup Minds India\n\nMode: ' + ({ local: 'Data on this computer', client: 'Connected to ' + cfg.serverUrl, online: 'Online database' })[cfg.mode] + (local ? '\nData folder: ' + USER : '') + '\n\nAll drafts must be reviewed by a CA / CS before signing or filing.' }) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  buildMenu();
  setupDownloads();
  if (cfg.mode === 'client') {
    let u = String(cfg.serverUrl || '').trim();
    if (!u) { openSettings(); return; }
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    baseUrl = u.replace(/\/+$/, '');
    return createWindow(baseUrl + '/');
  }
  try {
    if (cfg.mode === 'local') prepareLocalData();
    await startServer();
  } catch (e) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(path.join(LOG_DIR, 'error.log'), new Date().toISOString() + ' startup: ' + (e && e.stack || e) + '\n'); } catch (x) {}
    const r = await dialog.showMessageBox({ type: 'error', buttons: ['Open settings', 'Exit'], defaultId: 0, cancelId: 1, title: APP_NAME,
      message: 'The CRM could not start.', detail: (cfg.mode === 'online' ? 'Could not connect to the online database. Check the internet connection and the database address in Settings.\n\n' : '') + String(e && e.message || e) });
    if (r.response === 0) return openSettings();
    return app.quit();
  }
  createWindow(baseUrl + '/');
  if (cfg.justImported) {
    delete cfg.justImported; writeCfg(cfg);
    win.webContents.once('did-finish-load', () => dialog.showMessageBox(win, { type: 'info', title: 'Import done', message: 'Your old portal data has been imported.', detail: 'Log in with the same email and password as before.' }));
  }
});
