use anyhow::{Context, Result};
use directories::ProjectDirs;
use std::path::PathBuf;

use crate::models::Config;

fn project_dirs() -> Result<directories::ProjectDirs> {
    ProjectDirs::from("", "", "helo").context("could not determine config directory")
}

pub fn config_path() -> Result<PathBuf> {
    Ok(project_dirs()?.config_dir().join("config.toml"))
}

/// Path to the user-defined settings defaults for a given runtime.
/// e.g. <config_dir>/defaults/claude.json
pub fn defaults_path(runtime: &str) -> Result<PathBuf> {
    Ok(project_dirs()?.config_dir().join("defaults").join(format!("{runtime}.json")))
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
