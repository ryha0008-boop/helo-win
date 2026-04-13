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
        /// Provider name (e.g. openrouter, anthropic, openai)
        #[arg(long)]
        provider: String,
        /// Model ID (e.g. openai/gpt-4o, claude-sonnet-4-6)
        #[arg(long)]
        model: String,
    },
    /// List all blueprints
    List,
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
    Status,
    /// Remove a runtime's global config directory (clean reinstall)
    Clean {
        /// Runtime to clean: pi, claude, or opencode
        runtime: String,
        /// Skip confirmation prompt
        #[arg(short, long)]
        yes: bool,
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
        Commands::Add { name, runtime, provider, model } => cmd_add(name, runtime, provider, model),
        Commands::List => cmd_list(),
        Commands::Remove { name } => cmd_remove(name),
        Commands::Run { name, resume, extra } => cmd_run(name, resume, extra),
        Commands::Status => cmd_status(),
        Commands::Clean { runtime, yes } => cmd_clean(&runtime, yes),
    }
}

fn cmd_add(name: String, runtime: String, provider: String, model: String) -> Result<()> {
    let mut cfg = config::load()?;
    if cfg.blueprints.iter().any(|b| b.name == name) {
        bail!("blueprint '{name}' already exists. Remove it first with: helo remove {name}");
    }
    cfg.blueprints.push(models::Blueprint { name: name.clone(), runtime, provider, model });
    config::save(&cfg)?;
    println!("Added blueprint '{name}'.");
    Ok(())
}

fn cmd_list() -> Result<()> {
    let cfg = config::load()?;
    if cfg.blueprints.is_empty() {
        println!("No blueprints. Add one with:");
        println!("  helo add <name> --runtime pi --provider openrouter --model openai/gpt-4o");
        return Ok(());
    }
    println!("{:<20} {:<10} {:<15} {}", "NAME", "RUNTIME", "PROVIDER", "MODEL");
    println!("{}", "-".repeat(65));
    for b in &cfg.blueprints {
        println!("{:<20} {:<10} {:<15} {}", b.name, b.runtime, b.provider, b.model);
    }
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
                };
                project::save_instance(&env_dir, &inst)?;
                println!("Created: {}", env_dir.display());
            }
            launch(&bp.runtime, &bp.provider, &bp.model, &env_dir, resume.as_ref(), &extra)
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
                    launch(&inst.runtime, &inst.provider, &inst.model, env_dir, resume.as_ref(), &extra)
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

fn launch(runtime: &str, provider: &str, model: &str, env_dir: &Path, resume: Option<&Option<String>>, extra: &[String]) -> Result<()> {
    let mut cmd = match runtime {
        "claude" => {
            let mut c = std::process::Command::new("claude");
            c.env("CLAUDE_CONFIG_DIR", env_dir);
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

fn cmd_status() -> Result<()> {
    let path = config::config_path()?;
    println!("Config: {}", path.display());

    let cfg = config::load()?;
    println!("Blueprints: {}", cfg.blueprints.len());

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
