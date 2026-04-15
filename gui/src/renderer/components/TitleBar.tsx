import React from 'react';
import { motion } from 'framer-motion';

interface TitleBarProps {
  sessionCount: number;
  activeSessionName: string;
  onToggleSettings?: () => void;
}

export default function TitleBar({ sessionCount, activeSessionName, onToggleSettings }: TitleBarProps) {
  return (
    <div
      className="relative flex h-9 items-center bg-surface-low/80 backdrop-blur-sm select-none shrink-0 border-b border-white/[0.03]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Subtle top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="flex items-center gap-3 px-4 flex-1 min-w-0">
        <motion.div
          className="flex items-center gap-1.5"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <div className="w-1.5 h-1.5 bg-primary shadow-[0_0_6px_var(--color-primary)]" />
          <span className="text-primary text-[0.65rem] font-bold tracking-[0.3em] font-[var(--font-headline)]">
            HELO
          </span>
        </motion.div>
        {activeSessionName && (
          <>
            <span className="text-surface-highest/40 text-[0.5rem]">|</span>
            <span className="text-muted-foreground text-[0.6rem] font-[var(--font-mono)] tracking-wide truncate">
              {activeSessionName}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-0.5 px-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-primary hover:bg-surface-high/50 transition-colors cursor-pointer"
          onClick={onToggleSettings}
          title="Settings"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </motion.button>
      </div>

      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {[
          { action: () => window.terminal.windowMinimize(), content: (
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
          )},
          { action: () => window.terminal.windowMaximize(), content: (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          )},
          { action: () => window.terminal.windowClose(), className: 'hover:bg-danger/90 hover:text-white', content: (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )},
        ].map((btn, i) => (
          <motion.button
            key={i}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`flex items-center justify-center w-[38px] h-full text-muted-foreground hover:bg-surface-high/50 transition-colors cursor-pointer ${btn.className || ''}`}
            onClick={btn.action}
          >
            {btn.content}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
