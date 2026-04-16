# init

Guided first-time setup wizard. Installs runtimes, sets API keys, and creates your first blueprint.

## Usage

```bash
helo init
```

## Steps

1. **Install runtimes** — detects which runtimes (claude, pi, opencode) are already installed. Offers to install missing ones via `npm` or `go`.
2. **API keys** — prompts for provider keys (anthropic, zai, openrouter, openai). Stored as global keys — auto-applied to new blueprints.
3. **Create first blueprint** — prompts for name, runtime, provider, model. Auto-fills API key from global keys set in step 2.

## Notes

- Safe to run on an existing install — skips already-installed runtimes and already-set keys.
- Interactive mode auto-detects first run (no blueprints configured) and suggests `helo init`.
- Requires `npm` in PATH for claude/pi, `go` in PATH for opencode.
