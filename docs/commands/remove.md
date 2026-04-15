# remove

Delete a blueprint from the global config.

## Usage

```bash
helo remove <name>
```

## Examples

```bash
helo remove myagent
```

## Note

This removes the blueprint from `config.toml` only. It does **not** delete env dirs (`.claude-env-<name>/`) in project directories. Delete those manually if needed.
