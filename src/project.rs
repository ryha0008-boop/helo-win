use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::{config, models::Instance};

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
            // ZAI provider always uses the built-in template (needs env block).
            // Non-ZAI respects user defaults if set.
            let content = if inst.provider == "zai" {
                build_zai_settings(inst)
            } else {
                match config::defaults_path("claude") {
                    Ok(p) if p.exists() => std::fs::read_to_string(&p)
                        .with_context(|| format!("could not read defaults {}", p.display()))?,
                    _ => build_default_settings(inst),
                }
            };
            std::fs::write(&settings_path, content)
                .context("could not write settings.json")?;
        }
    }

    Ok(())
}

/// Build settings.json for ZAI provider — includes env block with API routing.
fn build_zai_settings(inst: &Instance) -> String {
    let stop_cmd = r#"code_t=$(git log -1 --format="%ct" 2>/dev/null); doc_t=$(git log -1 --format="%ct" -- CLAUDE.md 2>/dev/null); [ -n "$code_t" ] && [ "${code_t:-0}" -gt "${doc_t:-0}" ] && touch .git/claude-md-stale || true"#;
    let ups_cmd = r#"ctx=""; if [ -f .git/claude-md-stale ]; then rm .git/claude-md-stale; ctx="CLAUDE.md is behind code commits — update it before doing anything else this turn."; fi; if [ -f "$CLAUDE_CONFIG_DIR/CLAUDE.md" ]; then ctx="${ctx:+$ctx }Follow the terse coding style rules in your CLAUDE.md global instructions. No filler words, fragments only."; fi; if [ -n "$ctx" ]; then printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}' "$ctx"; fi"#;
    let stop_cmd_json = stop_cmd.replace('"', "\\\"");
    let ups_cmd_json = ups_cmd.replace('"', "\\\"");
    let api_key = inst.api_key.as_deref().unwrap_or("");
    format!(
        r#"{{
  "env": {{
    "ANTHROPIC_AUTH_TOKEN": {},
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": {},
    "ANTHROPIC_DEFAULT_SONNET_MODEL": {},
    "ANTHROPIC_DEFAULT_OPUS_MODEL": {}
  }},
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
  }},
  "effortLevel": "high"
}}
"#,
        json_str(api_key),
        json_str(&inst.model),
        json_str(&inst.model),
        json_str(&inst.model),
        stop_cmd_json, ups_cmd_json
    )
}

/// Build default settings.json for non-ZAI Claude envs.
fn build_default_settings(inst: &Instance) -> String {
    let stop_cmd = r#"code_t=$(git log -1 --format="%ct" 2>/dev/null); doc_t=$(git log -1 --format="%ct" -- CLAUDE.md 2>/dev/null); [ -n "$code_t" ] && [ "${code_t:-0}" -gt "${doc_t:-0}" ] && touch .git/claude-md-stale || true"#;
    let ups_cmd = r#"ctx=""; if [ -f .git/claude-md-stale ]; then rm .git/claude-md-stale; ctx="CLAUDE.md is behind code commits — update it before doing anything else this turn."; fi; if [ -f "$CLAUDE_CONFIG_DIR/CLAUDE.md" ]; then ctx="${ctx:+$ctx }Follow the terse coding style rules in your CLAUDE.md global instructions. No filler words, fragments only."; fi; if [ -n "$ctx" ]; then printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}' "$ctx"; fi"#;
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // Guard to clean up HELO_CONFIG_DIR after tests that set it
    struct ConfigTestGuard;
    impl Drop for ConfigTestGuard {
        fn drop(&mut self) {
            std::env::remove_var("HELO_CONFIG_DIR");
        }
    }

    fn make_instance(name: &str, runtime: &str) -> Instance {
        Instance {
            name: name.into(),
            runtime: runtime.into(),
            provider: "anthropic".into(),
            model: "sonnet".into(),
            api_key: None,
        }
    }

    // ── env_dir ───────────────────────────────────────────────────────────────

    #[test]
    fn env_dir_claude() {
        assert_eq!(
            env_dir(Path::new("/project"), "claude", "myagent"),
            PathBuf::from("/project/.claude-env-myagent")
        );
    }

    #[test]
    fn env_dir_pi() {
        assert_eq!(
            env_dir(Path::new("/project"), "pi", "myagent"),
            PathBuf::from("/project/.pi-env-myagent")
        );
    }

    #[test]
    fn env_dir_opencode() {
        assert_eq!(
            env_dir(Path::new("/project"), "opencode", "myagent"),
            PathBuf::from("/project/.opencode-env-myagent")
        );
    }

    #[test]
    fn env_dir_unknown_runtime() {
        assert_eq!(
            env_dir(Path::new("/project"), "custom", "myagent"),
            PathBuf::from("/project/.custom-env-myagent")
        );
    }

    // ── save_instance / load_instance round-trip ──────────────────────────────

    #[test]
    fn roundtrip_with_api_key() {
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "test".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "sonnet".into(),
            api_key: Some("sk-123".into()),
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        let loaded = load_instance(tmp.path()).unwrap();
        assert_eq!(loaded.name, "test");
        assert_eq!(loaded.runtime, "claude");
        assert_eq!(loaded.provider, "anthropic");
        assert_eq!(loaded.model, "sonnet");
        assert_eq!(loaded.api_key, Some("sk-123".into()));
    }

    #[test]
    fn roundtrip_without_api_key() {
        let tmp = TempDir::new().unwrap();
        let inst = make_instance("test", "pi");
        save_instance(tmp.path(), &inst, None).unwrap();
        let loaded = load_instance(tmp.path()).unwrap();
        assert!(loaded.api_key.is_none());
    }

    #[test]
    fn load_missing_dir_returns_none() {
        assert!(load_instance(Path::new("/nonexistent")).is_none());
    }

    #[test]
    fn load_missing_helo_toml_returns_none() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude-env-orph")).unwrap();
        assert!(load_instance(&tmp.path().join(".claude-env-orph")).is_none());
    }

    // ── settings.json generation (claude only) ────────────────────────────────

    #[test]
    fn settings_json_created_for_claude() {
        let cfg_tmp = TempDir::new().unwrap();
        std::env::set_var("HELO_CONFIG_DIR", cfg_tmp.path());
        let _guard = ConfigTestGuard;
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "test".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "sonnet-4".into(),
            api_key: None,
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        let settings = std::fs::read_to_string(tmp.path().join("settings.json")).unwrap();
        // Content comes from user defaults or built-in template — just verify it's valid JSON with model key
        let parsed: serde_json::Value = serde_json::from_str(&settings)
            .expect("settings.json should be valid JSON");
        assert!(parsed.get("model").is_some(), "settings.json must have a model field");
    }

    #[test]
    fn settings_json_hooks_contain_stale_flag_logic() {
        let cfg_tmp = TempDir::new().unwrap();
        std::env::set_var("HELO_CONFIG_DIR", cfg_tmp.path());
        let _guard = ConfigTestGuard;
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "test".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "sonnet".into(),
            api_key: None,
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        let settings = std::fs::read_to_string(tmp.path().join("settings.json")).unwrap();
        // Stop hook creates .git/claude-md-stale flag file
        // UPS hook removes flag and adds additionalContext
        assert!(
            settings.contains("claude-md-stale"),
            "settings should contain claude-md-stale. Actual: {}",
            settings
        );
        assert!(settings.contains("additionalContext"));
    }

    #[test]
    fn settings_json_valid_json() {
        let cfg_tmp = TempDir::new().unwrap();
        std::env::set_var("HELO_CONFIG_DIR", cfg_tmp.path());
        let _guard = ConfigTestGuard;
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "test".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "sonnet".into(),
            api_key: None,
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        let settings = std::fs::read_to_string(tmp.path().join("settings.json")).unwrap();
        // Should parse as valid JSON
        let _: serde_json::Value = serde_json::from_str(&settings)
            .expect("settings.json should be valid JSON");
    }

    #[test]
    fn no_settings_for_non_claude_runtime() {
        let tmp = TempDir::new().unwrap();
        let inst = make_instance("test", "pi");
        save_instance(tmp.path(), &inst, None).unwrap();
        assert!(!tmp.path().join("settings.json").exists());
    }

    #[test]
    fn settings_not_overwritten_on_resave() {
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "test".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "old-model".into(),
            api_key: None,
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        // Manually modify settings
        std::fs::write(tmp.path().join("settings.json"), "{\"custom\": true}").unwrap();
        // Re-save with different model — settings.json should NOT change
        let inst2 = Instance {
            name: "test".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "new-model".into(),
            api_key: None,
        };
        save_instance(tmp.path(), &inst2, None).unwrap();
        let content = std::fs::read_to_string(tmp.path().join("settings.json")).unwrap();
        assert_eq!(content, "{\"custom\": true}");
    }

    // ── ZAI settings.json ────────────────────────────────────────────────────

    #[test]
    fn zai_settings_json_env_block() {
        let cfg_tmp = TempDir::new().unwrap();
        std::env::set_var("HELO_CONFIG_DIR", cfg_tmp.path());
        let _guard = ConfigTestGuard;
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "zai-test".into(),
            runtime: "claude".into(),
            provider: "zai".into(),
            model: "glm-5.1".into(),
            api_key: Some("test-key-123".into()),
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        let settings = std::fs::read_to_string(tmp.path().join("settings.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&settings)
            .expect("settings.json should be valid JSON");
        // env block present
        let env = parsed.get("env").expect("must have env block");
        assert_eq!(env["ANTHROPIC_BASE_URL"], "https://api.z.ai/api/anthropic");
        assert_eq!(env["ANTHROPIC_AUTH_TOKEN"], "test-key-123");
        assert_eq!(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"], "glm-5.1");
        assert_eq!(env["ANTHROPIC_DEFAULT_SONNET_MODEL"], "glm-5.1");
        assert_eq!(env["ANTHROPIC_DEFAULT_OPUS_MODEL"], "glm-5.1");
        // effortLevel
        assert_eq!(parsed["effortLevel"], "high");
        // hooks present
        assert!(parsed.get("hooks").is_some());
    }

    #[test]
    fn zai_settings_json_no_key() {
        let cfg_tmp = TempDir::new().unwrap();
        std::env::set_var("HELO_CONFIG_DIR", cfg_tmp.path());
        let _guard = ConfigTestGuard;
        let tmp = TempDir::new().unwrap();
        let inst = Instance {
            name: "zai-nokey".into(),
            runtime: "claude".into(),
            provider: "zai".into(),
            model: "glm-5.1".into(),
            api_key: None,
        };
        save_instance(tmp.path(), &inst, None).unwrap();
        let settings = std::fs::read_to_string(tmp.path().join("settings.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&settings).unwrap();
        // Empty string when no key stored (falls back to env var at runtime)
        assert_eq!(parsed["env"]["ANTHROPIC_AUTH_TOKEN"], "");
    }

    // ── CLAUDE.md seeding ─────────────────────────────────────────────────────

    #[test]
    fn claude_md_seeded_when_provided() {
        let tmp = TempDir::new().unwrap();
        let inst = make_instance("test", "claude");
        save_instance(tmp.path(), &inst, Some("# My instructions\nBe helpful.")).unwrap();
        let content = std::fs::read_to_string(tmp.path().join("CLAUDE.md")).unwrap();
        assert_eq!(content, "# My instructions\nBe helpful.");
    }

    #[test]
    fn claude_md_not_overwritten_on_resave() {
        let tmp = TempDir::new().unwrap();
        let inst = make_instance("test", "claude");
        save_instance(tmp.path(), &inst, Some("# Original")).unwrap();
        save_instance(tmp.path(), &inst, Some("# New")).unwrap();
        let content = std::fs::read_to_string(tmp.path().join("CLAUDE.md")).unwrap();
        assert_eq!(content, "# Original");
    }

    #[test]
    fn claude_md_not_created_when_none() {
        let tmp = TempDir::new().unwrap();
        let inst = make_instance("test", "claude");
        save_instance(tmp.path(), &inst, None).unwrap();
        assert!(!tmp.path().join("CLAUDE.md").exists());
    }

    // ── find_instances ────────────────────────────────────────────────────────

    #[test]
    fn find_instances_empty_dir() {
        let tmp = TempDir::new().unwrap();
        assert!(find_instances(tmp.path()).is_empty());
    }

    #[test]
    fn find_instances_finds_valid_env() {
        let tmp = TempDir::new().unwrap();
        let env = tmp.path().join(".claude-env-test");
        let inst = make_instance("test", "claude");
        save_instance(&env, &inst, None).unwrap();

        let found = find_instances(tmp.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].1.name, "test");
        assert_eq!(found[0].0, env);
    }

    #[test]
    fn find_instances_multiple_runtimes() {
        let tmp = TempDir::new().unwrap();
        let c_inst = make_instance("agent1", "claude");
        let p_inst = Instance {
            name: "agent2".into(),
            runtime: "pi".into(),
            provider: "openrouter".into(),
            model: "gpt-4o".into(),
            api_key: None,
        };
        save_instance(&tmp.path().join(".claude-env-agent1"), &c_inst, None).unwrap();
        save_instance(&tmp.path().join(".pi-env-agent2"), &p_inst, None).unwrap();

        let found = find_instances(tmp.path());
        assert_eq!(found.len(), 2);
    }

    #[test]
    fn find_instances_skips_dirs_without_helo_toml() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude-env-broken")).unwrap();
        assert!(find_instances(tmp.path()).is_empty());
    }

    #[test]
    fn find_instances_skips_non_env_dirs() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("target")).unwrap();
        std::fs::create_dir_all(tmp.path().join(".git")).unwrap();
        assert!(find_instances(tmp.path()).is_empty());
    }
}
