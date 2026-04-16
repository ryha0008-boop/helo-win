# Concepts

## The core idea

helo is to AI runtimes what Python venv is to Python packages — isolated environments per project, per agent.

The mechanism is a single env var that each runtime checks at startup. If set, the runtime reads and writes its config to that path instead of the global default.

```mermaid
flowchart LR
    subgraph venv["Python venv"]
        PY["python -m venv myenv"]
        ACT["source activate\nexport VIRTUAL_ENV=myenv\nexport PATH=myenv/bin:$PATH"]
        PKG["pip install → myenv/lib/site-packages"]
        PY --> ACT --> PKG
    end

    subgraph helo["helo"]
        ADD["helo add --runtime claude --name claude1"]
        RUN["helo run --name claude1\nexport CLAUDE_CONFIG_DIR=.claude-env-claude1"]
        CFG["claude reads/writes → .claude-env-claude1/"]
        ADD --> RUN --> CFG
    end

    MECH["one env var\nredirects state"]
    venv --- MECH
    helo --- MECH
```

## How isolation works

Each AI runtime has one env var that redirects its config directory:

| Runtime | Env var | Default (no helo) |
|---------|---------|-------------------|
| claude | `CLAUDE_CONFIG_DIR` | `~/.claude/` |
| pi | `PI_CODING_AGENT_DIR` | `~/.pi/` |
| opencode | `OPENCODE_CONFIG` | `~/.opencode/` |

`helo run` sets that var to the project-local env dir, then launches the binary:

```bash
# what helo run does under the hood
export CLAUDE_CONFIG_DIR=/your/project/.claude-env-claude1
claude
```

Settings, sessions, memory, CLAUDE.md — everything Claude reads and writes goes into `.claude-env-claude1/`. The global `~/.claude/` is never touched.

## Binary vs config isolation

helo isolates config, not the binary. The runtime binary stays global — shared across all envs.

```mermaid
flowchart TB
    subgraph shared["global — one copy"]
        PYB["python binary"]
        CLB["claude binary"]
    end

    subgraph venv_iso["venv — isolates packages"]
        SP1["myenv/site-packages"]
        SP2["myenv2/site-packages"]
    end

    subgraph helo_iso["helo — isolates config"]
        ED1[".claude-env-agent1/\nsettings · memory · sessions"]
        ED2[".claude-env-agent2/\nsettings · memory · sessions"]
    end

    PYB -->|VIRTUAL_ENV| SP1
    PYB -->|VIRTUAL_ENV| SP2
    CLB -->|CLAUDE_CONFIG_DIR| ED1
    CLB -->|CLAUDE_CONFIG_DIR| ED2
```

Upgrade `claude` once — all envs get the new version. Each env keeps its own independent state.

## Without helo

You could do this manually in three lines:

```bash
mkdir -p .claude-env-claude1
CLAUDE_CONFIG_DIR=$(pwd)/.claude-env-claude1 claude
```

helo's value is making that ergonomic at scale: named blueprints, multiple projects, state persisted across reboots, reproducible across machines via a committed `.helo.toml`.

## Key terms

**Blueprint** — a named AI identity stored globally in `config.toml`. Fields: name, runtime, provider, model, optional API key, optional CLAUDE.md template. Shared across projects.

**Instance** — a blueprint placed into a specific project directory. Stored as `.helo.toml` inside the env dir. Tracks which blueprint it came from.

**Env dir** — the isolated directory for one agent in one project. Named `.claude-env-<name>/`, `.pi-env-<name>/`, `.opencode-env-<name>/`. Contains all config and state for that agent.
