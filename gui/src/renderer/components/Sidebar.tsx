import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import type { SessionMeta } from './TerminalView';

interface SessionItem {
  id: string;
  name: string;
  isActive: boolean;
  type?: 'terminal' | 'browser';
  shell?: string;
  createdAt?: number;
}

interface SidebarProps {
  sessions: SessionItem[];
  canClose: boolean;
  onNew: (shell?: string) => void;
  onNewBrowser: (url?: string) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate?: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  unreadSessions?: Set<string>;
  sessionMeta?: Map<string, SessionMeta>;
  paneIds?: string[];
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 220;

function loadSidebarState() {
  try {
    const stored = localStorage.getItem('sidebar');
    if (stored) return JSON.parse(stored);
  } catch {}
  return { width: DEFAULT_WIDTH, collapsed: false, side: 'left' as const };
}

function saveSidebarState(state: { width: number; collapsed: boolean; side: string }) {
  localStorage.setItem('sidebar', JSON.stringify(state));
}

function formatUptime(createdAt: number): string {
  const delta = Math.floor((Date.now() - createdAt) / 1000);
  if (delta < 60) return `${delta}s`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h`;
  return `${Math.floor(delta / 86400)}d`;
}

function shellIcon(session: SessionItem): string {
  if (session.type === 'browser') return '\u{1F310}'; // globe
  const shell = (session.shell || '').toLowerCase();
  if (shell.includes('powershell') || shell.includes('pwsh')) return 'PS';
  if (shell.includes('cmd')) return '>';
  return '>_';
}

export interface SidebarHandle {
  toggleCollapse: () => void;
  toggleSide: () => void;
  collapsed: boolean;
  side: 'left' | 'right';
}

function SidebarInner({ sessions, canClose, onNew, onNewBrowser, onSelect, onClose, onRename, onDuplicate, onReorder, unreadSessions, sessionMeta, paneIds }: SidebarProps, ref: React.Ref<SidebarHandle>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editCancelled = useRef(false);
  const [sessionContextMenu, setSessionContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const initial = useRef(loadSidebarState());
  const [width, setWidth] = useState(initial.current.width);
  const [collapsed, setCollapsed] = useState(initial.current.collapsed);
  const [side, setSide] = useState<'left' | 'right'>(initial.current.side);

  const dragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [shellMenu, setShellMenu] = useState<{ x: number; y: number; shells: string[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const [newGroupInput, setNewGroupInput] = useState<{ sessionId: string; value: string } | null>(null);

  // Pin & color state — persisted in localStorage
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('session-pins');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [colorTags, setColorTags] = useState<Map<string, string>>(() => {
    try {
      const stored = localStorage.getItem('session-colors');
      return stored ? new Map(Object.entries(JSON.parse(stored))) : new Map();
    } catch { return new Map(); }
  });

  useEffect(() => {
    localStorage.setItem('session-pins', JSON.stringify([...pinnedIds]));
  }, [pinnedIds]);

  useEffect(() => {
    localStorage.setItem('session-colors', JSON.stringify(Object.fromEntries(colorTags)));
  }, [colorTags]);

  // Clean up stale references when sessions change
  useEffect(() => {
    const validIds = new Set(sessions.map((s) => s.id));

    setPinnedIds((prev) => {
      const cleaned = new Set([...prev].filter((id) => validIds.has(id)));
      return cleaned.size !== prev.size ? cleaned : prev;
    });

    setColorTags((prev) => {
      let changed = false;
      const cleaned = new Map<string, string>();
      for (const [id, color] of prev) {
        if (validIds.has(id)) cleaned.set(id, color); else changed = true;
      }
      return changed ? cleaned : prev;
    });

    setGroups((prev) => {
      let changed = false;
      const cleaned: Record<string, string[]> = {};
      for (const [name, ids] of Object.entries(prev)) {
        const valid = ids.filter((id) => validIds.has(id));
        if (valid.length !== ids.length) changed = true;
        if (valid.length > 0) cleaned[name] = valid;
        else changed = true;
      }
      return changed ? cleaned : prev;
    });
  }, [sessions]);

  // Auto-group: when ungrouped terminal count hits 5, group the first 4.
  // Fires on every session change; setGroups functional updater reads current groups.
  useEffect(() => {
    const terminals = sessions.filter((s) => s.type === 'terminal');
    setGroups((prev) => {
      const groupedIds = new Set(Object.values(prev).flat());
      const ungrouped = terminals.filter((s) => !groupedIds.has(s.id));
      if (ungrouped.length !== 5) return prev;
      const toGroup = ungrouped.slice(0, 4);
      const groupNum = Object.keys(prev).length + 1;
      const name = `Group ${groupNum}`;
      setCollapsedGroups((c) => new Set([...c, name]));
      return { ...prev, [name]: toGroup.map((s) => s.id) };
    });
  }, [sessions]);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setColor = (id: string, color: string | null) => {
    setColorTags((prev) => {
      const next = new Map(prev);
      if (color) next.set(id, color); else next.delete(id);
      return next;
    });
  };

  // Session groups
  const [groups, setGroups] = useState<Record<string, string[]>>(() => {
    try {
      const stored = localStorage.getItem('session-groups');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('session-groups-collapsed');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; groupName: string } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState('');

  useEffect(() => {
    localStorage.setItem('session-groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('session-groups-collapsed', JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);

  const moveToGroup = (sessionId: string, groupName: string) => {
    setGroups((prev) => {
      const next = { ...prev };
      // Remove from any existing group
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter((id) => id !== sessionId);
        if (next[key].length === 0) delete next[key];
      }
      // Add to new group
      if (!next[groupName]) next[groupName] = [];
      next[groupName].push(sessionId);
      return next;
    });
  };

  const removeFromGroup = (sessionId: string) => {
    setGroups((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter((id) => id !== sessionId);
        if (next[key].length === 0) delete next[key];
      }
      return next;
    });
  };

  const createGroup = (name: string, sessionId?: string) => {
    setGroups((prev) => {
      const next = { ...prev };
      if (!next[name]) next[name] = [];
      if (sessionId) {
        // Remove from existing group first
        for (const key of Object.keys(next)) {
          if (key !== name) next[key] = next[key].filter((id) => id !== sessionId);
          if (next[key].length === 0 && key !== name) delete next[key];
        }
        if (!next[name].includes(sessionId)) next[name].push(sessionId);
      }
      return next;
    });
  };

  const deleteGroup = (name: string) => {
    setGroups((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  const renameGroup = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    setGroups((prev) => {
      const next = { ...prev };
      next[newName.trim()] = next[oldName] || [];
      delete next[oldName];
      return next;
    });
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(oldName)) { next.delete(oldName); next.add(newName.trim()); }
      return next;
    });
  };

  const toggleGroupCollapse = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const getSessionGroup = (sessionId: string): string | null => {
    for (const [name, ids] of Object.entries(groups)) {
      if (ids.includes(sessionId)) return name;
    }
    return null;
  };

  const TAG_COLORS = [
    { name: 'Red', value: '#ff5370' },
    { name: 'Orange', value: '#ffab40' },
    { name: 'Yellow', value: '#ffd740' },
    { name: 'Green', value: '#00e676' },
    { name: 'Cyan', value: '#00e5ff' },
    { name: 'Blue', value: '#40c4ff' },
    { name: 'Purple', value: '#ea80fc' },
    { name: 'Pink', value: '#ff80ab' },
  ];

  // Force re-render every 30s to update uptime display
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Persist state on change
  useEffect(() => {
    saveSidebarState({ width, collapsed, side });
  }, [width, collapsed, side]);

  const handleDoubleClick = (session: SessionItem) => {
    editCancelled.current = false;
    setEditingId(session.id);
    setEditValue(session.name);
  };

  const handleRenameSubmit = (id: string) => {
    if (editCancelled.current) {
      editCancelled.current = false;
      setEditingId(null);
      return;
    }
    if (editValue.trim()) {
      onRename(id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleRenameCancel = () => {
    editCancelled.current = true;
    setEditingId(null);
  };

  // Drag resize
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, side]);

  const toggleCollapse = () => setCollapsed((c: boolean) => !c);
  const toggleSide = () => setSide((s: 'left' | 'right') => s === 'left' ? 'right' : 'left');

  useImperativeHandle(ref, () => ({
    toggleCollapse,
    toggleSide,
    get collapsed() { return collapsed; },
    get side() { return side; },
  }), [collapsed, side]);

  const sidebarStyle: React.CSSProperties = {
    width: collapsed ? 40 : width,
    minWidth: collapsed ? 40 : MIN_WIDTH,
    maxWidth: collapsed ? 40 : MAX_WIDTH,
    order: side === 'left' ? 0 : 1,
    borderRight: side === 'left' ? '1px solid var(--ui-border)' : 'none',
    borderLeft: side === 'right' ? '1px solid var(--ui-border)' : 'none',
  };

  const resizeHandleStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 5,
    cursor: 'col-resize',
    zIndex: 20,
    ...(side === 'left' ? { right: -3 } : { left: -3 }),
  };

  return (
    <div className="sidebar" ref={sidebarRef} style={sidebarStyle}>
      {/* Resize handle */}
      {!collapsed && <div style={resizeHandleStyle} onMouseDown={startResize} />}

      {!collapsed && (
        <>
          {/* Search filter */}
          {sessions.length >= 4 && (
            <div className="session-search">
              <input
                className="session-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter sessions..."
              />
              {searchQuery && (
                <button className="session-search-clear" onClick={() => setSearchQuery('')}>&times;</button>
              )}
            </div>
          )}
          <div className="session-list">
            {(() => {
              // Filter by search
              let filtered = sessions;
              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                filtered = sessions.filter((s) => s.name.toLowerCase().includes(q));
              }
              // Sort: pinned first, then original order
              const sorted = [...filtered].sort((a, b) => {
                const aPin = pinnedIds.has(a.id) ? 0 : 1;
                const bPin = pinnedIds.has(b.id) ? 0 : 1;
                if (aPin !== bPin) return aPin - bPin;
                return filtered.indexOf(a) - filtered.indexOf(b);
              });

              // Split into ungrouped + grouped
              const groupNames = Object.keys(groups);
              const groupedIds = new Set(Object.values(groups).flat());
              const ungrouped = sorted.filter((s) => !groupedIds.has(s.id));

              const renderList: { type: 'session'; session: SessionItem; idx: number }[] | { type: 'header'; name: string }[] = [];
              const allItems: Array<{ type: 'session'; session: SessionItem } | { type: 'header'; name: string; count: number; collapsed: boolean }> = [];

              // Ungrouped first
              for (const s of ungrouped) allItems.push({ type: 'session', session: s });

              // Then each group
              for (const gName of groupNames) {
                const gSessions = sorted.filter((s) => (groups[gName] || []).includes(s.id));
                if (gSessions.length === 0 && searchQuery) continue; // hide empty groups during search
                allItems.push({ type: 'header', name: gName, count: gSessions.length, collapsed: collapsedGroups.has(gName) });
                if (!collapsedGroups.has(gName)) {
                  for (const s of gSessions) allItems.push({ type: 'session', session: s });
                }
              }

              return allItems;
            })().map((item, i) => {
              if (item.type === 'header') {
                return (
                  <div key={`group-${item.name}`} className="session-group-header"
                    onClick={() => toggleGroupCollapse(item.name)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setGroupContextMenu({ x: e.clientX, y: e.clientY, groupName: item.name });
                    }}
                  >
                    <span className="session-group-chevron">{item.collapsed ? '\u25B6' : '\u25BC'}</span>
                    {renamingGroup === item.name ? (
                      <input
                        className="session-rename-input"
                        value={renameGroupValue}
                        onChange={(e) => setRenameGroupValue(e.target.value)}
                        onBlur={() => { renameGroup(item.name, renameGroupValue); setRenamingGroup(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { renameGroup(item.name, renameGroupValue); setRenamingGroup(null); }
                          if (e.key === 'Escape') setRenamingGroup(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="session-group-name">{item.name}</span>
                    )}
                    <span className="session-group-count">{item.count}</span>
                  </div>
                );
              }

              const session = item.session;
              const hasUnread = unreadSessions?.has(session.id) ?? false;
              const color = colorTags.get(session.id);
              const isPinned = pinnedIds.has(session.id);

              return (
                <React.Fragment key={session.id}>
                <div
                  className={`session-item ${session.isActive ? 'active' : ''}${dragOverId === session.id && dragId !== session.id ? ' drag-over' : ''}${dragId === session.id ? ' dragging' : ''}${isPinned ? ' pinned' : ''}`}
                  style={color ? { borderLeft: `3px solid ${color}`, paddingLeft: '7px' } as React.CSSProperties : undefined}
                  onClick={() => onSelect(session.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSessionContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id });
                  }}
                  draggable={editingId !== session.id}
                  onDragStart={(e) => {
                    setDragId(session.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverId(session.id);
                  }}
                  onDragLeave={() => {
                    setDragOverId((prev) => prev === session.id ? null : prev);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== session.id && onReorder) {
                      const fromIdx = sessions.findIndex((s) => s.id === dragId);
                      const toIdx = sessions.findIndex((s) => s.id === session.id);
                      if (fromIdx !== -1 && toIdx !== -1) onReorder(fromIdx, toIdx);
                    }
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                >
                  <span className={`session-icon ${session.type === 'browser' ? 'browser' : 'terminal'}`}>
                    {shellIcon(session)}
                  </span>

                  <div className="session-info">
                    {editingId === session.id ? (
                      <input
                        className="session-rename-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleRenameSubmit(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit(session.id);
                          if (e.key === 'Escape') handleRenameCancel();
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="session-name-row">
                          {isPinned && <span className="session-pin-icon" title="Pinned">{'\u{1F4CC}'}</span>}
                          <span
                            className="session-name"
                            onDoubleClick={() => handleDoubleClick(session)}
                          >
                            {session.name}
                          </span>
                          {session.createdAt && (
                            <span className="session-meta">
                              {formatUptime(session.createdAt)}
                            </span>
                          )}
                        </div>
                        {(() => {
                          const meta = sessionMeta?.get(session.id);
                          if (!meta) return null;
                          const subtitle = meta.cwd || meta.lastCommand;
                          if (!subtitle) return null;
                          return (
                            <div className="session-subtitle">
                              {meta.isRunning && <span className="session-running-dot" />}
                              <span className="session-subtitle-text" title={subtitle}>
                                {meta.cwd || meta.lastCommand}
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  {(() => {
                    const meta = sessionMeta?.get(session.id);
                    if (meta?.exitCode !== undefined && meta.exitCode !== null) {
                      return (
                        <span className={`session-exit-badge ${meta.exitCode === 0 ? 'success' : 'error'}`}>
                          {meta.exitCode === 0 ? '\u2713' : meta.exitCode}
                        </span>
                      );
                    }
                    if (hasUnread && !session.isActive) {
                      return <span className="session-unread" />;
                    }
                    return null;
                  })()}

                  {canClose && (
                    <button
                      className="session-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(session.id);
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
              </React.Fragment>
              );
            })}
          </div>
        </>
      )}

      {collapsed && (
        <div className="sidebar-collapsed-sessions">
          {sessions.map((session) => {
            const hasUnread = unreadSessions?.has(session.id) ?? false;
            return (
              <div
                key={session.id}
                className={`sidebar-collapsed-item ${session.isActive ? 'active' : ''}`}
                onClick={() => onSelect(session.id)}
                title={session.name}
              >
                <span className={`session-icon-sm ${session.type === 'browser' ? 'browser' : 'terminal'}`}>
                  {shellIcon(session)}
                </span>
                {hasUnread && !session.isActive && <span className="session-unread-sm" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Session context menu */}
      {sessionContextMenu && (
        <ContextMenu
          x={sessionContextMenu.x}
          y={sessionContextMenu.y}
          onClose={() => setSessionContextMenu(null)}
          items={(() => {
            const sid = sessionContextMenu.sessionId;
            const currentGroup = getSessionGroup(sid);
            const groupNames = Object.keys(groups);
            const items: ContextMenuItem[] = [
              {
                label: pinnedIds.has(sid) ? 'Unpin' : 'Pin to top',
                action: () => togglePin(sid),
              },
              {
                label: 'Color tag',
                action: () => {
                  setShowColorPicker({ x: sessionContextMenu.x, y: sessionContextMenu.y, sessionId: sid });
                },
              },
              { label: '', action: () => {}, separator: true },
              // Group options
              ...groupNames
                .filter((g) => g !== currentGroup)
                .map((g) => ({
                  label: `Move to ${g}`,
                  action: () => moveToGroup(sid, g),
                })),
              {
                label: 'New group...',
                action: () => {
                  setNewGroupInput({ sessionId: sid, value: '' });
                },
              },
              ...(currentGroup ? [{
                label: `Remove from ${currentGroup}`,
                action: () => removeFromGroup(sid),
              }] : []),
              { label: '', action: () => {}, separator: true },
              {
                label: 'Rename',
                action: () => {
                  const session = sessions.find((s) => s.id === sid);
                  if (session) {
                    editCancelled.current = false;
                    setEditingId(session.id);
                    setEditValue(session.name);
                  }
                },
              },
              {
                label: 'Duplicate',
                action: () => { if (onDuplicate) onDuplicate(sid); },
                disabled: !onDuplicate,
              },
              { label: '', action: () => {}, separator: true },
              {
                label: 'Close',
                action: () => onClose(sid),
                disabled: !canClose,
              },
            ];
            return items;
          })()}
        />
      )}

      {/* Color tag picker */}
      {showColorPicker && (
        <div className="context-menu-backdrop" onClick={() => setShowColorPicker(null)}>
          <div
            className="color-picker-menu"
            style={{ left: showColorPicker.x, top: showColorPicker.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="color-picker-grid">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`color-picker-swatch ${colorTags.get(showColorPicker.sessionId) === c.value ? 'active' : ''}`}
                  style={{ background: c.value }}
                  title={c.name}
                  onClick={() => {
                    setColor(showColorPicker.sessionId, colorTags.get(showColorPicker.sessionId) === c.value ? null : c.value);
                    setShowColorPicker(null);
                  }}
                />
              ))}
            </div>
            {colorTags.has(showColorPicker.sessionId) && (
              <button
                className="color-picker-clear"
                onClick={() => { setColor(showColorPicker.sessionId, null); setShowColorPicker(null); }}
              >
                Clear color
              </button>
            )}
          </div>
        </div>
      )}

      {/* New group name input */}
      {newGroupInput && (
        <div className="context-menu-backdrop" onClick={() => setNewGroupInput(null)}>
          <div
            className="shell-menu"
            style={{ left: 60, top: 80 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--ui-text-muted)', fontWeight: 600 }}>New group name</div>
            <input
              className="session-rename-input"
              style={{ margin: '0 8px 8px', width: 'calc(100% - 16px)' }}
              value={newGroupInput.value}
              onChange={(e) => setNewGroupInput({ ...newGroupInput, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newGroupInput.value.trim()) {
                  createGroup(newGroupInput.value.trim(), newGroupInput.sessionId);
                  setNewGroupInput(null);
                }
                if (e.key === 'Escape') setNewGroupInput(null);
              }}
              autoFocus
              placeholder="Group name..."
            />
          </div>
        </div>
      )}

      {/* Group context menu */}
      {groupContextMenu && (
        <ContextMenu
          x={groupContextMenu.x}
          y={groupContextMenu.y}
          onClose={() => setGroupContextMenu(null)}
          items={[
            {
              label: 'Rename group',
              action: () => {
                setRenamingGroup(groupContextMenu.groupName);
                setRenameGroupValue(groupContextMenu.groupName);
              },
            },
            {
              label: 'Delete group',
              action: () => deleteGroup(groupContextMenu.groupName),
            },
          ]}
        />
      )}

      {/* Shell picker menu */}
      {shellMenu && (
        <div
          className="shell-menu-backdrop"
          onClick={() => setShellMenu(null)}
        >
          <div
            className="shell-menu"
            style={{ left: shellMenu.x, top: shellMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {shellMenu.shells.map((shell) => (
              <button
                key={shell}
                className="shell-menu-item"
                onClick={() => {
                  onNew(shell);
                  setShellMenu(null);
                }}
              >
                {shell}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const Sidebar = forwardRef(SidebarInner);
export default Sidebar;
