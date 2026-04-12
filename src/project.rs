use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::models::Instance;

/// Returns the env dir path for a given runtime + name inside a project.
/// e.g. project\.pi-env-myagent
pub fn env_dir(project: &Path, runtime: &str, name: &str) -> PathBuf {
    let prefix = match runtime {
        "claude"   => ".claude-env",
        "pi"       => ".pi-env",
        "opencode" => ".opencode-env",
        other      => return project.join(format!(".{other}-env-{name}")),
    };
    project.join(format!("{prefix}-{name}"))
}

pub fn load_instance(env_dir: &Path) -> Option<Instance> {
    let text = std::fs::read_to_string(env_dir.join(".helo.toml")).ok()?;
    toml::from_str(&text).ok()
}

pub fn save_instance(env_dir: &Path, inst: &Instance) -> Result<()> {
    std::fs::create_dir_all(env_dir)?;
    std::fs::write(
        env_dir.join(".helo.toml"),
        toml::to_string_pretty(inst)?,
    )
    .context("could not write .helo.toml")
}

/// Scan a project directory for all placed instances.
pub fn find_instances(project: &Path) -> Vec<(PathBuf, Instance)> {
    let prefixes = [".claude-env-", ".pi-env-", ".opencode-env-"];
    let Ok(entries) = std::fs::read_dir(project) else {
        return vec![];
    };
    let mut out = vec![];
    for entry in entries.flatten() {
        let fname = entry.file_name();
        let fname = fname.to_string_lossy();
        if prefixes.iter().any(|p| fname.starts_with(p)) {
            let dir = entry.path();
            if let Some(inst) = load_instance(&dir) {
                out.push((dir, inst));
            }
        }
    }
    out
}
