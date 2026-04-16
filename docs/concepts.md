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

## How Claude resolves its config dir

`CLAUDE_CONFIG_DIR` is not set by Claude — it's an input contract. Claude checks for it at startup and uses whatever it finds. No helo required; you could set it manually.

```mermaid
flowchart TD
    START["claude launched"]
    CHECK{"CLAUDE_CONFIG_DIR\nset?"}
    DEFAULT["use ~/.claude/"]
    CUSTOM["use $CLAUDE_CONFIG_DIR"]
    EXISTS{"dir exists?"}
    CREATE["create dir\nseed settings.json\nseed CLAUDE.md if configured"]
    RUN["run"]

    START --> CHECK
    CHECK -->|no| DEFAULT
    CHECK -->|yes| CUSTOM
    DEFAULT --> EXISTS
    CUSTOM --> EXISTS
    EXISTS -->|no| CREATE --> RUN
    EXISTS -->|yes| RUN
```

If not set: falls back to `~/.claude/` — not an error. That's the problem without helo: every claude invocation on your machine shares that one directory.

## The env var as a contract

`CLAUDE_CONFIG_DIR` has nothing to do with your system. It's just an agreement between you and the claude binary: "if you see this var, use that path."

Same pattern everywhere in Unix:

```bash
EDITOR=vim git commit           # tell git which editor to open
DEBUG=1 node app.js             # tell node to enable debug output
CLAUDE_CONFIG_DIR=... claude    # tell claude where its config lives
```

The program doesn't own the variable. It only reads it. You provide it. helo automates the providing.

## Env var lifetime

`CLAUDE_CONFIG_DIR` is injected per-process. It does not persist in your shell, registry, or anywhere on disk. It lives only for the duration of the claude subprocess helo spawns.

```mermaid
sequenceDiagram
    participant Shell
    participant helo
    participant claude

    Shell->>helo: helo run claude1
    helo->>helo: look up blueprint → compute env dir path
    helo->>claude: spawn with CLAUDE_CONFIG_DIR=.claude-env-claude1
    Note over claude: reads/writes .claude-env-claude1/
    claude-->>helo: exits
    helo-->>Shell: returns
    Note over Shell: CLAUDE_CONFIG_DIR never set here
```

The **persistence** is the env dir on disk — `.claude-env-claude1/` stays between runs. The var is re-injected fresh each time.

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

## The problem without helo

```mermaid
flowchart TD
    subgraph nogood["without helo — shared global dir"]
        C1["claude session\nagent1"] -->|writes| GD["~/.claude/\nsettings · memory · sessions"]
        C2["claude session\nagent2"] -->|overwrites| GD
        C3["claude session\nagent3"] -->|overwrites| GD
        GD --> CONFLICT["💥 settings conflict\nmemory bleeds\nidentities mix"]
    end

    subgraph good["with helo — isolated dirs"]
        H1["helo run agent1"] -->|CLAUDE_CONFIG_DIR| E1[".claude-env-agent1/"]
        H2["helo run agent2"] -->|CLAUDE_CONFIG_DIR| E2[".claude-env-agent2/"]
        H3["helo run agent3"] -->|CLAUDE_CONFIG_DIR| E3[".claude-env-agent3/"]
    end
```

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
