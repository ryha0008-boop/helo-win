# list

Show all stored blueprints.

## Usage

```bash
helo list [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON array (for scripting/automation) |

## Examples

```bash
# Human-readable table
helo list

# JSON output
helo list --json
```

## Output

**Table format:**
```
NAME                 RUNTIME     PROVIDER        MODEL                          CLAUDE.MD
------------------------------------------------------------------------------------------
dev-agent            claude      anthropic       sonnet                         coding
zai-agent            claude      zai             glm-5.1                        -
```

**JSON format:**
```json
[{"name":"dev-agent","runtime":"claude","provider":"anthropic","model":"sonnet","claude_md":"coding"}]
```
