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
import { motion, AnimatePresence } from 'framer-motion';
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

    const activeTheme = themes[settings?.theme || 'kinetic']?.terminal || themes.kinetic.terminal;
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

    try { term.loadAddon(new WebglAddon()); } catch {}
    try {
      term.loadAddon(new WebLinksAddon((_event, uri) => {
        window.terminal.openExternal(uri);
      }));
    } catch {}
    try { term.loadAddon(new LigaturesAddon()); } catch {}

    fitAddon.fit();

    const metaRef = { cwd: '', lastCommand: '', isRunning: false };
    let scanTimer: number | null = null;

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

      for (let r = cursorRow; r >= Math.max(0, cursorRow - 10); r--) {
        const line = buf.getLine(r)?.translateToString().trim() || '';
        const mingwMatch = line.match(/MINGW\d*\s+(~[^\s(]*|\/[^\s(]*)/);
        if (mingwMatch) {
          const cwd = mingwMatch[1];
          if (cwd !== metaRef.cwd) { metaRef.cwd = cwd; onSessionMeta?.(sessionId, { cwd }); }
          break;
        }
        const psMatch = line.match(/^PS\s+([A-Z]:\\[^>]*)/i);
        if (psMatch) {
          const cwd = psMatch[1].replace(/\\/g, '/');
          if (cwd !== metaRef.cwd) { metaRef.cwd = cwd; onSessionMeta?.(sessionId, { cwd }); }
          break;
        }
      }

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

      const cursorLine = buf.getLine(cursorRow)?.translateToString().trim() || '';
      const prevLine = cursorRow > 0 ? (buf.getLine(cursorRow - 1)?.translateToString().trim() || '') : '';
      const atPrompt = /\$\s*$/.test(cursorLine) || />\s*$/.test(cursorLine)
        || (cursorLine === '' && (/\$\s*$/.test(prevLine) || />\s*$/.test(prevLine)));
      if (atPrompt && metaRef.isRunning) {
        metaRef.isRunning = false;
        onSessionMeta?.(sessionId, { isRunning: false });
      }
    };

    const scheduleScan = () => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scanBuffer, 200);
    };

    term.onData((data) => {
      window.terminal.writePty(sessionId, data);
      if (data === '\r') {
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

    if (fromDaemon) {
      window.terminal.attachSession(sessionId);
    } else {
      window.terminal.createPty(sessionId, term.cols, term.rows, shell);
    }

    let sel: SelectionState | null = null;

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const buf = term.buffer.active;
      const cols = term.cols;

      if (e.ctrlKey && e.shiftKey && e.key === 'F') { setSearching((s) => !s); return false; }
      if (e.key === 'Escape' && searching) { setSearching(false); searchAddon.clearDecorations(); return false; }

      if (e.shiftKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (!sel) { const c = buf.cursorX; const r = buf.baseY + buf.cursorY; sel = { anchor: { col: c, row: r }, end: { col: c, row: r } }; }
        if (e.ctrlKey) { sel.end = findWordBoundary(term, sel.end.col, sel.end.row, e.key === 'ArrowRight' ? 1 : -1); }
        else {
          if (e.key === 'ArrowRight') { sel.end.col++; if (sel.end.col >= cols) { sel.end.col = 0; sel.end.row++; } }
          else { sel.end.col--; if (sel.end.col < 0) { sel.end.col = cols - 1; sel.end.row = Math.max(0, sel.end.row - 1); } }
        }
        applySelection(term, sel); return false;
      }
      if (e.shiftKey && e.key === 'Home') {
        if (!sel) { const c = buf.cursorX; const r = buf.baseY + buf.cursorY; sel = { anchor: { col: c, row: r }, end: { col: c, row: r } }; }
        sel.end.col = 0; applySelection(term, sel); return false;
      }
      if (e.shiftKey && e.key === 'End') {
        if (!sel) { const c = buf.cursorX; const r = buf.baseY + buf.cursorY; sel = { anchor: { col: c, row: r }, end: { col: c, row: r } }; }
        sel.end.col = getLineText(term, sel.end.row).trimEnd().length; applySelection(term, sel); return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'C') { const t = term.getSelection(); if (t) navigator.clipboard.writeText(t); return false; }
      if (e.ctrlKey && !e.shiftKey && e.key === 'c' && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); sel = null; return false; }
      if (e.ctrlKey && e.shiftKey && e.key === 'V') { navigator.clipboard.readText().then((t) => window.terminal.writePty(sessionId, t)); return false; }
      if (e.ctrlKey && !e.shiftKey && e.key === 'v') { e.preventDefault(); navigator.clipboard.readText().then((t) => window.terminal.writePty(sessionId, t)); return false; }
      if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { if (sel) { sel = null; term.clearSelection(); } }
      return true;
    });

    const dataListener = (_event: any, { id, data }: { id: string; data: string }) => {
      if (id === sessionId) { term.write(data); scheduleScan(); }
    };
    window.terminal.addDataListener(dataListener);

    const exitListener = (_event: any, { id, exitCode: code }: { id: string; exitCode: number }) => {
      if (id === sessionId) { setExitCode(code); onSessionMeta?.(sessionId, { exitCode: code, isRunning: false }); }
    };
    window.terminal.addExitListener(exitListener);

    const errorListener = (_event: any, { id, message }: { id: string; message: string }) => {
      if (id === sessionId) setError(message);
    };
    window.terminal.addErrorListener(errorListener);

    const readyListener = (_event: any, { id, shell, pid }: { id: string; shell: string; pid: number }) => {
      if (id === sessionId && onSessionInfo) onSessionInfo(id, { shell, pid });
    };
    window.terminal.addReadyListener(readyListener);

    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        fitAddon.fit();
        window.terminal.resizePty(sessionId, term.cols, term.rows);
        term.refresh(0, term.rows - 1);
      }
    });
    resizeObserver.observe(containerRef.current);

    const contextHandler = (e: MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); };
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
          if (e) { e.fitAddon.fit(); e.term.refresh(0, e.term.rows - 1); }
        }, 150);
      }
    }
  }, [isActive, sessionId]);

  useEffect(() => {
    const entry = terminals.get(sessionId);
    if (entry) {
      const activeTheme = themes[settings?.theme || 'kinetic']?.terminal || themes.kinetic.terminal;
      entry.term.options.theme = tabletMode ? tabletTheme : activeTheme;
    }
  }, [tabletMode, sessionId, settings?.theme]);

  useEffect(() => {
    if (searching) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searching]);

  useEffect(() => {
    const searchHandler = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.id === sessionId) setSearching(true); };
    window.addEventListener('tablet-search', searchHandler);
    const arrowHandler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.id !== sessionId) return;
      const entry = terminals.get(sessionId);
      if (!entry) return;
      entry.term.textarea?.dispatchEvent(new KeyboardEvent('keydown', { key: d.key, shiftKey: true, bubbles: true }));
    };
    window.addEventListener('tablet-arrow', arrowHandler);
    return () => { window.removeEventListener('tablet-search', searchHandler); window.removeEventListener('tablet-arrow', arrowHandler); };
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
        if (idx >= 0) entry.term.select(idx, lineRow, query.length);
        else entry.term.clearSelection();
      } else {
        entry.term.clearSelection();
        entry.searchAddon.findNext(query);
      }
    } else {
      entry.searchAddon.clearDecorations();
      entry.term.clearSelection();
    }
  };

  const handleSearch = (query: string) => { setSearchQuery(query); runSearch(query, searchCurrentLine); };
  const handleToggleScope = () => { const s = !searchCurrentLine; setSearchCurrentLine(s); runSearch(searchQuery, s); };

  const closeSearch = () => {
    setSearching(false);
    const entry = terminals.get(sessionId);
    if (entry) { entry.searchAddon.clearDecorations(); entry.term.clearSelection(); entry.term.focus(); }
  };

  const handleGoToMatch = () => {
    const entry = terminals.get(sessionId);
    if (!entry || !searchQuery) return;
    if (searchCurrentLine) {
      const buf = entry.term.buffer.active;
      const cursorX = buf.cursorX;
      const sel = entry.term.getSelectionPosition();
      if (sel) {
        const targetCol = sel.start.x;
        const delta = targetCol - cursorX;
        const arrow = delta > 0 ? '\x1b[C' : '\x1b[D';
        for (let i = 0; i < Math.abs(delta); i++) window.terminal.writePty(sessionId, arrow);
      }
    } else {
      const sel = entry.term.getSelectionPosition();
      if (sel) entry.term.scrollToLine(sel.start.y);
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
    if (entry) { entry.term.clear(); window.terminal.createPty(sessionId, entry.term.cols, entry.term.rows); }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Search bar */}
      <AnimatePresence>
        {searching && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-2 left-2 right-2 z-20 flex items-center gap-1 bg-surface-low/95 backdrop-blur-md border border-white/[0.06] shadow-lg px-1"
          >
            <input
              ref={searchInputRef}
              className="flex-1 bg-transparent text-on-surface text-xs font-[var(--font-mono)] px-2 py-1.5 outline-none placeholder:text-muted-foreground/50"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F3') {
                  e.preventDefault();
                  const entry = terminals.get(sessionId);
                  if (entry) { if (e.shiftKey) entry.searchAddon.findPrevious(searchQuery); else entry.searchAddon.findNext(searchQuery); }
                }
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder="Search..."
            />
            <button
              className={`px-1.5 py-0.5 text-[0.6rem] font-[var(--font-mono)] tracking-wider transition-colors cursor-pointer ${searchCurrentLine ? 'text-primary bg-primary-dim' : 'text-muted-foreground hover:text-on-surface'}`}
              onClick={handleToggleScope}
              title={searchCurrentLine ? 'Searching current line only' : 'Searching all output'}
            >
              {searchCurrentLine ? 'LINE' : 'ALL'}
            </button>
            <button className="px-1.5 py-0.5 text-muted-foreground hover:text-on-surface text-[0.6rem] transition-colors cursor-pointer"
              onClick={() => { const e = terminals.get(sessionId); if (e) e.searchAddon.findPrevious(searchQuery); }} title="Previous">&#9650;</button>
            <button className="px-1.5 py-0.5 text-muted-foreground hover:text-on-surface text-[0.6rem] transition-colors cursor-pointer"
              onClick={() => { const e = terminals.get(sessionId); if (e) e.searchAddon.findNext(searchQuery); }} title="Next">&#9660;</button>
            <button className="px-1.5 py-0.5 text-muted-foreground hover:text-on-surface text-[0.6rem] transition-colors cursor-pointer"
              onClick={handleGoToMatch} title="Go to match">&#8629;</button>
            <button className="px-1.5 py-0.5 text-muted-foreground hover:text-on-surface transition-colors cursor-pointer"
              onClick={closeSearch}>&times;</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit overlay */}
      <AnimatePresence>
        {exitCode !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="text-center space-y-3"
            >
              <div className="text-xs font-[var(--font-mono)] text-muted-foreground tracking-wider">
                PROCESS EXITED
              </div>
              <div className="text-2xl font-[var(--font-headline)] font-bold text-on-surface">
                {exitCode}
              </div>
              <div className="text-[0.6rem] font-[var(--font-mono)] text-muted-foreground tracking-wider">
                exit code
              </div>
              <button
                className="mt-2 px-4 py-1.5 text-[0.65rem] font-[var(--font-mono)] tracking-widest font-bold text-primary bg-primary-dim hover:bg-primary-glow transition-colors cursor-pointer"
                onClick={handleRestart}
              >
                RESTART
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="text-center space-y-3"
            >
              <div className="text-xs font-[var(--font-mono)] text-danger tracking-wider">
                ERROR
              </div>
              <div className="text-xs font-[var(--font-mono)] text-on-surface max-w-[300px]">
                {error}
              </div>
              <button
                className="mt-2 px-4 py-1.5 text-[0.65rem] font-[var(--font-mono)] tracking-widest font-bold text-primary bg-primary-dim hover:bg-primary-glow transition-colors cursor-pointer"
                onClick={handleRestart}
              >
                RETRY
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              { label: 'COPY', disabled: !hasSelection, action: () => { if (entry?.term.hasSelection()) navigator.clipboard.writeText(entry.term.getSelection()); } },
              { label: 'PASTE', action: () => { navigator.clipboard.readText().then((text) => { window.terminal.writePty(sessionId, text); }); } },
              { label: '', action: () => {}, separator: true },
              { label: 'CLEAR', action: () => { entry?.term.clear(); } },
              { label: 'SEARCH', action: () => { setSearching(true); } },
            ] as ContextMenuItem[];
          })()}
        />
      )}
    </div>
  );
}

TerminalView.getTerminal = getTerminal;
export default TerminalView;
