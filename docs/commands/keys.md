# keys

Manage global API keys — stored once per provider, auto-applied when creating new blueprints.

## Subcommands

```bash
helo keys set <provider> <key>       # set global key
helo keys remove <provider>          # remove global key
helo keys list                       # list all stored keys
```

## Examples

```bash
# Set keys
helo keys set anthropic sk-ant-xxx
helo keys set zai zai-key-xxx
helo keys set openrouter sk-or-xxx

# List (keys are masked)
helo keys list

# Remove
helo keys remove zai
```

## Output

```
PROVIDER        KEY
----------------------------------------
anthropic       sk-a...xxxx
zai             zai-...xxxx
```

Keys are masked for display (first 4 + last 4 chars).

## Priority chain

```
--api-key flag  >  global key (helo keys)  >  env var (ANTHROPIC_API_KEY, etc.)
```
