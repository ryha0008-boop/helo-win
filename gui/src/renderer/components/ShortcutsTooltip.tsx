import React, { useState } from 'react';

const shortcuts = [
  { keys: 'Ctrl+T', action: 'New terminal' },
  { keys: 'Ctrl+W', action: 'Close tab' },
  { keys: 'Ctrl+1-9', action: 'Switch tab by index' },
  { keys: 'Ctrl+Shift+D', action: 'Split vertical' },
  { keys: 'Ctrl+Shift+E', action: 'Split horizontal' },
  { keys: 'Ctrl+L', action: 'Clear terminal' },
  { keys: 'Ctrl+=/-', action: 'Zoom in/out' },
  { keys: 'Ctrl+0', action: 'Reset zoom' },
  { keys: 'Ctrl+Shift+F', action: 'Search in terminal' },
  { keys: 'F3 / Shift+F3', action: 'Next / prev search match' },
  { keys: 'Ctrl+Shift+C', action: 'Copy selection' },
  { keys: 'Ctrl+C', action: 'Copy (with selection) / SIGINT' },
  { keys: 'Ctrl+V', action: 'Paste' },
  { keys: 'Ctrl+Shift+↑/↓', action: 'Scroll terminal' },
  { keys: 'Shift+←/→', action: 'Select char by char' },
  { keys: 'Ctrl+Shift+←/→', action: 'Select word by word' },
  { keys: 'Shift+Home/End', action: 'Select to line start/end' },
  { keys: 'Escape', action: 'Close search' },
];

export default function ShortcutsTooltip() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="shortcuts-container">
      {visible && (
        <div className="shortcuts-panel">
          <div className="shortcuts-title">Keyboard Shortcuts</div>
          {shortcuts.map((s) => (
            <div key={s.keys} className="shortcuts-row">
              <span className="shortcuts-keys">{s.keys}</span>
              <span className="shortcuts-action">{s.action}</span>
            </div>
          ))}
        </div>
      )}
      <button
        className="shortcuts-trigger"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
        title="Keyboard shortcuts"
      >
        ?
      </button>
    </div>
  );
}
