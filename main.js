const { app, BrowserWindow, ipcMain, dialog, webContents } = require('electron');
const path = require('path');

let mainWindow;

app.setName('BROWSER');
app.setPath('userData', path.join(app.getPath('appData'), 'BROWSER'));
app.setPath('sessionData', path.join(app.getPath('userData'), 'Session'));

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  return;
}

function sendShortcutAction(action, payload = {}) {
  const fw = BrowserWindow.getFocusedWindow();
  if (fw && !fw.isDestroyed()) {
    fw.webContents.send('browser-shortcut', { action, payload });
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser-shortcut', { action, payload });
  }
}

function bindShortcutSource(contents) {
  contents.on('before-input-event', (event, input) => {
    const control = input.control || input.meta;
    const shift = input.shift;
    const key = input.key;
    const code = input.code;

    if (control && code === 'KeyT' && !shift) { event.preventDefault(); sendShortcutAction('new-tab'); return; }
    if (control && code === 'KeyW' && !shift) { event.preventDefault(); sendShortcutAction('close-tab'); return; }
    if (control && code === 'KeyT' && shift) { event.preventDefault(); sendShortcutAction('reopen-closed-tab'); return; }
    if (control && code === 'KeyN' && shift) { event.preventDefault(); createIncognitoWindow(); return; }
    if (control && code === 'KeyD' && !shift) { event.preventDefault(); sendShortcutAction('bookmark-current-page'); return; }
    if (control && code === 'KeyB' && shift) { event.preventDefault(); sendShortcutAction('toggle-bookmarks-bar'); return; }
    if (control && code === 'Tab' && !shift) { event.preventDefault(); sendShortcutAction('next-tab'); return; }
    if (control && code === 'Tab' && shift) { event.preventDefault(); sendShortcutAction('previous-tab'); return; }
    if (control && code === 'KeyL') { event.preventDefault(); sendShortcutAction('focus-address'); return; }
    if (control && code === 'Comma') { event.preventDefault(); sendShortcutAction('open-settings'); return; }
    if ((control && code === 'KeyR') || key === 'F5') { event.preventDefault(); sendShortcutAction('refresh'); return; }
    if (input.alt && code === 'ArrowLeft') { event.preventDefault(); sendShortcutAction('go-back'); return; }
    if (input.alt && code === 'ArrowRight') { event.preventDefault(); sendShortcutAction('go-forward'); return; }
    if (control && code === 'KeyF' && !shift) { event.preventDefault(); sendShortcutAction('find-in-page'); return; }
    if (control && code === 'KeyH' && !shift) { event.preventDefault(); sendShortcutAction('open-history'); return; }
    if (control && code === 'KeyS' && !shift) { event.preventDefault(); sendShortcutAction('save-page'); return; }
    if (control && code === 'Equal' && !shift) { event.preventDefault(); sendShortcutAction('zoom-in'); return; }
    if (control && code === 'Minus' && !shift) { event.preventDefault(); sendShortcutAction('zoom-out'); return; }
    if (control && code === 'Digit0' && !shift) { event.preventDefault(); sendShortcutAction('zoom-reset'); return; }
    if (key === 'F11') { event.preventDefault(); sendShortcutAction('toggle-fullscreen'); return; }
    if (key === 'Escape') { sendShortcutAction('escape'); return; }
    if (control && /^Digit[1-9]$/.test(code)) {
      event.preventDefault();
      sendShortcutAction('switch-to-index', { index: code === 'Digit9' ? -1 : Number(code.replace('Digit', '')) - 1 });
      return;
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'Assets', 'Logo.png'),
    backgroundColor: '#1a1b1e',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f1012', symbolColor: '#e8eaed', height: 44 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenu(null);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createIncognitoWindow() {
  const incognitoWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'Assets', 'Logo.png'),
    backgroundColor: '#111111',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#e8eaed', height: 44 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      partition: 'incognito',
    },
    autoHideMenuBar: true,
  });
  incognitoWindow.loadFile('index.html', { query: { incognito: 'true' } });
  incognitoWindow.setMenu(null);
}

ipcMain.on('create-incognito-window', () => { createIncognitoWindow(); });

ipcMain.on('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) { win.setFullScreen(!win.isFullScreen()); }
});

ipcMain.handle('save-page', async (event, payload = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return { ok: false, message: 'Окно не найдено' };
    }

    const targetId = Number(payload.webContentsId);
    const target = Number.isInteger(targetId) ? webContents.fromId(targetId) : null;
    if (!target || target.isDestroyed()) {
      return { ok: false, message: 'Активная страница не найдена' };
    }

    const rawTitle = String(payload.title || 'page').trim();
    const safeTitle = rawTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').slice(0, 120) || 'page';

    const result = await dialog.showSaveDialog(win, {
      title: 'Сохранить страницу как',
      defaultPath: `${safeTitle}.html`,
      filters: [
        { name: 'Веб-страница (полная)', extensions: ['html'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }

    await target.savePage(result.filePath, 'HTMLComplete');
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    return { ok: false, message: error?.message || 'Ошибка сохранения страницы' };
  }
});

app.whenReady().then(() => {
  const { session } = require('electron');
  
  const setupSession = (sess) => {
    sess.on('will-download', (event, item, webContents) => {
      const window = BrowserWindow.fromWebContents(webContents) || BrowserWindow.getFocusedWindow() || mainWindow;
      
      const downloadInfo = {
        id: Date.now().toString(),
        filename: item.getFilename(),
        total: item.getTotalBytes(),
        url: item.getURL()
      };
      
      if (window) {
        window.webContents.send('download-started', downloadInfo);
      }

      item.on('updated', (event, state) => {
        if (state === 'interrupted') {
          if (window) window.webContents.send('download-updated', { id: downloadInfo.id, state: 'interrupted' });
        } else if (state === 'progressing') {
          if (window) window.webContents.send('download-updated', { 
            id: downloadInfo.id, 
            state: 'progressing',
            received: item.getReceivedBytes(),
            savePath: item.getSavePath()
          });
        }
      });
      
      item.once('done', (event, state) => {
        if (window) window.webContents.send('download-updated', { id: downloadInfo.id, state, savePath: item.getSavePath() });
      });
    });
  };

  setupSession(session.defaultSession);
  setupSession(session.fromPartition('incognito'));

  app.on('web-contents-created', (_event, contents) => {
    const type = contents.getType();
    if (type === 'window' || type === 'webview') { bindShortcutSource(contents); }
    
    contents.setWindowOpenHandler(({ url }) => {
      let targetWindow = BrowserWindow.fromWebContents(contents) || BrowserWindow.getFocusedWindow() || mainWindow;
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('browser-shortcut', { action: 'open-tab-url', payload: url });
      }
      return { action: 'deny' };
    });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
