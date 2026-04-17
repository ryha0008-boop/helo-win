# helo

**Isolated AI agent environments** — like Python venvs, but for AI runtimes.

Manage multiple AI coding agents (Claude, pi, opencode) with isolated configs, API keys, and project environments. Each agent gets its own sandboxed directory with independent settings, memory, and identity.

## Why helo?

Running multiple AI agents on the same machine causes conflicts:

- Different agents need different API keys, models, and providers
- Global config files get overwritten when switching agents
- No clean way to run the same runtime with different identities per project

helo solves this by giving each agent its own isolated environment directory — separate config, separate keys, separate instructions.

## Key concepts

| Concept | Description |
|---------|-------------|
| **Blueprint** | A named AI identity: runtime + provider + model + optional API key + optional CLAUDE.md. Stored globally in `config.toml`. |
| **Instance** | A blueprint placed into a project directory. Self-contained copy stored inside the env dir. |
| **Env dir** | Per-project, per-runtime isolated directory (e.g. `.claude-env-myagent/`). Contains config, settings, and memory. |

## Supported runtimes

| Runtime | Binary required | Isolation mechanism |
|---------|----------------|-------------------|
| claude | `claude` in PATH | `CLAUDE_CONFIG_DIR` |
| pi | `pi` in PATH | `PI_CODING_AGENT_DIR` |
| opencode | `opencode` in PATH | `OPENCODE_CONFIG` |

## Supported providers

anthropic, zai, openrouter, openai, groq, deepseek, mistral, gemini, or any custom provider.

## Platforms

Windows, Linux, macOS. CLI only — no GUI.
