# key

Set or clear the API key stored in a blueprint.

## Usage

```bash
helo key <name> <key>
```

Pass an empty string `""` to clear the key.

## Examples

```bash
# Set/update a key
helo key myagent sk-new-key-123

# Clear a key (revert to global key or env var)
helo key myagent ""
```

## API key priority

1. Blueprint key (`helo key`) — highest
2. Global key (`helo keys set`)
3. Environment variable (e.g. `ANTHROPIC_API_KEY`)
