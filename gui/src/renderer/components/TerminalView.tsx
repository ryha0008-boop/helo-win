import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { tabletTheme } from '../theme';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { Settings, themes } from '../../shared/settings';
import '@xterm/xterm/css/xterm.css';

export interface SessionMeta {
  cwd?: string;
  lastCommand?: string;
  exitCode?: number | null;
  isRunning?: boolean;
}

interface TerminalViewProps {
  sessionId: string;
  isActive: boolean;
  shell?: string;
  fontSize?: number;
  fromDaemon?: boolean;
  tabletMode?: boolean;
  settings?: Settings;
  onSessionInfo?: (id: string, info: { shell?: string; pid?: number }) => void;
  onSessionMeta?: (id: string, meta: SessionMeta) => void;
}

interface SelectionState {
  anchor: { col: number; row: number };
  end: { col: number; row: number };
}

interface TerminalEntry {
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

const terminals = new Map<string, TerminalEntry>();

function getLineText(term: Terminal, row: number): string {
  const line = term.buffer.active.getLine(row);
  return line ? line.translateToString() : '';
}

function applySelection(term: Terminal, sel: SelectionState) {
  const cols = term.cols;
  const aRow = sel.anchor.row;
  const aCol = sel.anchor.col;
  const bRow = sel.end.row;
  const bCol = sel.end.col;

  let startRow: number, startCol: number, endRow: number, endCol: number;
  if (aRow < bRow || (aRow === bRow && aCol <= bCol)) {
    startRow = aRow; startCol = aCol; endRow = bRow; endCol = bCol;
  } else {
    startRow = bRow; startCol = bCol; endRow = aRow; endCol = aCol;
  }

  const length = (endRow - startRow) * cols + (endCol - startCol);
  if (length === 0) {
    term.clearSelection();
    return;
  }
  term.select(startCol, startRow, length);
}

function findWordBoundary(
  term: Terminal,
  col: number,
  row: number,
  direction: -1 | 1
): { col: number; row: number } {
  const cols = term.cols;
  const totalRows = term.buffer.active.length;
  let c = col;
  let r = row;
  let line = getLineText(term, r);
  const isWordChar = (ch: string) => /\w/.test(ch);

  while (true) {
    const next = c + direction;
    if (next < 0) {
      if (r <= 0) break;
      r--; line = getLineText(term, r); c = cols - 1;
    } else if (next >= cols) {
      if (r >= totalRows - 1) break;
      r++; line = getLineText(term, r); c = 0;
    } else { c = next; }
    if (isWordChar(line[c] || ' ')) break;
  }

  while (true) {
    const next = c + direction;
    if (next < 0) {
      if (r <= 0) break;
      r--; line = getLineText(term, r); c = cols - 1;
    } else if (next >= cols) {
      if (r >= totalRows - 1) break;
      r++; line = getLineText(term, r); c = 0;
    } else { c = next; }
    if (!isWordChar(line[c] || ' ')) {
      if (direction === -1) {
        c -= direction;
        if (c >= cols) { c = 0; r++; }
        if (c < 0) { c = cols - 1; r--; }
      }
      break;
    }
  }

  return { col: c, row: r };
}

function getTerminal(id: string) {
  return terminals.get(id) ?? null;
}

function TerminalView({ sessionId, isActive, shell, fontSize = 13, fromDaemon, tabletMode, settings, onSessionInfo, onSessionMeta }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCurrentLine, setSearchCurrentLine] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || initialized.current) return;
    initialized.current = true;

    const activeTheme = themes[settings?.theme || 'neon']?.terminal || themes.neon.terminal;
    const term = new Terminal({
      theme: activeTheme,
      fontFamily: settings?.fontFamily || 'JetBrains Mono, Consolas, monospace',
      fontSize,
      lineHeight: settings?.lineHeight || 1.15,
      cursorBlink: settings?.cursorBlink ?? true,
      cursorStyle: settings?.cursorStyle || 'bar',
      scrollback: settings?.scrollback || 5000,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    // Try WebGL, fall back silently
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // Canvas fallback
    }

    // Clickable hyperlinks in terminal output
    term.loadAddon(new WebLinksAddon((_event, uri) => {
      window.terminal.openExternal(uri);
    }));

    // Ligature support (font must support ligatures, e.g. Fira Code, JetBrains Mono)
    try {
      term.loadAddon(new LigaturesAddon());
    } catch {
      // Ligatures not supported in this environment
    }

    fitAddon.fit();

    // Session metadata tracking via buffer scanning
    // Instead of parsing the raw data stream (unreliable with ANSI codes + chunked data),
    // we scan the rendered terminal buffer after output settles.
    const metaRef = { cwd: '', lastCommand: '', isRunning: false };
    let scanTimer: number | null = null;

    // OSC 7 — CWD reporting (if shell supports it)
    term.parser.registerOscHandler(7, (data) => {
      try {
        const url = new URL(data);
        let path = decodeURIComponent(url.pathname);
        if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
        path = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
        if (path !== metaRef.cwd) {
          metaRef.cwd = path;
          onSessionMeta?.(sessionId, { cwd: path });
        }
      } catch {}
      return false;
    });

    const scanBuffer = () => {
      const buf = term.buffer.active;
      const cursorRow = buf.baseY + buf.cursorY;

      // Scan backwards from cursor to find CWD from MINGW prompt
      for (let r = cursorRow; r >= Math.max(0, cursorRow - 10); r--) {
        const line = buf.getLine(r)?.translateToString().trim() || '';
        // Git Bash: "user@host MINGW64 ~/path" or "user@host MINGW64 ~/path (branch)"
        const mingwMatch = line.match(/MINGW\d*\s+(~[^\s(]*|\/[^\s(]*)/);
        if (mingwMatch) {
          const cwd = mingwMatch[1];
          if (cwd !== metaRef.cwd) {
            metaRef.cwd = cwd;
            onSessionMeta?.(sessionId, { cwd });
          }
          break;
        }
        // PowerShell: "PS C:\Users\path>"
        const psMatch = line.match(/^PS\s+([A-Z]:\\[^>]*)/i);
        if (psMatch) {
          const cwd = psMatch[1].replace(/\\/g, '/');
          if (cwd !== metaRef.cwd) {
            metaRef.cwd = cwd;
            onSessionMeta?.(sessionId, { cwd });
          }
          break;
        }
      }

      // Find last command: scan for "$ command" lines
      for (let r = cursorRow; r >= Math.max(0, cursorRow - 50); r--) {
        const line = buf.getLine(r)?.translateToString().trim() || '';
        const cmdMatch = line.match(/^\$\s+(.+)/);
        if (cmdMatch) {
          const cmd = cmdMatch[1].trim();
          if (cmd && cmd !== metaRef.lastCommand) {
            metaRef.lastCommand = cmd;
            onSessionMeta?.(sessionId, { lastCommand: cmd });
          }
          break;
        }
        // PowerShell prompt
        const psCmd = line.match(/^PS\s+[^>]*>\s+(.+)/);
        if (psCmd) {
          const cmd = psCmd[1].trim();
          if (cmd && cmd !== metaRef.lastCommand) {
            metaRef.lastCommand = cmd;
            onSessionMeta?.(sessionId, { lastCommand: cmd });
          }
          break;
        }
      }

      // Detect if at prompt (not running a command)
      // The cursor line or the line just above should end with $ or >
      const cursorLine = buf.getLine(cursorRow)?.translateToString().trim() || '';
      const prevLine = cursorRow > 0 ? (buf.getLine(cursorRow - 1)?.translateToString().trim() || '') : '';
      const atPrompt = /\$\s*$/.test(cursorLine) || />\s*$/.test(cursorLine)
        || (cursorLine === '' && (/\$\s*$/.test(prevLine) || />\s*$/.test(prevLine)));

      if (atPrompt && metaRef.isRunning) {
        metaRef.isRunning = false;
        onSessionMeta?.(sessionId, { isRunning: false });
      }
    };

    // Debounced scan: run 200ms after last PTY output
    const scheduleScan = () => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scanBuffer, 200);
    };

    // Detect Enter key in terminal input → mark as running
    term.onData((data) => {
      window.terminal.writePty(sessionId, data);
      if (data === '\r') {
        // User pressed Enter — read current line for the command
        const buf = term.buffer.active;
        const row = buf.baseY + buf.cursorY;
        const lineText = buf.getLine(row)?.translateToString().trim() || '';
        const cmdMatch = lineText.match(/\$\s+(.+)/) || lineText.match(/>\s+(.+)/);
        if (cmdMatch) {
          const cmd = cmdMatch[1].trim();
          if (cmd) {
            metaRef.lastCommand = cmd;
            metaRef.isRunning = true;
            onSessionMeta?.(sessionId, { lastCommand: cmd, isRunning: true });
          }
        }
      }
    });
    // Create or attach to PTY
    if (fromDaemon) {
      // Reattach to existing daemon session — will replay buffered output
      window.terminal.attachSession(sessionId);
    } else {
      window.terminal.createPty(sessionId, term.cols, term.rows, shell);
    }

    // Selection state for keyboard-driven selection
    let sel: SelectionState | null = null;

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      const buf = term.buffer.active;
      const cols = term.cols;

      // Ctrl+Shift+F — toggle search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        setSearching((s) => !s);
        return false;
      }

      // Escape — close search if open
      if (e.key === 'Escape' && searching) {
        setSearching(false);
        searchAddon.clearDecorations();
        return false;
      }


      // --- Keyboard selection ---
      if (e.shiftKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (!sel) {
          const curCol = buf.cursorX;
          const curRow = buf.baseY + buf.cursorY;
          sel = { anchor: { col: curCol, row: curRow }, end: { col: curCol, row: curRow } };
        }
        if (e.ctrlKey) {
          sel.end = findWordBoundary(term, sel.end.col, sel.end.row, e.key === 'ArrowRight' ? 1 : -1);
        } else {
          if (e.key === 'ArrowRight') {
            sel.end.col++;
            if (sel.end.col >= cols) { sel.end.col = 0; sel.end.row++; }
          } else {
            sel.end.col--;
            if (sel.end.col < 0) { sel.end.col = cols - 1; sel.end.row = Math.max(0, sel.end.row - 1); }
          }
        }
        applySelection(term, sel);
        return false;
      }

      if (e.shiftKey && e.key === 'Home') {
        if (!sel) {
          const curCol = buf.cursorX; const curRow = buf.baseY + buf.cursorY;
          sel = { anchor: { col: curCol, row: curRow }, end: { col: curCol, row: curRow } };
        }
        sel.end.col = 0;
        applySelection(term, sel);
        return false;
      }

      if (e.shiftKey && e.key === 'End') {
        if (!sel) {
          const curCol = buf.cursorX; const curRow = buf.baseY + buf.cursorY;
          sel = { anchor: { col: curCol, row: curRow }, end: { col: curCol, row: curRow } };
        }
        sel.end.col = getLineText(term, sel.end.row).trimEnd().length;
        applySelection(term, sel);
        return false;
      }

      // --- Clipboard ---
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const text = term.getSelection();
        if (text) navigator.clipboard.writeText(text);
        return false;
      }

      if (e.ctrlKey && !e.shiftKey && e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        sel = null;
        return false;
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        navigator.clipboard.readText().then((text) => window.terminal.writePty(sessionId, text));
        return false;
      }

      if (e.ctrlKey && !e.shiftKey && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => window.terminal.writePty(sessionId, text));
        return false;
      }

      // Clear selection on non-modifier keypress
      if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (sel) { sel = null; term.clearSelection(); }
      }

      return true;
    });

    // PTY output → Terminal + schedule metadata scan
    const dataListener = (_event: any, { id, data }: { id: string; data: string }) => {
      if (id === sessionId) {
        term.write(data);
        scheduleScan();
      }
    };
    window.terminal.addDataListener(dataListener);

    // PTY exit → show overlay + report to parent
    const exitListener = (_event: any, { id, exitCode: code }: { id: string; exitCode: number }) => {
      if (id === sessionId) {
        setExitCode(code);
        onSessionMeta?.(sessionId, { exitCode: code, isRunning: false });
      }
    };
    window.terminal.addExitListener(exitListener);

    // PTY error → show error
    const errorListener = (_event: any, { id, message }: { id: string; message: string }) => {
      if (id === sessionId) setError(message);
    };
    window.terminal.addErrorListener(errorListener);

    // PTY ready → report shell info
    const readyListener = (_event: any, { id, shell, pid }: { id: string; shell: string; pid: number }) => {
      if (id === sessionId && onSessionInfo) onSessionInfo(id, { shell, pid });
    };
    window.terminal.addReadyListener(readyListener);

    // Handle resize — use clientWidth/Height; offsetParent is unreliable mid-transition.
    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        fitAddon.fit();
        window.terminal.resizePty(sessionId, term.cols, term.rows);
        term.refresh(0, term.rows - 1);
      }
    });
    resizeObserver.observe(containerRef.current);

    // Right-click context menu
    const contextHandler = (e: MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    };
    containerRef.current.addEventListener('contextmenu', contextHandler);

    terminals.set(sessionId, { term, fitAddon, searchAddon });

    return () => {
      if (scanTimer) clearTimeout(scanTimer);
      containerRef.current?.removeEventListener('contextmenu', contextHandler);
      resizeObserver.disconnect();
      window.terminal.removeDataListener(dataListener);
      window.terminal.removeExitListener(exitListener);
      window.terminal.removeErrorListener(errorListener);
      window.terminal.removeReadyListener(readyListener);
      term.dispose();
      terminals.delete(sessionId);
    };
  }, [sessionId]);

  // Re-fit, refresh, and focus when becoming active.
  // Two-stage: immediate RAF (CSS already committed) + 150ms fallback (WebGL catch-up).
  useEffect(() => {
    if (isActive) {
      const entry = terminals.get(sessionId);
      if (entry) {
        requestAnimationFrame(() => {
          entry.fitAddon.fit();
          entry.term.refresh(0, entry.term.rows - 1);
          entry.term.focus();
        });
        setTimeout(() => {
          const e = terminals.get(sessionId);
          if (e) {
            e.fitAddon.fit();
            e.term.refresh(0, e.term.rows - 1);
          }
        }, 150);
      }
    }
  }, [isActive, sessionId]);

  // Switch theme when tablet mode or settings theme changes
  useEffect(() => {
    const entry = terminals.get(sessionId);
    if (entry) {
      const activeTheme = themes[settings?.theme || 'neon']?.terminal || themes.neon.terminal;
      entry.term.options.theme = tabletMode ? tabletTheme : activeTheme;
    }
  }, [tabletMode, sessionId, settings?.theme]);

  // Focus search input when search opens
  useEffect(() => {
    if (searching) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searching]);

  // Tablet mode search trigger
  useEffect(() => {
    const searchHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === sessionId) setSearching(true);
    };
    window.addEventListener('tablet-search', searchHandler);

    // Tablet mode arrow keys with select
    const arrowHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id !== sessionId) return;
      const entry = terminals.get(sessionId);
      if (!entry) return;

      // Simulate shift+arrow for selection
      const synth = new KeyboardEvent('keydown', {
        key: detail.key,
        shiftKey: true,
        bubbles: true,
      });
      entry.term.textarea?.dispatchEvent(synth);
    };
    window.addEventListener('tablet-arrow', arrowHandler);

    return () => {
      window.removeEventListener('tablet-search', searchHandler);
      window.removeEventListener('tablet-arrow', arrowHandler);
    };
  }, [sessionId]);

  const runSearch = (query: string, lineOnly: boolean) => {
    const entry = terminals.get(sessionId);
    if (!entry) return;
    if (query) {
      if (lineOnly) {
        entry.searchAddon.clearDecorations();
        const buf = entry.term.buffer.active;
        const lineRow = buf.baseY + buf.cursorY;
        const lineText = getLineText(entry.term, lineRow);
        const idx = lineText.indexOf(query);
        if (idx >= 0) {
          entry.term.select(idx, lineRow, query.length);
        } else {
          entry.term.clearSelection();
        }
      } else {
        entry.term.clearSelection();
        entry.searchAddon.findNext(query);
      }
    } else {
      entry.searchAddon.clearDecorations();
      entry.term.clearSelection();
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    runSearch(query, searchCurrentLine);
  };

  const handleToggleScope = () => {
    const newScope = !searchCurrentLine;
    setSearchCurrentLine(newScope);
    runSearch(searchQuery, newScope);
  };

  const closeSearch = () => {
    setSearching(false);
    const entry = terminals.get(sessionId);
    if (entry) {
      entry.searchAddon.clearDecorations();
      entry.term.clearSelection();
      entry.term.focus();
    }
  };

  const handleGoToMatch = () => {
    const entry = terminals.get(sessionId);
    if (!entry || !searchQuery) return;

    if (searchCurrentLine) {
      // Move the shell cursor to the currently selected match position
      const buf = entry.term.buffer.active;
      const cursorX = buf.cursorX;
      const sel = entry.term.getSelectionPosition();
      if (sel) {
        const targetCol = sel.start.x;
        const delta = targetCol - cursorX;
        const arrow = delta > 0 ? '\x1b[C' : '\x1b[D';
        const count = Math.abs(delta);
        for (let i = 0; i < count; i++) {
          window.terminal.writePty(sessionId, arrow);
        }
      }
    } else {
      // All mode — scroll to the match (can't move shell cursor into scrollback)
      const sel = entry.term.getSelectionPosition();
      if (sel) {
        entry.term.scrollToLine(sel.start.y);
      }
    }

    setSearching(false);
    entry.searchAddon.clearDecorations();
    entry.term.clearSelection();
    entry.term.focus();
  };

  const handleRestart = () => {
    setExitCode(null);
    setError(null);
    onSessionMeta?.(sessionId, { exitCode: null, isRunning: false, lastCommand: '' });
    const entry = terminals.get(sessionId);
    if (entry) {
      entry.term.clear();
      window.terminal.createPty(sessionId, entry.term.cols, entry.term.rows);
    }
  };

  return (
    <div className="terminal-view-container">
      <div ref={containerRef} className="terminal-view" />

      {/* Search bar */}
      {searching && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            className="terminal-search-input"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'F3') {
                e.preventDefault();
                const entry = terminals.get(sessionId);
                if (entry) {
                  if (e.shiftKey) entry.searchAddon.findPrevious(searchQuery);
                  else entry.searchAddon.findNext(searchQuery);
                }
              }
              if (e.key === 'Escape') {
                closeSearch();
              }
            }}
            placeholder="Search..."
          />
          <button
            className="terminal-search-scope"
            onClick={handleToggleScope}
            title={searchCurrentLine ? 'Searching current line only' : 'Searching all output'}
          >
            {searchCurrentLine ? 'Line' : 'All'}
          </button>
          <button
            className="terminal-search-nav"
            onClick={() => {
              const entry = terminals.get(sessionId);
              if (entry) entry.searchAddon.findPrevious(searchQuery);
            }}
            title="Previous (Shift+Enter)"
          >&#9650;</button>
          <button
            className="terminal-search-nav"
            onClick={() => {
              const entry = terminals.get(sessionId);
              if (entry) entry.searchAddon.findNext(searchQuery);
            }}
            title="Next (Enter)"
          >&#9660;</button>
          <button
            className="terminal-search-nav"
            onClick={handleGoToMatch}
            title="Go to match — place cursor at end of found text"
          >&#8629;</button>
          <button
            className="terminal-search-close"
            onClick={closeSearch}
          >&times;</button>
        </div>
      )}

      {/* Exit overlay */}
      {exitCode !== null && (
        <div className="terminal-overlay">
          <div className="terminal-overlay-content">
            <span className="terminal-overlay-text">
              Process exited with code {exitCode}
            </span>
            <button className="terminal-overlay-btn" onClick={handleRestart}>
              Restart
            </button>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="terminal-overlay terminal-overlay-error">
          <div className="terminal-overlay-content">
            <span className="terminal-overlay-text">
              Failed to start: {error}
            </span>
            <button className="terminal-overlay-btn" onClick={handleRestart}>
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={(() => {
            const entry = terminals.get(sessionId);
            const hasSelection = entry?.term.hasSelection() ?? false;
            return [
              {
                label: 'Copy',
                disabled: !hasSelection,
                action: () => {
                  if (entry?.term.hasSelection()) {
                    navigator.clipboard.writeText(entry.term.getSelection());
                  }
                },
              },
              {
                label: 'Paste',
                action: () => {
                  navigator.clipboard.readText().then((text) => {
                    window.terminal.writePty(sessionId, text);
                  });
                },
              },
              { label: '', action: () => {}, separator: true },
              {
                label: 'Clear',
                action: () => { entry?.term.clear(); },
              },
              {
                label: 'Search',
                action: () => { setSearching(true); },
              },
            ] as ContextMenuItem[];
          })()}
        />
      )}
    </div>
  );
}

TerminalView.getTerminal = getTerminal;
export default TerminalView;
