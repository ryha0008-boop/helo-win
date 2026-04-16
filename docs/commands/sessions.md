# sessions

List conversation sessions for a blueprint in the current project.

## Usage

```bash
helo sessions [name]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `name` | Blueprint name. Omit if only one instance exists in the current directory. |

## Output

```
SESSION                               MODIFIED (UTC)    SIZE
--------------------------------------------------------------------
b6df8ba1-6630-4a3a-97c5-abb646de6500  2026-04-16 22:27   2270 KB
52e70571-d016-428b-add1-ee9a2b399419  2026-04-16 07:38      4 KB
196a69dd-66aa-4c87-b846-7ef0280e6379  2026-04-14 14:14   4560 KB
98dae297-7e96-4e50-94d9-56b98b84c9ed  2026-04-14 06:34      6 KB
```

Sessions sorted newest first. Dates shown in UTC.

## Resuming a session

Copy the session ID and pass it to `helo run --resume`:

```bash
helo run myagent --resume b6df8ba1-6630-4a3a-97c5-abb646de6500
```

## Interactive mode

Press `h` in interactive mode to view sessions for the current project.

## Notes

Sessions are `.jsonl` files stored inside the env dir under `projects/<encoded-project-path>/`. Each file is one full conversation. Subagent sessions (nested inside a parent session directory) are not listed.
