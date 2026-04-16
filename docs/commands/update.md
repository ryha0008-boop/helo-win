# update

Check for a newer helo release and install it in-place.

## Usage

```bash
helo update
```

## What it does

1. Fetches the latest release from GitHub via the API
2. Compares with the running version
3. If newer: downloads the correct binary for the current platform and replaces the running binary
4. Also updates any other copies of `helo` found in `PATH` directories

## Platform binaries

| Platform | Asset |
|----------|-------|
| Windows x86_64 | `helo-x86_64-windows.exe` |
| Linux x86_64 | `helo-x86_64-linux` |
| macOS ARM | `helo-aarch64-macos` |
| macOS Intel | `helo-x86_64-macos` |

## Windows notes

Windows cannot overwrite a running `.exe`, so helo uses a rename-swap:

1. Renames the current binary to `helo.exe.old`
2. Writes the new binary
3. Removes `helo.exe.old` on the next launch

## Notes

- If GitHub is unreachable, helo prints the releases page URL.
- If already on the latest version, prints a message and exits.
