# Quick Start

Get running in under a minute.

## 1. Install

```bash
# Build from source (requires Rust)
git clone https://github.com/ryha0008-boop/helo-win.git
cd helo-win
cargo build --release

# Install to PATH
cargo install --path .
```

Or copy the pre-built binary:
```bash
chmod +x helo
sudo cp helo /usr/local/bin/
```

## 2. Add a blueprint

```bash
helo add myagent --runtime claude --provider anthropic --model sonnet
```

Set an API key (one of):
```bash
# Option A: store in blueprint
helo add myagent --runtime claude --provider anthropic --model sonnet --api-key sk-xxx

# Option B: store globally (auto-applied to new blueprints)
helo keys set anthropic sk-xxx
helo add myagent --runtime claude --provider anthropic --model sonnet

# Option C: use env var (ANTHROPIC_API_KEY, ZAI_API_KEY, etc.)
export ANTHROPIC_API_KEY=sk-xxx
helo add myagent --runtime claude --provider anthropic --model sonnet
```

## 3. Run it

```bash
cd your-project
helo run myagent
```

First run creates the isolated env dir (`.claude-env-myagent/`) and launches Claude with its own config. Subsequent runs reuse the same environment.

## 4. (Optional) Add a CLAUDE.md template

Give your agent a role/persona:

```bash
helo add coder --runtime claude --provider anthropic --model sonnet --claude-md coding
```

Built-in templates: `coding`, `assistant`, `devops`. Or pass a file path.

## That's it

```
helo list        # see all blueprints
helo status      # config path + API key status
helo             # interactive menu
```
