# Installation

## Pre-built binary (recommended)

Download from the [latest GitHub release](https://github.com/ryha0008-boop/helo-win/releases/latest).

| Platform | Asset |
|----------|-------|
| Windows x86_64 | `helo-x86_64-windows.exe` |
| Linux x86_64 | `helo-x86_64-linux` |
| macOS ARM (M1/M2/M3) | `helo-aarch64-macos` |
| macOS Intel | `helo-x86_64-macos` |

### Windows

1. Download `helo-x86_64-windows.exe`
2. Rename it to `helo.exe`
3. Move it to a folder in your PATH (e.g. `C:\Users\<you>\bin\`)
4. If that folder isn't in PATH yet:
   - Open **Start** → search "Environment Variables" → click **Edit the system environment variables**
   - Click **Environment Variables…**
   - Under **User variables**, select **Path** → **Edit** → **New**
   - Add the folder path (e.g. `C:\Users\<you>\bin`)
   - Click OK on all dialogs
   - Restart your terminal
5. Verify: `helo --version`

### Linux / macOS

```bash
# Download and install
chmod +x helo-x86_64-linux   # or helo-aarch64-macos / helo-x86_64-macos
sudo cp helo-x86_64-linux /usr/local/bin/helo
# or user-local:
cp helo-x86_64-linux ~/.local/bin/helo

helo --version
```

## From source (all platforms)

Requires [Rust](https://rustup.rs/).

```bash
git clone https://github.com/ryha0008-boop/helo-win.git
cd helo-win
cargo build --release
cargo install --path .
```

## Static binary (Linux, maximum portability)

```bash
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
# Binary: target/x86_64-unknown-linux-musl/release/helo
```

No external dependencies — works on any x86_64 Linux system.

## Self-update

Once installed, keep helo current with:

```bash
helo update
```

Downloads and replaces the binary in-place. Also updates any other copies found in PATH.

## Verify

```bash
helo --version
helo status
```

## Config locations

| Platform | Config directory |
|----------|-----------------|
| Windows | `%APPDATA%\helo\config\` |
| Linux | `~/.config/helo/` |
| macOS | `~/Library/Application Support/helo/` |

Override with `HELO_CONFIG_DIR` env var.

## Prerequisites

helo launches other AI agent runtimes — you need at least one:

| Runtime | Install |
|---------|---------|
| claude | `helo runtime install claude` (native installer) |
| pi | `npm install -g @anthropic-ai/pi` or `helo runtime install pi` |
| opencode | `go install github.com/opencode-ai/opencode@latest` or `helo runtime install opencode` |

Or use `helo init` — it walks you through installing runtimes and setting API keys.
