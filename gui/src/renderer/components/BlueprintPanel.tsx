import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface Blueprint {
  name: string;
  runtime: string;
  provider: string;
  model: string;
  claude_md: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onLaunch: (blueprint: Blueprint, cwd: string) => void;
}

const RUNTIMES = ['claude', 'pi', 'opencode'];
const PROVIDERS = ['anthropic', 'openrouter', 'openai', 'groq', 'deepseek', 'zai', 'gemini', 'mistral'];

const inputCls = 'w-full bg-surface-base text-on-surface text-xs px-2.5 py-1.5 border border-white/[0.06] outline-none focus:border-primary/30 transition-colors font-[var(--font-mono)]';
const btnPrimary = 'px-3 py-1.5 text-[0.6rem] font-[var(--font-mono)] tracking-[0.15em] font-bold text-primary bg-primary-dim hover:bg-primary-glow transition-colors cursor-pointer disabled:opacity-30';
const btnGhost = 'px-2.5 py-1 text-[0.6rem] font-[var(--font-mono)] tracking-[0.12em] text-muted-foreground hover:text-on-surface hover:bg-surface-high/40 transition-colors cursor-pointer';
const btnDanger = 'px-2.5 py-1 text-[0.6rem] font-[var(--font-mono)] tracking-[0.12em] text-danger/70 hover:text-danger hover:bg-danger/5 transition-colors cursor-pointer';

export default function BlueprintPanel({ open, onClose, onLaunch }: Props) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [launching, setLaunching] = useState<Blueprint | null>(null);
  const [cwdInput, setCwdInput] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setBlueprints(await window.helo.list()); }
    catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const handleRemove = useCallback(async (name: string) => {
    if (!confirm(`Remove blueprint '${name}'?`)) return;
    try { await window.helo.remove(name); await refresh(); }
    catch (e: any) { setError(e?.message || String(e)); }
  }, [refresh]);

  const handlePickCwd = useCallback(async () => {
    const path = await window.helo.pickDirectory();
    if (path) setCwdInput(path);
  }, []);

  const confirmLaunch = useCallback(() => {
    if (!launching || !cwdInput.trim()) return;
    onLaunch(launching, cwdInput.trim());
    setLaunching(null); setCwdInput(''); onClose();
  }, [launching, cwdInput, onLaunch, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-[520px] max-h-[80vh] bg-surface-low/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <div className="w-1 h-3 bg-primary shadow-[0_0_4px_var(--color-primary)]" />
              <h2 className="text-[0.6rem] font-[var(--font-headline)] tracking-[0.25em] text-primary font-bold">BLUEPRINTS</h2>
            </div>
            <div className="flex items-center gap-1">
              <motion.button whileTap={{ scale: 0.95 }} className={btnGhost}
                onClick={() => setShowAdd((v) => !v)}>
                {showAdd ? 'Cancel' : '+ Add'}
              </motion.button>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                className="text-muted-foreground hover:text-on-surface hover:bg-surface-high/40 transition-colors cursor-pointer w-7 h-7 flex items-center justify-center"
                onClick={onClose} title="Close">×</motion.button>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-5 py-2 text-[0.6rem] font-[var(--font-mono)] text-danger bg-danger/5 border-b border-danger/10"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showAdd && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              >
                <AddBlueprintForm onDone={async () => { setShowAdd(false); await refresh(); }} onError={setError} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-[0.6rem] font-[var(--font-mono)] tracking-[0.2em] text-muted-foreground"
                >
                  LOADING
                </motion.div>
              </div>
            )}

            {!loading && blueprints.length === 0 && !showAdd && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-6 h-6 border border-white/[0.06] flex items-center justify-center text-muted-foreground/30 text-xs">+</div>
                <div className="text-[0.6rem] font-[var(--font-mono)] tracking-[0.15em] text-muted-foreground/50">
                  No blueprints yet
                </div>
              </div>
            )}

            {blueprints.map((b, i) => (
              <motion.div
                key={b.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', damping: 20 }}
                className="flex items-center justify-between px-5 py-3 hover:bg-surface-base/60 transition-colors group/bp"
              >
                <div>
                  <div className="text-xs font-[var(--font-mono)] tracking-wide text-on-surface font-medium">{b.name}</div>
                  <div className="text-[0.55rem] font-[var(--font-mono)] text-muted-foreground/50 mt-0.5 flex items-center gap-1.5">
                    <span>{b.runtime} · {b.provider} · {b.model}</span>
                    {b.claude_md && (
                      <span className="px-1 py-0.5 text-primary bg-primary-dim text-[0.45rem] tracking-[0.15em]">CLAUDE.MD</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover/bp:opacity-100 transition-opacity">
                  <motion.button whileTap={{ scale: 0.95 }}
                    className={btnPrimary}
                    onClick={() => setLaunching(b)}>Launch</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }}
                    className={btnDanger}
                    onClick={() => handleRemove(b.name)}>Remove</motion.button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Launch dialog */}
          <AnimatePresence>
            {launching && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="border-t border-white/[0.04] px-5 py-4 space-y-3"
              >
                <div className="text-xs font-[var(--font-mono)] tracking-wide text-on-surface-variant">
                  Launch <span className="text-primary font-bold">{launching.name}</span> in…
                </div>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    placeholder="Project directory path"
                    value={cwdInput}
                    onChange={(e) => setCwdInput(e.target.value)}
                    autoFocus
                  />
                  <motion.button whileTap={{ scale: 0.95 }} className={btnGhost} onClick={handlePickCwd}>Browse…</motion.button>
                </div>
                <div className="flex justify-end gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} className={btnGhost}
                    onClick={() => { setLaunching(null); setCwdInput(''); }}>Cancel</motion.button>
                  <motion.button
                    whileHover={{ boxShadow: '0 0 12px var(--color-primary-glow)' }}
                    whileTap={{ scale: 0.95 }}
                    className={btnPrimary}
                    onClick={confirmLaunch}
                    disabled={!cwdInput.trim()}
                  >
                    Launch
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AddBlueprintForm({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState('claude');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('sonnet');
  const [claudeMd, setClaudeMd] = useState('');
  const [busy, setBusy] = useState(false);

  const pickClaudeMd = async () => {
    const path = await window.helo.pickFile([{ name: 'Markdown', extensions: ['md'] }]);
    if (path) setClaudeMd(path);
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await window.helo.add({ name: name.trim(), runtime, provider, model: model.trim(), claudeMd: claudeMd.trim() || undefined });
      onDone();
    } catch (e: any) { onError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="px-5 py-4 border-b border-white/[0.04] space-y-2.5 bg-surface-base/30">
      <input className={inputCls} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="flex gap-2">
        <select className={inputCls} value={runtime} onChange={(e) => setRuntime(e.target.value)}>
          {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className={inputCls} placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <input className={inputCls} placeholder="CLAUDE.md path (optional)" value={claudeMd} onChange={(e) => setClaudeMd(e.target.value)} />
        <motion.button whileTap={{ scale: 0.95 }} className={btnGhost} onClick={pickClaudeMd} type="button">Browse…</motion.button>
      </div>
      <div className="flex justify-end">
        <motion.button
          whileHover={{ boxShadow: '0 0 12px var(--color-primary-glow)' }}
          whileTap={{ scale: 0.95 }}
          className={btnPrimary}
          onClick={submit}
          disabled={busy || !name.trim()}
        >
          {busy ? 'Adding…' : 'Add Blueprint'}
        </motion.button>
      </div>
    </div>
  );
}
