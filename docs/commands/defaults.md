# defaults

Manage default settings files seeded into new environments.

## Subcommands

```bash
helo defaults set <runtime> <path>       # save a settings file as the default
helo defaults show <runtime>             # display current defaults
```

## How it works

When `helo run` creates a new Claude env, it checks for a user-defined default settings file. If one exists, it's used instead of the built-in template.

Default file locations:
- Windows: `%APPDATA%\helo\config\defaults\claude.json`
- Linux: `~/.config/helo/defaults/claude.json`
- macOS: `~/Library/Application Support/helo/defaults/claude.json`

**Note:** ZAI provider blueprints always use the built-in template and ignore user defaults.

## Examples

```bash
# Save your preferred Claude settings as the default
helo defaults set claude ./my-settings.json

# View current defaults
helo defaults show claude
```
