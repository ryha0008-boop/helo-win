# templates

List and show built-in CLAUDE.md templates that give agents their role/persona.

## Subcommands

```bash
helo templates list                # list available templates
helo templates show <name>         # print template content
helo templates init                # write all templates to config dir
```

## Built-in templates

| Name | Description |
|------|-------------|
| `coding` | Coding-focused agent |
| `assistant` | General-purpose assistant |
| `devops` | Sysadmin/DevOps agent |

## Usage with blueprints

```bash
# Use a built-in template by name
helo add coder --runtime claude --provider anthropic --model sonnet --claude-md coding

# Use a custom file
helo add coder --runtime claude --provider anthropic --model sonnet --claude-md /path/to/custom.md
```

On first `helo run`, the template file is copied into the env dir as `CLAUDE.md`. Claude reads this as its global instructions. The file is only read at placement time — later changes to the template don't affect existing envs.

## Examples

```bash
helo templates list
helo templates show coding
helo templates init
```
