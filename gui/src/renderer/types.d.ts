interface TerminalAPI {
  createPty: (id: string, cols: number, rows: number, shell?: string) => void;
  writePty: (id: string, data: string) => void;
  resizePty: (id: string, cols: number, rows: number) => void;
  destroyPty: (id: string) => void;

  addDataListener: (callback: (...args: any[]) => void) => void;
  removeDataListener: (callback: (...args: any[]) => void) => void;
  addExitListener: (callback: (...args: any[]) => void) => void;
  removeExitListener: (callback: (...args: any[]) => void) => void;
  addReadyListener: (callback: (...args: any[]) => void) => void;
  removeReadyListener: (callback: (...args: any[]) => void) => void;
  addErrorListener: (callback: (...args: any[]) => void) => void;
  removeErrorListener: (callback: (...args: any[]) => void) => void;

  listShells: () => Promise<string[]>;
  listDaemonSessions: () => Promise<any[]>;
  attachSession: (id: string) => void;
  onDaemonSessions: (callback: (...args: any[]) => void) => void;
  saveBrowserSessions: (sessions: any[]) => void;
  loadBrowserSessions: () => Promise<any[] | null>;
  openExternal: (url: string) => void;
  setZoom: (factor: number) => void;

  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
}

interface HeloBlueprint {
  name: string;
  runtime: string;
  provider: string;
  model: string;
  claude_md: string | null;
}

interface HeloAPI {
  list: () => Promise<HeloBlueprint[]>;
  status: () => Promise<{ config_path: string; blueprints: number; api_keys: Record<string, boolean> }>;
  add: (input: {
    name: string; runtime: string; provider: string; model: string; claudeMd?: string;
  }) => Promise<{ stdout: string; stderr: string }>;
  remove: (name: string) => Promise<{ stdout: string; stderr: string }>;
  defaultsShow: (runtime: string) => Promise<string>;
  pickDirectory: () => Promise<string | null>;
  pickFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
}

declare global {
  interface Window {
    terminal: TerminalAPI;
    helo: HeloAPI;
  }
}

export {};
