import React from 'react';

interface TitleBarProps {
  sessionCount: number;
  activeSessionName: string;
  children?: React.ReactNode;
}

export default function TitleBar({ sessionCount, activeSessionName, children }: TitleBarProps) {
  return (
    <div className="titlebar">
      {children && (
        <div className="titlebar-actions">
          {children}
        </div>
      )}
      <div className="titlebar-drag" />
      <div className="titlebar-controls">
        <button
          className="titlebar-btn titlebar-btn-minimize"
          onClick={() => window.terminal.windowMinimize()}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn-maximize"
          onClick={() => window.terminal.windowMaximize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => window.terminal.windowClose()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
