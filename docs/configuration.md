# Configuration

## Config file

helo stores all blueprints and global keys in a single TOML file.

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\helo\config\config.toml` |
| Linux | `~/.config/helo/config.toml` |
| macOS | `~/Library/Application Support/helo/config.toml` |

Override with `HELO_CONFIG_DIR` env var:

```bash
export HELO_CONFIG_DIR=/custom/path
# Config file: /custom/path/config.toml
```

## Structure

```toml
[[blueprints]]
name = "dev-agent"
runtime = "claude"
provider = "anthropic"
model = "sonnet"
api_key = "sk-ant-xxx"
claude_md = "coding"

[[blueprints]]
name = "zai-agent"
runtime = "claude"
provider = "zai"
model = "glm-5.1"
api_key = "zai-key-xxx"

[keys]
anthropic = "sk-ant-xxx"
zai = "zai-key-xxx"
```

## Related files

| File | Purpose |
|------|---------|
| `config.toml` | Blueprints + global keys |
| `defaults/claude.json` | User-defined default settings for new Claude envs |
| `templates/*.md` | Built-in CLAUDE.md templates |

## Editing

Use the CLI commands (`helo add`, `helo remove`, `helo key`, `helo keys set`) to modify the config. Or edit `config.toml` directly — helo reads it fresh on every command.
