# Runtimes

helo supports three AI agent runtimes, each with its own isolation mechanism.

## claude

**Binary:** `claude` (must be in PATH)

**Isolation:** Sets `CLAUDE_CONFIG_DIR` to the env dir. Claude reads `settings.json` and `CLAUDE.md` from this directory.

**On first run, helo creates:**
- `.claude-env-<name>/settings.json` — model, permissions, hooks, and optionally env vars for ZAI
- `.claude-env-<name>/CLAUDE.md` — agent instructions (if `--claude-md` was set)
- `.claude-env-<name>/.helo.toml` — instance metadata

**Env vars set:**
- `CLAUDE_CONFIG_DIR` — always
- `ANTHROPIC_API_KEY` — non-ZAI providers with a key
- `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_DEFAULT_*_MODEL` — ZAI provider (set as process env vars at launch, not in settings.json)

## pi

**Binary:** `pi` (must be in PATH)

**Isolation:** Sets `PI_CODING_AGENT_DIR` to the env dir. Launched via `cmd /c` (Windows) or `sh -c` (Linux/macOS).

**On first run, helo creates:**
- `.pi-env-<name>/.helo.toml` — instance metadata

**API key handling:** Passed as `--api-key` flag to the pi binary.

## opencode

**Binary:** `opencode` (must be in PATH)

**Isolation:** Sets `OPENCODE_CONFIG` to the env dir.

**On first run, helo creates:**
- `.opencode-env-<name>/.helo.toml` — instance metadata

**API key handling:** Set as provider-specific env var (e.g. `OPENAI_API_KEY`).

## Adding new runtimes

helo uses a fallback pattern — unknown runtimes create env dirs named `.<runtime>-env-<name>/`. The runtime binary must accept the relevant env var for config isolation.
