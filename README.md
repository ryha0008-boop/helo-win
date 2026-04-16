# helo

> Isolated AI agent environments — like Python venvs, but for AI runtimes.

<!-- demo GIF goes here -->

Run multiple Claude, pi, or opencode agents — each with their own config, API key, memory, and persona — without them stepping on each other or your global setup.

---

## Why

Every AI runtime dumps its config into a single global directory. Run two agents on the same machine and they share settings, conversation history, and API keys. helo fixes this by giving each agent its own isolated environment, scoped to the project you're working on.

---

## Install

**1. Download** `helo.exe` from the [releases page](https://github.com/ryha0008-boop/helo-win/releases/latest).

**2. Put it on your PATH** — PATH is the list of folders Windows searches when you type a command. Pick one of these options:

<details>
<summary>Option A — create a personal bin folder (recommended)</summary>

Open PowerShell and run:

```powershell
# Create the folder
New-Item -ItemType Directory -Force "$HOME\bin"

# Move helo.exe there
Move-Item "$HOME\Downloads\helo.exe" "$HOME\bin\helo.exe"

# Add the folder to your PATH permanently
$path = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($path -notlike "*$HOME\bin*") {
    [Environment]::SetEnvironmentVariable("PATH", "$HOME\bin;$path", "User")
}
```

Close and reopen your terminal for the PATH change to take effect.
</details>

<details>
<summary>Option B — place it in an existing folder</summary>

If you already have a folder on your PATH (e.g. `C:\Windows\System32`, though that's not recommended), you can copy `helo.exe` there directly. To see your current PATH folders:

```powershell
$env:PATH -split ";"
```
</details>

**3. Run first-time setup:**

```
helo init
```

This walks you through installing runtimes, setting API keys, and creating your first blueprint.

---

## Concepts

**Blueprint** — a reusable AI agent identity. Has a name, runtime, provider, model, and optional API key. Stored globally in helo's config.

**Instance** — a blueprint placed into a project directory. Gets its own isolated config folder (`.claude-env-<name>/`, `.pi-env-<name>/`, etc.) with its own `settings.json`, memory, and CLAUDE.md persona.

---

## Quick start

```
# Create a blueprint
helo add myagent --runtime claude --provider anthropic --model claude-sonnet-4-5

# Run it in your project directory
cd my-project
helo run myagent

# Run with a one-shot prompt
helo run myagent -p "explain this codebase"

# Resume the last conversation
helo run myagent --resume
```

Or just type `helo` for interactive mode.

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
helo status
helo key <name> <key>                   # set API key on a blueprint
helo keys set <provider> <key>          # global key (auto-applied on add)
helo keys list
helo keys remove <provider>
helo defaults set <runtime> <file>      # default settings.json for new envs
helo templates list                     # built-in CLAUDE.md personas
helo templates show <name>
helo runtime install <runtime>
helo runtime list
helo clean [name] [--global]
helo completion <shell>                 # bash/zsh/fish/powershell
helo update                             # self-update from GitHub releases
```

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
helo add reviewer --runtime claude --provider anthropic --model claude-sonnet-4-5 --claude-md coding
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
