/**
 * PTY Client — connects to the PTY daemon from the Electron main process.
 * Spawns the daemon if it's not running.
 */
import * as net from 'net';
import * as path from 'path';
import { spawn } from 'child_process';
import { BrowserWindow } from 'electron';

const PIPE_PATH = '\\\\.\\pipe\\sidebar-terminal';

let connection: net.Socket | null = null;
let mainWindow: BrowserWindow | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let partial = '';

type EventCallback = (msg: any) => void;
const eventCallbacks: EventCallback[] = [];

function onDaemonMessage(msg: any) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  switch (msg.event) {
    case 'data':
      mainWindow.webContents.send('pty:data', { id: msg.id, data: msg.data });
      break;
    case 'exit':
      mainWindow.webContents.send('pty:exit', { id: msg.id, exitCode: msg.exitCode });
      break;
    case 'ready':
      mainWindow.webContents.send('pty:ready', { id: msg.id, shell: msg.shell, pid: msg.pid });
      break;
    case 'error':
      mainWindow.webContents.send('pty:error', { id: msg.id, message: msg.message });
      break;
    case 'sessions':
      mainWindow.webContents.send('daemon:sessions', msg.sessions);
      break;
    case 'pong':
      break;
  }

  for (const cb of eventCallbacks) cb(msg);
}

function sendToDaemon(msg: object) {
  if (connection && !connection.destroyed) {
    connection.write(JSON.stringify(msg) + '\n');
  }
}

function connectToDaemon(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (connection && !connection.destroyed) {
      resolve();
      return;
    }

    const socket = net.connect(PIPE_PATH);
    partial = '';

    socket.on('connect', () => {
      console.log('[client] Connected to daemon');
      connection = socket;
      resolve();
    });

    socket.on('data', (chunk) => {
      partial += chunk.toString();
      const lines = partial.split('\n');
      partial = lines.pop()!;
      for (const line of lines) {
        if (line.trim()) {
          try {
            onDaemonMessage(JSON.parse(line));
          } catch {}
        }
      }
    });

    socket.on('close', () => {
      console.log('[client] Disconnected from daemon');
      connection = null;
    });

    socket.on('error', (err: any) => {
      connection = null;
      reject(err);
    });
  });
}

async function spawnDaemon(): Promise<void> {
  console.log('[client] Spawning daemon...');

  // The daemon script needs to be compiled to JS
  const daemonScript = path.join(__dirname, 'pty-daemon.js');

  // Use the same node/electron executable to run the daemon
  // We need plain Node, not Electron, for the daemon
  const nodePath = process.execPath;

  // If we're running in Electron, we need to find the actual node binary
  // Electron's process.execPath points to electron.exe
  // The daemon needs node-pty which should work with regular Node too
  // But since node-pty is built for Electron's Node ABI, we should use
  // Electron's node to run it
  const child = spawn(nodePath, [daemonScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  child.unref();
  console.log(`[client] Daemon spawned (PID ${child.pid})`);

  // Wait for the daemon to start listening
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      await connectToDaemon();
      return;
    } catch {
      // Not ready yet
    }
  }
  throw new Error('Daemon failed to start');
}

export async function initClient(window: BrowserWindow): Promise<void> {
  mainWindow = window;

  try {
    await connectToDaemon();
    // Request existing sessions
    sendToDaemon({ cmd: 'list' });
  } catch {
    // Daemon not running — try to spawn it
    try {
      await spawnDaemon();
      sendToDaemon({ cmd: 'list' });
    } catch (err) {
      throw new Error('Could not connect to or start daemon');
    }
  }
}

export function createPty(id: string, cols: number, rows: number, shell?: string) {
  sendToDaemon({ cmd: 'create', id, cols, rows, shell });
}

export function writePty(id: string, data: string) {
  sendToDaemon({ cmd: 'write', id, data });
}

export function resizePty(id: string, cols: number, rows: number) {
  sendToDaemon({ cmd: 'resize', id, cols, rows });
}

export function destroyPty(id: string) {
  sendToDaemon({ cmd: 'destroy', id });
}

export function attachSession(id: string) {
  sendToDaemon({ cmd: 'attach', id });
}

export function listSessions(): Promise<any[]> {
  return new Promise((resolve) => {
    const handler = (msg: any) => {
      if (msg.event === 'sessions') {
        const idx = eventCallbacks.indexOf(handler);
        if (idx >= 0) eventCallbacks.splice(idx, 1);
        resolve(msg.sessions);
      }
    };
    eventCallbacks.push(handler);
    sendToDaemon({ cmd: 'list' });
    // Timeout fallback
    setTimeout(() => {
      const idx = eventCallbacks.indexOf(handler);
      if (idx >= 0) eventCallbacks.splice(idx, 1);
      resolve([]);
    }, 2000);
  });
}

export function disconnect() {
  if (connection && !connection.destroyed) {
    connection.end();
    connection = null;
  }
}

export function shutdownDaemon() {
  sendToDaemon({ cmd: 'shutdown' });
  setTimeout(() => disconnect(), 200);
}

export function getSessionCount(): number {
  // This is approximate — real count is on the daemon
  return 0; // We'll use the renderer's count for the close dialog
}
