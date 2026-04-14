import { contextBridge, ipcRenderer, webFrame } from 'electron';

contextBridge.exposeInMainWorld('terminal', {
  createPty: (id: string, cols: number, rows: number, shell?: string) =>
    ipcRenderer.send('pty:create', { id, cols, rows, shell }),

  writePty: (id: string, data: string) =>
    ipcRenderer.send('pty:write', { id, data }),

  resizePty: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', { id, cols, rows }),

  destroyPty: (id: string) =>
    ipcRenderer.send('pty:destroy', { id }),

  addDataListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.on('pty:data', callback);
  },
  removeDataListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener('pty:data', callback);
  },
  addExitListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.on('pty:exit', callback);
  },
  removeExitListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener('pty:exit', callback);
  },
  addReadyListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.on('pty:ready', callback);
  },
  removeReadyListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener('pty:ready', callback);
  },
  addErrorListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.on('pty:error', callback);
  },
  removeErrorListener: (callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener('pty:error', callback);
  },

  listShells: (): Promise<string[]> => ipcRenderer.invoke('shells:list'),

  listDaemonSessions: (): Promise<any[]> => ipcRenderer.invoke('daemon:list-sessions'),
  attachSession: (id: string) => ipcRenderer.send('daemon:attach', { id }),
  onDaemonSessions: (callback: (...args: any[]) => void) => {
    ipcRenderer.on('daemon:sessions', callback);
  },

  // Force quit flag — skip saving on "Close All"
  onForceQuit: (callback: () => void) => {
    ipcRenderer.on('app:force-quit', callback);
  },

  // Settings
  loadSettings: (): Promise<any> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: any) => ipcRenderer.send('settings:save', settings),
  setOpacity: (opacity: number) => ipcRenderer.send('window:opacity', opacity),

  // Session persistence
  saveBrowserSessions: (sessions: any[]) => ipcRenderer.send('browser:save', sessions),
  loadBrowserSessions: (): Promise<any[] | null> => ipcRenderer.invoke('browser:load'),
  saveSessionNames: (names: Record<string, string>) => ipcRenderer.send('sessions:save-names', names),
  loadSessionNames: (): Promise<Record<string, string> | null> => ipcRenderer.invoke('sessions:load-names'),

  // Open in system browser
  openExternal: (url: string) => ipcRenderer.send('shell:open-external', url),

  // Zoom
  setZoom: (factor: number) => webFrame.setZoomFactor(factor),

  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
});

contextBridge.exposeInMainWorld('helo', {
  list: (): Promise<any[]> => ipcRenderer.invoke('helo:list'),
  status: (): Promise<any> => ipcRenderer.invoke('helo:status'),
  add: (input: {
    name: string; runtime: string; provider: string; model: string; claudeMd?: string;
  }): Promise<{ stdout: string; stderr: string }> =>
    ipcRenderer.invoke('helo:add', input),
  remove: (name: string): Promise<{ stdout: string; stderr: string }> =>
    ipcRenderer.invoke('helo:remove', name),
  defaultsShow: (runtime: string): Promise<string> =>
    ipcRenderer.invoke('helo:defaults-show', runtime),
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-directory'),
  pickFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-file', filters),
});
