mod config;
mod models;
mod project;

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

fn main() {
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
        Commands::Run { name, resume, extra } => cmd_run(name, resume, extra),
        Commands::Status { json } => cmd_status(json),
        Commands::Clean { runtime, yes } => cmd_clean(&runtime, yes),
        Commands::Defaults { sub } => match sub {
            DefaultsCommands::Set { runtime, path } => cmd_defaults_set(&runtime, &path),
            DefaultsCommands::Show { runtime } => cmd_defaults_show(&runtime),
        },
    }
}

fn cmd_add(name: String, runtime: String, provider: String, model: String, api_key: Option<String>, claude_md: Option<String>) -> Result<()> {
    if let Some(ref path) = claude_md {
        if !std::path::Path::new(path).exists() {
            bail!("--claude-md file not found: {path}");
        }
    }
    let mut cfg = config::load()?;
    if cfg.blueprints.iter().any(|b| b.name == name) {
        bail!("blueprint '{name}' already exists. Remove it first with: helo remove {name}");
    }
    cfg.blueprints.push(models::Blueprint { name: name.clone(), runtime, provider, model, api_key, claude_md });
    config::save(&cfg)?;
    println!("Added blueprint '{name}'.");
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

fn cmd_run(name: Option<String>, resume: Option<Option<String>>, extra: Vec<String>) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let cfg = config::load()?;

    match name {
        Some(n) => {
            // Named: place if needed, then run.
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
            launch(&bp.runtime, &bp.provider, &bp.model, bp.api_key.as_deref(), &env_dir, resume.as_ref(), &extra)
        }
        None => {
            // No name: auto-detect from instances already placed in cwd.
            let instances = project::find_instances(&cwd);
            match instances.len() {
                0 => bail!(
                    "no instances in current directory.\n\
                     Add a blueprint: helo add <name> --runtime pi --provider openrouter --model <model>\n\
                     Then run:        helo run <name>"
                ),
                1 => {
                    let (env_dir, inst) = &instances[0];
                    launch(&inst.runtime, &inst.provider, &inst.model, inst.api_key.as_deref(), env_dir, resume.as_ref(), &extra)
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
    }
}

fn launch(runtime: &str, provider: &str, model: &str, api_key: Option<&str>, env_dir: &Path, resume: Option<&Option<String>>, extra: &[String]) -> Result<()> {
    let mut cmd = match runtime {
        "claude" => {
            let mut c = std::process::Command::new("claude");
            c.env("CLAUDE_CONFIG_DIR", env_dir);

            // Provider-specific API routing for claude runtime.
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
                    // Route all Claude model tiers to the blueprint model (default: glm-5.1).
                    c.env("ANTHROPIC_DEFAULT_HAIKU_MODEL", model);
                    c.env("ANTHROPIC_DEFAULT_SONNET_MODEL", model);
                    c.env("ANTHROPIC_DEFAULT_OPUS_MODEL", model);
                }
                _ => {
                    // Default Anthropic — use stored key or ANTHROPIC_API_KEY env var.
                    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
                        c.env("ANTHROPIC_API_KEY", key);
                    }
                }
            }

            // --resume <id>  → resume specific session
            // --resume       → --continue (most recent)
            if let Some(r) = resume {
                match r {
                    Some(id) => { c.args(["--resume", id]); }
                    None     => { c.arg("--continue"); }
                }
            }
            c
        }
        "pi" => {
            // On Windows, npm CLI wrappers are .cmd files — must go through cmd.exe.
            let key_env = provider_key_env(provider);
            let api_key = std::env::var(&key_env).unwrap_or_default();
            let mut pi_args = format!(
                "pi --provider {provider} --model {model}"
            );
            if !api_key.is_empty() {
                pi_args.push_str(&format!(" --api-key {api_key}"));
            }
            // pi resume: pass through as-is if a session id is given
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
            // extra already embedded above; skip the outer cmd.args(extra) call
            let code = c
                .status()
                .with_context(|| "could not launch pi via cmd.exe")?
                .code()
                .unwrap_or(1);
            std::process::exit(code);
        }
        "opencode" => {
            let mut c = std::process::Command::new("opencode");
            c.env("OPENCODE_CONFIG", env_dir);
            if let Some(Some(id)) = resume {
                c.args(["--continue", id]);
            }
            c
        }
        other => bail!("unknown runtime '{other}'. Supported: pi, claude, opencode"),
    };

    cmd.args(extra);

    let status = cmd
        .status()
        .with_context(|| format!("could not launch '{runtime}' — is it installed and in PATH?"))?;

    std::process::exit(status.code().unwrap_or(1));
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
