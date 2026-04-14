import React, { useState, useCallback, useRef, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import BlueprintPanel, { Blueprint } from './components/BlueprintPanel';
import ContextMenu from './components/ContextMenu';
import Sidebar, { SidebarHandle } from './components/Sidebar';
import TerminalView, { SessionMeta } from './components/TerminalView';
import BrowserView from './components/BrowserView';
import TabletToolbar from './components/TabletToolbar';
import ShortcutsTooltip from './components/ShortcutsTooltip';
import SettingsPanel from './components/SettingsPanel';
import { Settings, defaultSettings, themes } from '../shared/settings';

interface Session {
  id: string;
  name: string;
  isActive: boolean;
  type: 'terminal' | 'browser';
  shell?: string;
  url?: string;
  browserTabs?: { url: string; title: string }[];
  fromDaemon?: boolean;
  createdAt: number;
}

let sessionCounter = 0;

function createSession(shell?: string): Session {
  sessionCounter++;
  return {
    id: crypto.randomUUID(),
    name: shell ? `${shell} ${sessionCounter}` : `Terminal ${sessionCounter}`,
    isActive: true,
    type: 'terminal',
    shell,
    createdAt: Date.now(),
  };
}

function createBrowserSession(url?: string): Session {
  sessionCounter++;
  return {
    id: crypto.randomUUID(),
    name: `Browser ${sessionCounter}`,
    isActive: true,
    type: 'browser',
    url: url || 'https://www.google.com',
    createdAt: Date.now(),
  };
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const initializedRef = useRef(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  const sidebarRef = useRef<SidebarHandle>(null);
  const [, forceRender] = useState(0);
  const forceQuitting = useRef(false);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const [sessionMeta, setSessionMeta] = useState<Map<string, SessionMeta>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  const [showBlueprints, setShowBlueprints] = useState(false);
  const pendingInitCommands = useRef<Map<string, string>>(new Map());
  const [shells, setShells] = useState<string[]>([]);
  const [shellMenu, setShellMenu] = useState<{ x: number; y: number } | null>(null);
  // Pane layout — up to 4 session IDs shown simultaneously in the grid.
  const [paneIds, setPaneIds] = useState<string[]>([]);
  // Pane resize splits (percentage 20-80)
  const [splitV, setSplitV] = useState(50); // vertical (column) divider
  const [splitH, setSplitH] = useState(50); // horizontal (row) divider
  const paneGridRef = useRef<HTMLDivElement>(null);

  // When a PTY becomes ready, if there's a pending init command, send it.
  useEffect(() => {
    const readyListener = (_event: any, { id }: { id: string }) => {
      const cmd = pendingInitCommands.current.get(id);
      if (cmd) {
        pendingInitCommands.current.delete(id);
        // Small delay to let the shell prompt render first.
        setTimeout(() => window.terminal.writePty(id, cmd + '\n'), 100);
      }
    };
    window.terminal.addReadyListener(readyListener);
    return () => window.terminal.removeReadyListener(readyListener);
  }, []);

  const addToPane = useCallback((id: string) => {
    setPaneIds((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length < 4) return [...prev, id];
      // At capacity — replace the currently active session's pane slot.
      const activeIdx = prev.indexOf(activeIdRef.current ?? '');
      const replaceIdx = activeIdx >= 0 ? activeIdx : prev.length - 1;
      return prev.map((pId, i) => (i === replaceIdx ? id : pId));
    });
  }, []);

  const startPaneDrag = useCallback((e: React.MouseEvent, dir: 'v' | 'h') => {
    e.preventDefault();
    const rect = paneGridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ids = paneIds;
    const onMove = (ev: MouseEvent) => {
      if (dir === 'v') {
        setSplitV(Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100)));
      } else {
        setSplitH(Math.min(80, Math.max(20, ((ev.clientY - rect.top) / rect.height) * 100)));
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setTimeout(() => {
        for (const id of ids) {
          const entry = TerminalView.getTerminal(id);
          if (entry) entry.fitAddon.fit();
        }
      }, 50);
    };
    document.body.style.cursor = dir === 'v' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [paneIds]);

  const handleLaunchBlueprint = useCallback((bp: Blueprint, cwd: string) => {
    const session = createSession();
    session.name = bp.name;
    const initCmd = `cd "${cwd.replace(/"/g, '\\"')}" && helo run ${bp.name}`;
    pendingInitCommands.current.set(session.id, initCmd);
    setSessions((prev) => [...prev.map((s) => ({ ...s, isActive: false })), session]);
    addToPane(session.id);
  }, [addToPane]);

  const handleSessionMeta = useCallback((id: string, meta: SessionMeta) => {
    setSessionMeta((prev) => {
      const existing = prev.get(id) || {};
      const merged = { ...existing, ...meta };
      const next = new Map(prev);
      next.set(id, merged);
      return next;
    });
  }, []);

  useEffect(() => {
    window.terminal.onForceQuit(() => { forceQuitting.current = true; });
  }, []);

  useEffect(() => {
    window.terminal.listShells().then(setShells).catch(() => {});
  }, []);

  // Track unread activity on background terminals
  useEffect(() => {
    const listener = (_event: any, { id }: { id: string; data: string }) => {
      if (id !== activeIdRef.current) {
        setUnreadSessions((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    };
    window.terminal.addDataListener(listener);
    return () => window.terminal.removeDataListener(listener);
  }, []);

  // Load settings on mount
  useEffect(() => {
    window.terminal.loadSettings().then((saved: any) => {
      if (saved) {
        const merged = { ...defaultSettings, ...saved };
        setSettings(merged);
        if (merged.opacity < 1) window.terminal.setOpacity(merged.opacity);
      }
    }).catch(() => {});
  }, []);

  // Apply theme CSS variables when settings or tablet mode changes
  useEffect(() => {
    const root = document.documentElement;
    if (tabletMode) {
      root.style.setProperty('--ui-bg', '#f5f5f7');
      root.style.setProperty('--ui-sidebar', '#ebebed');
      root.style.setProperty('--ui-border', '#d1d1d6');
      root.style.setProperty('--ui-accent', '#0071e3');
      root.style.setProperty('--ui-text', '#1d1d1f');
      root.style.setProperty('--ui-text-muted', '#6e6e73');
      root.style.setProperty('--ui-text-dim', '#aeaeb2');
      root.style.setProperty('--ui-danger', '#ff3b30');
      root.style.setProperty('--ui-success', '#34c759');
      root.style.setProperty('--ui-panel', '#ffffff');
      root.style.setProperty('--ui-hover', 'rgba(0, 0, 0, 0.04)');
      root.style.setProperty('--ui-glass', 'rgba(255, 255, 255, 0.72)');
      root.style.setProperty('--ui-glass-border', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--ui-shadow', '0 2px 12px rgba(0, 0, 0, 0.08)');
    } else {
      const ui = themes[settings.theme]?.ui || themes.neon.ui;
      root.style.setProperty('--ui-bg', ui.bg);
      root.style.setProperty('--ui-sidebar', ui.sidebar);
      root.style.setProperty('--ui-border', ui.border);
      root.style.setProperty('--ui-accent', ui.accent);
      root.style.setProperty('--ui-text', ui.text);
      root.style.setProperty('--ui-text-muted', ui.textMuted);
      root.style.setProperty('--ui-text-dim', ui.textDim);
      root.style.setProperty('--ui-danger', '#ff5370');
      root.style.setProperty('--ui-success', '#00e676');
      root.style.setProperty('--ui-panel', ui.sidebar);
      root.style.setProperty('--ui-hover', 'rgba(255, 255, 255, 0.04)');
      root.style.setProperty('--ui-glass', 'rgba(255, 255, 255, 0.03)');
      root.style.setProperty('--ui-glass-border', 'rgba(255, 255, 255, 0.06)');
      root.style.setProperty('--ui-shadow', '0 4px 24px rgba(0, 0, 0, 0.4)');
    }
  }, [settings.theme, tabletMode]);

  const handleSaveSettings = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    window.terminal.saveSettings(newSettings);
    window.terminal.setOpacity(newSettings.opacity);
    // Apply font size to all terminals
    for (const s of sessions) {
      if (s.type === 'terminal') {
        const entry = TerminalView.getTerminal(s.id);
        if (entry) {
          const termTheme = themes[newSettings.theme]?.terminal || themes.neon.terminal;
          entry.term.options.fontSize = newSettings.fontSize;
          entry.term.options.fontFamily = newSettings.fontFamily;
          entry.term.options.lineHeight = newSettings.lineHeight;
          entry.term.options.cursorStyle = newSettings.cursorStyle;
          entry.term.options.cursorBlink = newSettings.cursorBlink;
          entry.term.options.scrollback = newSettings.scrollback;
          entry.term.options.theme = termTheme;
          entry.fitAddon.fit();
        }
      }
    }
  }, [sessions]);

  // On mount: restore daemon + browser sessions, fall back to fresh terminal
  useEffect(() => {
    if (initializedRef.current) return;

    // Restore terminal + browser sessions
    Promise.all([
      window.terminal.listDaemonSessions().catch(() => []),
      window.terminal.loadBrowserSessions().catch(() => null),
      window.terminal.loadSessionNames().catch(() => null),
    ]).then(([daemonSessions, browserSessions, savedNames]) => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      const allSessions: Session[] = [];

      // Restore terminal sessions from daemon
      const names: Record<string, string> = savedNames || {};
      // Clean up any legacy split keys
      delete (names as any)['__splits'];
      delete (names as any)['__splitIds'];

      const alive = daemonSessions.filter((s: any) => s.alive);
      for (let i = 0; i < alive.length; i++) {
        sessionCounter++;
        const defaultName = alive[i].shell ? `${alive[i].shell} ${sessionCounter}` : `Terminal ${sessionCounter}`;
        allSessions.push({
          id: alive[i].id,
          name: names[alive[i].id] || defaultName,
          isActive: false,
          type: 'terminal',
          shell: alive[i].shell,
          fromDaemon: true,
          createdAt: Date.now(),
        });
      }

      // Only restore browser sessions if daemon had alive terminals
      // (no alive terminals = fresh start, stale browser files should be ignored)
      if (alive.length > 0 && browserSessions && browserSessions.length > 0) {
        for (const bs of browserSessions) {
          sessionCounter++;
          allSessions.push({
            id: bs.id || crypto.randomUUID(),
            name: bs.name || `Browser ${sessionCounter}`,
            isActive: false,
            type: 'browser',
            url: bs.url,
            browserTabs: bs.tabs,
            createdAt: Date.now(),
          });
        }
      }

      // Always ensure at least one terminal session exists
      if (!allSessions.some((s) => s.type === 'terminal')) {
        allSessions.unshift(createSession());
      }
      const firstTerminalIdx = allSessions.findIndex((s) => s.type === 'terminal');
      allSessions[firstTerminalIdx].isActive = true;
      setSessions(allSessions);
      setPaneIds([allSessions[firstTerminalIdx].id]);
    });

    // Fallback: if nothing responds in 2 seconds, create fresh
    const timeout = setTimeout(() => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      setSessions((prev) => prev.length === 0 ? [createSession()] : prev);
    }, 2000);

    return () => clearTimeout(timeout);
  }, []);

  const activeSession = sessions.find((s) => s.isActive);
  const activeId = activeSession?.id ?? null;

  // Keep activeIdRef in sync for the unread data listener
  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId) {
      setUnreadSessions((prev) => {
        if (!prev.has(activeId)) return prev;
        const next = new Set(prev);
        next.delete(activeId);
        return next;
      });
    }
  }, [activeId]);

  const handleNewSession = useCallback((shell?: string) => {
    const session = createSession(shell);
    setSessions((prev) => [...prev.map((s) => ({ ...s, isActive: false })), session]);
    addToPane(session.id);
  }, [addToPane]);

  const handleNewBrowser = useCallback((url?: string) => {
    const session = createBrowserSession(url);
    setSessions((prev) => [...prev.map((s) => ({ ...s, isActive: false })), session]);
    addToPane(session.id);
  }, [addToPane]);

  const handleSelectSession = useCallback((id: string) => {
    setSessions((prev) => prev.map((s) => ({ ...s, isActive: s.id === id })));
    addToPane(id);
    // Refit the terminal after it becomes visible (may have been hidden).
    setTimeout(() => {
      const entry = TerminalView.getTerminal(id);
      if (entry) entry.fitAddon.fit();
    }, 50);
  }, [addToPane]);

  const handleRemoveFromPane = useCallback((id: string) => {
    setPaneIds((prev) => prev.filter((pId) => pId !== id));
  }, []);

  // Save sessions on window unload
  useEffect(() => {
    const save = () => {
      if (forceQuitting.current) return; // "Close All" — don't re-save
      const browserSessions = sessions
        .filter((s) => s.type === 'browser')
        .map((s) => ({ id: s.id, name: s.name, url: s.url, tabs: s.browserTabs }));
      if (browserSessions.length > 0) {
        window.terminal.saveBrowserSessions(browserSessions);
      }
      const nameMap: Record<string, string> = {};
      for (const s of sessions) {
        if (s.type === 'terminal') nameMap[s.id] = s.name;
      }
      window.terminal.saveSessionNames(nameMap);
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [sessions]);

  const handleCloseSession = useCallback((id: string) => {
    setSessions((prev) => {
      if (prev.length <= 1) return prev;
      const closing = prev.find((s) => s.id === id);
      const wasActive = closing?.isActive;
      const remaining = prev.filter((s) => s.id !== id);
      if (wasActive && remaining.length > 0) {
        return remaining.map((s, i) =>
          i === remaining.length - 1 ? { ...s, isActive: true } : s
        );
      }
      return remaining;
    });
    setPaneIds((prev) => prev.filter((pId) => pId !== id));
    const session = sessions.find((s) => s.id === id);
    if (session?.type === 'terminal') {
      window.terminal.destroyPty(id);
    }
  }, [sessions]);

  const handleRenameSession = useCallback((id: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s))
    );
  }, []);

  const handleBrowserTabsChange = useCallback((id: string, tabs: { url: string; title: string }[]) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id && s.type === 'browser' ? { ...s, browserTabs: tabs } : s))
    );
  }, []);

  const handleBrowserTitleChange = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id && s.type === 'browser' ? { ...s, name: title || s.name } : s))
    );
  }, []);

  const handleReorderSessions = useCallback((fromIndex: number, toIndex: number) => {
    setSessions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleDuplicateSession = useCallback((id: string) => {
    const source = sessions.find((s) => s.id === id);
    if (!source) return;
    if (source.type === 'terminal') {
      handleNewSession(source.shell);
    } else {
      handleNewBrowser(source.url);
    }
  }, [sessions, handleNewSession, handleNewBrowser]);


  // Font size zoom
  const [fontSize, setFontSize] = useState(() => {
    const stored = localStorage.getItem('terminal-font-size');
    return stored ? parseInt(stored, 10) : 13;
  });

  const updateFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(32, Math.max(8, prev + delta));
      localStorage.setItem('terminal-font-size', String(next));
      for (const [, entry] of terminals()) {
        entry.term.options.fontSize = next;
        entry.fitAddon.fit();
      }
      return next;
    });
  }, []);

  const terminals = useCallback(() => {
    const map = new Map<string, any>();
    for (const s of sessions) {
      if (s.type === 'terminal') {
        const t = TerminalView.getTerminal(s.id);
        if (t) map.set(s.id, t);
      }
    }
    return map;
  }, [sessions]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        handleNewSession(settings.defaultShell || undefined);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault();
        if (activeId) handleCloseSession(activeId);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (idx < sessions.length) handleSelectSession(sessions[idx].id);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        updateFontSize(1);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === '-') {
        e.preventDefault();
        updateFontSize(-1);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === '0') {
        e.preventDefault();
        setFontSize(13);
        localStorage.setItem('terminal-font-size', '13');
        for (const [, entry] of terminals()) {
          entry.term.options.fontSize = 13;
          entry.fitAddon.fit();
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        const entry = activeId ? TerminalView.getTerminal(activeId) : null;
        if (entry) entry.term.scrollLines(-5);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        const entry = activeId ? TerminalView.getTerminal(activeId) : null;
        if (entry) entry.term.scrollLines(5);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
        e.preventDefault();
        const entry = activeId ? TerminalView.getTerminal(activeId) : null;
        if (entry) entry.term.clear();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeId, sessions, handleNewSession, handleCloseSession, handleSelectSession, updateFontSize, terminals]);

  const scrollTimer = useRef<number | null>(null);
  const scrollSpeed = useRef(3);

  const startScrolling = (direction: -1 | 1) => {
    const entry = activeId ? TerminalView.getTerminal(activeId) : null;
    if (!entry) return;
    scrollSpeed.current = 3;
    entry.term.scrollLines(direction * scrollSpeed.current);
    let elapsed = 0;
    scrollTimer.current = window.setInterval(() => {
      elapsed += 80;
      if (elapsed % 400 === 0 && scrollSpeed.current < 30) {
        scrollSpeed.current = Math.min(scrollSpeed.current + 3, 30);
      }
      entry.term.scrollLines(direction * scrollSpeed.current);
    }, 80);
  };

  const stopScrolling = () => {
    if (scrollTimer.current !== null) {
      clearInterval(scrollTimer.current);
      scrollTimer.current = null;
    }
  };

  // Tablet mode zoom and class
  useEffect(() => {
    window.terminal.setZoom(tabletMode ? 2.0 : 1.0);
    document.documentElement.classList.toggle('tablet-mode', tabletMode);
    localStorage.setItem('tablet-mode', String(tabletMode));
    // Refit all terminals when zoom changes
    setTimeout(() => {
      for (const [, entry] of terminals()) {
        entry.fitAddon.fit();
      }
    }, 100);
  }, [tabletMode, terminals]);

  const statusText = activeSession?.type === 'browser'
    ? 'browser'
    : (activeSession?.shell || 'bash');

  const handleTabletCopy = useCallback(() => {
    const entry = activeId ? TerminalView.getTerminal(activeId) : null;
    if (entry?.term.hasSelection()) {
      navigator.clipboard.writeText(entry.term.getSelection());
    }
  }, [activeId]);

  const handleTabletPaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      if (activeId) window.terminal.writePty(activeId, text);
    });
  }, [activeId]);

  const handleTabletArrow = useCallback((direction: 'up' | 'down' | 'left' | 'right', select: boolean) => {
    if (!activeId) return;
    // Send arrow key escape sequences to the PTY
    // When not in select mode, arrows move the shell cursor
    // When in select mode, we use the keyboard selection system
    if (select) {
      // Dispatch a synthetic keyboard event for shift+arrow
      const keyMap: Record<string, string> = {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
      };
      window.dispatchEvent(new CustomEvent('tablet-arrow', {
        detail: { id: activeId, key: keyMap[direction], select: true },
      }));
    } else {
      // Send escape sequences directly to PTY for cursor movement
      const seqMap: Record<string, string> = {
        up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D',
      };
      window.terminal.writePty(activeId, seqMap[direction]);
    }
  }, [activeId]);

  const handleTabletClear = useCallback(() => {
    const entry = activeId ? TerminalView.getTerminal(activeId) : null;
    if (entry) entry.term.clear();
  }, [activeId]);

  const handleTabletSearch = useCallback(() => {
    // Trigger search via a custom event the TerminalView listens for
    window.dispatchEvent(new CustomEvent('tablet-search', { detail: { id: activeId } }));
  }, [activeId]);

  const handleTabletScrollUp = useCallback(() => {
    const entry = activeId ? TerminalView.getTerminal(activeId) : null;
    if (entry) entry.term.scrollLines(-10);
  }, [activeId]);

  const handleTabletScrollDown = useCallback(() => {
    const entry = activeId ? TerminalView.getTerminal(activeId) : null;
    if (entry) entry.term.scrollLines(10);
  }, [activeId]);

  return (
    <div className="app">
      <TitleBar
        sessionCount={sessions.length}
        activeSessionName={activeSession?.name ?? ''}
      >
        {!tabletMode && (
          <>
            {/* Sidebar */}
            <div className="titlebar-btn-group">
              <button
                className="titlebar-action-btn"
                onClick={() => { sidebarRef.current?.toggleCollapse(); forceRender((n) => n + 1); }}
                title={sidebarRef.current?.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >{sidebarRef.current?.collapsed
                  ? (sidebarRef.current?.side === 'left' ? '\u25B6' : '\u25C0')
                  : (sidebarRef.current?.side === 'left' ? '\u25C0' : '\u25B6')
              }</button>
              <button
                className="titlebar-action-btn"
                onClick={() => { sidebarRef.current?.toggleSide(); forceRender((n) => n + 1); }}
                title={`Move sidebar to ${sidebarRef.current?.side === 'left' ? 'right' : 'left'}`}
              >{sidebarRef.current?.side === 'left' ? '\u21C0' : '\u21BC'}</button>
            </div>

            {/* New session */}
            <div className="titlebar-btn-group">
              <button
                className="titlebar-action-btn"
                onClick={() => handleNewSession(settings.defaultShell || undefined)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShellMenu({ x: e.clientX, y: e.clientY });
                }}
                title="New terminal (Ctrl+T) · Right-click to choose shell"
              >+</button>
              <button
                className="titlebar-action-btn"
                onClick={() => handleNewBrowser()}
                title="New browser"
              >&#9741;</button>
            </div>


            {/* Tools */}
            <div className="titlebar-btn-group">
              <button
                className="titlebar-action-btn"
                onClick={() => setShowBlueprints(true)}
                title="Blueprints (helo)"
              >&#129302;</button>
              <ShortcutsTooltip />
              <button
                className="titlebar-action-btn"
                onClick={() => setShowSettings(true)}
                title="Settings"
              >&#9881;</button>
              <button
                className="titlebar-action-btn"
                onClick={() => setTabletMode(true)}
                title="Tablet mode"
              >&#128241;</button>
            </div>
          </>
        )}
      </TitleBar>
      <BlueprintPanel
        open={showBlueprints}
        onClose={() => setShowBlueprints(false)}
        onLaunch={handleLaunchBlueprint}
      />
      {shellMenu && (
        <ContextMenu
          x={shellMenu.x}
          y={shellMenu.y}
          onClose={() => setShellMenu(null)}
          items={[
            ...shells.map((shell) => ({
              label: shell === settings.defaultShell ? `✓ ${shell}` : `  ${shell}`,
              action: () => handleNewSession(shell),
            })),
            { label: '', action: () => {}, separator: true },
            ...shells
              .filter((shell) => shell !== settings.defaultShell)
              .map((shell) => ({
                label: `Set default: ${shell}`,
                action: () => {
                  const next = { ...settings, defaultShell: shell };
                  setSettings(next);
                  window.terminal.saveSettings(next);
                },
              })),
          ]}
        />
      )}
      {tabletMode && (
        <TabletToolbar
          activeType={activeSession?.type || 'terminal'}
          onCopy={handleTabletCopy}
          onPaste={handleTabletPaste}
          onClear={handleTabletClear}
          onSearch={handleTabletSearch}
          onNewTerminal={() => handleNewSession()}
          onNewBrowser={() => handleNewBrowser()}
          onCloseTab={() => { if (activeId) handleCloseSession(activeId); }}
          onArrow={handleTabletArrow}
          onScrollUp={handleTabletScrollUp}
          onScrollDown={handleTabletScrollDown}
          onSplitVertical={() => {}}
          onSplitHorizontal={() => {}}
          onCloseSplit={() => {}}
          canClose={sessions.length > 1}
          hasSplit={false}
          onToggleSidebar={() => { sidebarRef.current?.toggleCollapse(); forceRender((n) => n + 1); }}
          sidebarCollapsed={sidebarRef.current?.collapsed ?? false}
          onSettings={() => setShowSettings(true)}
          onToggleDesktop={() => setTabletMode(false)}
        />
      )}
      <div className="app-body">
        <Sidebar
          ref={sidebarRef}
          sessions={sessions}
          canClose={sessions.length > 1}
          onNew={handleNewSession}
          onNewBrowser={handleNewBrowser}
          onSelect={handleSelectSession}
          onClose={handleCloseSession}
          onRename={handleRenameSession}
          onDuplicate={handleDuplicateSession}
          onReorder={handleReorderSessions}
          unreadSessions={unreadSessions}
          sessionMeta={sessionMeta}
          paneIds={paneIds}
        />
        <div
          ref={paneGridRef}
          className={`terminal-container pane-grid pane-count-${paneIds.length}`}
          style={(() => {
            const n = paneIds.length;
            if (n <= 1) return {};
            if (n === 2) return { gridTemplateColumns: `${splitV}fr ${100 - splitV}fr` };
            return { gridTemplateColumns: `${splitV}fr ${100 - splitV}fr`, gridTemplateRows: `${splitH}fr ${100 - splitH}fr` };
          })()}
        >
          {paneIds.length >= 2 && (
            <div
              className="pane-resize-handle pane-resize-v"
              style={{ left: `${splitV}%` }}
              onMouseDown={(e) => startPaneDrag(e, 'v')}
            />
          )}
          {paneIds.length >= 3 && (
            <div
              className="pane-resize-handle pane-resize-h"
              style={{ top: `${splitH}%` }}
              onMouseDown={(e) => startPaneDrag(e, 'h')}
            />
          )}
          {sessions.map((session) => {
            const paneIndex = paneIds.indexOf(session.id);
            const inPane = paneIndex >= 0;
            const isActive = session.isActive;
            return (
              <div
                key={session.id}
                className={`pane-slot ${inPane ? 'pane-slot-visible' : ''} ${isActive ? 'pane-slot-active' : ''}`}
                style={inPane ? { gridArea: `p${paneIndex + 1}` } : { display: 'none' }}
                onClick={inPane && !isActive ? () => handleSelectSession(session.id) : undefined}
              >
                {inPane && (
                  <div className="pane-bar">
                    <span className="pane-bar-name">{session.name}</span>
                    <button
                      className="pane-bar-close"
                      onClick={(e) => { e.stopPropagation(); handleRemoveFromPane(session.id); }}
                      title="Remove from pane"
                    >×</button>
                  </div>
                )}
                <div className="pane-content">
                  {session.type === 'terminal' ? (
                    <TerminalView
                      sessionId={session.id}
                      isActive={isActive}
                      shell={session.shell}
                      fontSize={fontSize}
                      fromDaemon={session.fromDaemon}
                      tabletMode={tabletMode}
                      settings={settings}
                      onSessionMeta={handleSessionMeta}
                    />
                  ) : (
                    <BrowserView
                      sessionId={session.id}
                      isActive={isActive}
                      initialUrl={session.url}
                      initialTabs={session.browserTabs}
                      onTitleChange={handleBrowserTitleChange}
                      onTabsChange={handleBrowserTabsChange}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {paneIds.length === 0 && (
            <div className="pane-empty-state">Select a session from the sidebar</div>
          )}
        </div>
      </div>
      <div className="statusbar">
        <span className="statusbar-item">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
        <span className="statusbar-item statusbar-shell">{statusText}</span>
        {(() => {
          const meta = activeId ? sessionMeta.get(activeId) : null;
          if (!meta?.lastCommand) return null;
          return (
            <span className="statusbar-item statusbar-cmd" title={meta.lastCommand}>
              {meta.isRunning ? '\u25B6 ' : '$ '}{meta.lastCommand}
            </span>
          );
        })()}
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
