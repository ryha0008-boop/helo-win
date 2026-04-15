# Interactive Mode

Run `helo` with no arguments to enter interactive mode — a menu-driven loop for managing blueprints and launching agents.

```
helo       # interactive
helo run   # CLI (non-interactive)
```

## Menu

```
helo — AI agent environment manager  (q to quit)

─────────────────────────────────────────────
  1  dev-agent  (claude / anthropic / sonnet [coding])
  2  zai-agent  (claude / zai / glm-5.1)

  a  add blueprint     d  delete blueprint
  k  set api key       g  global keys
  s  status            c  clean runtime
  t  templates         x  defaults
  q  quit

number to run, or letter:
```

## Actions

| Key | Action |
|-----|--------|
| `1`–`N` | Run blueprint N. Prompts for project dir, resume option, and extra args. |
| `a` | Add a blueprint (guided prompts) |
| `d` | Delete a blueprint (pick by number, confirm) |
| `k` | Set/update API key for a blueprint |
| `g` | Global keys submenu (`set`, `remove`, `list`) |
| `s` | Status (config path + API key presence) |
| `t` | Templates submenu (`show <name>`, `init`) |
| `c` | Clean runtime global directory |
| `x` | Defaults submenu (`show <runtime>`, `set <runtime> <path>`) |
| `q` | Quit |

## Running a blueprint

When you select a blueprint by number:

1. **Project dir** — defaults to current directory, or enter a path
2. **Resume?** — `y` for most recent session, enter a session ID, or blank for new session
3. **Extra args** — e.g. `-p "my prompt"`. Supports double-quoted strings.

After the agent process exits, helo returns to the menu.
