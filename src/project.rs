use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::{config, models::Instance};

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

pub fn save_instance(env_dir: &Path, inst: &Instance, claude_md: Option<&str>) -> Result<()> {
    std::fs::create_dir_all(env_dir)?;
    std::fs::write(
        env_dir.join(".helo.toml"),
        toml::to_string_pretty(inst)?,
    )
    .context("could not write .helo.toml")?;

    // Seed CLAUDE.md if a template was provided and none exists yet.
    if let Some(content) = claude_md {
        let claude_md_path = env_dir.join("CLAUDE.md");
        if !claude_md_path.exists() {
            std::fs::write(&claude_md_path, content)
                .context("could not write CLAUDE.md")?;
        }
    }

    // Claude reads settings from CLAUDE_CONFIG_DIR/settings.json.
    // Without this file the model from the blueprint is silently ignored.
    if inst.runtime == "claude" {
        let settings_path = env_dir.join("settings.json");
        if !settings_path.exists() {
            let content = match config::defaults_path("claude") {
                Ok(p) if p.exists() => std::fs::read_to_string(&p)
                    .with_context(|| format!("could not read defaults {}", p.display()))?,
                _ => {
                    // Built-in fallback template.
                    // Two-hook pattern: Stop writes a flag file; UserPromptSubmit
                    // reads it and injects additionalContext (Stop doesn't support that field).
                    let stop_cmd = r#"code_t=$(git log -1 --format="%ct" 2>/dev/null); doc_t=$(git log -1 --format="%ct" -- CLAUDE.md 2>/dev/null); [ -n "$code_t" ] && [ "${code_t:-0}" -gt "${doc_t:-0}" ] && touch .git/claude-md-stale || true"#;
                    let ups_cmd = r#"if [ -f .git/claude-md-stale ]; then rm .git/claude-md-stale; printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"CLAUDE.md is behind code commits — update it before doing anything else this turn."}}'; fi"#;
                    let stop_cmd_json = stop_cmd.replace('"', "\\\"");
                    let ups_cmd_json = ups_cmd.replace('"', "\\\"");
                    format!(
                        r#"{{
  "model": "{}",
  "skipDangerousModePermissionPrompt": true,
  "permissions": {{
    "defaultMode": "bypassPermissions"
  }},
  "hooks": {{
    "Stop": [
      {{
        "hooks": [
          {{
            "type": "command",
            "command": "{}"
          }}
        ]
      }}
    ],
    "UserPromptSubmit": [
      {{
        "hooks": [
          {{
            "type": "command",
            "command": "{}"
          }}
        ]
      }}
    ]
  }}
}}
"#,
                        inst.model, stop_cmd_json, ups_cmd_json
                    )
                }
            };
            std::fs::write(&settings_path, content)
                .context("could not write settings.json")?;
        }
    }

    Ok(())
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
