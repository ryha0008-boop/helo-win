/**
 * PTY Daemon — runs as a detached background process.
 * Manages PTY sessions, buffers output, survives UI restarts.
 * Communicates via Windows named pipe: \\.\pipe\sidebar-terminal
 */
import * as pty from 'node-pty';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const PIPE_PATH = '\\\\.\\pipe\\sidebar-terminal';
const MAX_BUFFER = 100 * 1024; // 100KB per session
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 min with no clients and no sessions → exit

interface DaemonSession {
  id: string;
  proc: pty.IPty;
  shell: string;
  pid: number;
  buffer: string;
  alive: boolean;
  exitCode?: number;
}

const sessions = new Map<string, DaemonSession>();
const clients = new Set<net.Socket>();
let idleTimer: NodeJS.Timeout | null = null;

// Shell configs
const SHELLS: Record<string, { path: string; args: string[] }> = {
  'Git Bash': { path: 'C:/Program Files/Git/bin/bash.exe', args: ['--login', '-i'] },
  'PowerShell 7': { path: 'C:/Program Files/PowerShell/7/pwsh.exe', args: [] },
  'PowerShell': { path: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', args: [] },
};

function getShell(name?: string) {
  if (name && SHELLS[name]) return { name, ...SHELLS[name] };
  // Find first available
  for (const [n, s] of Object.entries(SHELLS)) {
    if (fs.existsSync(s.path)) return { name: n, ...s };
  }
  return { name: 'Git Bash', path: 'bash.exe', args: ['--login', '-i'] };
}

function broadcast(msg: object, exclude?: net.Socket) {
  const line = JSON.stringify(msg) + '\n';
  for (const client of clients) {
    if (client !== exclude && !client.destroyed) {
      client.write(line);
    }
  }
}

function send(client: net.Socket, msg: object) {
  if (!client.destroyed) {
    client.write(JSON.stringify(msg) + '\n');
  }
}

function appendBuffer(session: DaemonSession, data: string) {
  session.buffer += data;
  if (session.buffer.length > MAX_BUFFER) {
    session.buffer = session.buffer.slice(-MAX_BUFFER);
  }
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (clients.size === 0 && sessions.size === 0) {
    idleTimer = setTimeout(() => {
      console.log('[daemon] Idle timeout, exiting');
      process.exit(0);
    }, IDLE_TIMEOUT);
  } else {
    idleTimer = null;
  }
}

function handleCommand(client: net.Socket, msg: any) {
  switch (msg.cmd) {
    case 'create': {
      const shell = getShell(msg.shell);
      try {
        const proc = pty.spawn(shell.path, shell.args, {
          name: 'xterm-256color',
          cols: msg.cols || 80,
          rows: msg.rows || 24,
          cwd: process.env.HOME || process.env.USERPROFILE,
          env: process.env as Record<string, string>,
        });

        const session: DaemonSession = {
          id: msg.id,
          proc,
          shell: shell.name,
          pid: proc.pid,
          buffer: '',
          alive: true,
        };

        proc.onData((data) => {
          appendBuffer(session, data);
          broadcast({ event: 'data', id: msg.id, data });
        });

        proc.onExit(({ exitCode }) => {
          session.alive = false;
          session.exitCode = exitCode;
          broadcast({ event: 'exit', id: msg.id, exitCode });
          // Keep dead sessions for potential inspection, clean up after a while
          setTimeout(() => {
            if (!session.alive) {
              sessions.delete(msg.id);
              resetIdleTimer();
            }
          }, 60000);
        });

        sessions.set(msg.id, session);
        broadcast({ event: 'ready', id: msg.id, shell: shell.name, pid: proc.pid });
        resetIdleTimer();
      } catch (err: any) {
        send(client, { event: 'error', id: msg.id, message: err.message });
      }
      break;
    }

    case 'write': {
      const s = sessions.get(msg.id);
      if (s?.alive) s.proc.write(msg.data);
      break;
    }

    case 'resize': {
      const s = sessions.get(msg.id);
      if (s?.alive) s.proc.resize(msg.cols, msg.rows);
      break;
    }

    case 'destroy': {
      const s = sessions.get(msg.id);
      if (s) {
        if (s.alive) s.proc.kill();
        sessions.delete(msg.id);
        resetIdleTimer();
      }
      break;
    }

    case 'list': {
      const list = [...sessions.values()].map((s) => ({
        id: s.id,
        shell: s.shell,
        pid: s.pid,
        alive: s.alive,
        exitCode: s.exitCode,
      }));
      send(client, { event: 'sessions', sessions: list });
      break;
    }

    case 'attach': {
      const s = sessions.get(msg.id);
      if (s) {
        // Replay buffered output
        if (s.buffer.length > 0) {
          send(client, { event: 'data', id: msg.id, data: s.buffer });
        }
        if (!s.alive) {
          send(client, { event: 'exit', id: msg.id, exitCode: s.exitCode ?? -1 });
        } else {
          send(client, { event: 'ready', id: msg.id, shell: s.shell, pid: s.pid });
        }
      }
      break;
    }

    case 'ping': {
      send(client, { event: 'pong' });
      break;
    }

    case 'shutdown': {
      console.log('[daemon] Shutdown requested');
      for (const [, s] of sessions) {
        if (s.alive) s.proc.kill();
      }
      sessions.clear();
      server.close();
      setTimeout(() => process.exit(0), 500);
      break;
    }
  }
}

// Start server
const server = net.createServer((client) => {
  console.log('[daemon] Client connected');
  clients.add(client);
  resetIdleTimer();

  let partial = '';

  client.on('data', (chunk) => {
    partial += chunk.toString();
    const lines = partial.split('\n');
    partial = lines.pop()!; // Keep incomplete line
    for (const line of lines) {
      if (line.trim()) {
        try {
          handleCommand(client, JSON.parse(line));
        } catch (e) {
          console.error('[daemon] Bad message:', line, e);
        }
      }
    }
  });

  client.on('close', () => {
    console.log('[daemon] Client disconnected');
    clients.delete(client);
    resetIdleTimer();
  });

  client.on('error', () => {
    clients.delete(client);
    resetIdleTimer();
  });
});

let listenRetries = 0;
const MAX_LISTEN_RETRIES = 3;

function handleListenError(err: any) {
  if (err.code === 'EADDRINUSE') {
    // Try to connect — if it fails, the pipe is stale and we can take over
    const testConn = net.connect(PIPE_PATH);
    testConn.on('connect', () => {
      console.log('[daemon] Another instance is running, exiting');
      testConn.destroy();
      process.exit(0);
    });
    testConn.on('error', () => {
      listenRetries++;
      if (listenRetries > MAX_LISTEN_RETRIES) {
        console.error(`[daemon] Failed to acquire pipe after ${MAX_LISTEN_RETRIES} retries, exiting`);
        process.exit(1);
      }
      console.log(`[daemon] Stale pipe detected, retrying (${listenRetries}/${MAX_LISTEN_RETRIES})...`);
      server.removeListener('error', handleListenError);
      server.once('error', handleListenError);
      setTimeout(() => server.listen(PIPE_PATH), 500);
    });
    return;
  }
  console.error('[daemon] Server error:', err);
}

server.on('error', handleListenError);

server.listen(PIPE_PATH, () => {
  console.log(`[daemon] Listening on ${PIPE_PATH}`);
  // Write PID file so the client knows we're running
  const pidFile = path.join(process.env.APPDATA || '', 'sidebar-terminal', 'daemon.pid');
  try {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(process.pid));
  } catch {}
  resetIdleTimer();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[daemon] SIGTERM received');
  for (const [, s] of sessions) {
    if (s.alive) s.proc.kill();
  }
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  // Ignore SIGINT — daemon should keep running
});
