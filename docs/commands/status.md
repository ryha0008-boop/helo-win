# status

Show config location and API key presence.

## Usage

```bash
helo status [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON (for scripting/automation) |

## Output

**Human-readable:**
```
Config: /home/user/.config/helo/config.toml
Blueprints: 3

API keys:
  Anthropic          set (env)
  OpenRouter         not set
  OpenAI             not set
  Groq               not set
  DeepSeek           not set
  Z.AI               set (global)
  Gemini             not set
  Mistral            not set
```

**JSON:**
```json
{
  "config_path": "/home/user/.config/helo/config.toml",
  "blueprints": 3,
  "api_keys": {
    "Anthropic": true,
    "OpenRouter": false,
    "Z.AI": true
  }
}
```
