# Project Plan — Sidebar Terminal v2 → v1.0

Ship a polished terminal emulator. All bugs fixed, architecture clean, ready for distribution.

**Stack:** Electron 35 + React 19 + TypeScript + xterm.js 5 + node-pty
**Shell:** Git Bash (`C:/Program Files/Git/bin/bash.exe --login -i`)
**Target:** v1.0 release — all bugs resolved, features are post-v1.0

---

## Progress: 0%

Clean slate. v1 source copied to v2 as baseline. One fix applied: `isDev` check respects `NODE_ENV=production` so tests can run against the built app.

---

## Task 01 — Baseline & Test Infrastructure

**Status:** In progress
**Complexity:** Low

Verify the app builds, runs, and existing E2E tests pass against the v1 baseline.

### Steps
1. Fix `isDev` check so Playwright tests work against built app ✅
2. Run existing `sidebar.spec.ts` — establish pass/fail baseline
3. Record results in ISSUES.md

---

## Task 02 — Bug Fixes (Fix → Test loop)

**Status:** Pending
**Complexity:** Low-Medium
**Depends on:** Task 01

Fix bugs one at a time. Each fix gets verified with a build + test run before moving to the next.

### Priority order
1. #14 — Paste extra newlines (normalize \r\n→\r)
2. #13 — Paste clipping (chunk large pastes)
3. #9 — Scroll-to-bottom broken
4. #10 — Ctrl+L not clearing terminal
5. #11 — Input freeze after clear
6. #1 — file:// URL handling
7. #19 — Child pane overlaps parent
8. #8 — Bottom line clipped by status bar
9. #6 — Sidebar colors in collapsed view
10. #2 — Group drag & drop reorder
11. #3 — Ungrouped items below group

---

## Task 03 — Flatten Session Hierarchy

**Status:** Pending
**Complexity:** High
**Depends on:** Task 02
**Eliminates:** #12, #15, #16

Replace parent/child split model with standalone sessions + PaneLayout. Not started until all simpler bugs are fixed and tested.

### Data model
```
PaneLayout {
  id: string
  sessionIds: [string, string]
  direction: 'horizontal' | 'vertical'
}
```

### Files
- `src/renderer/App.tsx` — state, handlers, rendering, persistence
- `src/renderer/components/Sidebar.tsx` — remove child rendering
- `src/renderer/styles.css` — remove session-child CSS

---

## Task 04 — UX Polish

**Status:** Pending
**Complexity:** Medium
**Depends on:** Task 03

- #5 — Toolbar icons redesign
- #7 — Scroll buttons to toolbar + long-press

---

## Post-v1.0

Tracked in ISSUES.md only: #4, #17, #18, #20, #22, #23

---

## Dev Workflow

```bash
cd v2
npm run dev           # Vite + Electron with hot reload
npm run daemon        # PTY daemon (sessions survive app restarts)
npm test              # E2E tests headless
npm run test:headed   # E2E tests visible
npm run test:slow     # E2E tests with on-screen labels
```
