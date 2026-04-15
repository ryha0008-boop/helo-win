# run

Place a blueprint into a project directory and launch the agent. Creates the isolated env dir on first use; reuses it on subsequent runs.

## Usage

```bash
helo run [name] [--resume [id]] [-p <prompt>] [-- extra args]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `name` | Blueprint name to run. Omit if only one instance exists in the current directory. |
| `--resume` / `-r` | Resume a session. No ID = continue most recent. With ID = resume specific session. |
| `--prompt` / `-p` | Send a prompt to the runtime. Runs once and exits (Claude's `-p` mode). |
| `-- extra args` | Everything after `--` is passed directly to the runtime binary. |

## What happens

1. Looks up the blueprint by name
2. If the env dir (`.claude-env-<name>/`, `.pi-env-<name>/`, etc.) doesn't exist yet:
   - Creates it
   - Writes `.helo.toml` (instance metadata)
   - Seeds `settings.json` (Claude runtime)
   - Seeds `CLAUDE.md` if a template was configured
3. Launches the runtime binary with the env dir for isolation
4. Exits with the runtime's exit code

## Examples

```bash
# Run a blueprint in current directory
helo run myagent

# Resume most recent session
helo run myagent --resume

# Resume specific session
helo run myagent --resume abc123-session-id

# Send a prompt (runs once and exits)
helo run myagent -p "fix the bug in main.rs"

# Combine prompt with resume
helo run myagent --resume -p "continue fixing the tests"

# Headless with output format
helo run myagent -p "explain this code" -- --output-format json

# Full passthrough for advanced use
helo run myagent -- -p "your prompt" --output-format json

# Run without specifying name (auto-detects if only one instance)
helo run
```

## Errors

- `no blueprint named 'name'` — run `helo list` to see available blueprints
- `no instances in current directory` — specify a blueprint name or `helo run <name>`
- `Multiple instances` — specify which one: `helo run <name>`
