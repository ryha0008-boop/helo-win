# Sidebar Terminal — V1.0.0 Release Documentation

**Release Date:** 2026-04-06
**Platform:** Windows x64
**Stack:** Electron 35 + React 19 + TypeScript + xterm.js 5 + node-pty

---

## How to Run

### Packaged App (end user)
```
dist/win-unpacked/Sidebar Terminal.exe
```
Double-click. No install, no terminal, no dependencies needed. Self-contained portable app.

### Portable Distribution
```
dist/SidebarTerminal-v1.0.0-win-x64.zip
```
Unzip anywhere and run `Sidebar Terminal.exe`.

### Dev Mode (for development)
```bash
npm run daemon    # Terminal 1 — PTY daemon (sessions survive app restarts)
npm run dev       # Terminal 2 — Vite + Electron (hot reload)
```

### Testing
```bash
npm test              # E2E tests, headless (~2 min)
npm run test:headed   # E2E tests, visible window
npm run test:slow     # E2E tests, slow with on-screen labels
```

---

## Feature List

### Core Terminal
- xterm.js terminal with WebGL rendering (canvas fallback)
- Git Bash and PowerShell support via node-pty
- Bidirectional PTY I/O with auto-resize (addon-fit)
- Font ligature support (addon-ligatures)
- Clickable hyperlinks in terminal output (addon-web-links)
- Search terminal output with All/Line scope toggle (addon-search)
- F3/Shift+F3 search navigation, go-to-match cursor placement
- Right-click context menu: Copy, Paste, Clear, Search
- Dead terminal overlay with Restart button on process exit

### Session Management
- Sidebar-based session list (chat-app style)
- Create terminal (+ button or Ctrl+T) and browser sessions
- Switch sessions by click or Ctrl+1-9
- Close sessions (X button or Ctrl+W), last session protected
- Inline rename via double-click, Enter to save, Escape to cancel
- Drag-and-drop session reordering
- Duplicate session via context menu

### Sidebar Intelligence
- Shell type icons: `>_` (bash), `PS` (PowerShell), globe (browser)
- Session uptime display (5s, 2m, 1h, 3d), updates every 30 seconds
- Unread activity indicator — pulsing dot on background tabs with new output
- Current working directory (CWD) shown as subtitle, detected from MINGW64 prompt + OSC 7
- Running process indicator — green pulsing dot while command executes
- Last command shown in status bar
- Exit code badges — green checkmark (0) or red code (non-zero), clears on restart

### Session Organization
- **Pin to top** — right-click → Pin, pinned sessions sort first with pin icon
- **Color tags** — 8 preset colors, applied as colored left border, toggle on/off
- **Session groups** — named collapsible groups, create/rename/delete via context menu
- **Search filter** — appears with 4+ sessions, case-insensitive name filtering
- All organization state persists in localStorage across restarts
- Stale references auto-cleaned when session IDs change

### Split Panes
- Vertical split (Ctrl+Shift+D) and horizontal split (Ctrl+Shift+E)
- Split with terminal or browser pane
- Draggable split divider (15%-85% range) with accent glow on hover
- Split children shown as indented tree items in sidebar with full metadata
- Close split via sidebar child X button or title bar button
- No double-split on same session
- Splits persist across soft restarts (daemon reattach)

### Browser Integration
- Embedded Chromium browser tabs alongside terminal tabs
- Multi-tab browser sessions with tab bar
- URL bar with auto-detect: URLs get https://, text becomes Google search
- Back/Forward/Reload/Stop navigation
- Persistent login sessions (partition:persist)
- Open in system browser button (http/https only)
- target="_blank" links open in new browser tab
- Protocol blocking: will-navigate prevents file://, javascript:// etc.

### Window & Layout
- Frameless window with custom title bar and drag region
- Minimize, maximize, close window controls
- Resizable sidebar (180-500px drag handle)
- Collapsible sidebar (40px icon-only mode)
- Sidebar position toggle (left/right)
- All sidebar state persisted to localStorage
- Status bar: session count, active shell, last command
- Scroll buttons with hold-to-accelerate
- Window snap support (thickFrame: true)
- Window opacity slider (30%-100%)

### Settings & Themes
- 4 themes: Neon (default), Tokyo Night, Catppuccin, Dracula
- Theme switcher with color preview swatches
- Font: family, size (8-32), line height (1-2)
- Cursor: style (bar/block/underline), blink toggle
- Terminal: scrollback (500-50000), opacity
- Default shell selector
- Reset to defaults
- Settings persist across restarts, live-apply to all terminals

### Tablet Mode
- Toggle via title bar button (desktop) or toolbar button (tablet)
- 2x zoom via Electron webFrame
- Light high-contrast theme (Apple-inspired)
- All desktop features accessible via single-row tablet toolbar:
  - Sidebar toggle, +Term, +Web, Close tab
  - Split vertical/horizontal, Close split
  - Copy, Paste, Clear, Find
  - D-pad arrows with MOV/SEL toggle
  - Page scroll buttons
  - Settings, Desktop mode switch
- Terminal-only controls auto-hide when browser session is active
- Title bar action groups hidden (no duplicates)

### Premium UI
- Glass-morphism: backdrop-filter blur on title bar, sidebar, status bar, menus, panels
- CSS variable design system: all colors via variables, color-mix() for derived values
- Smooth animations: fadeIn, slideDown, scaleIn on panels and menus
- Consistent design tokens: radius, transitions, hover/active states
- Split divider with wider invisible drag handle and accent glow
- Themed scrollbar

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| Ctrl+T | New terminal |
| Ctrl+W | Close tab |
| Ctrl+1-9 | Switch tab by index |
| Ctrl+Shift+D | Split vertical |
| Ctrl+Shift+E | Split horizontal |
| Ctrl+L | Clear terminal |
| Ctrl+=/- | Zoom in/out |
| Ctrl+0 | Reset zoom |
| Ctrl+Shift+F | Search in terminal |
| F3 / Shift+F3 | Next/prev search match |
| Ctrl+C | Copy (with selection) / SIGINT |
| Ctrl+V | Paste |
| Ctrl+Shift+Up/Down | Scroll terminal |
| Shift+Arrow | Select character |
| Ctrl+Shift+Arrow | Select word |
| Shift+Home/End | Select to line start/end |
| Escape | Close search |

### PTY Daemon (dev mode only)
- Background daemon process manages PTY processes
- Sessions survive app close ("Keep Running" dialog)
- Output buffered (100KB per session) and replayed on reconnect
- Close confirmation: Keep Running / Close All / Cancel
- Daemon auto-spawns if not running
- EADDRINUSE retry with max 3 attempts
- Stale session files ignored on fresh daemon start

---

## Architecture

```
src/
  main/           Electron main process
    index.ts        Window creation, IPC handlers
    preload.ts      Context bridge (contextIsolation: true)
    pty-daemon.ts   Background PTY daemon
    pty-client.ts   Daemon client connection
    pty-manager.ts  Direct PTY management (packaged mode)
    shell-detect.ts Shell detection (Git Bash, PowerShell)
  renderer/       React UI
    App.tsx         Root component, session/split state, keyboard shortcuts
    theme.ts        Terminal themes (neon, tablet light)
    styles.css      Full CSS with glass-morphism design system
    components/
      Sidebar.tsx          Session list, groups, pin, color, search, tree view
      TerminalView.tsx     xterm.js wrapper, PTY bridge, metadata extraction
      BrowserView.tsx      Embedded Chromium, tabs, URL bar
      TabletToolbar.tsx    Touch-friendly toolbar with all controls
      TitleBar.tsx         Frameless window chrome
      SettingsPanel.tsx    Settings modal
      ShortcutsTooltip.tsx Keyboard shortcuts hover panel
      ContextMenu.tsx      Reusable right-click menu
  shared/
    settings.ts     Settings schema, theme definitions, defaults
  test/
    setup.ts        Test mocks (removed — now E2E only)
```

---

## Test Coverage

155 Playwright E2E tests covering:
- Session lifecycle (create, switch, close, rename, duplicate)
- Shell icons, uptime, unread indicators
- Pin to top, color tags, session groups, search filter
- Split panes (vertical, horizontal, browser, tree view, close)
- Terminal intelligence (CWD, last command, status bar)
- Terminal search bar and context menu
- Dead terminal overlay and restart
- Settings panel (all controls, theme change, persistence)
- Tablet mode (all toolbar buttons functional)
- Browser sessions (URL, tabs, navigation)
- Sidebar collapse/expand, position toggle
- Shortcuts tooltip, scroll buttons, drag-and-drop
- localStorage persistence

---

## Known Limitations
- NSIS installer fails without Windows Developer Mode (symlink permission for code signing tools). Use portable exe instead.
- Keyboard shortcuts (Ctrl+T, Ctrl+W etc.) don't work in Playwright E2E tests due to xterm.js capturing keyboard events. Tested via button clicks instead.
- CWD detection relies on MINGW64 prompt pattern — may not work with custom prompts.
- Running process detection is heuristic-based (prompt pattern matching), not 100% reliable.
- Tablet mode always uses light theme regardless of selected theme.
- Child processes in terminal sessions don't survive soft restarts (shell does, running commands don't).
