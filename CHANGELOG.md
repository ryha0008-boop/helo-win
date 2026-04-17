# Changelog

All notable changes to helo are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- `helo sessions [name]` — list conversation sessions for a blueprint in the current project (session ID, modified date UTC, size); `h` key in interactive mode

### Fixed
- `config.toml` blueprints missing `provider`/`model` (created by older versions) no longer cause a parse error — fields default to empty string

## [0.1.5] — 2026-04-16

### Added
- GitHub Actions release workflow — tag push triggers CI, builds all four platform binaries and attaches them to the release automatically
- Linux (`helo-x86_64-linux`) and macOS (`helo-aarch64-macos`, `helo-x86_64-macos`) binaries in releases
- README: Linux/macOS install instructions with per-platform binary table

### Fixed
- `helo update` hardcoded `.exe` asset search — now selects the correct binary for the current platform; falls back to `.exe` search for older releases
- `config.rs`: template name detection replaced manual `/` `\` checks with `Path::components()` — platform-correct on all OSes
- `project.rs`: doc comment had Windows-style backslash path separator

## [0.1.4] — 2026-04-16

### Added
- `README.md` — install instructions (with step-by-step PATH setup for Windows), concepts, quick start, full command reference
- `helo edit <name>` — edit blueprint fields (runtime/provider/model/api-key/claude-md) without recreating it; no-flag invocation shows current config
- `helo init` — guided first-time setup wizard (install runtimes, set API keys, create first blueprint)
- `helo runtime install/uninstall/list` — install and manage AI runtimes from within helo
- `helo clean [name] [--global]` — remove instance env dirs or global runtime config
- `helo completion <shell>` — shell completions (bash/zsh/fish/powershell)
- `helo keys set/list/remove` — global per-provider API keys, auto-applied on `helo add`
- `helo key <name> <key>` — update API key for an existing blueprint
- `helo defaults set/show <runtime>` — save a settings.json as the default for new Claude envs
- `helo templates list/show/init` — built-in CLAUDE.md templates (coding, assistant, devops)
- `helo list --json` / `helo status --json` — machine-readable output for GUI/scripting
- `helo update` — self-update: fetches latest release from GitHub, downloads binary, replaces in-place; updates all copies found in PATH
- z.ai provider (`--provider zai`): generates `env` block in settings.json so Claude Code picks up the API routing without extra env setup
- `--claude-md <path|name>` on `helo add` and `helo edit` — seed a CLAUDE.md persona into the env dir on first run; built-in template names accepted
- Interactive mode (`helo` with no args) — menu-driven loop with version shown in header every redraw
- GUI: Electron terminal (xterm.js + node-pty) with blueprint panel, Kinetic Console design system (dark/orange, zero border-radius), Framer Motion animations, Tailwind CSS v4 + shadcn/ui
- GUI: up to 4 panes simultaneously, session grouping, sidebar (left/right/top/bottom, collapsible, resizable), shell picker, settings panel
- Cross-platform: Linux and macOS support for pi runtime launcher
- Comprehensive test suite (40 tests covering config, settings generation, env dir logic, ZAI, CLAUDE.md seeding)

### Fixed
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` written as integer `1` instead of string `"1"` in ZAI settings.json — Claude Code silently ignored it
- Model name not JSON-escaped in `build_default_settings` — a model name containing `\` or `"` produced corrupt settings.json
- Windows: `sh` not found when Git for Windows `usr\bin` is absent from PATH — helo now auto-detects and injects it before spawning Claude Code
- ZAI blueprints inheriting system `ANTHROPIC_API_KEY` — now cleared before launch to prevent Claude Code's "detected custom API key" prompt
- `pi` runtime api_key not injected for opencode and pi runtimes
- Stop hook scoped to `src/` and `gui/src/` only (was triggering on any file change)
- `.claude/settings.json` removed from version control (contained API key)

---

## [0.1.3] — 2025

### Added
- Global defaults for new Claude envs (`helo defaults set claude <file>`) — new envs copy the file instead of using the built-in template
- Two-hook CLAUDE.md enforcement pattern: Stop hook sets `.git/claude-md-stale` flag; UserPromptSubmit hook injects `additionalContext` on the next turn
- `--claude-md` flag on `helo add` — path to CLAUDE.md template seeded into env dir on first run
- Interactive mode (initial version): `helo` with no args enters a menu loop
- Built-in CLAUDE.md templates: `coding`, `assistant`, `devops`
- z.ai provider support: sets `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and model-tier env vars
- `helo key <name> <key>` and interactive `k` action to set/update a blueprint's API key
- Global API keys (`helo keys set/list/remove`): stored in `config.toml [keys]`, auto-applied on `helo add`
- ZAI settings.json env block generation via `build_zai_settings()`
- GUI: Electron terminal with blueprint panel (initial version)
- GUI: Kinetic Console redesign — Tailwind CSS v4, shadcn/ui, Framer Motion
- GUI: pane layout (up to 4 panes), session grouping, sidebar, shell picker
- Linux support: cross-platform pi runtime launcher (`sh -c` on Linux/macOS, `cmd /c` on Windows)
- Comprehensive test suite

### Fixed
- Stop hook made language-agnostic (no longer checks file extension)
- Hook changed from `systemMessage` to `additionalContext` injection (actually acted on by Claude)
- `pi` and `opencode` stored api_key not injected at launch

---

## [0.1.2] — 2025

### Added
- Stop hook in `settings.json`: compares most-recent commit timestamp vs CLAUDE.md last-commit timestamp; sets `.git/claude-md-stale` flag when behind

---

## [0.1.1] — 2025

### Fixed
- `settings.json` not created on first run in some cases
- `defaultMode` must be nested under `permissions` — root-level key silently ignored by Claude Code

---

## [0.1.0] — 2025

Initial release.

### Added
- `helo add/list/remove/run/status` — core blueprint and instance management
- `CLAUDE_CONFIG_DIR` isolation for Claude Code; `PI_CODING_AGENT_DIR` for pi; `OPENCODE_CONFIG` for opencode
- `--resume [id]` flag on `helo run`
- Windows pi launch via `cmd /c` to resolve `.cmd` shim
- `helo clean <runtime>` — removes global agent config dir
- `settings.json` seeded on first `helo run` for Claude with model, permissions, and hooks
