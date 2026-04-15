# Providers

helo supports multiple AI providers. Each provider has an associated environment variable for API keys.

## Supported providers

| Provider | Key env var | Notes |
|----------|------------|-------|
| anthropic | `ANTHROPIC_API_KEY` | Default Claude provider |
| zai | `ZAI_API_KEY` | Routes through z.ai API. Special settings handling. |
| openrouter | `OPENROUTER_API_KEY` | Multi-model gateway |
| openai | `OPENAI_API_KEY` | |
| groq | `GROQ_API_KEY` | |
| deepseek | `DEEPSEEK_API_KEY` | |
| mistral | `MISTRAL_API_KEY` | |
| gemini | `GEMINI_API_KEY` | |
| (custom) | `<PROVIDER>_API_KEY` | Any provider name uppercased |

## ZAI provider

The ZAI provider has special handling:

- **Settings template:** Always uses the built-in template (ignores user defaults). Generates an `env` block in `settings.json` that Claude Code reads at startup.
- **Routing:** Sets `ANTHROPIC_BASE_URL` to `https://api.z.ai/api/anthropic`
- **Model overrides:** Sets `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` to the blueprint's model
- **Key type:** ZAI subscription/plan keys work the same as API keys

```bash
helo add zai-agent --runtime claude --provider zai --model glm-5.1 --api-key <key>
```

## API key priority

For all providers:

```
--api-key flag  >  blueprint key (helo key)  >  global key (helo keys)  >  env var
```

## Setting keys

```bash
# Per-blueprint
helo add myagent --runtime claude --provider anthropic --model sonnet --api-key sk-xxx
helo key myagent sk-new-key

# Global (auto-applied to new blueprints)
helo keys set anthropic sk-xxx

# Environment variable
export ANTHROPIC_API_KEY=sk-xxx
```
