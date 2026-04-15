mod config;
mod models;
mod project;

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
#[command(name = "helo", about = "Isolated AI agent environments — like venvs for AI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
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
    /// Remove a runtime's global config directory (clean reinstall)
    Clean {
        /// Runtime to clean: pi, claude, or opencode
        runtime: String,
        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
    },
    /// Manage default settings seeded into new environments
    Defaults {
        #[command(subcommand)]
        sub: DefaultsCommands,
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
enum DefaultsCommands {
    /// Copy a settings file as the default for a runtime
    Set {
        /// Runtime: pi, claude, or opencode
        runtime: String,
        /// Path to the settings file to use as default
        path: String,
    },
    /// Show the current default settings for a runtime
    Show {
        /// Runtime: pi, claude, or opencode
        runtime: String,
    },
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
    // No subcommand → interactive mode
    if std::env::args().len() == 1 {
        if let Err(e) = run_interactive() {
            eprintln!("error: {e:#}");
            std::process::exit(1);
        }
        return;
    }
    if let Err(e) = run() {
        eprintln!("error: {e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Add { name, runtime, provider, model, api_key, claude_md } => cmd_add(name, runtime, provider, model, api_key, claude_md),
        Commands::List { json } => cmd_list(json),
        Commands::Remove { name } => cmd_remove(name),
        Commands::Key { name, key } => cmd_key(name, key),
        Commands::Run { name, resume, extra } => cmd_run(name, resume, extra),
        Commands::Status { json } => cmd_status(json),
        Commands::Clean { runtime, yes } => cmd_clean(&runtime, yes),
        Commands::Defaults { sub } => match sub {
            DefaultsCommands::Set { runtime, path } => cmd_defaults_set(&runtime, &path),
            DefaultsCommands::Show { runtime } => cmd_defaults_show(&runtime),
        },
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
    }
}

fn cmd_add(name: String, runtime: String, provider: String, model: String, api_key: Option<String>, claude_md: Option<String>) -> Result<()> {
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
            print!(
                "{{\"name\":{},\"runtime\":{},\"provider\":{},\"model\":{},\"claude_md\":{}}}",
                json_str(&b.name),
                json_str(&b.runtime),
                json_str(&b.provider),
                json_str(&b.model),
                b.claude_md.as_deref().map(json_str).unwrap_or_else(|| "null".to_string()),
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

/// Minimal JSON string encoder — escapes the chars required by RFC 8259.
fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"'  => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
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

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "*".repeat(key.len())
    } else {
        format!("{}...{}", &key[..4], &key[key.len()-4..])
    }
}

fn cmd_run(name: Option<String>, resume: Option<Option<String>>, extra: Vec<String>) -> Result<()> {
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
            if !env_dir.exists() {
                let inst = models::Instance {
                    name: bp.name.clone(),
                    runtime: bp.runtime.clone(),
                    provider: bp.provider.clone(),
                    model: bp.model.clone(),
                    api_key: bp.api_key.clone(),
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
            launch(&bp.runtime, &bp.provider, &bp.model, bp.api_key.as_deref(), &env_dir, resume.as_ref(), &extra)?
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
    match runtime {
        "claude" => {
            let mut c = std::process::Command::new("claude");
            c.env("CLAUDE_CONFIG_DIR", env_dir);

            match provider {
                "zai" => {
                    c.env("ANTHROPIC_BASE_URL", "https://api.z.ai/api/anthropic");
                    let key = api_key
                        .map(str::to_string)
                        .or_else(|| std::env::var("ZAI_API_KEY").ok().filter(|v| !v.is_empty()))
                        .unwrap_or_default();
                    if !key.is_empty() {
                        c.env("ANTHROPIC_AUTH_TOKEN", &key);
                    }
                    c.env("ANTHROPIC_DEFAULT_HAIKU_MODEL", model);
                    c.env("ANTHROPIC_DEFAULT_SONNET_MODEL", model);
                    c.env("ANTHROPIC_DEFAULT_OPUS_MODEL", model);
                }
                _ => {
                    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
                        c.env("ANTHROPIC_API_KEY", key);
                    }
                }
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
            let mut pi_args = format!("pi --provider {provider} --model {model}");
            if !api_key_val.is_empty() {
                pi_args.push_str(&format!(" --api-key {api_key_val}"));
            }
            if let Some(Some(id)) = resume {
                pi_args.push_str(&format!(" --resume {id}"));
            }
            for arg in extra {
                pi_args.push(' ');
                pi_args.push_str(arg);
            }
            let mut c = std::process::Command::new("cmd");
            c.env("PI_CODING_AGENT_DIR", env_dir);
            c.args(["/c", &pi_args]);
            let status = c
                .status()
                .with_context(|| "could not launch pi via cmd.exe")?;
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
    match provider {
        "openrouter" => "OPENROUTER_API_KEY",
        "anthropic"  => "ANTHROPIC_API_KEY",
        "openai"     => "OPENAI_API_KEY",
        "groq"       => "GROQ_API_KEY",
        "deepseek"   => "DEEPSEEK_API_KEY",
        "zai"        => "ZAI_API_KEY",
        "mistral"    => "MISTRAL_API_KEY",
        "gemini"     => "GEMINI_API_KEY",
        other        => return format!("{}_API_KEY", other.to_uppercase()),
    }
    .to_string()
}

fn cmd_clean(runtime: &str, yes: bool) -> Result<()> {
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
        print!(
            "Delete {} and all its contents? [y/N] ",
            global_dir.display()
        );
        use std::io::Write;
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Aborted.");
            return Ok(());
        }
    }

    std::fs::remove_dir_all(&global_dir)
        .with_context(|| format!("could not remove {}", global_dir.display()))?;
    println!("Removed {}.", global_dir.display());
    Ok(())
}

fn cmd_defaults_set(runtime: &str, path: &str) -> Result<()> {
    let src = std::path::Path::new(path);
    let content = std::fs::read_to_string(src)
        .with_context(|| format!("could not read {path}"))?;
    let dest = config::defaults_path(runtime)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&dest, content)
        .with_context(|| format!("could not write {}", dest.display()))?;
    println!("Saved defaults for '{runtime}': {}", dest.display());
    Ok(())
}

fn cmd_defaults_show(runtime: &str) -> Result<()> {
    let path = config::defaults_path(runtime)?;
    if !path.exists() {
        println!("No defaults set for '{runtime}'. Use: helo defaults set {runtime} <settings.json>");
        return Ok(());
    }
    println!("Defaults for '{runtime}' ({})\n", path.display());
    print!("{}", std::fs::read_to_string(&path)?);
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
        print!("\"config_path\":{},", json_str(&path.display().to_string()));
        print!("\"blueprints\":{},", cfg.blueprints.len());
        print!("\"api_keys\":{{");
        for (i, (env, label)) in keys.iter().enumerate() {
            if i > 0 { print!(","); }
            let set = std::env::var(env).map(|v| !v.is_empty()).unwrap_or(false);
            print!("{}:{}", json_str(label), set);
        }
        print!("}}");
        println!("}}");
        return Ok(());
    }

    println!("Config: {}", path.display());
    println!("Blueprints: {}", cfg.blueprints.len());
    println!("\nAPI keys:");
    for (env, label) in &keys {
        let status = if std::env::var(env).map(|v| !v.is_empty()).unwrap_or(false) {
            "set"
        } else {
            "not set"
        };
        println!("  {:<20} {}", label, status);
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
    println!("helo — AI agent environment manager  (q to quit)");
    loop {
        let cfg = config::load()?;
        println!();
        println!("─────────────────────────────────────────────");
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
        println!("  k  set api key       g  global keys");
        println!("  s  status            c  clean runtime");
        println!("  t  templates         x  defaults");
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
            "k" => {
                if cfg.blueprints.is_empty() {
                    println!("No blueprints.");
                } else if let Err(e) = interactive_set_key() {
                    println!("error: {e:#}");
                }
            }
            "d" => {
                if cfg.blueprints.is_empty() {
                    println!("No blueprints to delete.");
                } else if let Err(e) = interactive_delete() {
                    println!("error: {e:#}");
                }
            }
            "s" => { if let Err(e) = cmd_status(false)        { println!("error: {e:#}"); } }
            "g" => { if let Err(e) = interactive_keys()       { println!("error: {e:#}"); } }
            "t" => { if let Err(e) = interactive_templates()  { println!("error: {e:#}"); } }
            "c" => { if let Err(e) = interactive_clean()      { println!("error: {e:#}"); } }
            "x" => { if let Err(e) = interactive_defaults()   { println!("error: {e:#}"); } }
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

    let extra_input = iread("Extra args (e.g. -p \"prompt\") [blank=none]: ")?;
    let extra = if extra_input.is_empty() { vec![] } else { shell_split(&extra_input) };

    let env_dir = project::env_dir(&project_dir, &bp.runtime, &bp.name);
    if !env_dir.exists() {
        let inst = models::Instance {
            name: bp.name.clone(),
            runtime: bp.runtime.clone(),
            provider: bp.provider.clone(),
            model: bp.model.clone(),
            api_key: bp.api_key.clone(),
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

    let code = launch(&bp.runtime, &bp.provider, &bp.model, bp.api_key.as_deref(), &env_dir, resume.as_ref(), &extra)?;
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

fn interactive_set_key() -> Result<()> {
    let cfg = config::load()?;
    println!("Set API key:");
    for (i, b) in cfg.blueprints.iter().enumerate() {
        let has_key = if b.api_key.is_some() { " [key stored]" } else { "" };
        println!("  {}  {}{}", i + 1, b.name, has_key);
    }
    let input = iread("Number [blank=cancel]: ")?;
    if input.is_empty() { return Ok(()); }
    let n: usize = input.parse().context("enter a number")?;
    if n < 1 || n > cfg.blueprints.len() { bail!("no blueprint #{n}"); }
    let name = cfg.blueprints[n - 1].name.clone();
    let key = iread(&format!("Key for '{name}' [blank=clear]: "))?;
    cmd_key(name, key)
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
    let runtime = iread("Runtime to clean [claude/pi/opencode, blank=cancel]: ")?;
    if runtime.is_empty() { return Ok(()); }
    cmd_clean(&runtime, false)
}

fn interactive_defaults() -> Result<()> {
    loop {
        println!();
        println!("  show <runtime>        — print current defaults");
        println!("  set <runtime> <path>  — set defaults from file");
        println!("  q                     — back");
        let input = iread("> ")?;
        let parts: Vec<&str> = input.splitn(3, ' ').collect();
        match parts.as_slice() {
            [cmd] if cmd.eq_ignore_ascii_case("q") || cmd.is_empty() => break,
            ["show", runtime] | ["show", runtime, _] => {
                if let Err(e) = cmd_defaults_show(runtime) { println!("error: {e}"); }
            }
            ["set", runtime, path] => {
                if let Err(e) = cmd_defaults_set(runtime, path) { println!("error: {e}"); }
            }
            _ => println!("Unknown: '{input}'"),
        }
    }
    Ok(())
}

fn interactive_keys() -> Result<()> {
    loop {
        println!();
        let cfg = config::load()?;
        if cfg.keys.is_empty() {
            println!("  (no global keys)");
        } else {
            println!("{:<15} {}", "PROVIDER", "KEY");
            println!("  {}", "-".repeat(36));
            for (provider, key) in &cfg.keys {
                println!("  {:<15} {}", provider, mask_key(key));
            }
        }
        println!();
        println!("  set <provider> <key>  — add or update");
        println!("  remove <provider>     — delete");
        println!("  q                     — back");
        let input = iread("> ")?;
        let parts: Vec<&str> = input.splitn(3, ' ').collect();
        match parts.as_slice() {
            [cmd] if cmd.eq_ignore_ascii_case("q") || cmd.is_empty() => break,
            ["set", provider, key] => {
                if let Err(e) = cmd_keys_set(provider, key) { println!("error: {e}"); }
            }
            ["remove", provider] | ["rm", provider] => {
                if let Err(e) = cmd_keys_remove(provider) { println!("error: {e}"); }
            }
            _ => println!("Unknown: '{input}'"),
        }
    }
    Ok(())
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
