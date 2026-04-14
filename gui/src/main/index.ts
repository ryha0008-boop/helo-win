import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import * as ptyClient from './pty-client';
import * as ptyManager from './pty-manager';
import { detectShells } from './shell-detect';
import { registerHeloHandlers } from './helo-bridge';

let mainWindow: BrowserWindow | null = null;
let forceQuit = false;
let useDaemon = false;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true, // Enable window snap on Windows (WM_NCHITTEST)
    backgroundColor: '#070a14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[main] ready-to-show fired');
    mainWindow?.maximize();
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  // Fallback show
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[main] Force showing window');
      mainWindow.maximize();
      mainWindow.show();
    }
  }, 5000);

  // Try to connect to daemon
  ptyClient.initClient(mainWindow).then(() => {
    useDaemon = true;
    console.log('[main] Daemon connected');
    ptyClient.listSessions().then((sessions) => {
      const alive = sessions.filter((s: any) => s.alive);
      if (alive.length > 0) {
        mainWindow?.webContents.send('daemon:sessions', alive);
      }
    });
  }).catch((err) => {
    console.log('[main] Daemon not available, using direct PTY:', err?.message);
    useDaemon = false;
  });

  mainWindow.on('close', (e) => {
    if (forceQuit) return;

    const count = useDaemon ? 1 : ptyManager.getSessionCount(); // Assume active if daemon
    if (count > 0) {
      e.preventDefault();

      const buttons = useDaemon
        ? ['Keep Running & Close', 'Close All & Exit', 'Cancel']
        : ['Close All & Exit', 'Cancel'];

      dialog.showMessageBox(mainWindow!, {
        type: 'question',
        buttons,
        defaultId: useDaemon ? 0 : 1,
        cancelId: useDaemon ? 2 : 1,
        title: 'Close Terminal',
        message: 'You have active terminals.',
        detail: useDaemon
          ? 'Keep Running: terminals stay alive, restored on next launch.\nClose All: kill all terminals and exit.'
          : 'Close all terminals and exit?',
      }).then(({ response }) => {
        if (useDaemon) {
          if (response === 0) {
            // Keep running
            ptyClient.disconnect();
            forceQuit = true;
            mainWindow?.close();
          } else if (response === 1) {
            // Close all — signal renderer to skip saving, then clean up
            mainWindow?.webContents.send('app:force-quit');
            ptyClient.shutdownDaemon();
            try { fs.unlinkSync(browserSessionsFile); } catch {}
            try { fs.unlinkSync(sessionNamesFile); } catch {}
            forceQuit = true;
            setTimeout(() => mainWindow?.close(), 300);
          }
        } else {
          if (response === 0) {
            mainWindow?.webContents.send('app:force-quit');
            ptyManager.destroyAll();
            try { fs.unlinkSync(browserSessionsFile); } catch {}
            try { fs.unlinkSync(sessionNamesFile); } catch {}
            forceQuit = true;
            mainWindow?.close();
          }
        }
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers — route to daemon or direct PTY
ipcMain.on('pty:create', (_, { id, cols, rows, shell }) => {
  console.log(`[ipc] pty:create id=${id} cols=${cols} rows=${rows} shell=${shell || 'default'}`);
  if (useDaemon) {
    ptyClient.createPty(id, cols, rows, shell);
  } else if (mainWindow) {
    ptyManager.createPty(id, cols, rows, mainWindow, shell);
  }
});

ipcMain.on('pty:write', (_, { id, data }) => {
  if (useDaemon) ptyClient.writePty(id, data);
  else ptyManager.writePty(id, data);
});

ipcMain.on('pty:resize', (_, { id, cols, rows }) => {
  if (useDaemon) ptyClient.resizePty(id, cols, rows);
  else ptyManager.resizePty(id, cols, rows);
});

ipcMain.on('pty:destroy', (_, { id }) => {
  if (useDaemon) ptyClient.destroyPty(id);
  else ptyManager.destroyPty(id);
});

ipcMain.handle('shells:list', () => {
  return detectShells().map((s) => s.name);
});

ipcMain.handle('daemon:list-sessions', async () => {
  if (useDaemon) return await ptyClient.listSessions();
  return [];
});

ipcMain.on('daemon:attach', (_, { id }) => {
  if (useDaemon) ptyClient.attachSession(id);
});

// Settings persistence
const settingsFile = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('settings:load', () => {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch {}
  return null;
});

ipcMain.on('settings:save', (_, settings: any) => {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch {}
});

// Session persistence
const browserSessionsFile = path.join(app.getPath('userData'), 'browser-sessions.json');
const sessionNamesFile = path.join(app.getPath('userData'), 'session-names.json');

ipcMain.on('sessions:save-names', (_, names: Record<string, string>) => {
  try {
    fs.writeFileSync(sessionNamesFile, JSON.stringify(names));
  } catch {}
});

ipcMain.handle('sessions:load-names', () => {
  try {
    if (fs.existsSync(sessionNamesFile)) {
      return JSON.parse(fs.readFileSync(sessionNamesFile, 'utf8'));
    }
  } catch {}
  return null;
});

ipcMain.on('browser:save', (_, sessions: any[]) => {
  try {
    fs.writeFileSync(browserSessionsFile, JSON.stringify(sessions, null, 2));
  } catch {}
});

ipcMain.handle('browser:load', () => {
  try {
    if (fs.existsSync(browserSessionsFile)) {
      return JSON.parse(fs.readFileSync(browserSessionsFile, 'utf8'));
    }
  } catch {}
  return null;
});

// Open URL in system browser — only allow http(s)
ipcMain.on('shell:open-external', (_, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(url);
    }
  } catch {}
});

// Window opacity
ipcMain.on('window:opacity', (_, opacity: number) => {
  if (mainWindow) mainWindow.setOpacity(Math.max(0.3, Math.min(1, opacity)));
});

// Directory picker — used by BlueprintPanel to choose a project dir.
ipcMain.handle('dialog:pick-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Pick project directory',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// File picker — used by BlueprintPanel to choose a CLAUDE.md template.
ipcMain.handle('dialog:pick-file', async (_event, filters?: { name: string; extensions: string[] }[]) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters,
    title: 'Pick file',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

registerHeloHandlers();

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (!useDaemon) ptyManager.destroyAll();
  app.quit();
});
