import React, { useState } from 'react';

interface TabletToolbarProps {
  activeType: 'terminal' | 'browser';
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onSearch: () => void;
  onNewTerminal: () => void;
  onNewBrowser: () => void;
  onCloseTab: () => void;
  onArrow: (direction: 'up' | 'down' | 'left' | 'right', select: boolean) => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onSplitVertical: () => void;
  onSplitHorizontal: () => void;
  onCloseSplit: () => void;
  canClose: boolean;
  hasSplit: boolean;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onSettings: () => void;
  onToggleDesktop: () => void;
}

export default function TabletToolbar({
  activeType,
  onCopy,
  onPaste,
  onClear,
  onSearch,
  onNewTerminal,
  onNewBrowser,
  onCloseTab,
  onArrow,
  onScrollUp,
  onScrollDown,
  onSplitVertical,
  onSplitHorizontal,
  onCloseSplit,
  canClose,
  hasSplit,
  onToggleSidebar,
  sidebarCollapsed,
  onSettings,
  onToggleDesktop,
}: TabletToolbarProps) {
  const [selectMode, setSelectMode] = useState(false);

  return (
    <div className="tablet-toolbar">
      {/* Single row: all controls */}
      <div className="tt-row">
        {/* Sidebar toggle */}
        <div className="tt-group">
          <button className="tt-btn tt-btn-icon" onClick={onToggleSidebar} title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
            {sidebarCollapsed ? '\u2630' : '\u2715'}
          </button>
        </div>

        {/* Session controls */}
        <div className="tt-group">
          <button className="tt-btn tt-btn-primary" onClick={onNewTerminal}>+Term</button>
          <button className="tt-btn tt-btn-primary" onClick={onNewBrowser}>+Web</button>
          {canClose && <button className="tt-btn tt-btn-danger" onClick={onCloseTab}>&times;</button>}
        </div>

        {/* Split controls */}
        {!hasSplit ? (
          <div className="tt-group">
            <button className="tt-btn" onClick={onSplitVertical} title="Split vertical">&#9553;</button>
            <button className="tt-btn" onClick={onSplitHorizontal} title="Split horizontal">&#9552;</button>
          </div>
        ) : (
          <div className="tt-group">
            <button className="tt-btn tt-btn-danger" onClick={onCloseSplit}>&times;Split</button>
          </div>
        )}

        {/* Terminal controls — only when terminal active */}
        {activeType === 'terminal' && (
          <>
            <div className="tt-group">
              <button className="tt-btn" onClick={onCopy}>Copy</button>
              <button className="tt-btn" onClick={onPaste}>Paste</button>
              <button className="tt-btn" onClick={onClear}>Clear</button>
              <button className="tt-btn" onClick={onSearch}>Find</button>
            </div>

            <div className="tt-group tt-group-nav">
              <button className="tt-arrow" onClick={() => onArrow('left', selectMode)}>&#9664;</button>
              <button className="tt-arrow" onClick={() => onArrow('up', selectMode)}>&#9650;</button>
              <button className="tt-arrow" onClick={() => onArrow('down', selectMode)}>&#9660;</button>
              <button className="tt-arrow" onClick={() => onArrow('right', selectMode)}>&#9654;</button>
              <button
                className={`tt-mode-toggle ${selectMode ? 'active' : ''}`}
                onClick={() => setSelectMode((s) => !s)}
              >{selectMode ? 'SEL' : 'MOV'}</button>
            </div>

            <div className="tt-group">
              <button className="tt-btn tt-btn-sm" onClick={onScrollUp}>Pg&#9650;</button>
              <button className="tt-btn tt-btn-sm" onClick={onScrollDown}>Pg&#9660;</button>
            </div>
          </>
        )}

        <div className="tt-spacer" />

        {/* Tools — right-aligned */}
        <div className="tt-group">
          <button className="tt-btn tt-btn-icon" onClick={onSettings} title="Settings">&#9881;</button>
          <button className="tt-btn tt-btn-icon" onClick={onToggleDesktop} title="Desktop mode">&#128421;</button>
        </div>
      </div>
    </div>
  );
}
