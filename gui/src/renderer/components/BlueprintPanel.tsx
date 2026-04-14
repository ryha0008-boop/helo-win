import React, { useCallback, useEffect, useState } from 'react';

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

export default function BlueprintPanel({ open, onClose, onLaunch }: Props) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [launching, setLaunching] = useState<Blueprint | null>(null);
  const [cwdInput, setCwdInput] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.helo.list();
      setBlueprints(list);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleRemove = useCallback(async (name: string) => {
    if (!confirm(`Remove blueprint '${name}'?`)) return;
    try {
      await window.helo.remove(name);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [refresh]);

  const handlePickCwd = useCallback(async () => {
    const path = await window.helo.pickDirectory();
    if (path) setCwdInput(path);
  }, []);

  const confirmLaunch = useCallback(() => {
    if (!launching || !cwdInput.trim()) return;
    onLaunch(launching, cwdInput.trim());
    setLaunching(null);
    setCwdInput('');
    onClose();
  }, [launching, cwdInput, onLaunch, onClose]);

  if (!open) return null;

  return (
    <div className="bp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bp-panel">
        <div className="bp-header">
          <h2>Blueprints</h2>
          <div className="bp-header-actions">
            <button className="bp-btn" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? 'Cancel' : '+ Add'}
            </button>
            <button className="bp-btn bp-btn-icon" onClick={onClose} title="Close">×</button>
          </div>
        </div>

        {error && <div className="bp-error">{error}</div>}

        {showAdd && <AddBlueprintForm onDone={async () => { setShowAdd(false); await refresh(); }} onError={setError} />}

        {loading && <div className="bp-empty">Loading…</div>}

        {!loading && blueprints.length === 0 && !showAdd && (
          <div className="bp-empty">No blueprints yet. Click + Add.</div>
        )}

        <div className="bp-list">
          {blueprints.map((b) => (
            <div key={b.name} className="bp-row">
              <div className="bp-row-main">
                <div className="bp-row-name">{b.name}</div>
                <div className="bp-row-meta">
                  {b.runtime} · {b.provider} · {b.model}
                  {b.claude_md && <span className="bp-md-badge" title={b.claude_md}>CLAUDE.md</span>}
                </div>
              </div>
              <div className="bp-row-actions">
                <button className="bp-btn bp-btn-primary" onClick={() => setLaunching(b)}>Launch</button>
                <button className="bp-btn bp-btn-danger" onClick={() => handleRemove(b.name)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        {launching && (
          <div className="bp-launch-dialog">
            <div className="bp-launch-title">Launch <b>{launching.name}</b> in…</div>
            <div className="bp-launch-row">
              <input
                className="bp-input"
                placeholder="Project directory path"
                value={cwdInput}
                onChange={(e) => setCwdInput(e.target.value)}
                autoFocus
              />
              <button className="bp-btn" onClick={handlePickCwd}>Browse…</button>
            </div>
            <div className="bp-launch-actions">
              <button className="bp-btn" onClick={() => { setLaunching(null); setCwdInput(''); }}>Cancel</button>
              <button className="bp-btn bp-btn-primary" onClick={confirmLaunch} disabled={!cwdInput.trim()}>Launch</button>
            </div>
          </div>
        )}
      </div>
    </div>
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
      await window.helo.add({
        name: name.trim(),
        runtime,
        provider,
        model: model.trim(),
        claudeMd: claudeMd.trim() || undefined,
      });
      onDone();
    } catch (e: any) {
      onError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bp-add">
      <input className="bp-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="bp-add-row">
        <select className="bp-input" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
          {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="bp-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="bp-input" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <div className="bp-add-row">
        <input className="bp-input" placeholder="CLAUDE.md path (optional)" value={claudeMd} onChange={(e) => setClaudeMd(e.target.value)} />
        <button className="bp-btn" onClick={pickClaudeMd} type="button">Browse…</button>
      </div>
      <div className="bp-add-actions">
        <button className="bp-btn bp-btn-primary" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add Blueprint'}
        </button>
      </div>
    </div>
  );
}
