# add

Create a new blueprint — a named AI identity with runtime, provider, model, and optional API key.

## Usage

```bash
helo add <name> --runtime <runtime> --provider <provider> --model <model> [options]
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Unique name for this blueprint |
| `--runtime` | Yes | `claude`, `pi`, or `opencode` |
| `--provider` | Yes | `anthropic`, `zai`, `openrouter`, `openai`, `groq`, `deepseek`, `mistral`, `gemini`, or custom |
| `--model` | Yes | Model ID (e.g. `sonnet`, `glm-5.1`, `openai/gpt-4o`) |
| `--api-key` | No | API key stored in blueprint. Omit to use global key or env var. |
| `--claude-md` | No | Path to CLAUDE.md template (or built-in name: `coding`, `assistant`, `devops`). Claude runtime only. |

## API key priority

1. `--api-key` flag (highest)
2. Global key (`helo keys set <provider> <key>`)
3. Environment variable (e.g. `ANTHROPIC_API_KEY`, `ZAI_API_KEY`)

## Examples

```bash
# Basic Claude + Anthropic
helo add dev-agent --runtime claude --provider anthropic --model sonnet

# With API key
helo add dev-agent --runtime claude --provider anthropic --model sonnet --api-key sk-xxx

# ZAI provider
helo add zai-agent --runtime claude --provider zai --model glm-5.1 --api-key zai-key

# With CLAUDE.md template
helo add coder --runtime claude --provider anthropic --model sonnet --claude-md coding

# Custom CLAUDE.md file
helo add coder --runtime claude --provider anthropic --model sonnet --claude-md /path/to/instructions.md

# pi runtime + OpenRouter
helo add helper --runtime pi --provider openrouter --model openai/gpt-4o
```

## Errors

- `blueprint 'name' already exists` — remove it first with `helo remove <name>`
- `unknown template 'name'` — run `helo templates list` to see available templates
- `--claude-md file not found` — check the file path
