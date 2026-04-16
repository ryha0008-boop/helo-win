# completion

Generate shell completion scripts.

## Usage

```bash
helo completion <shell>
```

## Supported shells

| Shell | Value |
|-------|-------|
| Bash | `bash` |
| Zsh | `zsh` |
| Fish | `fish` |
| PowerShell | `powershell` |
| Elvish | `elvish` |

## Setup

### Bash

```bash
helo completion bash >> ~/.bashrc
source ~/.bashrc
```

### Zsh

```bash
helo completion zsh >> ~/.zshrc
source ~/.zshrc
```

### Fish

```bash
helo completion fish > ~/.config/fish/completions/helo.fish
```

### PowerShell

```powershell
helo completion powershell >> $PROFILE
. $PROFILE
```
