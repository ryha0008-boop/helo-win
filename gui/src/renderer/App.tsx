import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import TitleBar from './components/TitleBar';
import BlueprintPanel, { Blueprint } from './components/BlueprintPanel';
import Sidebar, { SidebarHandle } from './components/Sidebar';
import TerminalView, { SessionMeta } from './components/TerminalView';
import SettingsPanel from './components/SettingsPanel';
import { Settings, defaultSettings, themes } from '../shared/settings';

// Groups are mandatory, max 4 sessions per group
// Clicking a group shows all its sessions (other groups hidden)
// Terminals persist across group switches (always mounted, visibility toggled)

interface Session {
  id: string;
  name: string;
  type: 'terminal';
  shell?: string;
  fromDaemon?: boolean;
  createdAt: number;
}

interface Group {
  id: string;
  name: string;
  sessionIds: string[];  // max 4
  createdAt: number;
}

let sessionCounter = 0;
let groupCounter = 0;

function createSession(shell?: string): Session {
  sessionCounter++;
  return {
    id: crypto.randomUUID(),
    name: shell ? `${shell} ${sessionCounter}` : `Terminal ${sessionCounter}`,
    type: 'terminal',
    shell,
    createdAt: Date.now(),
  };
}

function createGroup(name?: string): Group {
  groupCounter++;
  return {
    id: crypto.randomUUID(),
    name: name || `Group ${groupCounter}`,
    sessionIds: [],
    createdAt: Date.now(),
  };
}

export default function App() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const sidebarRef = useRef<SidebarHandle>(null);
  const forceQuitting = useRef(false);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const [sessionMeta, setSessionMeta] = useState<Map<string, SessionMeta>>(new Map());
  const [showBlueprints, setShowBlueprints] = useState(false);
  const pendingInitCommands = useRef<Map<string, string>>(new Map());

  // Pane resize splits (percentage 20-80)
  const [splitV, setSplitV] = useState(50);
  const [splitH, setSplitH] = useState(50);

  // Get active group
  const activeGroup = activeGroupId ? groups.find(g => g.id === activeGroupId) : null;

  // When a PTY becomes ready, if there's a pending init command, send it.
  useEffect(() => {
    const readyListener = (_event: any, { id }: { id: string }) => {
      const cmd = pendingInitCommands.current.get(id);
      if (cmd) {
        pendingInitCommands.current.delete(id);
        setTimeout(() => window.terminal.writePty(id, cmd + '\n'), 100);
      }
    };
    window.terminal.addReadyListener(readyListener);
    return () => window.terminal.removeReadyListener(readyListener);
  }, []);

  // Find or create a group with room for a new session
  const findOrCreateGroupForNewSession = useCallback((): Group => {
    const availableGroup = groups.find(g => g.sessionIds.length < 4);
    if (availableGroup) return availableGroup;
    const newGroup = createGroup();
    setGroups(prev => [...prev, newGroup]);
    return newGroup;
  }, [groups]);

  const handleNewSession = useCallback((shell?: string) => {
    const session = createSession(shell);
    const group = findOrCreateGroupForNewSession();
    setSessions(prev => new Map(prev).set(session.id, session));
    setGroups(prev => prev.map(g =>
      g.id === group.id
        ? { ...g, sessionIds: [...g.sessionIds, session.id] }
        : g
    ));
    setActiveGroupId(group.id);
  }, [findOrCreateGroupForNewSession]);

  // Click group -> activate it
  const handleSelectGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
  }, []);

  // Refit terminals when group changes — debounce to avoid double-print
  useEffect(() => {
    if (!activeGroupId) return;
    const timer = setTimeout(() => {
      const group = groups.find(g => g.id === activeGroupId);
      if (group) {
        for (const id of group.sessionIds) {
          try {
            const entry = TerminalView.getTerminal?.(id);
            if (entry?.fitAddon && entry.term) {
              const parent = entry.term.element?.parentElement;
              if (parent && parent.offsetWidth > 0 && parent.offsetHeight > 0) {
                entry.fitAddon.fit();
              }
            }
          } catch {
            // Terminal may not be mounted yet
          }
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [activeGroupId, groups]);

  // Clear unread when group becomes active
  useEffect(() => {
    if (!activeGroupId) return;
    const group = groups.find(g => g.id === activeGroupId);
    if (group) {
      setUnreadSessions(prev => {
        const next = new Set(prev);
        for (const sid of group.sessionIds) {
          next.delete(sid);
        }
        return next;
      });
    }
  }, [activeGroupId, groups]);

  const handleLaunchBlueprint = useCallback((bp: Blueprint, cwd: string) => {
    const session = createSession();
    session.name = bp.name;
    const group = findOrCreateGroupForNewSession();
    const initCmd = `cd "${cwd.replace(/"/g, '\\"')}" && helo run ${bp.name}`;
    pendingInitCommands.current.set(session.id, initCmd);
    setSessions(prev => new Map(prev).set(session.id, session));
    setGroups(prev => prev.map(g =>
      g.id === group.id
        ? { ...g, sessionIds: [...g.sessionIds, session.id] }
        : g
    ));
    setActiveGroupId(group.id);
  }, [findOrCreateGroupForNewSession]);

  const handleSessionMeta = useCallback((id: string, meta: SessionMeta) => {
    setSessionMeta(prev => {
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

  // Track unread activity on background terminals
  useEffect(() => {
    const listener = (_event: any, { id }: { id: string; data: string }) => {
      const isInActiveGroup = activeGroup?.sessionIds.includes(id) ?? false;
      if (!isInActiveGroup) {
        setUnreadSessions(prev => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    };
    window.terminal.addDataListener(listener);
    return () => window.terminal.removeDataListener(listener);
  }, [activeGroup]);

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

  // Apply theme CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const ui = themes[settings.theme]?.ui || themes.kinetic.ui;
    root.style.setProperty('--ui-bg', ui.bg);
    root.style.setProperty('--ui-sidebar', ui.sidebar);
    root.style.setProperty('--ui-border', ui.border);
    root.style.setProperty('--ui-accent', ui.accent);
    root.style.setProperty('--ui-text', ui.text);
    root.style.setProperty('--ui-text-muted', ui.textMuted);
    root.style.setProperty('--ui-text-dim', ui.textDim);
    root.style.setProperty('--ui-danger', '#ff5370');
    root.style.setProperty('--ui-success', '#a6e3a1');
    root.style.setProperty('--ui-panel', ui.sidebar);
    root.style.setProperty('--ui-surface', ui.surface || ui.border);
    root.style.setProperty('--ui-surface-high', ui.surfaceHigh || ui.border);
    root.style.setProperty('--ui-surface-highest', ui.surfaceHighest || ui.sidebar);
    root.style.setProperty('--ui-outline', ui.outline || ui.border);
    root.style.setProperty('--ui-hover', 'rgba(255, 255, 255, 0.03)');
    root.style.setProperty('--ui-glow', `0 0 12px ${ui.accent}40`);
  }, [settings.theme]);

  const handleSaveSettings = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    window.terminal.saveSettings(newSettings);
    window.terminal.setOpacity(newSettings.opacity);
    for (const session of sessions.values()) {
      const entry = TerminalView.getTerminal?.(session.id);
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
  }, [sessions]);

  // On mount: restore daemon sessions
  useEffect(() => {
    if (initializedRef.current) return;
    window.terminal.listDaemonSessions().catch(() => []).then((daemonSessions: any[]) => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      const restoredSessions = new Map<string, Session>();
      const restoredGroups: Group[] = [];
      let currentGroup: Group | null = null;
      const alive = daemonSessions.filter((s: any) => s.alive);
      for (let i = 0; i < alive.length; i++) {
        sessionCounter++;
        const session: Session = {
          id: alive[i].id,
          name: alive[i].shell ? `${alive[i].shell} ${sessionCounter}` : `Terminal ${sessionCounter}`,
          type: 'terminal',
          shell: alive[i].shell,
          fromDaemon: true,
          createdAt: Date.now(),
        };
        restoredSessions.set(session.id, session);
        if (!currentGroup || currentGroup.sessionIds.length >= 4) {
          currentGroup = createGroup();
          restoredGroups.push(currentGroup);
        }
        currentGroup.sessionIds.push(session.id);
      }
      if (restoredGroups.length === 0) {
        const group = createGroup();
        const session = createSession();
        group.sessionIds = [session.id];
        restoredSessions.set(session.id, session);
        restoredGroups.push(group);
      }
      setSessions(restoredSessions);
      setGroups(restoredGroups);
      setActiveGroupId(restoredGroups[0].id);
    });
    const timeout = setTimeout(() => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      const group = createGroup();
      const session = createSession();
      group.sessionIds = [session.id];
      setSessions(new Map([[session.id, session]]));
      setGroups([group]);
      setActiveGroupId(group.id);
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);

  const handleCloseGroup = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    for (const sessionId of group.sessionIds) {
      window.terminal.destroyPty(sessionId);
    }
    const newGroups = groups.filter(g => g.id !== groupId);
    if (newGroups.length === 0) {
      const newGroup = createGroup();
      const newSession = createSession();
      newGroup.sessionIds = [newSession.id];
      setSessions(new Map([[newSession.id, newSession]]));
      setGroups([newGroup]);
      setActiveGroupId(newGroup.id);
    } else {
      const usedSessionIds = new Set(newGroups.flatMap(g => g.sessionIds));
      const newSessions = new Map(sessions);
      for (const sid of sessions.keys()) {
        if (!usedSessionIds.has(sid)) newSessions.delete(sid);
      }
      setSessions(newSessions);
      setGroups(newGroups);
      if (activeGroupId === groupId) {
        setActiveGroupId(newGroups[0]?.id ?? null);
      }
    }
  }, [groups, sessions, activeGroupId]);

  const handleRenameGroup = useCallback((groupId: string, name: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, name: name.trim() || g.name } : g
    ));
  }, []);

  const handleRenameSession = useCallback((sessionId: string, name: string) => {
    setSessions(prev => {
      const session = prev.get(sessionId);
      if (!session) return prev;
      const next = new Map(prev);
      next.set(sessionId, { ...session, name: name.trim() || session.name });
      return next;
    });
  }, []);

  const handleCloseSession = useCallback((sessionId: string) => {
    const group = groups.find(g => g.sessionIds.includes(sessionId));
    if (!group) return;
    window.terminal.destroyPty(sessionId);
    const isLastSession = group.sessionIds.length === 1;
    const isOnlyGroup = groups.length === 1;
    if (isLastSession && isOnlyGroup) {
      const newSession = createSession();
      setSessions(new Map([[newSession.id, newSession]]));
      setGroups([{ ...group, sessionIds: [newSession.id] }]);
    } else {
      setSessions(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setGroups(prev => {
        const newGroups = prev.map(g =>
          g.id === group.id
            ? { ...g, sessionIds: g.sessionIds.filter(id => id !== sessionId) }
            : g
        );
        const updatedGroup = newGroups.find(g => g.id === group.id);
        if (updatedGroup && updatedGroup.sessionIds.length === 0) {
          return newGroups.filter(g => g.id !== group.id);
        }
        return newGroups;
      });
    }
  }, [groups]);

  // Keyboard shortcuts — capture phase so xterm doesn't swallow them
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        handleNewSession();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        e.stopPropagation();
        if (activeGroupId) handleCloseGroup(activeGroupId);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleNewSession, handleCloseGroup, activeGroupId]);

  // All session IDs in stable order — never reorder, just toggle visibility
  const allSessionIds = Array.from(sessions.keys());
  const visibleIds = activeGroup?.sessionIds ?? [];
  const visibleSet = new Set(visibleIds);

  const count = visibleIds.length;

  // Build grid template — vertical stacking priority
  let gridTemplate = '"a"';
  let gridCols = '1fr';
  let gridRows = '1fr';
  if (count === 2) {
    gridTemplate = '"a" "b"';
    gridCols = '1fr';
    gridRows = `${splitH}% 1fr`;
  } else if (count === 3) {
    gridTemplate = '"a a" "b c"';
    gridCols = '1fr 1fr';
    gridRows = `${splitH}% 1fr`;
  } else if (count === 4) {
    gridTemplate = '"a b" "c d"';
    gridCols = '1fr 1fr';
    gridRows = `${splitH}% 1fr`;
  }

  const sidebarPos = settings.sidebarPosition;
  const isVerticalSidebar = sidebarPos === 'left' || sidebarPos === 'right';
  const sidebarFirst = sidebarPos === 'left' || sidebarPos === 'top';

  const sidebarEl = (
    <Sidebar
      ref={sidebarRef}
      groups={groups}
      sessions={sessions}
      activeGroupId={activeGroupId}
      unreadSessions={unreadSessions}
      sessionMeta={sessionMeta}
      onSelectGroup={handleSelectGroup}
      onNew={() => handleNewSession()}
      onCloseGroup={handleCloseGroup}
      onRenameGroup={handleRenameGroup}
      onCloseSession={handleCloseSession}
      onRenameSession={handleRenameSession}
      position={sidebarPos}
    />
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <TitleBar
        sessionCount={groups.length}
        activeSessionName={activeGroup?.name ?? ''}
        onToggleSettings={() => setShowSettings(true)}
      />
      <div
        className="flex flex-1 min-h-0"
        style={{ flexDirection: isVerticalSidebar ? 'row' : 'column' }}
      >
        {sidebarFirst && sidebarEl}
        <div className="relative flex-1 min-w-0 min-h-0 bg-surface">
          <div
            className="w-full h-full"
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gridTemplateRows: gridRows,
              gridTemplateAreas: gridTemplate,
              gap: 1,
            }}
          >
            {allSessionIds.map(id => {
              const session = sessions.get(id);
              if (!session) return null;
              const isVisible = visibleSet.has(id);
              const posIdx = isVisible ? visibleIds.indexOf(id) : -1;
              const area = ['a', 'b', 'c', 'd'][posIdx] ?? '';
              return (
                <div
                  key={id}
                  className={isVisible ? 'overflow-hidden flex flex-col bg-surface-low' : 'absolute inset-0 overflow-hidden pointer-events-none opacity-0'}
                  style={isVisible ? { gridArea: area } : undefined}
                >
                  <div className="flex items-center justify-between px-3 h-7 shrink-0 bg-surface-low border-b border-white/[0.03]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-1 h-1 bg-primary/40 shrink-0" />
                      <span className="text-[0.55rem] font-[var(--font-mono)] tracking-[0.12em] text-muted-foreground truncate">{session.name}</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="text-surface-highest hover:text-danger text-xs transition-colors cursor-pointer shrink-0"
                      onClick={() => handleCloseSession(id)}
                      title="Close session"
                    >
                      ×
                    </motion.button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <TerminalView
                      sessionId={session.id}
                      isActive={isVisible}
                      shell={session.shell}
                      fontSize={settings.fontSize}
                      fromDaemon={session.fromDaemon}
                      settings={settings}
                      onSessionMeta={handleSessionMeta}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Row divider — 2+ terminals */}
          {count >= 2 && (
            <div
              className="absolute left-0 right-0 h-[5px] z-10 cursor-row-resize group/hr"
              style={{ top: `calc(${splitH}% - 3px)` }}
              onMouseDown={(e) => {
                e.preventDefault();
                const container = e.currentTarget.parentElement;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const onMove = (ev: MouseEvent) => {
                  const pct = ((ev.clientY - rect.top) / rect.height) * 100;
                  setSplitH(Math.min(80, Math.max(20, pct)));
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  document.body.style.cursor = '';
                };
                document.body.style.cursor = 'row-resize';
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            >
              <div className="h-full w-full flex items-center justify-center opacity-0 group-hover/hr:opacity-100 transition-opacity">
                <div className="w-8 h-px bg-primary/30" />
              </div>
            </div>
          )}
          {/* Column divider — 3+ terminals */}
          {count >= 3 && (
            <div
              className="absolute top-0 bottom-0 w-[5px] z-10 cursor-col-resize group/vr"
              style={{ left: `calc(${splitV}% - 3px)` }}
              onMouseDown={(e) => {
                e.preventDefault();
                const container = e.currentTarget.parentElement;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const onMove = (ev: MouseEvent) => {
                  const pct = ((ev.clientX - rect.left) / rect.width) * 100;
                  setSplitV(Math.min(80, Math.max(20, pct)));
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  document.body.style.cursor = '';
                };
                document.body.style.cursor = 'col-resize';
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            >
              <div className="h-full w-full flex items-center justify-center opacity-0 group-hover/vr:opacity-100 transition-opacity">
                <div className="h-8 w-px bg-primary/30" />
              </div>
            </div>
          )}
        </div>
        {!sidebarFirst && sidebarEl}
      </div>
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      <BlueprintPanel
        open={showBlueprints}
        onClose={() => setShowBlueprints(false)}
        onLaunch={handleLaunchBlueprint}
      />
    </div>
  );
}
