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
helo --version                                # show version
helo init                                     # first-time setup wizard
helo add <name> --runtime claude --provider anthropic --model sonnet [--claude-md <path>]
helo list [--json]                            # list blueprints
helo run [name] [--resume [id]] [-p <prompt>] [-- extra args]
helo remove <name>
helo edit <name> [--runtime <r>] [--provider <p>] [--model <m>] [--api-key <key>] [--claude-md <path>]
helo clean [name] [--global] [--yes]          # remove instance env dirs (or global dirs with --global)
helo status [--json]
helo key <name> <key>                         # set/update api_key for an existing blueprint
helo keys list                                # list global API keys
helo keys set <provider> <key>                # set global key (auto-applied on add)
helo keys remove <provider>                   # remove global key
helo defaults set <runtime> <settings.json>   # save as global default for new envs
helo defaults show <runtime>                  # show current default
helo templates list                           # list built-in CLAUDE.md templates
helo templates show <name>                    # print template content
helo templates init                           # write templates to config dir
helo completion <shell>                       # generate shell completions (bash/zsh/fish/powershell)
helo runtime install <runtime>                # install a runtime (claude/pi/opencode)
helo runtime uninstall <runtime>              # uninstall a runtime
helo runtime list                             # show installed runtimes and versions
helo update                                   # self-update
```

`--claude-md <path>` — path to a CLAUDE.md template. On first `helo run`, the file is copied into the env dir (which is `CLAUDE_CONFIG_DIR` for Claude). Claude reads this as its global instructions, giving the agent its role/persona. The path is stored in the blueprint; the file is only read at placement time.

## Non-interactive / headless use

Send a prompt with `-p` — runs once and exits:

```
helo run myagent -p "fix the bug in main.rs"
```

Or pass extra args after `--` — they go directly to the runtime binary:

```
helo run myagent -- -p "your prompt" --output-format json
helo run myagent --resume -- -p "continue fixing"
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

## Windows notes

**Git Bash / sh on PATH:** hooks in `settings.json` use POSIX shell syntax. helo auto-detects Git for Windows at `C:\Program Files\Git\usr\bin` and injects it into PATH before spawning Claude Code. If Git is installed elsewhere and sh is not found, install Git for Windows or add its `usr\bin` to PATH.

**ANTHROPIC_API_KEY env var:** if set in your Windows environment, ZAI blueprints clear it before launch (they use `ANTHROPIC_AUTH_TOKEN` instead). Without this, Claude Code prompts "detected custom API key". Non-ZAI blueprints that have a stored key override it via `ANTHROPIC_API_KEY`; non-ZAI blueprints with no stored key inherit it (intentional — lets you rely on system key).

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

## Runtime management

Install/uninstall AI runtimes from within helo:

```
helo runtime install claude     # npm install -g @anthropic-ai/claude-code
helo runtime install pi         # npm install -g @anthropic-ai/pi
helo runtime install opencode   # go install github.com/opencode-ai/opencode
helo runtime uninstall claude
helo runtime list               # show installed runtimes and versions
```

Requires `npm` (for claude/pi) or `go` (for opencode) on PATH.

## Clean

Remove instance env dirs from a project, or global runtime config:

```
helo clean              # remove all instance env dirs in current project
helo clean myagent      # remove specific instance
helo clean --global claude  # remove ~/.claude (requires typing 'yes')
```

`--global` requires explicit `yes` confirmation — protects accidental global wipe.

## Shell completions

```
helo completion bash       # bash
helo completion zsh        # zsh
helo completion fish       # fish
helo completion powershell # PowerShell
```

## Self-update

```
helo update    # updates via cargo install --path .
```

Requires `cargo` on PATH. Otherwise prints download URL.

On Windows, after a successful install, auto-copies the new binary to `C:\Users\H\bin\helo.exe` if that file already exists (PATH shadow fix).

## Interactive mode

`helo` with no arguments enters interactive mode — a menu-driven loop covering all functionality.

```
helo       # interactive
helo run   # CLI as before
```

Menu shows current blueprints by number. Type number to run, letter for actions:

| Key | Action |
|-----|--------|
| 1–N | Run blueprint N (prompts: project dir, resume?, prompt?, extra args) |
| a | Add blueprint (guided prompts for all fields) |
| e | Edit blueprint (change runtime/provider/model/key) |
| k | Set/update API key for a blueprint |
| g | Global keys (set/remove/list) |
| d | Delete blueprint (pick by number, confirm) |
| s | Status (config path + API key presence) |
| t | Templates submenu (`show <name>`, `init`) |
| c | Clean instance env dirs or global runtime config |
| x | Defaults submenu (`show <runtime>`, `set <runtime> <path>`) |
| q | Quit |

After a runtime subprocess exits, helo returns to the menu.

**Interactive run prompts:** project dir, resume?, prompt (blank=interactive), extra args. Supports double-quoted strings.

## First-time setup (helo init)

Guided 3-step wizard for new users:

1. **Install runtimes** — detects installed runtimes (claude/pi/opencode), offers to install missing ones via npm/go
2. **API keys** — prompt for provider keys (anthropic, zai, openrouter, openai), stored in config
3. **Create first blueprint** — name, runtime, provider, model. Auto-fills API key from global keys.

```
helo init     # run the setup wizard
```

Interactive mode auto-detects first run (no blueprints) and suggests `helo init`.

## Build & install

```
cargo build --release    # writes to target/ — safe while helo is running
cargo install --path .   # replaces ~/.cargo/bin/helo.exe — helo must not be running
```

## GUI (Electron terminal + blueprint panel)

`gui/` is an Electron terminal (xterm.js + node-pty) with a helo-aware blueprint panel. Uses the **Kinetic Console** design system — dark obsidian backgrounds, orange (#ff8c00) primary, zero border-radius, CRT scanline texture.

**UI stack:**
- Tailwind CSS v4 (`@tailwindcss/vite` plugin, no config file — all in `styles.css`)
- shadcn/ui (base-nova style) — component primitives in `gui/src/components/ui/`
- Framer Motion — modal animations, sidebar collapse, context menu springs, hover/tap micro-interactions
- All components use Tailwind utilities exclusively (no vanilla CSS classes)

**Design tokens** — defined in `gui/src/renderer/styles.css` `@theme` block:
- Surface tonal stack: `--color-surface` (#0e0c14) through `--color-surface-bright` (#3d374a)
- Primary: `--color-primary` (#ff8c00) with dim/glow/faint variants
- Fonts: Space Grotesk (headlines), Inter (body), JetBrains Mono (monospace/code)
- `--radius: 0px` globally (zero border-radius throughout)

**Architecture:**
- `gui/src/main/helo-bridge.ts` shells out to `helo` CLI via `execFile`. IPC handlers: `helo:list`, `helo:add`, `helo:remove`, `helo:status`, `helo:defaults-show`.
- `gui/src/renderer/components/BlueprintPanel.tsx` — modal UI for list/add/remove/launch blueprints.
- **Launch flow:** user picks blueprint + project dir → App.tsx creates new PTY session → pending init command stashed in `pendingInitCommands` ref → global `pty:ready` listener writes `cd <dir> && helo run <name>\n` when the PTY is ready.
- `gui/src/shared/settings.ts` — theme definitions + settings types. Default theme: `kinetic`.

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

**Components:**
- `TitleBar.tsx` — drag region, HELO branding with glow dot, settings gear (SVG), window controls
- `Sidebar.tsx` — vertical/horizontal modes, position prop (left/right/top/bottom), collapsible with Framer Motion `AnimatePresence`, resize handle, context menus for rename/close, active group indicator with `layoutId` animation
- `ContextMenu.tsx` — glassmorphism backdrop, spring scale animation, hover slide effect
- `SettingsPanel.tsx` — modal overlay with `AnimatePresence`, theme grid with color swatches, font/cursor/terminal/sidebar sections
- `BlueprintPanel.tsx` — modal overlay, staggered list animation, launch dialog with browse, add form with animated expand/collapse
- `TerminalView.tsx` — xterm.js wrapper, animated search bar (AnimatePresence), exit/error overlays with spring animations, context menu

**Shell picker:**
- Left-click `+` in titlebar → new terminal with default shell
- Right-click `+` → context menu: pick shell or set default
- Default shell persisted in settings.json (Electron userData)

**Pane layout (up to 4 simultaneously):**
- Sessions organized into groups (max 4 per group)
- Grid: 1=full, 2=vertical stack, 3=top + bottom-split, 4=2×2
- All terminals always mounted — hidden ones use `position: absolute; opacity: 0; pointer-events: none`
- Panes resizable via drag handles with hover-reveal indicator lines

**Session grouping:**
- Groups created automatically (max 4 sessions per group)
- Click group in sidebar to activate — shows its sessions in the pane grid
- Right-click group/session for rename/close context menu
- Double-click session name to inline rename

**Sidebar:**
- Configurable position: left/right/top/bottom (in Settings)
- Resizable (drag edge handle), collapsible
- Vertical mode: brand header, group list with active glow indicator, session sub-items with dot indicators, NEW SESSION button
- Horizontal mode: compact tab bar with group tabs and session chips

`helo` must be on PATH for the bridge to work.
