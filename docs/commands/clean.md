# clean

Remove a runtime's global config directory (clean reinstall).

## Usage

```bash
helo clean <runtime> [--yes]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `runtime` | `claude`, `pi`, or `opencode` |
| `--yes` / `-y` | Skip confirmation prompt |

## What it deletes

The runtime's **global** config directory (not helo's config):

| Runtime | Path |
|---------|------|
| claude | `~/.claude/` |
| pi | `~/.pi/` |
| opencode | `~/.opencode/` |

This does **not** affect helo's managed env dirs (`.claude-env-<name>/`). Those are per-project.

## Examples

```bash
# With confirmation
helo clean claude

# Skip prompt
helo clean claude --yes
```
