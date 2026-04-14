# helo-win

Isolated AI agent environments — like Python venvs but for AI runtimes (Claude, pi, opencode).

## Architecture

**Blueprints** — global AI identities stored in helo's config (`config.toml` via `directories::ProjectDirs`). Fields: `name`, `runtime`, `provider`, `model`.

**Instances** — a blueprint placed into a project directory. Stored as `.helo.toml` inside the env dir (e.g. `.claude-env-<name>/`).

**Env dirs** — per-project, per-runtime directories gitignored by convention. Named `.claude-env-<name>`, `.pi-env-<name>`, `.opencode-env-<name>`.

## Runtime isolation

| Runtime | Env var set | Notes |
|---------|-------------|-------|
| claude | `CLAUDE_CONFIG_DIR` | settings.json seeded on first run |
| pi | `PI_CODING_AGENT_DIR` | launched via `cmd /c` (Windows .cmd wrapper) |
| opencode | `OPENCODE_CONFIG` | — |

## Claude settings.json

On first `helo run`, a `settings.json` is written to the env dir with:
```json
{
  "model": "<from blueprint>",
  "skipDangerousModePermissionPrompt": true,
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

**Key gotcha:** `defaultMode` must be nested under `permissions` — root-level `defaultMode` is silently ignored by Claude Code.

## Commands

```
helo add <name> --runtime claude --provider anthropic --model sonnet
helo list
helo run [name] [--resume [id]] [-- extra args]
helo remove <name>
helo clean <runtime>
helo status
```

## Hooks

`.claude/settings.json` contains a project-level Stop hook that warns when code commits are newer than `CLAUDE.md`:
- Compares `git log` timestamps of `src/` + `Cargo.toml` vs `CLAUDE.md`
- Outputs a `systemMessage` if CLAUDE.md is behind
- New Claude envs created by `helo run` get the same hook seeded into their `settings.json`

## Build & install

```
cargo build --release    # requires helo.exe not in use
cargo install --path .   # installs to ~/.cargo/bin, safe while running
```
