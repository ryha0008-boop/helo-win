# helo

> Isolated AI agent environments — like Python venvs, but for AI runtimes.

<!-- demo GIF goes here -->

Run multiple Claude, pi, or opencode agents — each with their own config, API key, memory, and persona — without them stepping on each other or your global setup.

---

## Why

Every AI runtime dumps its config into a single global directory. Run two agents on the same machine and they share settings, conversation history, and API keys. helo fixes this by giving each agent its own isolated environment, scoped to the project you're working on.

---

## Install

Download the binary for your platform from the [releases page](https://github.com/ryha0008-boop/helo-win/releases/latest):

| Platform | File |
|----------|------|
| Windows x64 | `helo-x86_64-windows.exe` |
| Linux x64 | `helo-x86_64-linux` |
| macOS Apple Silicon | `helo-aarch64-macos` |
| macOS Intel | `helo-x86_64-macos` |

Then follow the setup for your OS:

<details>
<summary>Windows</summary>

Open PowerShell and run:

```powershell
# Create a personal bin folder and add it to PATH (one-time setup)
New-Item -ItemType Directory -Force "$HOME\bin"
$path = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($path -notlike "*$HOME\bin*") {
    [Environment]::SetEnvironmentVariable("PATH", "$HOME\bin;$path", "User")
}

# Move the downloaded binary there
Move-Item "$HOME\Downloads\helo-x86_64-windows.exe" "$HOME\bin\helo.exe"
```

Close and reopen your terminal, then run `helo init`.
</details>

<details>
<summary>Linux</summary>

```bash
# One-liner install (requires curl)
curl -fsSL https://raw.githubusercontent.com/ryha0008-boop/helo-win/master/install.sh | bash
```

Or manually:

```bash
mv helo-x86_64-linux ~/.local/bin/helo
chmod +x ~/.local/bin/helo
```

Then run `helo init`.
</details>

<details>
<summary>macOS</summary>

```bash
mv helo-aarch64-macos ~/.local/bin/helo    # Apple Silicon
mv helo-x86_64-macos ~/.local/bin/helo     # Intel
chmod +x ~/.local/bin/helo
```

Then run `helo init`.
</details>

**First-time setup:**

```
helo init
```

This walks you through installing runtimes, setting API keys, and creating your first blueprint.

---

## Concepts

**Blueprint** — a reusable AI agent identity. Has a name, runtime, provider, model, and optional API key. Stored globally in helo's config. Set-and-forget — create variations as needed.

**Instance** — a blueprint placed into a project directory. Gets its own isolated config folder (`.claude-env-<name>/`, `.pi-env-<name>/`, etc.) with its own `settings.json`, memory, and CLAUDE.md persona. Editable after creation — change provider, model, API key, or toggle hooks without recreating.

---

## Quick start

```
# Create a blueprint
helo add myagent --runtime claude --provider anthropic --model sonnet

# Run it in your project directory
cd my-project
helo run myagent

# Run with a one-shot prompt
helo run myagent -p "explain this codebase"

# Resume the last conversation
helo run myagent --resume
```

Or just type `helo` for interactive mode:

```
── helo v0.1.8 ──────────────────────────────────

  1  dev-agent  (claude / anthropic / sonnet [coding])
  2  zai-agent  (claude / zai / glm-5.1)

  a  add blueprint     d  delete blueprint
  e  edit instance     h  sessions (history)
  k  keys              s  status
  c  clean runtime     t  templates
  q  quit
```

---

## Supported runtimes

| Runtime | Provider examples | Install |
|---------|------------------|---------|
| `claude` | anthropic, zai | `helo runtime install claude` |
| `pi` | openrouter, openai | `helo runtime install pi` |
| `opencode` | anthropic, openrouter | `helo runtime install opencode` |

---

## Commands

```
helo                                    # interactive mode
helo init                               # first-time setup wizard
helo add <name> --runtime <r> --provider <p> --model <m>
helo edit <name> [--runtime] [--provider] [--model] [--api-key] [--claude-md]
helo list                               # list blueprints
helo remove <name>
helo run [name] [--resume [id]] [-p <prompt>] [-- extra args]
helo status                             # config path + API key presence
helo key <name> <key>                   # set API key on a blueprint
helo keys set <provider> <key>          # global key (auto-applied on add)
helo keys list
helo keys remove <provider>
helo templates list                     # built-in CLAUDE.md personas
helo templates show <name>
helo sessions [name]                    # list conversation sessions
helo runtime install <runtime>
helo runtime list
helo clean [name] [--global]
helo update                             # self-update from GitHub releases
```

---

## Instance editing

Change provider, model, API key, or toggle hooks on existing instances without recreating them. Press `e` in interactive mode or edit via CLI:

```
helo edit myagent --model opus
helo edit myagent --provider zai --model glm-5.1
helo edit myagent --api-key ""
```

Settings.json is regenerated on the next `helo run` (or when saving in interactive mode).

---

## Hook toggling

Each instance has three hooks that can be toggled independently:

- **Stop** — auto-commits tracked files + detects doc staleness at end of each turn
- **UserPromptSubmit** — injects staleness reminders + sub-agent guidance at start of each turn
- **PostCompact** — saves compaction summaries to `contextdb/` after auto/manual compaction

All default to enabled. Toggle per-instance via interactive `e` → instance editor.

---

## API keys

Set once, used everywhere:

```
helo keys set anthropic sk-ant-...
helo keys set zai <key>
```

Keys are stored in helo's config and automatically applied when you `helo add` a blueprint. Override per-blueprint with `--api-key` or `helo key <name> <key>`.

**Priority:** `--api-key` flag > blueprint key > global key > env var (`ANTHROPIC_API_KEY`, `ZAI_API_KEY`, …)

---

## Agent personas (CLAUDE.md)

Give an agent a role by attaching a CLAUDE.md template:

```
helo add reviewer --runtime claude --provider anthropic --model sonnet --claude-md coding
```

Built-in templates: `coding`, `assistant`, `devops`. Or pass a path to your own file.

The file is copied into the agent's isolated config dir on first run — it becomes that agent's global instructions.

---

## z.ai

Use Claude via [z.ai](https://z.ai) (Anthropic-compatible proxy):

```
helo add myagent --runtime claude --provider zai --model glm-5.1 --api-key <key>
```

helo generates the full `env` block in `settings.json` so Claude Code picks up the API routing automatically — no manual env var setup needed.

---

## Updating

```
helo update
```

Checks GitHub for a newer release, downloads the binary, and replaces itself in-place. Also updates any other copies of `helo` found in your PATH.

---

## Build from source

Requires [Rust](https://rustup.rs).

```
git clone https://github.com/ryha0008-boop/helo-win
cd helo-win
cargo install --path .
```

---

## License

MIT
