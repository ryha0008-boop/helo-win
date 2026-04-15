# Cross-Platform Notes

helo runs on Windows, Linux, and macOS.

## Platform differences

| Feature | Windows | Linux / macOS |
|---------|---------|---------------|
| pi launcher | `cmd /c` | `sh -c` |
| GUI | Full Electron app | CLI only |
| Config dir | `%APPDATA%\helo\config\` | `~/.config/helo/` (Linux) / `~/Library/Application Support/helo/` (macOS) |
| Binary extension | `.exe` | none |
| Static build | N/A | `x86_64-unknown-linux-musl` target |

## Building on Linux

```bash
# Standard build (dynamically links to glibc)
cargo build --release

# Static build (works on any Linux distro)
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
```

## Config directory locations

The `directories` crate handles platform-specific paths automatically:

| Platform | Path |
|----------|------|
| Windows | `C:\Users\<user>\AppData\Roaming\helo\config\` |
| Linux | `/home/<user>/.config/helo/` |
| macOS | `/Users/<user>/Library/Application Support/helo/` |

Override with `HELO_CONFIG_DIR` on any platform.

## Path separators

Blueprint `--claude-md` values accept both `/` and `\` as path separators. Template names (no separators, no extension) are resolved from `<config_dir>/templates/`.

## Hooks

The hook shell commands use POSIX-compatible syntax (`$()`, `[]`, `test`) which works in `sh` on Linux/macOS and in Git Bash on Windows.
