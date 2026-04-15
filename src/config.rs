use anyhow::{Context, Result};
use directories::ProjectDirs;
use std::path::PathBuf;

use crate::models::Config;

fn project_dirs() -> Result<directories::ProjectDirs> {
    ProjectDirs::from("", "", "helo").context("could not determine config directory")
}

/// Config directory — uses HELO_CONFIG_DIR env var if set, otherwise ProjectDirs.
fn config_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("HELO_CONFIG_DIR") {
        return Ok(PathBuf::from(dir));
    }
    Ok(project_dirs()?.config_dir().to_path_buf())
}

pub fn config_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("config.toml"))
}

/// Path to the user-defined settings defaults for a given runtime.
/// e.g. <config_dir>/defaults/claude.json
pub fn defaults_path(runtime: &str) -> Result<PathBuf> {
    Ok(config_dir()?.join("defaults").join(format!("{runtime}.json")))
}

/// Directory where built-in CLAUDE.md templates are stored.
pub fn templates_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("templates"))
}

/// Resolve a --claude-md value: if it's a known template name (no path separators,
/// no extension), look up <templates_dir>/<name>.md; otherwise treat as a file path.
pub fn resolve_claude_md(value: &str) -> Result<PathBuf> {
    let is_name = !value.contains('/') && !value.contains('\\') && !value.contains('.');
    if is_name {
        let path = templates_dir()?.join(format!("{value}.md"));
        if path.exists() {
            return Ok(path);
        }
        anyhow::bail!(
            "unknown template '{value}'. Run: helo templates list"
        );
    }
    Ok(PathBuf::from(value))
}

pub fn load() -> Result<Config> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let text = std::fs::read_to_string(&path)
        .with_context(|| format!("could not read {}", path.display()))?;
    toml::from_str(&text).context("could not parse config.toml")
}

pub fn save(config: &Config) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, toml::to_string_pretty(config)?)
        .with_context(|| format!("could not write {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_claude_md_file_path_passes_through() {
        let result = resolve_claude_md("/some/path/to/file.md");
        assert_eq!(result.unwrap(), std::path::PathBuf::from("/some/path/to/file.md"));
    }

    #[test]
    fn resolve_claude_md_dot_extension_treated_as_path() {
        let result = resolve_claude_md("my.template");
        assert_eq!(result.unwrap(), std::path::PathBuf::from("my.template"));
    }
}
