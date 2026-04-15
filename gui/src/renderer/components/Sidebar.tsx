import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import type { SessionMeta } from './TerminalView';

interface Session {
  id: string;
  name: string;
  type: 'terminal';
  shell?: string;
  createdAt: number;
}

interface Group {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: number;
}

interface SidebarProps {
  groups: Group[];
  sessions: Map<string, Session>;
  activeGroupId: string | null;
  unreadSessions?: Set<string>;
  sessionMeta?: Map<string, SessionMeta>;
  onSelectGroup: (groupId: string) => void;
  onNew: () => void;
  onCloseGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onCloseSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  position: 'left' | 'right' | 'top' | 'bottom';
}

export interface SidebarHandle {
  toggleCollapse: () => void;
  toggleSide: () => void;
  collapsed: boolean;
  side: 'left' | 'right';
}

const MIN_SIZE = 44;
const MAX_H_SIZE = 400;
const MAX_V_SIZE = 200;
const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 56;

function loadSidebarState() {
  try {
    const stored = localStorage.getItem('sidebar');
    if (stored) return JSON.parse(stored);
  } catch {}
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, collapsed: false };
}

function saveSidebarState(state: { width: number; height: number; collapsed: boolean }) {
  localStorage.setItem('sidebar', JSON.stringify(state));
}

function SidebarInner({
  groups,
  sessions,
  activeGroupId,
  onSelectGroup,
  onNew,
  onCloseGroup,
  onRenameGroup,
  onCloseSession,
  onRenameSession,
  position,
}: SidebarProps, ref: React.Ref<SidebarHandle>) {
  const initial = useRef(loadSidebarState());
  const [width, setWidth] = useState(initial.current.width);
  const [height, setHeight] = useState(initial.current.height);
  const [collapsed, setCollapsed] = useState(initial.current.collapsed);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const [sessionContextMenu, setSessionContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState('');
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [renameSessionValue, setRenameSessionValue] = useState('');

  const isVertical = position === 'left' || position === 'right';

  useEffect(() => { saveSidebarState({ width, height, collapsed }); }, [width, height, collapsed]);

  const toggleCollapse = () => setCollapsed((c: boolean) => !c);

  useImperativeHandle(ref, () => ({
    toggleCollapse,
    toggleSide: () => {},
    collapsed,
    side: position as 'left' | 'right',
  }));

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;
    const onMove = (ev: MouseEvent) => {
      if (isVertical) {
        const delta = position === 'right' ? startX - ev.clientX : ev.clientX - startX;
        setWidth(Math.min(MAX_H_SIZE, Math.max(MIN_SIZE, startW + delta)));
      } else {
        const delta = position === 'bottom' ? startY - ev.clientY : ev.clientY - startY;
        setHeight(Math.min(MAX_V_SIZE, Math.max(MIN_SIZE, startH + delta)));
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const sidebarStyle: React.CSSProperties = collapsed
    ? (isVertical
        ? { width: MIN_SIZE, minWidth: MIN_SIZE, maxWidth: MIN_SIZE }
        : { height: MIN_SIZE, minHeight: MIN_SIZE, maxHeight: MIN_SIZE })
    : (isVertical
        ? { width, minWidth: MIN_SIZE, maxWidth: MAX_H_SIZE }
        : { height, minHeight: MIN_SIZE, maxHeight: MAX_V_SIZE });

  const resizeEdge = (() => {
    if (position === 'right') return 'left';
    if (position === 'left') return 'right';
    if (position === 'bottom') return 'top';
    return 'bottom';
  })();

  const resizeHandleStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 20,
    ...(isVertical
      ? { top: 0, bottom: 0, width: 6, cursor: 'col-resize', [resizeEdge]: -3 }
      : { left: 0, right: 0, height: 6, cursor: 'row-resize', [resizeEdge]: -3 }),
  };

  const getGroupContextMenuItems = (groupId: string): ContextMenuItem[] => [
    {
      label: 'RENAME',
      onClick: () => {
        const group = groups.find(g => g.id === groupId);
        if (group) { setRenamingGroup(groupId); setRenameGroupValue(group.name); }
      },
    },
    { label: 'CLOSE', onClick: () => onCloseGroup(groupId), danger: true },
  ];

  const getSessionContextMenuItems = (sessionId: string): ContextMenuItem[] => [
    {
      label: 'RENAME',
      onClick: () => {
        const session = sessions.get(sessionId);
        if (session) { setRenamingSession(sessionId); setRenameSessionValue(session.name); }
      },
    },
    { label: 'CLOSE', onClick: () => onCloseSession(sessionId), danger: true },
  ];

  // ── Horizontal mode (top/bottom) ──
  if (!isVertical) {
    return (
      <div
        className="relative flex bg-surface-low/60 backdrop-blur-sm border-b border-white/[0.03] overflow-hidden"
        ref={sidebarRef}
        style={sidebarStyle}
      >
        {!collapsed && (
          <div style={resizeHandleStyle} onMouseDown={startResize}
            className="hover:bg-primary/10 transition-colors" />
        )}
        <div className="flex items-center gap-1 px-2 w-full overflow-x-auto">
          {groups.map(group => {
            const isActive = group.id === activeGroupId;
            return (
              <div key={group.id} className="flex items-center gap-0.5 shrink-0">
                {renamingGroup === group.id ? (
                  <input className="bg-surface-high text-on-surface text-xs px-1.5 py-0.5 w-20 outline-none border border-primary/30"
                    value={renameGroupValue}
                    onChange={e => setRenameGroupValue(e.target.value)}
                    onBlur={() => { onRenameGroup(group.id, renameGroupValue); setRenamingGroup(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { onRenameGroup(group.id, renameGroupValue); setRenamingGroup(null); } if (e.key === 'Escape') setRenamingGroup(null); }}
                    autoFocus onClick={e => e.stopPropagation()} />
                ) : (
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    className={`px-2.5 py-1 text-[0.6rem] font-[var(--font-mono)] tracking-[0.1em] transition-all cursor-pointer ${
                      isActive
                        ? 'text-primary bg-primary-dim shadow-[0_1px_0_var(--color-primary)_inset]'
                        : 'text-muted-foreground hover:text-on-surface-variant hover:bg-surface-high/40'
                    }`}
                    onClick={() => onSelectGroup(group.id)}
                    onContextMenu={e => { e.preventDefault(); setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id }); }}
                  >
                    {group.name}
                  </motion.button>
                )}
                <AnimatePresence>
                  {isActive && group.sessionIds.map(sid => {
                    const session = sessions.get(sid);
                    if (!session) return null;
                    return (
                      <motion.div
                        key={sid}
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex items-center gap-1 px-1.5 py-0.5 text-[0.55rem] font-[var(--font-mono)] text-muted-foreground hover:text-on-surface transition-colors overflow-hidden"
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSessionContextMenu({ x: e.clientX, y: e.clientY, sessionId: sid }); }}
                      >
                        {renamingSession === sid ? (
                          <input className="bg-surface-high text-on-surface text-xs px-1 py-0 w-16 outline-none border border-primary/30"
                            value={renameSessionValue}
                            onChange={e => setRenameSessionValue(e.target.value)}
                            onBlur={() => { onRenameSession(sid, renameSessionValue); setRenamingSession(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') { onRenameSession(sid, renameSessionValue); setRenamingSession(null); } if (e.key === 'Escape') setRenamingSession(null); }}
                            autoFocus />
                        ) : (
                          <>
                            <span className="truncate max-w-[80px]"
                              onDoubleClick={() => { setRenamingSession(sid); setRenameSessionValue(session.name); }}>
                              {session.name}
                            </span>
                            <button className="text-surface-highest hover:text-danger transition-colors cursor-pointer shrink-0"
                              onClick={e => { e.stopPropagation(); onCloseSession(sid); }}>×</button>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            );
          })}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="px-2 py-1 text-primary hover:text-primary-light transition-colors text-sm cursor-pointer shrink-0"
            onClick={onNew}
          >
            +
          </motion.button>
          <div className="ml-auto shrink-0">
            <button className="text-muted-foreground/40 hover:text-muted-foreground text-[0.5rem] font-[var(--font-mono)] tracking-wider transition-colors cursor-pointer"
              onClick={toggleCollapse}>{collapsed ? '▸' : '▾'}</button>
          </div>
        </div>
        {groupContextMenu && <ContextMenu x={groupContextMenu.x} y={groupContextMenu.y} items={getGroupContextMenuItems(groupContextMenu.groupId)} onClose={() => setGroupContextMenu(null)} />}
        {sessionContextMenu && <ContextMenu x={sessionContextMenu.x} y={sessionContextMenu.y} items={getSessionContextMenuItems(sessionContextMenu.sessionId)} onClose={() => setSessionContextMenu(null)} />}
      </div>
    );
  }

  // ── Vertical mode (left/right) ──
  return (
    <motion.div
      className="relative flex flex-col bg-surface-low/60 backdrop-blur-sm overflow-hidden shrink-0 border-r border-white/[0.03]"
      ref={sidebarRef}
      style={sidebarStyle}
      layout
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      {!collapsed && (
        <div style={resizeHandleStyle} onMouseDown={startResize}
          className="hover:bg-primary/10 transition-colors" />
      )}

      <AnimatePresence mode="wait">
        {!collapsed ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col h-full"
          >
            {/* Brand header */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                <div>
                  <div className="text-primary text-[0.6rem] font-bold tracking-[0.3em] font-[var(--font-headline)]">
                    TERMINAL_ED
                  </div>
                  <div className="text-surface-highest text-[0.45rem] font-[var(--font-mono)] tracking-[0.2em] mt-0.5">
                    V2.2.0_STABLE
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent mx-3" />

            {/* Session list */}
            <div className="flex-1 overflow-y-auto py-2">
              {groups.map((group, gi) => {
                const isActive = group.id === activeGroupId;
                return (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: gi * 0.04, type: 'spring', damping: 20 }}
                  >
                    {renamingGroup === group.id ? (
                      <div className="px-3 py-1.5">
                        <input className="w-full bg-surface-high text-on-surface text-xs px-2 py-1 outline-none border border-primary/30"
                          value={renameGroupValue}
                          onChange={e => setRenameGroupValue(e.target.value)}
                          onBlur={() => { onRenameGroup(group.id, renameGroupValue); setRenamingGroup(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { onRenameGroup(group.id, renameGroupValue); setRenamingGroup(null); } if (e.key === 'Escape') setRenamingGroup(null); }}
                          autoFocus onClick={e => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <motion.div
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative mx-2 px-3 py-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-primary-dim text-primary'
                            : 'text-muted-foreground hover:bg-surface-base/60 hover:text-on-surface-variant'
                        }`}
                        onClick={() => onSelectGroup(group.id)}
                        onContextMenu={e => { e.preventDefault(); setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id }); }}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeGroupIndicator"
                            className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary shadow-[0_0_6px_var(--color-primary)]"
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                          />
                        )}
                        <span className="text-[0.6rem] font-[var(--font-mono)] tracking-[0.12em] font-medium">
                          {group.name}
                        </span>
                      </motion.div>
                    )}

                    <AnimatePresence>
                      {isActive && group.sessionIds.map((sid, si) => {
                        const session = sessions.get(sid);
                        if (!session) return null;
                        return (
                          <motion.div
                            key={sid}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ delay: si * 0.03, type: 'spring', damping: 20 }}
                            className="px-2 pl-7 group/session"
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSessionContextMenu({ x: e.clientX, y: e.clientY, sessionId: sid }); }}
                          >
                            {renamingSession === sid ? (
                              <div className="py-1">
                                <input className="w-full bg-surface-high text-on-surface text-[0.6rem] px-2 py-1 outline-none border border-primary/30"
                                  value={renameSessionValue}
                                  onChange={e => setRenameSessionValue(e.target.value)}
                                  onBlur={() => { onRenameSession(sid, renameSessionValue); setRenamingSession(null); }}
                                  onKeyDown={e => { if (e.key === 'Enter') { onRenameSession(sid, renameSessionValue); setRenamingSession(null); } if (e.key === 'Escape') setRenamingSession(null); }}
                                  autoFocus />
                              </div>
                            ) : (
                              <motion.div
                                whileHover={{ x: 2 }}
                                className="flex items-center justify-between py-1 px-2 transition-colors cursor-default"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className="w-1 h-1 bg-muted-foreground/30 group-hover/session:bg-primary/50 transition-colors shrink-0" />
                                  <span className="text-[0.6rem] font-[var(--font-mono)] text-muted-foreground group-hover/session:text-on-surface-variant transition-colors truncate"
                                    onDoubleClick={() => { setRenamingSession(sid); setRenameSessionValue(session.name); }}>
                                    {session.name}
                                  </span>
                                </div>
                                <motion.button
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.9 }}
                                  className="text-surface-highest hover:text-danger text-xs transition-colors cursor-pointer opacity-0 group-hover/session:opacity-100 shrink-0"
                                  onClick={e => { e.stopPropagation(); onCloseSession(sid); }}
                                >
                                  ×
                                </motion.button>
                              </motion.div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-3 py-3 space-y-2">
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
              <motion.button
                whileHover={{ scale: 1.01, boxShadow: '0 0 12px var(--color-primary-glow)' }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-2 text-[0.6rem] font-[var(--font-mono)] tracking-[0.2em] font-bold text-primary bg-primary-dim hover:bg-primary-glow transition-colors cursor-pointer"
                onClick={onNew}
              >
                NEW SESSION
              </motion.button>
              <button
                className="w-full text-[0.5rem] font-[var(--font-mono)] tracking-[0.15em] text-surface-highest hover:text-muted-foreground transition-colors cursor-pointer py-1"
                onClick={toggleCollapse}
              >
                hide sidebar
              </button>
            </div>

            {groupContextMenu && <ContextMenu x={groupContextMenu.x} y={groupContextMenu.y} items={getGroupContextMenuItems(groupContextMenu.groupId)} onClose={() => setGroupContextMenu(null)} />}
            {sessionContextMenu && <ContextMenu x={sessionContextMenu.x} y={sessionContextMenu.y} items={getSessionContextMenuItems(sessionContextMenu.sessionId)} onClose={() => setSessionContextMenu(null)} />}
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center py-3 gap-3 h-full"
          >
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              className="w-9 h-9 flex items-center justify-center text-primary bg-primary-dim hover:bg-primary-glow transition-colors cursor-pointer"
              onClick={onNew}
            >
              +
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              className="text-primary/60 text-[0.45rem] font-[var(--font-headline)] tracking-[0.25em] cursor-pointer hover:text-primary transition-colors"
              onClick={toggleCollapse}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              TERMINAL
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const Sidebar = forwardRef(SidebarInner);
export default Sidebar;
