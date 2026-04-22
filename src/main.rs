mod config;
mod models;
mod project;
mod providers;

// ── Built-in CLAUDE.md templates ────────────────────────────────────────────

const TEMPLATE_CODING: &str = include_str!("../templates/coding.md");
const TEMPLATE_ASSISTANT: &str = include_str!("../templates/assistant.md");
const TEMPLATE_DEVOPS: &str = include_str!("../templates/devops.md");

struct Template { pub name: &'static str, pub content: &'static str }

const TEMPLATES: &[Template] = &[
    Template { name: "coding",    content: TEMPLATE_CODING    },
    Template { name: "assistant", content: TEMPLATE_ASSISTANT },
    Template { name: "devops",    content: TEMPLATE_DEVOPS    },
];

/// Write all built-in templates to <config_dir>/templates/ if not already present.
fn ensure_templates() -> anyhow::Result<()> {
    let dir = config::templates_dir()?;
    std::fs::create_dir_all(&dir)?;
    for t in TEMPLATES {
        let path = dir.join(format!("{}.md", t.name));
        if !path.exists() {
            std::fs::write(&path, t.content)?;
        }
    }
    Ok(())
}

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use std::path::Path;

#[derive(Parser)]
#[command(name = "helo", about = "Isolated AI agent environments — like venvs for AI", version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// First-time setup: install runtimes, set API keys, create your first blueprint
    Init,
    /// Add a blueprint (defines an AI identity)
    Add {
        /// Name for this blueprint
        name: String,
        /// Runtime: pi, claude, or opencode
        #[arg(long)]
        runtime: String,
        /// Provider name (e.g. anthropic, zai, openrouter, openai)
        #[arg(long)]
        provider: String,
        /// Model ID (e.g. glm-z1, claude-sonnet-4-6)
        #[arg(long)]
        model: String,
        /// API key stored in the blueprint (falls back to env var if omitted)
        #[arg(long)]
        api_key: Option<String>,
        /// Path to a CLAUDE.md template seeded into the env dir on first run (claude runtime only)
        #[arg(long)]
        claude_md: Option<String>,
    },
    /// List all blueprints
    List {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Edit an existing blueprint's fields
    Edit {
        /// Blueprint name to edit
        name: String,
        /// New runtime
        #[arg(long)]
        runtime: Option<String>,
        /// New provider
        #[arg(long)]
        provider: Option<String>,
        /// New model
        #[arg(long)]
        model: Option<String>,
        /// New API key (pass "" to clear)
        #[arg(long)]
        api_key: Option<Option<String>>,
        /// New CLAUDE.md template path (pass "" to clear)
        #[arg(long)]
        claude_md: Option<Option<String>>,
    },
    /// Remove a blueprint by name
    Remove {
        name: String,
    },
    /// Place a blueprint in the current directory and launch it.
    /// Creates the env dir on first use; re-uses it on subsequent runs.
    Run {
        /// Blueprint name (omit if there is only one instance in the current directory)
        name: Option<String>,
        /// Resume a specific session by ID (omit ID to continue most recent session)
        #[arg(short, long)]
        resume: Option<Option<String>>,
        /// Send a prompt to the runtime (runs once and exits for Claude)
        #[arg(short, long)]
        prompt: Option<String>,
        /// Extra args passed through to the runtime binary
        #[arg(last = true)]
        extra: Vec<String>,
    },
    /// Show config location and API key status
    Status {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Remove instance env dirs from the current project (or global runtime dirs with --global)
    Clean {
        /// Instance name to remove (omit to remove all instances in current dir)
        name: Option<String>,
        /// Clean global runtime config instead of project instances
        #[arg(long)]
        global: bool,
        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },
    /// Set or replace the API key stored in a blueprint
    Key {
        /// Blueprint name
        name: String,
        /// The key value (pass empty string "" to clear)
        key: String,
    },
    /// List or show built-in CLAUDE.md templates
    Templates {
        #[command(subcommand)]
        sub: TemplatesCommands,
    },
    /// Manage global API keys (auto-applied when creating blueprints)
    Keys {
        #[command(subcommand)]
        sub: KeysCommands,
    },
    /// Check for helo updates
    Update,
    /// Install or uninstall AI runtimes (claude, pi, opencode)
    Runtime {
        #[command(subcommand)]
        sub: RuntimeCommands,
    },
    /// List conversation sessions for a blueprint in the current project
    Sessions {
        /// Blueprint name (omit if only one instance exists in the current directory)
        name: Option<String>,
    },
}

#[derive(Subcommand)]
enum RuntimeCommands {
    /// Install a runtime (e.g. claude, pi, opencode)
    Install {
        /// Runtime to install: claude, pi, opencode
        runtime: String,
    },
    /// Uninstall a runtime
    Uninstall {
        /// Runtime to uninstall: claude, pi, opencode
        runtime: String,
    },
    /// List installed runtimes and their versions
    List,
}

#[derive(Subcommand)]
enum TemplatesCommands {
    /// List available built-in templates
    List,
    /// Print a template's content
    Show {
        /// Template name: coding, assistant, devops
        name: String,
    },
    /// Write all templates to <config_dir>/templates/ (done automatically on helo add)
    Init,
}

#[derive(Subcommand)]
enum KeysCommands {
    /// List stored global keys
    List,
    /// Set a global key for a provider
    Set {
        /// Provider name (e.g. zai, anthropic, openrouter)
        provider: String,
        /// The key value
        key: String,
    },
    /// Remove a global key for a provider
    Remove {
        /// Provider name
        provider: String,
    },
}

fn main() {
    // Clean up old binary left behind by a previous self-update on Windows.
    #[cfg(windows)]
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(exe.with_extension("exe.old"));
    }

    if let Err(e) = run() {
        eprintln!("error: {e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        None => run_interactive(),
        Some(command) => run_command(command),
    }
}

fn run_command(command: Commands) -> Result<()> {
    match command {
        Commands::Init => cmd_init(),
        Commands::Add { name, runtime, provider, model, api_key, claude_md } => cmd_add(name, runtime, provider, model, api_key, claude_md),
        Commands::List { json } => cmd_list(json),
        Commands::Edit { name, runtime, provider, model, api_key, claude_md } => cmd_edit(name, runtime, provider, model, api_key, claude_md),
        Commands::Remove { name } => cmd_remove(name),
        Commands::Key { name, key } => cmd_key(name, key),
        Commands::Run { name, resume, prompt, extra } => cmd_run(name, resume, prompt, extra),
        Commands::Status { json } => cmd_status(json),
        Commands::Clean { name, global, yes } => cmd_clean(name, global, yes),
        Commands::Templates { sub } => match sub {
            TemplatesCommands::List => cmd_templates_list(),
            TemplatesCommands::Show { name } => cmd_templates_show(&name),
            TemplatesCommands::Init => { ensure_templates()?; println!("Templates written to: {}", config::templates_dir()?.display()); Ok(()) }
        },
        Commands::Keys { sub } => match sub {
            KeysCommands::List => cmd_keys_list(),
            KeysCommands::Set { provider, key } => cmd_keys_set(&provider, &key),
            KeysCommands::Remove { provider } => cmd_keys_remove(&provider),
        },
        Commands::Update => cmd_update(),
        Commands::Runtime { sub } => match sub {
            RuntimeCommands::Install { runtime } => cmd_runtime_install(&runtime),
            RuntimeCommands::Uninstall { runtime } => cmd_runtime_uninstall(&runtime),
            RuntimeCommands::List => cmd_runtime_list(),
        },
        Commands::Sessions { name } => cmd_sessions(name),
    }
}

fn validate_name(name: &str) -> Result<()> {
    if name.is_empty() {
        bail!("name required");
    }
    let valid = name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        bail!("name must contain only letters, digits, hyphens, and underscores");
    }
    Ok(())
}

fn cmd_add(name: String, runtime: String, provider: String, model: String, api_key: Option<String>, claude_md: Option<String>) -> Result<()> {
    validate_name(&name)?;
    // Resolve --claude-md: template name or file path.
    let claude_md = if let Some(ref value) = claude_md {
        ensure_templates()?;
        let resolved = config::resolve_claude_md(value)?;
        if !resolved.exists() {
            bail!("--claude-md file not found: {}", resolved.display());
        }
        Some(resolved.to_string_lossy().into_owned())
    } else {
        None
    };

    let mut cfg = config::load()?;
    if cfg.blueprints.iter().any(|b| b.name == name) {
        bail!("blueprint '{name}' already exists. Remove it first with: helo remove {name}");
    }
    // Auto-fill api_key from global keys if not provided via --api-key
    let api_key = match api_key {
        Some(k) if !k.is_empty() => Some(k),
        _ => cfg.keys.get(&provider).cloned(),
    };
    cfg.blueprints.push(models::Blueprint { name: name.clone(), runtime, provider, model, api_key, claude_md });
    config::save(&cfg)?;
    println!("Added blueprint '{name}'.");
    Ok(())
}

fn cmd_templates_list() -> Result<()> {
    ensure_templates()?;
    let dir = config::templates_dir()?;
    println!("Built-in templates (stored in {}):\n", dir.display());
    for t in TEMPLATES {
        println!("  {:<12} — use with: helo add <name> ... --claude-md {}", t.name, t.name);
    }
    Ok(())
}

fn cmd_templates_show(name: &str) -> Result<()> {
    let t = TEMPLATES.iter().find(|t| t.name == name)
        .with_context(|| format!("unknown template '{name}'. Run: helo templates list"))?;
    print!("{}", t.content);
    Ok(())
}

fn cmd_list(json: bool) -> Result<()> {
    let cfg = config::load()?;
    if json {
        // Emit a stable, minimal JSON array. Hand-rolled to avoid serde_json dep.
        print!("[");
        for (i, b) in cfg.blueprints.iter().enumerate() {
            if i > 0 { print!(","); }
            let has_key = b.api_key.is_some();
            print!(
                "{{\"name\":{},\"runtime\":{},\"provider\":{},\"model\":{},\"claude_md\":{},\"has_key\":{}}}",
                project::json_str(&b.name),
                project::json_str(&b.runtime),
                project::json_str(&b.provider),
                project::json_str(&b.model),
                b.claude_md.as_deref().map(|s| project::json_str(s)).unwrap_or_else(|| "null".to_string()),
                has_key,
            );
        }
        println!("]");
        return Ok(());
    }
    if cfg.blueprints.is_empty() {
        println!("No blueprints. Add one with:");
        println!("  helo add <name> --runtime pi --provider openrouter --model openai/gpt-4o");
        return Ok(());
    }
    println!("{:<20} {:<10} {:<15} {:<30} {}", "NAME", "RUNTIME", "PROVIDER", "MODEL", "CLAUDE.MD");
    println!("{}", "-".repeat(90));
    for b in &cfg.blueprints {
        let md = b.claude_md.as_deref()
            .map(|p| std::path::Path::new(p).file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(p))
            .unwrap_or("-");
        println!("{:<20} {:<10} {:<15} {:<30} {}", b.name, b.runtime, b.provider, b.model, md);
    }
    Ok(())
}

fn cmd_edit(name: String, runtime: Option<String>, provider: Option<String>, model: Option<String>, api_key: Option<Option<String>>, claude_md: Option<Option<String>>) -> Result<()> {
    let mut cfg = config::load()?;
    let bp = cfg.blueprints.iter_mut()
        .find(|b| b.name == name)
        .with_context(|| format!("no blueprint named '{name}'. Run: helo list"))?;

    let mut changed = false;
    if let Some(v) = runtime { bp.runtime = v; changed = true; }
    if let Some(v) = provider { bp.provider = v; changed = true; }
    if let Some(v) = model { bp.model = v; changed = true; }
    if let Some(key_opt) = api_key {
        match key_opt {
            Some(k) if !k.is_empty() => { bp.api_key = Some(k); }
            _ => { bp.api_key = None; }
        }
        changed = true;
    }
    if let Some(md_opt) = claude_md {
        match md_opt {
            Some(p) if !p.is_empty() => { bp.claude_md = Some(p); }
            _ => { bp.claude_md = None; }
        }
        changed = true;
    }

    if !changed {
        // No flags — show current config
        println!("Blueprint: {}", bp.name);
        println!("  runtime:   {}", bp.runtime);
        println!("  provider:  {}", bp.provider);
        println!("  model:     {}", bp.model);
        println!("  api_key:   {}", if bp.api_key.is_some() { "set" } else { "not set" });
        println!("  claude_md: {}", bp.claude_md.as_deref().unwrap_or("-"));
        println!();
        println!("Edit with: helo edit {} --model <new-model>", bp.name);
        return Ok(());
    }

    let summary = format!("{} / {} / {}", bp.runtime, bp.provider, bp.model);
    let name = bp.name.clone();
    config::save(&cfg)?;
    println!("Updated '{}' — now: {}", name, summary);
    Ok(())
}

fn cmd_remove(name: String) -> Result<()> {
    let mut cfg = config::load()?;
    let before = cfg.blueprints.len();
    cfg.blueprints.retain(|b| b.name != name);
    if cfg.blueprints.len() == before {
        bail!("no blueprint named '{name}'");
    }
    config::save(&cfg)?;
    println!("Removed '{name}'.");
    Ok(())
}

fn cmd_key(name: String, key: String) -> Result<()> {
    let mut cfg = config::load()?;
    let bp = cfg.blueprints.iter_mut()
        .find(|b| b.name == name)
        .with_context(|| format!("no blueprint named '{name}'. Run: helo list"))?;
    if key.is_empty() {
        bp.api_key = None;
        config::save(&cfg)?;
        println!("Cleared api_key for '{name}'.");
    } else {
        bp.api_key = Some(key);
        config::save(&cfg)?;
        println!("Updated api_key for '{name}'.");
    }
    Ok(())
}

fn cmd_keys_list() -> Result<()> {
    let cfg = config::load()?;
    if cfg.keys.is_empty() {
        println!("No global keys stored. Use: helo keys set <provider> <key>");
        return Ok(());
    }
    println!("{:<15} {}", "PROVIDER", "KEY");
    println!("{}", "-".repeat(40));
    for (provider, key) in &cfg.keys {
        let masked = mask_key(key);
        println!("{:<15} {}", provider, masked);
    }
    Ok(())
}

fn cmd_keys_set(provider: &str, key: &str) -> Result<()> {
    let mut cfg = config::load()?;
    cfg.keys.insert(provider.to_string(), key.to_string());
    config::save(&cfg)?;
    println!("Set global key for '{provider}'.");
    Ok(())
}

fn cmd_keys_remove(provider: &str) -> Result<()> {
    let mut cfg = config::load()?;
    if cfg.keys.remove(provider).is_none() {
        bail!("no global key for '{provider}'.");
    }
    config::save(&cfg)?;
    println!("Removed global key for '{provider}'.");
    Ok(())
}

// ── Runtime install / uninstall ─────────────────────────────────────────────

fn which_runtime(name: &str) -> Result<&'static str> {
    match name {
        "claude" => Ok("claude"),
        "pi" => Ok("pi"),
        "opencode" => Ok("opencode"),
        other => bail!("unknown runtime '{other}'. Supported: claude, pi, opencode"),
    }
}

fn runtime_install_cmd(runtime: &str) -> (&'static str, &'static [&'static str]) {
    match runtime {
        "claude" => ("npm", &["install", "-g", "@anthropic-ai/claude-code@latest"]),
        "pi" => ("npm", &["install", "-g", "@anthropic-ai/pi@latest"]),
        "opencode" => ("go", &["install", "github.com/opencode-ai/opencode@latest"]),
        _ => ("", &[]),
    }
}

fn runtime_uninstall_cmd(runtime: &str) -> (&'static str, &'static [&'static str]) {
    match runtime {
        "claude" => ("npm", &["uninstall", "-g", "@anthropic-ai/claude-code"]),
        "pi" => ("npm", &["uninstall", "-g", "@anthropic-ai/pi"]),
        "opencode" => ("go", &["clean", "-i", "github.com/opencode-ai/opencode@latest"]),
        _ => ("", &[]),
    }
}

fn cmd_runtime_install(runtime: &str) -> Result<()> {
    which_runtime(runtime)?;

    if runtime == "claude" {
        return cmd_runtime_install_claude();
    }

    let (bin, args) = runtime_install_cmd(runtime);
    if bin.is_empty() { bail!("unknown runtime"); }

    println!("Installing {runtime}...");
    let status = std::process::Command::new(bin)
        .args(args)
        .status()
        .with_context(|| format!("{bin} not found — install {} first", bin))?;

    if status.success() {
        println!("Installed {runtime}.");
    } else {
        bail!("failed to install {runtime} — {bin} exited with {}", status.code().unwrap_or(1));
    }
    Ok(())
}

#[cfg(windows)]
fn cmd_runtime_install_claude() -> Result<()> {
    println!("Installing claude (native installer)...");
    let script = "irm https://claude.ai/install.ps1 | iex";
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .status()
        .with_context(|| "powershell not found")?;
    if status.success() { println!("Installed claude."); } else {
        bail!("claude install failed — powershell exited with {}", status.code().unwrap_or(1));
    }
    Ok(())
}

#[cfg(not(windows))]
fn cmd_runtime_install_claude() -> Result<()> {
    println!("Installing claude (native installer)...");
    let script = "curl -fsSL https://claude.ai/install.sh | bash";
    let status = std::process::Command::new("sh")
        .args(["-c", script])
        .status()
        .with_context(|| "sh not found")?;
    if status.success() { println!("Installed claude."); } else {
        bail!("claude install failed — sh exited with {}", status.code().unwrap_or(1));
    }
    Ok(())
}

fn cmd_runtime_uninstall(runtime: &str) -> Result<()> {
    which_runtime(runtime)?;
    let (bin, args) = runtime_uninstall_cmd(runtime);
    if bin.is_empty() { bail!("unknown runtime"); }

    println!("Uninstalling {runtime}...");
    let status = std::process::Command::new(bin)
        .args(args)
        .status()
        .with_context(|| format!("{bin} not found"))?;

    if status.success() {
        println!("Uninstalled {runtime}.");
    } else {
        bail!("failed to uninstall {runtime} — {bin} exited with {}", status.code().unwrap_or(1));
    }
    Ok(())
}

fn cmd_runtime_list() -> Result<()> {
    let runtimes = [("claude", "npm"), ("pi", "npm"), ("opencode", "go")];
    println!("{:<12} {:<10} {}", "RUNTIME", "STATUS", "VERSION");
    println!("{}", "-".repeat(50));
    for (name, _installer) in &runtimes {
        let version = std::process::Command::new(name)
            .arg("--version")
            .output();
        match version {
            Ok(out) if out.status.success() => {
                let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let v_short = v.lines().next().unwrap_or("unknown");
                println!("{:<12} {:<10} {}", name, "installed", v_short);
            }
            _ => {
                println!("{:<12} {:<10} {}", name, "missing", "-");
            }
        }
    }
    Ok(())
}

// ── First-time setup (helo init) ────────────────────────────────────────────

fn is_installed(runtime: &str) -> bool {
    std::process::Command::new(runtime)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn cmd_init() -> Result<()> {
    let current = env!("CARGO_PKG_VERSION");
    println!("helo v{current} — first-time setup");
    println!();

    // Step 1: Install runtimes
    println!("═══ Step 1: Install runtimes ═══");
    println!();
    let runtimes = ["claude", "pi", "opencode"];

    let mut installed = Vec::new();
    for name in &runtimes {
        if name == &"claude" {
            // claude uses native installer — handle separately
            if is_installed(name) {
                let ver = std::process::Command::new(name)
                    .arg("--version")
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().lines().next().unwrap_or("").to_string())
                    .unwrap_or_default();
                println!("  {} — already installed ({})", name, ver);
                installed.push(name.to_string());
            } else {
                print!("  {} — not found. Install? [Y/n]: ", name);
                use std::io::Write;
                std::io::stdout().flush()?;
                let mut input = String::new();
                std::io::stdin().read_line(&mut input)?;
                if !input.trim().eq_ignore_ascii_case("n") {
                    print!("  Installing {}...", name);
                    std::io::stdout().flush()?;
                    match cmd_runtime_install_claude() {
                        Ok(()) => { println!(" done."); installed.push(name.to_string()); }
                        Err(e) => println!(" failed: {e:#}"),
                    }
                }
            }
            continue;
        }
        let (installer, install_args) = runtime_install_cmd(name);
        if is_installed(name) {
            let ver = std::process::Command::new(name)
                .arg("--version")
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().lines().next().unwrap_or("").to_string())
                .unwrap_or_default();
            println!("  {} — already installed ({})", name, ver);
            installed.push(name.to_string());
        } else {
            let has_installer = std::process::Command::new(installer)
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            if !has_installer {
                println!("  {} — skipped ({} not found)", name, installer);
                continue;
            }

            print!("  {} — not found. Install? [Y/n]: ", name);
            use std::io::Write;
            std::io::stdout().flush()?;
            let mut input = String::new();
            std::io::stdin().read_line(&mut input)?;
            if !input.trim().eq_ignore_ascii_case("n") {
                print!("  Installing {}...", name);
                std::io::stdout().flush()?;
                let status = std::process::Command::new(installer)
                    .args(install_args)
                    .status();
                match status {
                    Ok(s) if s.success() => {
                        println!(" done.");
                        installed.push(name.to_string());
                    }
                    Ok(s) => println!(" failed (exit code {})", s.code().unwrap_or(1)),
                    Err(_) => println!(" failed"),
                }
            } else {
                println!("  Skipped.");
            }
        }
    }

    if installed.is_empty() {
        println!();
        println!("No runtimes installed. Install at least one to use helo:");
        println!("  helo runtime install claude");
        println!("  helo runtime install pi");
        return Ok(());
    }

    // Step 2: API keys
    println!();
    println!("═══ Step 2: API keys ═══");
    println!();
    println!("  Set API keys for providers you want to use.");
    println!("  Keys are stored securely in helo's config.");
    println!("  (blank to skip)");
    println!();

    let providers = [
        ("anthropic", "Anthropic (Claude models)"),
        ("zai", "Z.AI (GLM models, subscription keys)"),
        ("openrouter", "OpenRouter (multi-model gateway)"),
        ("openai", "OpenAI"),
    ];

    let mut cfg = config::load()?;
    for (provider, description) in &providers {
        if cfg.keys.contains_key(*provider) {
            println!("  {} — key already set", provider);
            continue;
        }
        // Check env var
        let env_var = provider_key_env(provider);
        let has_env = std::env::var(&env_var).map(|v| !v.is_empty()).unwrap_or(false);
        let _hint = if has_env { " (env var exists)" } else { "" };
        print!("  {} [{}]: ", provider, description);
        use std::io::Write;
        std::io::stdout().flush()?;
        let mut key_input = String::new();
        std::io::stdin().read_line(&mut key_input)?;
        let key = key_input.trim().to_string();
        if !key.is_empty() {
            cfg.keys.insert(provider.to_string(), key);
        }
    }
    config::save(&cfg)?;

    // Step 3: Create first blueprint
    println!();
    println!("═══ Step 3: Create your first blueprint ═══");
    println!();

    let cfg = config::load()?;
    if !cfg.blueprints.is_empty() {
        println!("  You already have {} blueprint(s). Done!", cfg.blueprints.len());
        println!();
        println!("Setup complete. Run `helo` for interactive mode or `helo run <name>` to launch.");
        return Ok(());
    }

    let name = iread("  Blueprint name (e.g. dev-agent): ")?;
    if name.trim().is_empty() {
        println!("  Skipped. Create one later with: helo add <name> --runtime <r> --provider <p> --model <m>");
        println!();
        println!("Setup complete. Run `helo` for interactive mode.");
        return Ok(());
    }
    validate_name(&name)?;

    // Show available runtimes
    println!("  Available runtimes:");
    for r in &installed {
        println!("    {}", r);
    }

    let runtime = if installed.len() == 1 {
        println!("  Runtime: {} (auto-detected)", installed[0]);
        installed[0].clone()
    } else {
        let r = iread("  Runtime [claude/pi/opencode]: ")?;
        if r.is_empty() { bail!("runtime required"); }
        r
    };

    let provider = iread("  Provider [anthropic/zai/openrouter/openai]: ")?;
    if provider.is_empty() { bail!("provider required"); }

    let model = iread("  Model (e.g. sonnet, glm-5.1, gpt-4o): ")?;
    if model.is_empty() { bail!("model required"); }

    // Auto-fill API key from global keys
    let api_key = cfg.keys.get(&provider).cloned();

    cmd_add(name, runtime, provider, model, api_key, None)?;

    println!();
    println!("Setup complete!");
    println!();
    println!("Next steps:");
    println!("  helo                    — interactive mode");
    println!("  helo run {}            — launch your agent", cfg.blueprints.last().map(|b| b.name.as_str()).unwrap_or("<name>"));
    println!("  helo run {} -p \"...\"   — send a prompt and exit", cfg.blueprints.last().map(|b| b.name.as_str()).unwrap_or("<name>"));

    Ok(())
}

// ── Self-update ─────────────────────────────────────────────────────────────

const RELEASES_API: &str = "https://api.github.com/repos/ryha0008-boop/helo-win/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/ryha0008-boop/helo-win/releases";

fn cmd_update() -> Result<()> {
    let current = env!("CARGO_PKG_VERSION");
    println!("helo v{current}");
    print!("Checking for updates... ");
    std::io::Write::flush(&mut std::io::stdout()).ok();

    let resp = ureq::get(RELEASES_API)
        .set("User-Agent", &format!("helo/{current}"))
        .call();

    let body = match resp {
        Ok(r) => r,
        Err(e) => {
            println!("failed ({e})");
            println!("Download from: {RELEASES_PAGE}");
            return Ok(());
        }
    };

    let release: serde_json::Value = body.into_json()
        .context("failed to parse release JSON")?;

    let tag = release["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
    if tag.is_empty() {
        println!("no releases found.");
        println!("Download from: {RELEASES_PAGE}");
        return Ok(());
    }

    if !version_gt(tag, current) {
        println!("already up to date (v{current}).");
        return Ok(());
    }
    println!("v{tag} available.");

    // Find the asset for this platform.
    // Naming convention: helo-<arch>-<os>[.exe]
    // Falls back to bare .exe for older releases that predated multi-platform builds.
    let expected = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64")  => "helo-x86_64-windows.exe",
        ("linux",   "x86_64")  => "helo-x86_64-linux",
        ("macos",   "aarch64") => "helo-aarch64-macos",
        ("macos",   "x86_64")  => "helo-x86_64-macos",
        (os, arch)             => return Err(anyhow::anyhow!("no pre-built binary for {arch}-{os} — build from source: cargo install --git {RELEASES_PAGE}")),
    };
    let empty = vec![];
    let assets = release["assets"].as_array().unwrap_or(&empty);
    let asset = assets.iter()
        .find(|a| a["name"].as_str() == Some(expected))
        .or_else(|| {
            // Fallback: older Windows releases used bare helo.exe
            if cfg!(windows) {
                assets.iter().find(|a| a["name"].as_str().map(|n| n.ends_with(".exe")).unwrap_or(false))
            } else {
                None
            }
        })
        .with_context(|| format!("no binary for this platform in release v{tag} — download from: {RELEASES_PAGE}"))?;

    let url = asset["browser_download_url"].as_str().context("missing download URL")?;
    let name = asset["name"].as_str().unwrap_or("helo.exe");
    println!("Downloading {name}...");

    let mut reader = ureq::get(url)
        .set("User-Agent", &format!("helo/{current}"))
        .call()
        .context("download failed")?
        .into_reader();

    let mut buf = Vec::new();
    std::io::Read::read_to_end(&mut reader, &mut buf).context("failed to read download")?;

    let exe = std::env::current_exe().context("could not find current exe path")?;

    // On Windows: rename the running exe out of the way (OS allows this), write new binary.
    // The .exe.old file is removed on next launch.
    #[cfg(windows)]
    {
        let old = exe.with_extension("exe.old");
        let _ = std::fs::remove_file(&old);
        std::fs::rename(&exe, &old)
            .context("could not rename current binary — try running as administrator")?;
        if let Err(e) = std::fs::write(&exe, &buf) {
            let _ = std::fs::rename(&old, &exe); // restore on failure
            return Err(e).context("failed to write new binary");
        }
    }
    #[cfg(not(windows))]
    {
        std::fs::write(&exe, &buf).context("failed to write new binary")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755));
        }
    }

    // Also update any other copies of helo found in PATH
    update_path_copies(&exe);

    println!("Updated to v{tag}. Restart helo to use the new version.");
    Ok(())
}

/// Copies the newly installed binary to any other locations in PATH that have a helo binary.
fn update_path_copies(installed: &std::path::Path) {
    let Ok(path_var) = std::env::var("PATH") else { return };
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join("helo").with_extension(std::env::consts::EXE_EXTENSION);
        if candidate.exists() && candidate != installed {
            if std::fs::copy(installed, &candidate).is_ok() {
                println!("Also updated {}", candidate.display());
            }
        }
    }
}

fn version_gt(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> (u32, u32, u32) {
        let mut it = v.split('.').flat_map(|p| p.parse::<u32>().ok());
        (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
    };
    parse(a) > parse(b)
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "*".repeat(key.len())
    } else {
        format!("{}...{}", &key[..4], &key[key.len()-4..])
    }
}

fn cmd_run(name: Option<String>, resume: Option<Option<String>>, prompt: Option<String>, extra: Vec<String>) -> Result<()> {
    // Prepend prompt as -p <prompt> to extra args
    let extra: Vec<String> = match prompt {
        Some(p) => {
            let mut v = vec!["-p".to_string(), p];
            v.extend(extra);
            v
        }
        None => extra,
    };

    let cwd = std::env::current_dir()?;
    let cfg = config::load()?;

    let code = match name {
        Some(n) => {
            let bp = cfg
                .blueprints
                .iter()
                .find(|b| b.name == n)
                .with_context(|| format!("no blueprint named '{n}'. Run: helo list"))?;

            let env_dir = project::env_dir(&cwd, &bp.runtime, &bp.name);
            // Resolve key: blueprint → global key → env var
            let resolved_key = bp.api_key.as_deref()
                .map(Some)
                .unwrap_or_else(|| cfg.keys.get(&bp.provider).map(|s| s.as_str()))
                .map(str::to_string)
                .or_else(|| {
                    std::env::var(provider_key_env(&bp.provider)).ok().filter(|v| !v.is_empty())
                });
            if !env_dir.exists() {
                let inst = models::Instance {
                    name: bp.name.clone(),
                    runtime: bp.runtime.clone(),
                    provider: bp.provider.clone(),
                    model: bp.model.clone(),
                    api_key: resolved_key.clone(),
                    hooks: models::InstanceHooks::default(),
                };
                let claude_md_content = match &bp.claude_md {
                    Some(path) => Some(
                        std::fs::read_to_string(path)
                            .with_context(|| format!("could not read --claude-md file: {path}"))?
                    ),
                    None => None,
                };
                project::save_instance(&env_dir, &inst, claude_md_content.as_deref())?;
                println!("Created: {}", env_dir.display());
            }
            launch(&bp.runtime, &bp.provider, &bp.model, resolved_key.as_deref(), &env_dir, resume.as_ref(), &extra)?
        }
        None => {
            let instances = project::find_instances(&cwd);
            match instances.len() {
                0 => bail!(
                    "no instances in current directory.\n\
                     Add a blueprint: helo add <name> --runtime pi --provider openrouter --model <model>\n\
                     Then run:        helo run <name>"
                ),
                1 => {
                    let (env_dir, inst) = &instances[0];
                    launch(&inst.runtime, &inst.provider, &inst.model, inst.api_key.as_deref(), env_dir, resume.as_ref(), &extra)?
                }
                _ => {
                    eprintln!("Multiple instances in current directory:");
                    for (_, inst) in &instances {
                        eprintln!("  {}", inst.name);
                    }
                    bail!("specify which one: helo run <name>");
                }
            }
        }
    };

    std::process::exit(code);
}

fn launch(runtime: &str, provider: &str, model: &str, api_key: Option<&str>, env_dir: &Path, resume: Option<&Option<String>>, extra: &[String]) -> Result<i32> {
    #[cfg(windows)]
    {
        // Hooks use POSIX commands (sh, $(), test) — require Git Bash on PATH.
        // If sh is not found, try known Git for Windows locations and inject into PATH.
        if runtime == "claude" && env_dir.join("settings.json").exists() {
            let has_sh = std::process::Command::new("sh")
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if !has_sh {
                let candidates = [
                    r"C:\Program Files\Git\usr\bin",
                    r"C:\Program Files (x86)\Git\usr\bin",
                ];
                let found = candidates.iter().find(|p| std::path::Path::new(p).join("sh.exe").exists());
                match found {
                    Some(git_bin) => {
                        let current = std::env::var("PATH").unwrap_or_default();
                        std::env::set_var("PATH", format!("{};{}", git_bin, current));
                    }
                    None => {
                        eprintln!("warning: hooks use POSIX shell commands. Install Git Bash and ensure 'sh' is on PATH.");
                    }
                }
            }
        }
    }

    match runtime {
        "claude" => {
            let mut c = std::process::Command::new("claude");
            c.env("CLAUDE_CONFIG_DIR", env_dir);

            let pdef = providers::find_provider(provider);
            if pdef.map_or(false, |p| p.clear_api_key) {
                c.env_remove("ANTHROPIC_API_KEY");
            }
            if let Some(url) = pdef.and_then(|p| p.base_url) {
                c.env("ANTHROPIC_BASE_URL", url);
            }
            let auth_var = pdef.map_or("ANTHROPIC_API_KEY", |p| p.auth_var);
            if let Some(key) = api_key.filter(|k| !k.is_empty()) {
                c.env(auth_var, key);
            }
            if pdef.map_or(false, |p| p.set_model_defaults) {
                c.env("ANTHROPIC_DEFAULT_HAIKU_MODEL", model);
                c.env("ANTHROPIC_DEFAULT_SONNET_MODEL", model);
                c.env("ANTHROPIC_DEFAULT_OPUS_MODEL", model);
            }

            if let Some(r) = resume {
                match r {
                    Some(id) => { c.args(["--resume", id]); }
                    None     => { c.arg("--continue"); }
                }
            }
            c.args(extra);

            let status = c
                .status()
                .with_context(|| "could not launch 'claude' — is it installed and in PATH?")?;
            Ok(status.code().unwrap_or(1))
        }
        "pi" => {
            let key_env = provider_key_env(provider);
            let api_key_val = api_key
                .filter(|k| !k.is_empty())
                .map(str::to_string)
                .or_else(|| std::env::var(&key_env).ok().filter(|v| !v.is_empty()))
                .unwrap_or_default();
            let mut pi_args = format!("pi --provider {} --model {}", shell_quote(provider), shell_quote(model));
            if !api_key_val.is_empty() {
                pi_args.push_str(&format!(" --api-key {}", shell_quote(&api_key_val)));
            }
            if let Some(Some(id)) = resume {
                pi_args.push_str(&format!(" --resume {}", shell_quote(id)));
            }
            for arg in extra {
                pi_args.push(' ');
                pi_args.push_str(&shell_quote(arg));
            }

            // Platform-specific shell invocation
            #[cfg(windows)]
            let mut c = {
                let mut c = std::process::Command::new("cmd");
                c.args(["/c", &pi_args]);
                c
            };
            #[cfg(not(windows))]
            let mut c = {
                let mut c = std::process::Command::new("sh");
                c.args(["-c", &pi_args]);
                c
            };

            c.env("PI_CODING_AGENT_DIR", env_dir);
            let status = c
                .status()
                .with_context(|| "could not launch pi — is it installed and in PATH?")?;
            Ok(status.code().unwrap_or(1))
        }
        "opencode" => {
            let mut c = std::process::Command::new("opencode");
            c.env("OPENCODE_CONFIG", env_dir);
            if let Some(key) = api_key.filter(|k| !k.is_empty()) {
                c.env(provider_key_env(provider), key);
            }
            if let Some(Some(id)) = resume {
                c.args(["--continue", id]);
            }
            c.args(extra);
            let status = c
                .status()
                .with_context(|| "could not launch 'opencode' — is it installed and in PATH?")?;
            Ok(status.code().unwrap_or(1))
        }
        other => bail!("unknown runtime '{other}'. Supported: pi, claude, opencode"),
    }
}

fn provider_key_env(provider: &str) -> String {
    providers::provider_key_env(provider)
}

fn cmd_clean(name: Option<String>, global: bool, yes: bool) -> Result<()> {
    if global {
        // Global clean: remove runtime's global config dir
        let runtime = name.as_deref().with_context(|| "specify runtime: helo clean --global <runtime>")?;
        let home = directories::BaseDirs::new()
            .context("could not determine home directory")?
            .home_dir()
            .to_path_buf();

        let global_dir = match runtime {
            "pi" => home.join(".pi"),
            "claude" => home.join(".claude"),
            "opencode" => home.join(".opencode"),
            other => bail!("unknown runtime '{other}'. Supported: pi, claude, opencode"),
        };

        if !global_dir.exists() {
            println!("Nothing to clean — {} does not exist.", global_dir.display());
            return Ok(());
        }

        if !yes {
            eprintln!("WARNING: This deletes {} and ALL its contents (sessions, memory, config).", global_dir.display());
            print!("Type 'yes' to confirm: ");
            use std::io::Write;
            std::io::stdout().flush()?;
            let mut input = String::new();
            std::io::stdin().read_line(&mut input)?;
            if input.trim() != "yes" {
                println!("Aborted.");
                return Ok(());
            }
        }

        std::fs::remove_dir_all(&global_dir)
            .with_context(|| format!("could not remove {}", global_dir.display()))?;
        println!("Removed {}.", global_dir.display());
        return Ok(());
    }

    // Project-level clean: remove instance env dirs
    let cwd = std::env::current_dir()?;
    let instances = project::find_instances(&cwd);

    if let Some(target) = name {
        let found: Vec<_> = instances.iter().filter(|(_, inst)| inst.name == target).collect();
        if found.is_empty() {
            bail!("no instance named '{target}' in current directory");
        }
        if !yes {
            println!("Will remove:");
            for (dir, _) in &found {
                println!("  {}", dir.display());
            }
            print!("Proceed? [y/N] ");
            use std::io::Write;
            std::io::stdout().flush()?;
            let mut input = String::new();
            std::io::stdin().read_line(&mut input)?;
            if !input.trim().eq_ignore_ascii_case("y") {
                println!("Aborted.");
                return Ok(());
            }
        }
        for (dir, _) in &found {
            std::fs::remove_dir_all(dir)
                .with_context(|| format!("could not remove {}", dir.display()))?;
            println!("Removed {} ({})", dir.display(), target);
        }
        return Ok(());
    }

    // No name — clean all instances
    if instances.is_empty() {
        println!("No instances in current directory.");
        return Ok(());
    }

    let to_remove = &instances;

    if !yes {
        println!("Will remove:");
        for (dir, inst) in to_remove.iter() {
            println!("  {} ({})", dir.display(), inst.name);
        }
        print!("Proceed? [y/N] ");
        use std::io::Write;
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Aborted.");
            return Ok(());
        }
    }

    for (dir, inst) in to_remove.iter() {
        std::fs::remove_dir_all(dir)
            .with_context(|| format!("could not remove {}", dir.display()))?;
        println!("Removed {} ({})", dir.display(), inst.name);
    }
    Ok(())
}

fn cmd_status(json: bool) -> Result<()> {
    let path = config::config_path()?;
    let cfg = config::load()?;

    let keys = [
        ("ANTHROPIC_API_KEY",  "Anthropic"),
        ("OPENROUTER_API_KEY", "OpenRouter"),
        ("OPENAI_API_KEY",     "OpenAI"),
        ("GROQ_API_KEY",       "Groq"),
        ("DEEPSEEK_API_KEY",   "DeepSeek"),
        ("ZAI_API_KEY",        "Z.AI"),
        ("GEMINI_API_KEY",     "Gemini"),
        ("MISTRAL_API_KEY",    "Mistral"),
    ];

    if json {
        print!("{{");
        print!("\"config_path\":{},", project::json_str(&path.display().to_string()));
        print!("\"blueprints\":{},", cfg.blueprints.len());
        print!("\"api_keys\":{{");
        for (i, (env, label)) in keys.iter().enumerate() {
            if i > 0 { print!(","); }
            let set = std::env::var(env).map(|v| !v.is_empty()).unwrap_or(false);
            print!("{}:{}", project::json_str(label), set);
        }
        print!("}}");
        println!("}}");
        return Ok(());
    }

    println!("Config: {}", path.display());
    println!("Blueprints: {}", cfg.blueprints.len());
    println!("\nAPI keys:");
    for (env, label) in &keys {
        let from_env = std::env::var(env).map(|v| !v.is_empty()).unwrap_or(false);
        let provider_key = match *label {
            "Anthropic" => "anthropic",
            "OpenRouter" => "openrouter",
            "OpenAI" => "openai",
            "Groq" => "groq",
            "DeepSeek" => "deepseek",
            "Z.AI" => "zai",
            "Gemini" => "gemini",
            "Mistral" => "mistral",
            _ => "",
        };
        let from_global = cfg.keys.contains_key(provider_key);
        let status = if from_env {
            "set (env)"
        } else if from_global {
            "set (global)"
        } else {
            "not set"
        };
        println!("  {:<20} {}", label, status);
    }
    Ok(())
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/// Encode an absolute path to Claude's project-dir naming convention:
/// replace each `\`, `/`, and `:` with `-`.
fn encode_project_path(path: &std::path::Path) -> String {
    path.to_string_lossy()
        .chars()
        .map(|c| if matches!(c, '\\' | '/' | ':') { '-' } else { c })
        .collect()
}

/// Format a SystemTime as "YYYY-MM-DD HH:MM" (UTC).
fn format_utc(t: std::time::SystemTime) -> String {
    let secs = t.duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let days = secs / 86400;
    let rem  = secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;

    // Gregorian calendar from days-since-epoch (Howarth algorithm)
    let z   = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y   = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp  = (5 * doy + 2) / 153;
    let d   = doy - (153 * mp + 2) / 5 + 1;
    let mo  = if mp < 10 { mp + 3 } else { mp - 9 };
    let y   = if mo <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02} {:02}:{:02}", y, mo, d, h, m)
}

fn cmd_sessions(name: Option<String>) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let instances = project::find_instances(&cwd);

    let env_dir = if let Some(n) = name {
        instances.into_iter()
            .find(|(_, inst)| inst.name == n)
            .map(|(dir, _)| dir)
            .with_context(|| format!("no instance named '{n}' in current directory"))?
    } else if instances.len() == 1 {
        instances.into_iter().next().unwrap().0
    } else if instances.is_empty() {
        bail!("no instances in current directory");
    } else {
        bail!("multiple instances — specify: helo sessions <name>");
    };

    let sessions_dir = env_dir.join("projects").join(encode_project_path(&cwd));

    if !sessions_dir.exists() {
        println!("No sessions yet.");
        return Ok(());
    }

    let mut sessions: Vec<(String, std::time::SystemTime, u64)> = vec![];
    for entry in std::fs::read_dir(&sessions_dir)?.flatten() {
        let path = entry.path();
        if path.is_dir() { continue; }
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") { continue; }
        let fname = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let meta  = std::fs::metadata(&path)?;
        let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        sessions.push((fname, mtime, meta.len()));
    }

    if sessions.is_empty() {
        println!("No sessions yet.");
        return Ok(());
    }

    sessions.sort_by(|a, b| b.1.cmp(&a.1));

    println!("{:<38}  {:<16}  {:>8}", "SESSION", "MODIFIED (UTC)", "SIZE");
    println!("{}", "-".repeat(68));
    for (id, mtime, size) in sessions {
        let size_kb = (size + 1023) / 1024;
        println!("{:<38}  {:<16}  {:>5} KB", id, format_utc(mtime), size_kb);
    }
    Ok(())
}

// ── Interactive mode ─────────────────────────────────────────────────────────

fn iread(prompt_str: &str) -> Result<String> {
    use std::io::Write;
    print!("{}", prompt_str);
    std::io::stdout().flush()?;
    let mut line = String::new();
    std::io::stdin().read_line(&mut line)?;
    Ok(line.trim().to_string())
}

fn run_interactive() -> Result<()> {
    println!("helo v{} — AI agent environment manager", env!("CARGO_PKG_VERSION"));

    // First-run hint
    let cfg = config::load()?;
    if cfg.blueprints.is_empty() {
        println!();
        println!("  No blueprints yet. Run `helo init` for guided setup,");
        println!("  or press `a` to add one manually.");
    }

    loop {
        let cfg = config::load()?;
        println!();
        println!("── helo v{} ──────────────────────────────────", env!("CARGO_PKG_VERSION"));
        if cfg.blueprints.is_empty() {
            println!("  (no blueprints)");
        } else {
            for (i, b) in cfg.blueprints.iter().enumerate() {
                let md = b.claude_md.as_deref()
                    .map(|p| std::path::Path::new(p).file_stem()
                        .and_then(|n| n.to_str()).unwrap_or(p))
                    .map(|n| format!(" [{}]", n))
                    .unwrap_or_default();
                println!("  {}  {}  ({} / {} / {}{})", i + 1, b.name, b.runtime, b.provider, b.model, md);
            }
        }
        println!();
        println!("  a  add blueprint     d  delete blueprint");
        println!("  e  edit instance     h  sessions (history)");
        println!("  k  keys              s  status");
        println!("  c  clean runtime     t  templates");
        println!("  q  quit");
        println!();

        let input = iread("number to run, or letter: ")?;
        if input.is_empty() { continue; }

        if let Ok(n) = input.parse::<usize>() {
            if n >= 1 && n <= cfg.blueprints.len() {
                // Clone to drop borrow on cfg before passing to interactive_run
                let bp = cfg.blueprints[n - 1].clone();
                if let Err(e) = interactive_run(&bp) {
                    println!("error: {e:#}");
                }
            } else {
                println!("No blueprint #{}.", n);
            }
            continue;
        }

        match input.to_lowercase().as_str() {
            "a" => { if let Err(e) = interactive_add()     { println!("error: {e:#}"); } }
            "k" => { if let Err(e) = interactive_keys_menu()  { println!("error: {e:#}"); } }
            "d" => {
                if cfg.blueprints.is_empty() {
                    println!("No blueprints to delete.");
                } else if let Err(e) = interactive_delete() {
                    println!("error: {e:#}");
                }
            }
            "e" => { if let Err(e) = interactive_edit_instance()  { println!("error: {e:#}"); } }
            "h" => { if let Err(e) = cmd_sessions(None)        { println!("error: {e:#}"); } }
            "s" => { if let Err(e) = cmd_status(false)        { println!("error: {e:#}"); } }
            "t" => { if let Err(e) = interactive_templates()  { println!("error: {e:#}"); } }
            "c" => { if let Err(e) = interactive_clean()      { println!("error: {e:#}"); } }
            "q" | "quit" | "exit" => break,
            _ => println!("Unknown: '{input}'"),
        }
    }
    Ok(())
}

fn interactive_run(bp: &models::Blueprint) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let dir_input = iread(&format!("Project dir [{}]: ", cwd.display()))?;
    let project_dir = if dir_input.is_empty() {
        cwd
    } else {
        std::path::PathBuf::from(&dir_input)
    };
    if !project_dir.exists() {
        bail!("directory does not exist: {}", project_dir.display());
    }

    let resume_input = iread("Resume? [y=most-recent / session-id / blank=no]: ")?;
    let resume: Option<Option<String>> = match resume_input.to_lowercase().as_str() {
        "" | "n" | "no" => None,
        "y" | "yes"     => Some(None),
        id              => Some(Some(id.to_string())),
    };

    let prompt_input = iread("Prompt [blank=interactive]: ")?;
    let extra_input = iread("Extra args [blank=none]: ")?;
    let mut extra = if extra_input.is_empty() { vec![] } else { shell_split(&extra_input) };
    if !prompt_input.is_empty() {
        extra.insert(0, prompt_input);
        extra.insert(0, "-p".to_string());
    }

    let env_dir = project::env_dir(&project_dir, &bp.runtime, &bp.name);
    let cfg = config::load()?;
    let resolved_key = bp.api_key.as_deref()
        .map(Some)
        .unwrap_or_else(|| cfg.keys.get(&bp.provider).map(|s| s.as_str()))
        .map(str::to_string)
        .or_else(|| match bp.provider.as_str() {
            "zai" => std::env::var("ZAI_API_KEY").ok().filter(|v| !v.is_empty()),
            _ => std::env::var("ANTHROPIC_API_KEY").ok().filter(|v| !v.is_empty()),
        });
    if !env_dir.exists() {
        let inst = models::Instance {
            name: bp.name.clone(),
            runtime: bp.runtime.clone(),
            provider: bp.provider.clone(),
            model: bp.model.clone(),
            api_key: resolved_key.clone(),
            hooks: models::InstanceHooks::default(),
        };
        let claude_md_content = match &bp.claude_md {
            Some(path) => Some(
                std::fs::read_to_string(path)
                    .with_context(|| format!("could not read --claude-md file: {path}"))?
            ),
            None => None,
        };
        project::save_instance(&env_dir, &inst, claude_md_content.as_deref())?;
        println!("Created: {}", env_dir.display());
    }

    let code = launch(&bp.runtime, &bp.provider, &bp.model, resolved_key.as_deref(), &env_dir, resume.as_ref(), &extra)?;
    if code != 0 {
        println!("Process exited with code {}.", code);
    }
    Ok(())
}

fn interactive_add() -> Result<()> {
    println!("Add blueprint");
    let name = iread("Name: ")?;
    if name.is_empty() { bail!("name required"); }

    let runtime = iread("Runtime [claude/pi/opencode]: ")?;
    if runtime.is_empty() { bail!("runtime required"); }

    let provider = iread("Provider [anthropic/zai/openrouter/openai]: ")?;
    if provider.is_empty() { bail!("provider required"); }

    let model = iread("Model: ")?;
    if model.is_empty() { bail!("model required"); }

    let api_key_input = iread("API key [blank = use env var]: ")?;
    let api_key = if api_key_input.is_empty() { None } else { Some(api_key_input) };

    let claude_md_input = if runtime == "claude" {
        let v = iread("CLAUDE.md [coding/assistant/devops or file path, blank=none]: ")?;
        if v.is_empty() { None } else { Some(v) }
    } else {
        None
    };

    cmd_add(name, runtime, provider, model, api_key, claude_md_input)
}

fn interactive_keys_menu() -> Result<()> {
    loop {
        println!();
        let cfg = config::load()?;

        // Blueprint keys
        println!("  Blueprints:");
        if cfg.blueprints.is_empty() {
            println!("    (none)");
        } else {
            for (i, b) in cfg.blueprints.iter().enumerate() {
                let key_status = match &b.api_key {
                    Some(k) => mask_key(k),
                    None => {
                        // Check if global key covers this provider
                        if let Some(gk) = cfg.keys.get(&b.provider) {
                            format!("{} (global)", mask_key(gk))
                        } else {
                            "not set".to_string()
                        }
                    }
                };
                println!("    {}  {:<20} {}", i + 1, b.name, key_status);
            }
        }

        // Global keys
        println!("\n  Global:");
        if cfg.keys.is_empty() {
            println!("    (none)");
        } else {
            for (provider, key) in &cfg.keys {
                println!("    {:<15} {}", provider, mask_key(key));
            }
        }

        println!();
        println!("  set <#> <key>            — set blueprint key");
        println!("  rm <#>                   — clear blueprint key");
        println!("  global <provider> <key>  — set global key");
        println!("  unglobal <provider>      — remove global key");
        println!("  q                        — back");
        let input = iread("> ")?;
        let parts: Vec<&str> = input.splitn(3, ' ').collect();
        match parts.as_slice() {
            [cmd] if cmd.eq_ignore_ascii_case("q") || cmd.is_empty() => break,
            ["set", num, key] => {
                if let Ok(n) = num.parse::<usize>() {
                    let cfg = config::load()?;
                    if n < 1 || n > cfg.blueprints.len() {
                        println!("No blueprint #{}.", n);
                    } else {
                        let name = cfg.blueprints[n - 1].name.clone();
                        if let Err(e) = cmd_key(name, key.to_string()) { println!("error: {e}"); }
                    }
                } else {
                    println!("Expected blueprint number, got '{}'.", num);
                }
            }
            ["rm", num] | ["remove", num] => {
                if let Ok(n) = num.parse::<usize>() {
                    let cfg = config::load()?;
                    if n < 1 || n > cfg.blueprints.len() {
                        println!("No blueprint #{}.", n);
                    } else {
                        let name = cfg.blueprints[n - 1].name.clone();
                        if let Err(e) = cmd_key(name, String::new()) { println!("error: {e}"); }
                    }
                } else {
                    println!("Expected blueprint number, got '{}'.", num);
                }
            }
            ["global", provider, key] => {
                if let Err(e) = cmd_keys_set(provider, key) { println!("error: {e}"); }
            }
            ["unglobal", provider] | ["rmglobal", provider] => {
                if let Err(e) = cmd_keys_remove(provider) { println!("error: {e}"); }
            }
            _ => println!("Unknown: '{input}'"),
        }
    }
    Ok(())
}

fn interactive_edit_instance() -> Result<()> {
    let cwd = std::env::current_dir()?;
    let instances = project::find_instances(&cwd);
    if instances.is_empty() {
        println!("No instances in current directory.");
        println!("Run a blueprint first to create one.");
        return Ok(());
    }

    println!("Edit instance:");
    for (i, (_, inst)) in instances.iter().enumerate() {
        let hooks_summary = format_hooks_summary(&inst.hooks);
        println!("  {}  {}  ({}/{}/{})  hooks:{}",
            i + 1, inst.name, inst.runtime, inst.provider, inst.model, hooks_summary);
    }
    let input = iread("Number [blank=cancel]: ")?;
    if input.is_empty() { return Ok(()); }
    let n: usize = input.parse().context("enter a number")?;
    if n < 1 || n > instances.len() { bail!("no instance #{n}"); }
    let (env_dir, mut inst) = instances[n - 1].clone();

    loop {
        let hooks_summary = format_hooks_summary(&inst.hooks);
        println!();
        println!("  Instance: {}  ({}/{}/{})", inst.name, inst.runtime, inst.provider, inst.model);
        println!("  Hooks: {}  Key: {}", hooks_summary,
            inst.api_key.as_deref().map(|_| "set").unwrap_or("not set"));
        println!();
        println!("  p  provider ({})      m  model ({})", inst.provider, inst.model);
        println!("  k  api key");
        println!("  1  Stop             [{}]", if inst.hooks.stop { "ON" } else { "OFF" });
        println!("  2  UserPromptSubmit [{}]", if inst.hooks.user_prompt_submit { "ON" } else { "OFF" });
        println!("  3  PostCompact      [{}]", if inst.hooks.post_compact { "ON" } else { "OFF" });
        println!("  q  done (save & regenerate settings)");
        let choice = iread("> ")?;
        match choice.to_lowercase().as_str() {
            "p" => {
                let new_p = iread(&format!("Provider [{}]: ", inst.provider))?;
                if !new_p.is_empty() && new_p != inst.provider {
                    inst.provider = new_p;
                    project::save_instance_toml(&env_dir, &inst)?;
                }
            }
            "m" => {
                let new_m = iread(&format!("Model [{}]: ", inst.model))?;
                if !new_m.is_empty() && new_m != inst.model {
                    inst.model = new_m;
                    project::save_instance_toml(&env_dir, &inst)?;
                }
            }
            "k" => {
                let key_input = iread("API key [blank=keep, 'clear'=remove]: ")?;
                if key_input == "clear" {
                    inst.api_key = None;
                } else if !key_input.is_empty() {
                    inst.api_key = Some(key_input);
                }
                project::save_instance_toml(&env_dir, &inst)?;
            }
            "1" => { inst.hooks.stop = !inst.hooks.stop; project::save_instance_toml(&env_dir, &inst)?; }
            "2" => { inst.hooks.user_prompt_submit = !inst.hooks.user_prompt_submit; project::save_instance_toml(&env_dir, &inst)?; }
            "3" => { inst.hooks.post_compact = !inst.hooks.post_compact; project::save_instance_toml(&env_dir, &inst)?; }
            "q" | "" => {
                if inst.runtime == "claude" {
                    if project::regenerate_settings(&env_dir, &inst)? {
                        println!("Settings regenerated.");
                    }
                }
                println!("Instance '{}' saved.", inst.name);
                break;
            }
            _ => println!("Unknown: '{}'", choice),
        }
    }
    Ok(())
}

fn format_hooks_summary(hooks: &models::InstanceHooks) -> String {
    let stop = if hooks.stop { "S" } else { "-" };
    let ups = if hooks.user_prompt_submit { "U" } else { "-" };
    let pc = if hooks.post_compact { "P" } else { "-" };
    format!("{}{}{}", stop, ups, pc)
}

fn interactive_delete() -> Result<()> {
    let cfg = config::load()?;
    println!("Delete blueprint:");
    for (i, b) in cfg.blueprints.iter().enumerate() {
        println!("  {}  {}", i + 1, b.name);
    }
    let input = iread("Number [blank=cancel]: ")?;
    if input.is_empty() { return Ok(()); }
    let n: usize = input.parse().context("enter a number")?;
    if n < 1 || n > cfg.blueprints.len() { bail!("no blueprint #{n}"); }
    let name = cfg.blueprints[n - 1].name.clone();
    let confirm = iread(&format!("Delete '{name}'? [y/N]: "))?;
    if confirm.eq_ignore_ascii_case("y") {
        cmd_remove(name)?;
    } else {
        println!("Aborted.");
    }
    Ok(())
}

fn interactive_templates() -> Result<()> {
    loop {
        println!();
        for t in TEMPLATES {
            println!("  {}", t.name);
        }
        println!();
        println!("  show <name>   print template content");
        println!("  init          write templates to config dir");
        println!("  q             back");
        let input = iread("> ")?;
        let lower = input.to_lowercase();
        match lower.as_str() {
            "q" | "" => break,
            "init" => {
                ensure_templates()?;
                println!("Templates written to: {}", config::templates_dir()?.display());
            }
            s if s.starts_with("show ") => {
                let name = s["show ".len()..].trim();
                if let Err(e) = cmd_templates_show(name) { println!("error: {e}"); }
            }
            _ => println!("Unknown: '{input}'"),
        }
    }
    Ok(())
}

fn interactive_clean() -> Result<()> {
    let cwd = std::env::current_dir()?;
    let instances = project::find_instances(&cwd);
    println!("Clean instances from current directory:");
    if instances.is_empty() {
        println!("  (none)");
    } else {
        for (i, (_, inst)) in instances.iter().enumerate() {
            println!("  {}  {}", i + 1, inst.name);
        }
    }
    println!();
    println!("  <number>  remove instance");
    println!("  global    clean global runtime config");
    println!("  q         back");
    let input = iread("> ")?;
    let lower = input.to_lowercase();
    match lower.as_str() {
        "q" | "" => Ok(()),
        "global" => {
            let runtime = iread("Runtime [claude/pi/opencode]: ")?;
            if runtime.is_empty() { return Ok(()); }
            cmd_clean(Some(runtime), true, false)
        }
        _ => {
            if let Ok(n) = input.parse::<usize>() {
                if n >= 1 && n <= instances.len() {
                    let name = instances[n - 1].1.name.clone();
                    return cmd_clean(Some(name), false, false);
                }
            }
            cmd_clean(Some(input), false, false)
        }
    }
}

/// Shell-quote a string for safe inclusion in a sh -c / cmd /c command.
fn shell_quote(s: &str) -> String {
    if s.is_empty() { return "''".to_string(); }
    // If only safe chars, no quoting needed
    if s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '/') {
        return s.to_string();
    }
    // Use single-quote wrapping, escaping any embedded single quotes
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Basic shell-like split — handles double-quoted strings.
fn shell_split(s: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    for c in s.chars() {
        match c {
            '"' => in_quote = !in_quote,
            ' ' if !in_quote => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() { args.push(current); }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::json_str;

    // ── json_str ──────────────────────────────────────────────────────────────

    #[test]
    fn json_str_plain() {
        assert_eq!(json_str("hello"), "\"hello\"");
    }

    #[test]
    fn json_str_empty() {
        assert_eq!(json_str(""), "\"\"");
    }

    #[test]
    fn json_str_escapes_quote() {
        assert_eq!(json_str("a\"b"), "\"a\\\"b\"");
    }

    #[test]
    fn json_str_escapes_backslash() {
        assert_eq!(json_str("a\\b"), "\"a\\\\b\"");
    }

    #[test]
    fn json_str_escapes_newline() {
        assert_eq!(json_str("a\nb"), "\"a\\nb\"");
    }

    #[test]
    fn json_str_escapes_tab() {
        assert_eq!(json_str("a\tb"), "\"a\\tb\"");
    }

    #[test]
    fn json_str_escapes_cr() {
        assert_eq!(json_str("a\rb"), "\"a\\rb\"");
    }

    #[test]
    fn json_str_escapes_control_char() {
        assert_eq!(json_str("a\x07b"), "\"a\\u0007b\"");
    }

    #[test]
    fn json_str_preserves_unicode() {
        assert_eq!(json_str("日本語"), "\"日本語\"");
    }

    // ── shell_split ───────────────────────────────────────────────────────────

    // ── shell_quote ────────────────────────────────────────────────────────────

    #[test]
    fn shell_quote_safe_chars() {
        assert_eq!(shell_quote("hello"), "hello");
    }

    #[test]
    fn shell_quote_empty() {
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn shell_quote_spaces() {
        assert_eq!(shell_quote("hello world"), "'hello world'");
    }

    #[test]
    fn shell_quote_single_quote() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }

    #[test]
    fn shell_quote_special_chars() {
        assert_eq!(shell_quote("a;b"), "'a;b'");
    }

    // ── shell_split ───────────────────────────────────────────────────────────

    #[test]
    fn shell_split_basic() {
        assert_eq!(shell_split("hello world"), vec!["hello", "world"]);
    }

    #[test]
    fn shell_split_empty() {
        assert!(shell_split("").is_empty());
    }

    #[test]
    fn shell_split_quoted() {
        assert_eq!(shell_split("-p \"my prompt\""), vec!["-p", "my prompt"]);
    }

    #[test]
    fn shell_split_multiple_spaces() {
        assert_eq!(shell_split("a   b"), vec!["a", "b"]);
    }

    #[test]
    fn shell_split_single_arg() {
        assert_eq!(shell_split("hello"), vec!["hello"]);
    }

    #[test]
    fn shell_split_only_spaces() {
        assert!(shell_split("   ").is_empty());
    }

    #[test]
    fn shell_split_unclosed_quote() {
        // Unclosed quote — rest goes into one arg
        assert_eq!(shell_split("\"hello world"), vec!["hello world"]);
    }

    #[test]
    fn shell_split_multiple_quoted() {
        assert_eq!(
            shell_split("-p \"first prompt\" --flag \"second value\""),
            vec!["-p", "first prompt", "--flag", "second value"]
        );
    }

    // ── provider_key_env ──────────────────────────────────────────────────────

    #[test]
    fn provider_key_env_all_known() {
        assert_eq!(provider_key_env("openrouter"), "OPENROUTER_API_KEY");
        assert_eq!(provider_key_env("anthropic"), "ANTHROPIC_API_KEY");
        assert_eq!(provider_key_env("openai"), "OPENAI_API_KEY");
        assert_eq!(provider_key_env("groq"), "GROQ_API_KEY");
        assert_eq!(provider_key_env("deepseek"), "DEEPSEEK_API_KEY");
        assert_eq!(provider_key_env("zai"), "ZAI_API_KEY");
        assert_eq!(provider_key_env("mistral"), "MISTRAL_API_KEY");
        assert_eq!(provider_key_env("gemini"), "GEMINI_API_KEY");
    }

    #[test]
    fn provider_key_env_unknown_uppercases() {
        assert_eq!(provider_key_env("myprovider"), "MYPROVIDER_API_KEY");
    }

    // ── mask_key ────────────────────────────────────────────────────────────────

    #[test]
    fn mask_key_long() {
        assert_eq!(mask_key("abcdefghijk"), "abcd...hijk");
    }

    #[test]
    fn mask_key_eight_chars() {
        assert_eq!(mask_key("12345678"), "********");
    }

    #[test]
    fn mask_key_nine_chars() {
        assert_eq!(mask_key("123456789"), "1234...6789");
    }

    #[test]
    fn mask_key_short() {
        assert_eq!(mask_key("abc"), "***");
    }

    #[test]
    fn mask_key_empty() {
        assert_eq!(mask_key(""), "");
    }
}
