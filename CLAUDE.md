# helo

Isolated AI agent environments — like Python venvs but for AI runtimes (Claude, pi, opencode). Cross-platform: Windows, Linux, macOS.

## Architecture

**Blueprints** — global AI identities stored in helo's config (`config.toml` via `directories::ProjectDirs`). Fields: `name`, `runtime`, `provider`, `model`.

**Instances** — a blueprint placed into a project directory. Stored as `.helo.toml` inside the env dir (e.g. `.claude-env-<name>/`).

**Env dirs** — per-project, per-runtime directories gitignored by convention. Named `.claude-env-<name>`, `.pi-env-<name>`, `.opencode-env-<name>`.

## Runtime isolation

| Runtime | Env var set | Notes |
|---------|-------------|-------|
| claude | `CLAUDE_CONFIG_DIR` | settings.json seeded on first run |
| pi | `PI_CODING_AGENT_DIR` | Windows: `cmd /c`; Linux/macOS: `sh -c` |
| opencode | `OPENCODE_CONFIG` | — |

## Claude settings.json

On first `helo run`, a `settings.json` is written to the env dir.

**Non-ZAI providers** — uses user defaults (`helo defaults set claude <file>`) if set, otherwise built-in template:
```json
{
  "model": "<from blueprint>",
  "skipDangerousModePermissionPrompt": true,
  "permissions": { "defaultMode": "bypassPermissions" },
  "hooks": { ... }
}
```

**ZAI provider** — always uses the built-in template (ignores user defaults). Generates an `env` block that Claude Code reads at startup:
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<api_key from blueprint>",
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "<model>",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "<model>",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "<model>"
  },
  "skipDangerousModePermissionPrompt": true,
  "permissions": { "defaultMode": "bypassPermissions" },
  "hooks": { ... },
  "effortLevel": "high"
}
```

**Key gotcha:** `defaultMode` must be nested under `permissions` — root-level `defaultMode` is silently ignored by Claude Code.

## Commands

```
helo                                          # interactive mode (no args)
helo add <name> --runtime claude --provider anthropic --model sonnet [--claude-md <path>]
helo list
helo run [name] [--resume [id]] [-- extra args]
helo remove <name>
helo clean <runtime>
helo status
helo defaults set <runtime> <settings.json>   # save as global default for new envs
helo defaults show <runtime>                  # show current default
helo key <name> <key>                         # set/update api_key for an existing blueprint
helo keys list                                # list global API keys
helo keys set <provider> <key>                # set global key (auto-applied on add)
helo keys remove <provider>                   # remove global key
helo templates list                           # list built-in CLAUDE.md templates
helo templates show <name>                    # print template content
helo templates init                           # write templates to config dir
```

`--claude-md <path>` — path to a CLAUDE.md template. On first `helo run`, the file is copied into the env dir (which is `CLAUDE_CONFIG_DIR` for Claude). Claude reads this as its global instructions, giving the agent its role/persona. The path is stored in the blueprint; the file is only read at placement time.

## Non-interactive / headless use

Pass extra args after `--` — they go directly to the runtime binary:

```
helo run mazas-bahuras -- -p "your prompt"
helo run mazas-bahuras -- -p "your prompt" --output-format json
```

Claude's `-p` / `--print` flag runs a single prompt and exits. All helo isolation (CLAUDE_CONFIG_DIR, settings, memory) still applies. Useful for orchestration by another AI or automation scripts.

## Global API keys

Store a key once per provider — auto-applied when `helo add` creates a blueprint (no `--api-key` needed):

```
helo keys set zai <key>
helo keys set anthropic <key>
helo keys list
helo keys remove zai
```

Interactive mode: press `g` to manage global keys.

**Priority:** `--api-key` flag > global key > env var (`ZAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)

Keys are stored in `[keys]` section of `config.toml`.

## Default settings

New Claude envs copy `<helo_config>/defaults/claude.json` if it exists, otherwise use the built-in template. Set your defaults once with:

```
helo defaults set claude <path/to/settings.json>
```

Default locations (via `directories` crate):
- Windows: `%APPDATA%\helo\config\defaults\claude.json`
- Linux: `~/.config/helo/defaults/claude.json`
- macOS: `~/Library/Application Support/helo/defaults/claude.json`

**Config override:** set `HELO_CONFIG_DIR` env var to redirect all config reads/writes (used by integration tests).

## Hooks

Two-hook pattern enforces CLAUDE.md updates after code commits.

**Stop hook** — runs at end of every turn. Compares most-recent commit timestamp vs CLAUDE.md last-commit timestamp. If CLAUDE.md is behind, writes `.git/claude-md-stale` flag file.

**UserPromptSubmit hook** — runs at start of next turn. If flag file exists, deletes it and injects `additionalContext` into Claude's context: `"CLAUDE.md is behind code commits — update it before doing anything else this turn."` This makes Claude act on it (unlike a `systemMessage` which is user-facing only).

Both hooks live in `.claude/settings.json` (project-level) and are seeded into new Claude env `settings.json` by `save_instance`. Stop doesn't support `hookSpecificOutput.additionalContext` — hence the two-hook pattern.

## z.ai provider

`helo add <name> --runtime claude --provider zai --model glm-5.1 --api-key <key>`

On `helo run`:
- `launch()` sets `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_DEFAULT_*_MODEL` as process env vars (fallback for the env block in settings.json)
- `save_instance()` writes the same vars into `settings.json` `"env"` block via `build_zai_settings()` — this is the primary mechanism Claude Code uses
- ZAI blueprints always use the built-in settings template, ignoring user defaults (`helo defaults set claude`)

Blueprint `zai-agent` exists with model `glm-5.1`. Stored global key: `helo keys set zai <key>`.

**Key type:** z.ai subscription/plan keys work the same as API keys here — just pass as `--api-key` or set globally with `helo keys set zai <key>`. The env var `ZAI_API_KEY` is the fallback if no key is stored.

## Updating a blueprint's API key

```
helo key <name> <key>   # store or replace the api_key in an existing blueprint
```

Interactive mode: press `k`, pick blueprint by number, enter new key.

**Priority:** blueprint key > global key (`helo keys`) > env var (`ZAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) for all runtimes.

## Built-in CLAUDE.md templates

Shipped with the binary, written to `<config_dir>/templates/` on first use.

```
helo templates list                 # show available templates
helo templates show <name>          # print template content
helo add <name> ... --claude-md coding     # use built-in template by name
helo add <name> ... --claude-md /path/to/file  # or absolute path as before
```

Templates: `coding` (coding agent), `assistant` (general), `devops` (sysadmin).

## Interactive mode

`helo` with no arguments enters interactive mode — a menu-driven loop covering all functionality.

```
helo       # interactive
helo run   # CLI as before
```

Menu shows current blueprints by number. Type number to run, letter for actions:

| Key | Action |
|-----|--------|
| 1–N | Run blueprint N (prompts: project dir, resume?, extra args) |
| a | Add blueprint (guided prompts for all fields) |
| k | Set/update API key for a blueprint |
| g | Global keys (set/remove/list) |
| d | Delete blueprint (pick by number, confirm) |
| s | Status (config path + API key presence) |
| t | Templates submenu (`show <name>`, `init`) |
| c | Clean runtime global dir |
| x | Defaults submenu (`show <runtime>`, `set <runtime> <path>`) |
| q | Quit |

After a runtime subprocess exits, helo returns to the menu.

**Extra args in interactive run:** supports double-quoted strings, e.g. `-p "my prompt"`.

## Build & install

```
cargo build --release    # writes to target/ — safe while helo is running
cargo install --path .   # replaces ~/.cargo/bin/helo.exe — helo must not be running
```

## GUI (Electron terminal + blueprint panel)

`gui/` is an Electron terminal (xterm.js + node-pty, based on `sidebar-terminal` v2) merged with a helo-aware blueprint panel.

**Architecture:**
- `gui/src/main/helo-bridge.ts` shells out to `helo` CLI via `execFile`. IPC handlers: `helo:list`, `helo:add`, `helo:remove`, `helo:status`, `helo:defaults-show`.
- `gui/src/renderer/components/BlueprintPanel.tsx` — modal UI for list/add/remove/launch blueprints.
- **Launch flow:** user picks blueprint + project dir → App.tsx creates new PTY session → pending init command stashed in `pendingInitCommands` ref → global `pty:ready` listener writes `cd <dir> && helo run <name>\n` when the PTY is ready.

**JSON CLI support (added for GUI consumption):**
- `helo list --json` — array of blueprints
- `helo status --json` — config path, blueprint count, API key flags

**Dev:**
```
cd gui
npm install
npm run dev      # vite + electron with hot reload
```

**Build:**
```
cd gui
npm run build    # tsc main + vite renderer → dist/
npm run app      # run packaged dist/ (NODE_ENV=production)
```

**Shell picker:**
- Left-click `+` in titlebar → new terminal with default shell
- Right-click `+` → context menu: pick shell or set default
- Default shell persisted in settings.json (Electron userData)

**Pane layout (up to 4 simultaneously):**
- Each session is a standalone sidebar tab — no parent/child hierarchy
- Clicking a session in sidebar replaces the currently active pane slot (adds to free slot if < 4)
- 1 pane=full, 2=side by side, 3=left tall+right split, 4=2×2 grid
- Panes are resizable: drag the divider between panes (col divider at ≥2 panes, row at ≥3)
- Each pane bar has session name + × to remove from grid (session stays in sidebar)

**Session auto-grouping:**
- When 5th terminal is opened, the first 4 auto-group into "Group 1" (collapsed) in the sidebar
- Pattern repeats: 9th terminal groups 5–8 into "Group 2", etc.
- Click group header to expand/collapse; right-click to rename or delete
- Double-click group header to show all group sessions in panes (up to 4)
- Right-click any session to manually move it to a group

`helo` must be on PATH for the bridge to work.
