# Interactive Mode

Run `helo` with no arguments to enter interactive mode — a menu-driven loop for managing blueprints and launching agents.

```
helo       # interactive
helo run   # CLI (non-interactive)
```

## Menu

```
── helo v0.1.7 ──────────────────────────────────

  1  dev-agent  (claude / anthropic / sonnet [coding])
  2  zai-agent  (claude / zai / glm-5.1)

  a  add blueprint     d  delete blueprint
  e  edit instance     h  sessions (history)
  k  keys              s  status
  c  clean runtime     t  templates
  q  quit

number to run, or letter:
```

## Actions

| Key | Action |
|-----|--------|
| `1`–`N` | Run blueprint N. Prompts for project dir, resume option, and extra args. |
| `a` | Add a blueprint (guided prompts) |
| `e` | Edit instance — change provider, model, API key, or toggle hooks for an instance in the current project |
| `d` | Delete a blueprint (pick by number, confirm) |
| `h` | Sessions — list conversation history for the current project |
| `k` | Keys submenu — manage blueprint keys and global keys together |
| `s` | Status (config path + API key presence, shows both env vars and stored keys) |
| `c` | Clean runtime global directory or instance env dirs |
| `t` | Templates submenu (`show <name>`, `init`) |
| `q` | Quit |

## Keys submenu (`k`)

Shows both blueprint-level and global keys in one view:

```
  Blueprints:
    1  dev-agent         sk-...abc
    2  zai-agent         sk-...xyz (global)

  Global:
    zai              sk-...abc

  set <#> <key>            — set blueprint key
  rm <#>                   — clear blueprint key
  global <provider> <key>  — set global key
  unglobal <provider>      — remove global key
  q                        — back
```

Blueprints without a stored key show "(global)" if a global key covers their provider.

## Instance editor (`e`)

Edit an existing instance in the current project — change provider, model, API key, or toggle hooks:

```
  Instance: zai-agent  (claude/zai/glm-5.1)
  Hooks: SUP  Key: set

  p  provider (zai)      m  model (glm-5.1)
  k  api key
  1  Stop             [ON]
  2  UserPromptSubmit [ON]
  3  PostCompact      [ON]
  q  done (save & regenerate settings)
```

Hooks summary: `SUP` = all on, `-U-` = UserPromptSubmit off, etc. On `q`, settings.json is regenerated respecting current hook toggles.

## Running a blueprint

When you select a blueprint by number:

1. **Project dir** — defaults to current directory, or enter a path
2. **Resume?** — `y` for most recent session, enter a session ID, or blank for new session
3. **Extra args** — e.g. `-p "my prompt"`. Supports double-quoted strings.

After the agent process exits, helo returns to the menu.
