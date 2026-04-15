# Installation

## From source (all platforms)

Requires [Rust](https://rustup.rs/) installed.

```bash
git clone https://github.com/ryha0008-boop/helo-win.git
cd helo-win

# Debug build
cargo build

# Release build (recommended)
cargo build --release

# Install to ~/.cargo/bin/
cargo install --path .
```

The binary is self-contained — no Rust toolchain needed at runtime.

## Static binary (Linux)

For maximum portability across Linux distros, build a static binary:

```bash
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
# Binary at target/x86_64-unknown-linux-musl/release/helo
```

This binary has no external dependencies and works on any x86_64 Linux system.

## Pre-built binary

Copy the binary to anywhere in your PATH:

```bash
chmod +x helo
sudo cp helo /usr/local/bin/
# or
cp helo ~/.local/bin/
```

## Verify

```bash
helo --help
helo status
```

## Config locations

helo stores its configuration using platform-standard directories (via the `directories` crate):

| Platform | Config directory |
|----------|-----------------|
| Windows | `%APPDATA%\helo\config\` |
| Linux | `~/.config/helo/` |
| macOS | `~/Library/Application Support/helo/` |

Override with `HELO_CONFIG_DIR` env var:

```bash
export HELO_CONFIG_DIR=/custom/config/path
```

## Prerequisites

helo is a manager — it launches other AI agent runtimes. You need at least one installed:

| Runtime | Install |
|---------|---------|
| claude | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) |
| pi | pi coding agent |
| opencode | opencode |

Make sure the runtime binary is in your `PATH`.
