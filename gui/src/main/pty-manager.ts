import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { getDefaultShell, getShellByName, type ShellInfo } from './shell-detect';

const sessions = new Map<string, { proc: pty.IPty; shell: ShellInfo }>();

export function createPty(
  id: string,
  cols: number,
  rows: number,
  window: BrowserWindow,
  shellName?: string
): void {
  const shell = shellName ? getShellByName(shellName) ?? getDefaultShell() : getDefaultShell();
  console.log(`[pty] Creating PTY ${id} (${cols}x${rows}) shell=${shell.name}`);

  try {
    const proc = pty.spawn(shell.path, shell.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || process.env.USERPROFILE,
      env: process.env as Record<string, string>,
    });

    console.log(`[pty] Spawned PID ${proc.pid}`);

    proc.onData((data) => {
      window.webContents.send('pty:data', { id, data });
    });

    proc.onExit(({ exitCode }) => {
      console.log(`[pty] Exit ${id} code=${exitCode}`);
      sessions.delete(id);
      window.webContents.send('pty:exit', { id, exitCode });
    });

    sessions.set(id, { proc, shell });
    window.webContents.send('pty:ready', { id, shell: shell.name, pid: proc.pid });
  } catch (err: any) {
    console.error(`[pty] Failed to spawn:`, err);
    window.webContents.send('pty:error', { id, message: err.message || String(err) });
  }
}

export function writePty(id: string, data: string): void {
  sessions.get(id)?.proc.write(data);
}

export function resizePty(id: string, cols: number, rows: number): void {
  sessions.get(id)?.proc.resize(cols, rows);
}

export function destroyPty(id: string): void {
  const entry = sessions.get(id);
  if (entry) {
    console.log(`[pty] Destroying ${id} (PID ${entry.proc.pid}), active sessions: ${sessions.size}`);
    entry.proc.kill();
    sessions.delete(id);
    console.log(`[pty] Remaining sessions: ${sessions.size}`);
  }
}

export function getSessionCount(): number {
  return sessions.size;
}

export function destroyAll(): void {
  const entries = [...sessions.entries()];
  sessions.clear();
  for (const [, entry] of entries) {
    entry.proc.kill();
  }
}
