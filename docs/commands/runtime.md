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
| `claude` | native installer (PowerShell on Windows, curl on Linux/macOS) |
| `pi` | `npm install -g @anthropic-ai/pi` |
| `opencode` | `go install github.com/opencode-ai/opencode@latest` |

## Requirements

- Claude uses the official native installer — no prerequisites
- `npm` in PATH for pi
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
