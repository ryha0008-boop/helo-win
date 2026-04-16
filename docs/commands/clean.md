# clean

Remove instance env dirs from the current project, or a runtime's global config directory.

## Usage

```bash
helo clean [name] [--global <runtime>] [--yes]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `name` | Instance name to remove. Omit to remove all instances in the current directory. |
| `--global <runtime>` | Remove the runtime's global config dir (`~/.claude`, `~/.pi`, `~/.opencode`) instead of project instances. |
| `--yes` / `-y` | Skip confirmation prompt. |

## Project-level clean (default)

Removes `.claude-env-<name>/`, `.pi-env-<name>/`, or `.opencode-env-<name>/` directories from the current project. Does not touch helo's config (`config.toml`) or blueprints.

```bash
# Remove all instances in current project (prompts for confirmation)
helo clean

# Remove a specific instance
helo clean myagent

# Skip prompt
helo clean myagent --yes
```

## Global clean

Removes a runtime's global config directory. This deletes all sessions, memory, and global config for that runtime — use with care.

```bash
# Remove ~/.claude (prompts: must type 'yes')
helo clean --global claude

# Remove ~/.pi
helo clean --global pi
```

| Runtime | Path deleted |
|---------|-------------|
| claude | `~/.claude/` |
| pi | `~/.pi/` |
| opencode | `~/.opencode/` |

Global clean requires typing `yes` (not just `y`) to confirm. The `--yes` flag does not bypass this for global operations.
