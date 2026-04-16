# runtime

Install, uninstall, and list AI runtimes.

## Subcommands

```bash
helo runtime install <runtime>    # install a runtime
helo runtime uninstall <runtime>  # uninstall a runtime
helo runtime list                 # show installed runtimes and versions
```

## Supported runtimes

| Runtime | Install command |
|---------|----------------|
| `claude` | `npm install -g @anthropic-ai/claude-code` |
| `pi` | `npm install -g @anthropic-ai/pi` |
| `opencode` | `go install github.com/opencode-ai/opencode@latest` |

## Requirements

- `npm` in PATH for claude and pi
- `go` in PATH for opencode

## Examples

```bash
# Check what's installed
helo runtime list

# Install Claude Code CLI
helo runtime install claude

# Install pi
helo runtime install pi

# Uninstall opencode
helo runtime uninstall opencode
```

## Output

```
RUNTIME     VERSION
------------------------
claude      1.2.3
pi          not installed
opencode    not installed
```
