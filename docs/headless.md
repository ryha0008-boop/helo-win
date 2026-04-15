# Headless / Scripting

Run helo non-interactively for automation, CI/CD, or orchestration by another AI.

## Non-interactive run

Pass extra args after `--` — they go directly to the runtime binary:

```bash
# Single prompt and exit
helo run myagent -- -p "fix the bug in main.rs"

# With JSON output
helo run myagent -- -p "explain this code" --output-format json

# Resume a session
helo run myagent --resume -- -p "continue fixing the tests"
```

Claude's `-p` / `--print` flag runs a single prompt and exits. All helo isolation (CLAUDE_CONFIG_DIR, settings, memory) still applies.

## JSON output

Several commands support `--json` for programmatic consumption:

```bash
helo list --json      # array of blueprints
helo status --json    # config path + key status
```

## Scripting examples

```bash
# Check if a blueprint exists
helo list --json | jq '.[] | select(.name == "myagent")'

# Run a prompt and capture output
result=$(helo run myagent -- -p "what does main.rs do?" --output-format json)

# Create, run, and clean up
helo add temp-agent --runtime claude --provider anthropic --model sonnet
helo run temp-agent -- -p "analyze this codebase"
helo remove temp-agent
```

## Exit codes

helo exits with the runtime process's exit code. Non-zero means the agent failed.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `HELO_CONFIG_DIR` | Override config directory location |
| `ANTHROPIC_API_KEY` | Fallback API key for Anthropic provider |
| `ZAI_API_KEY` | Fallback API key for ZAI provider |
| `OPENROUTER_API_KEY` | Fallback API key for OpenRouter |
| (etc.) | `<PROVIDER>_API_KEY` pattern for any provider |
