# GUI

helo includes a Windows-only Electron GUI — a terminal emulator with an integrated blueprint panel.

## Features

- **Terminal emulator** — xterm.js + node-pty, based on sidebar-terminal v2
- **Blueprint panel** — list, add, remove, and launch blueprints directly from the GUI
- **Multi-pane layout** — up to 4 simultaneous terminal panes
- **Shell picker** — right-click the `+` button to choose a shell
- **Session management** — auto-grouping, sidebar tabs, pane resize

## Architecture

- `gui/src/main/helo-bridge.ts` — shells out to `helo` CLI via `execFile`. IPC handlers: `helo:list`, `helo:add`, `helo:remove`, `helo:status`, `helo:defaults-show`.
- `gui/src/renderer/components/BlueprintPanel.tsx` — modal UI for managing blueprints.
- `gui/src/renderer/App.tsx` — main app with PTY session management and pane layout.

## Launch flow

1. User picks a blueprint + project directory in the blueprint panel
2. App.tsx creates a new PTY session
3. Pending init command stashed in `pendingInitCommands` ref
4. Global `pty:ready` listener writes `cd <dir> && helo run <name>\n` when the PTY is ready

## Pane layout

| Panes | Layout |
|-------|--------|
| 1 | Full screen |
| 2 | Side by side |
| 3 | Left tall + right split vertically |
| 4 | 2x2 grid |

Panes are resizable — drag the divider between them.

## Session auto-grouping

- 5th terminal auto-groups terminals 1–4 into "Group 1"
- Pattern repeats every 4 terminals
- Click group header to expand/collapse
- Right-click to rename or delete
- Double-click to show all group sessions in panes

## Development

```bash
cd gui
npm install
npm run dev      # vite + electron with hot reload
```

## Build

```bash
cd gui
npm run build    # tsc main + vite renderer -> dist/
npm run app      # run packaged dist/ (NODE_ENV=production)
```

`helo` must be on PATH for the bridge to work.
