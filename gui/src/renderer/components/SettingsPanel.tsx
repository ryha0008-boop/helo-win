import React, { useState } from 'react';
import { Settings, themes, defaultSettings } from '../../shared/settings';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>({ ...settings });

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...defaultSettings });
  };

  const themeNames = Object.keys(themes);

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-body">
          {/* Theme */}
          <div className="settings-section">
            <h3 className="settings-section-title">Theme</h3>
            <div className="settings-theme-grid">
              {themeNames.map((name) => {
                const t = themes[name];
                return (
                  <button
                    key={name}
                    className={`settings-theme-btn ${draft.theme === name ? 'active' : ''}`}
                    onClick={() => update('theme', name)}
                    style={{
                      background: t.terminal.background,
                      borderColor: draft.theme === name ? t.ui.accent : t.ui.border,
                    }}
                  >
                    <span className="settings-theme-colors">
                      <span style={{ background: t.terminal.red as string }} />
                      <span style={{ background: t.terminal.green as string }} />
                      <span style={{ background: t.terminal.blue as string }} />
                      <span style={{ background: t.terminal.yellow as string }} />
                      <span style={{ background: t.terminal.magenta as string }} />
                      <span style={{ background: t.terminal.cyan as string }} />
                    </span>
                    <span className="settings-theme-name" style={{ color: t.terminal.foreground as string }}>
                      {name.replace(/-/g, ' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font */}
          <div className="settings-section">
            <h3 className="settings-section-title">Font</h3>
            <div className="settings-row">
              <label className="settings-label">Family</label>
              <input
                className="settings-input"
                value={draft.fontFamily}
                onChange={(e) => update('fontFamily', e.target.value)}
              />
            </div>
            <div className="settings-row">
              <label className="settings-label">Size</label>
              <input
                className="settings-input settings-input-sm"
                type="number"
                min={8}
                max={32}
                value={draft.fontSize}
                onChange={(e) => update('fontSize', parseInt(e.target.value, 10) || 13)}
              />
            </div>
            <div className="settings-row">
              <label className="settings-label">Line height</label>
              <input
                className="settings-input settings-input-sm"
                type="number"
                min={1}
                max={2}
                step={0.05}
                value={draft.lineHeight}
                onChange={(e) => update('lineHeight', parseFloat(e.target.value) || 1.15)}
              />
            </div>
          </div>

          {/* Cursor */}
          <div className="settings-section">
            <h3 className="settings-section-title">Cursor</h3>
            <div className="settings-row">
              <label className="settings-label">Style</label>
              <select
                className="settings-select"
                value={draft.cursorStyle}
                onChange={(e) => update('cursorStyle', e.target.value as Settings['cursorStyle'])}
              >
                <option value="bar">Bar</option>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
              </select>
            </div>
            <div className="settings-row">
              <label className="settings-label">Blink</label>
              <button
                className={`settings-toggle ${draft.cursorBlink ? 'on' : ''}`}
                onClick={() => update('cursorBlink', !draft.cursorBlink)}
              >
                {draft.cursorBlink ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Terminal */}
          <div className="settings-section">
            <h3 className="settings-section-title">Terminal</h3>
            <div className="settings-row">
              <label className="settings-label">Scrollback</label>
              <input
                className="settings-input settings-input-sm"
                type="number"
                min={500}
                max={50000}
                step={500}
                value={draft.scrollback}
                onChange={(e) => update('scrollback', parseInt(e.target.value, 10) || 5000)}
              />
            </div>
            <div className="settings-row">
              <label className="settings-label">Opacity</label>
              <div className="settings-slider-row">
                <input
                  className="settings-slider"
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={draft.opacity}
                  onChange={(e) => update('opacity', parseFloat(e.target.value))}
                />
                <span className="settings-slider-value">{Math.round(draft.opacity * 100)}%</span>
              </div>
            </div>
            <div className="settings-row">
              <label className="settings-label">Default shell</label>
              <select
                className="settings-select"
                value={draft.defaultShell}
                onChange={(e) => update('defaultShell', e.target.value)}
              >
                {draft.shellProfiles.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-btn settings-btn-reset" onClick={handleReset}>
            Reset to defaults
          </button>
          <div className="settings-footer-right">
            <button className="settings-btn" onClick={onClose}>Cancel</button>
            <button className="settings-btn settings-btn-save" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
