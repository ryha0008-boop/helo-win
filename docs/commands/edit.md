# edit

Update fields in an existing blueprint without recreating it.

## Usage

```bash
helo edit <name> [--runtime <r>] [--provider <p>] [--model <m>] [--api-key <key>] [--claude-md <path>]
```

Calling `helo edit <name>` with no flags prints the current config for that blueprint.

## Arguments

| Argument | Description |
|----------|-------------|
| `name` | Blueprint name to edit |
| `--runtime` | New runtime (`claude`, `pi`, `opencode`) |
| `--provider` | New provider |
| `--model` | New model ID |
| `--api-key` | New API key. Pass `""` to clear. |
| `--claude-md` | New CLAUDE.md template path or built-in name. Pass `""` to clear. |

## Examples

```bash
# Show current config
helo edit myagent

# Change model
helo edit myagent --model claude-opus-4-6

# Change provider and model
helo edit myagent --provider zai --model glm-5.1

# Update API key
helo edit myagent --api-key sk-new-xxx

# Clear stored API key (revert to global key or env var)
helo edit myagent --api-key ""

# Set CLAUDE.md template
helo edit myagent --claude-md coding
```

## Notes

Only the specified fields are updated — unspecified fields are unchanged. Changes take effect on the next `helo run`.

This command edits **blueprints** (global templates). To edit a running **instance** (change provider, model, hooks, or API key for an existing env dir), use interactive mode (`e` key). Instance editing regenerates `settings.json` to reflect the changes.
