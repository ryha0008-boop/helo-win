import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }, [x, y]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 z-50"
        onMouseDown={onClose}
      >
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          className="fixed z-50 min-w-[160px] bg-surface-base/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl py-1"
          style={{ left: x, top: y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="h-px bg-white/[0.04] my-1 mx-2" />
            ) : (
              <motion.button
                key={i}
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                className={`w-full text-left px-3 py-1.5 text-[0.65rem] font-[var(--font-mono)] tracking-wider transition-colors cursor-pointer ${
                  item.danger
                    ? 'text-danger/80 hover:text-danger hover:bg-danger/5'
                    : item.disabled
                      ? 'text-muted-foreground/30 cursor-default'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/50'
                }`}
                disabled={item.disabled}
                onClick={() => {
                  (item.onClick || item.action)?.();
                  onClose();
                }}
              >
                {item.label}
              </motion.button>
            )
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
