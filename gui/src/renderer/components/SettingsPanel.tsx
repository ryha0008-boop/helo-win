import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, themes, defaultSettings } from '../../shared/settings';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[0.55rem] font-[var(--font-mono)] tracking-[0.2em] text-muted-foreground/60 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-2 last:mb-0">
      <label className="text-[0.6rem] font-[var(--font-mono)] text-muted-foreground w-20 shrink-0 tracking-wide">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const inputCls = 'w-full bg-surface-base text-on-surface text-xs px-2.5 py-1.5 border border-white/[0.06] outline-none focus:border-primary/30 transition-colors font-[var(--font-mono)]';
const selectCls = inputCls;
const btnPrimary = 'px-4 py-1.5 text-[0.6rem] font-[var(--font-mono)] tracking-[0.15em] font-bold text-primary bg-primary-dim hover:bg-primary-glow transition-colors cursor-pointer disabled:opacity-30';
const btnGhost = 'px-3 py-1.5 text-[0.6rem] font-[var(--font-mono)] tracking-[0.15em] text-muted-foreground hover:text-on-surface hover:bg-surface-high/40 transition-colors cursor-pointer';

export default function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>({ ...settings });

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => { onSave(draft); onClose(); };
  const handleReset = () => { setDraft({ ...defaultSettings }); };
  const themeNames = Object.keys(themes);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onMouseDown={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-[440px] max-h-[80vh] bg-surface-low/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl flex flex-col"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <div className="w-1 h-3 bg-primary shadow-[0_0_4px_var(--color-primary)]" />
              <span className="text-[0.6rem] font-[var(--font-headline)] tracking-[0.25em] text-primary font-bold">SETTINGS</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="text-muted-foreground hover:text-on-surface text-sm transition-colors cursor-pointer w-6 h-6 flex items-center justify-center"
              onClick={onClose}
            >
              ×
            </motion.button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {/* Theme */}
            <Section title="THEME">
              <div className="grid grid-cols-3 gap-2">
                {themeNames.map((name) => {
                  const t = themes[name];
                  const active = draft.theme === name;
                  return (
                    <motion.button
                      key={name}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`relative p-2.5 border transition-all cursor-pointer overflow-hidden ${
                        active
                          ? 'border-primary/40 bg-primary-dim'
                          : 'border-white/[0.06] hover:border-white/[0.1]'
                      }`}
                      style={{ background: active ? undefined : t.terminal.background as string }}
                      onClick={() => update('theme', name)}
                    >
                      <div className="flex gap-1 mb-2">
                        {[t.terminal.red, t.terminal.green, t.terminal.blue, t.terminal.yellow, t.terminal.magenta, t.terminal.cyan].map((c, i) => (
                          <div key={i} className="w-1.5 h-1.5" style={{ background: c as string }} />
                        ))}
                      </div>
                      <span className="text-[0.55rem] font-[var(--font-mono)] tracking-wide" style={{ color: t.terminal.foreground as string }}>
                        {name.replace(/-/g, ' ')}
                      </span>
                      {active && (
                        <div className="absolute top-1.5 right-1.5 w-1 h-1 bg-primary shadow-[0_0_4px_var(--color-primary)]" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </Section>

            {/* Font */}
            <Section title="FONT">
              <Row label="Family">
                <input className={inputCls} value={draft.fontFamily} onChange={(e) => update('fontFamily', e.target.value)} />
              </Row>
              <Row label="Size">
                <input className={`${inputCls} w-20`} type="number" min={8} max={32} value={draft.fontSize}
                  onChange={(e) => update('fontSize', parseInt(e.target.value, 10) || 13)} />
              </Row>
              <Row label="Line height">
                <input className={`${inputCls} w-20`} type="number" min={1} max={2} step={0.05} value={draft.lineHeight}
                  onChange={(e) => update('lineHeight', parseFloat(e.target.value) || 1.15)} />
              </Row>
            </Section>

            {/* Cursor */}
            <Section title="CURSOR">
              <Row label="Style">
                <select className={selectCls} value={draft.cursorStyle}
                  onChange={(e) => update('cursorStyle', e.target.value as Settings['cursorStyle'])}>
                  <option value="bar">Bar</option>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                </select>
              </Row>
              <Row label="Blink">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className={`px-3 py-1 text-[0.6rem] font-[var(--font-mono)] tracking-[0.15em] transition-colors cursor-pointer ${
                    draft.cursorBlink ? 'text-primary bg-primary-dim' : 'text-muted-foreground bg-surface-base hover:bg-surface-high/50'
                  }`}
                  onClick={() => update('cursorBlink', !draft.cursorBlink)}
                >
                  {draft.cursorBlink ? 'ON' : 'OFF'}
                </motion.button>
              </Row>
            </Section>

            {/* Terminal */}
            <Section title="TERMINAL">
              <Row label="Scrollback">
                <input className={`${inputCls} w-24`} type="number" min={500} max={50000} step={500} value={draft.scrollback}
                  onChange={(e) => update('scrollback', parseInt(e.target.value, 10) || 5000)} />
              </Row>
              <Row label="Opacity">
                <div className="flex items-center gap-3">
                  <input className="flex-1 accent-primary h-0.5" type="range" min={0.3} max={1} step={0.05}
                    value={draft.opacity} onChange={(e) => update('opacity', parseFloat(e.target.value))} />
                  <span className="text-[0.6rem] font-[var(--font-mono)] text-muted-foreground w-8 text-right">{Math.round(draft.opacity * 100)}%</span>
                </div>
              </Row>
              <Row label="Shell">
                <select className={selectCls} value={draft.defaultShell}
                  onChange={(e) => update('defaultShell', e.target.value)}>
                  {draft.shellProfiles.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </Row>
            </Section>

            {/* Sidebar */}
            <Section title="SIDEBAR">
              <Row label="Position">
                <div className="flex gap-1">
                  {(['left', 'right', 'top', 'bottom'] as const).map(pos => (
                    <motion.button
                      key={pos}
                      whileTap={{ scale: 0.95 }}
                      className={`px-2 py-1 text-[0.5rem] font-[var(--font-mono)] tracking-[0.15em] transition-colors cursor-pointer ${
                        draft.sidebarPosition === pos
                          ? 'text-primary bg-primary-dim'
                          : 'text-muted-foreground/60 bg-surface-base hover:bg-surface-high/50 hover:text-muted-foreground'
                      }`}
                      onClick={() => update('sidebarPosition', pos)}
                    >
                      {pos.toUpperCase()}
                    </motion.button>
                  ))}
                </div>
              </Row>
            </Section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.04]">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className={btnGhost}
              onClick={handleReset}
            >
              RESET
            </motion.button>
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.97 }} className={btnGhost} onClick={onClose}>Cancel</motion.button>
              <motion.button
                whileHover={{ boxShadow: '0 0 12px var(--color-primary-glow)' }}
                whileTap={{ scale: 0.97 }}
                className={btnPrimary}
                onClick={handleSave}
              >
                SAVE
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
