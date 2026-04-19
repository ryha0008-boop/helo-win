use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_with_keys_roundtrip() {
        let mut cfg = Config::default();
        cfg.blueprints.push(Blueprint {
            name: "test-bp".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "sonnet".into(),
            api_key: Some("sk-secret".into()),
            claude_md: Some("/path/to/md".into()),
        });
        cfg.keys.insert("zai".into(), "zai-key".into());
        cfg.keys.insert("openrouter".into(), "or-key".into());

        let toml = toml::to_string_pretty(&cfg).unwrap();
        let loaded: Config = toml::from_str(&toml).unwrap();

        assert_eq!(loaded.blueprints.len(), 1);
        assert_eq!(loaded.blueprints[0].name, "test-bp");
        assert_eq!(loaded.keys.len(), 2);
        assert_eq!(loaded.keys.get("zai").unwrap(), "zai-key");
    }

    #[test]
    fn blueprint_omits_none_fields() {
        let bp = Blueprint {
            name: "minimal".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "sonnet".into(),
            api_key: None,
            claude_md: None,
        };
        let toml = toml::to_string_pretty(&bp).unwrap();
        assert!(!toml.contains("api_key"));
        assert!(!toml.contains("claude_md"));
    }

    #[test]
    fn blueprint_includes_some_fields() {
        let bp = Blueprint {
            name: "full".into(),
            runtime: "claude".into(),
            provider: "zai".into(),
            model: "glm-5.1".into(),
            api_key: Some("key123".into()),
            claude_md: Some("coding".into()),
        };
        let toml = toml::to_string_pretty(&bp).unwrap();
        assert!(toml.contains("api_key"));
        assert!(toml.contains("claude_md"));
    }

    #[test]
    fn instance_roundtrip() {
        let inst = Instance {
            name: "my-inst".into(),
            runtime: "pi".into(),
            provider: "openrouter".into(),
            model: "gpt-4o".into(),
            api_key: Some("sk-test".into()),
            hooks: InstanceHooks::default(),
        };

        let toml = toml::to_string_pretty(&inst).unwrap();
        let loaded: Instance = toml::from_str(&toml).unwrap();

        assert_eq!(loaded.name, "my-inst");
        assert_eq!(loaded.runtime, "pi");
        assert_eq!(loaded.provider, "openrouter");
        assert_eq!(loaded.model, "gpt-4o");
        assert_eq!(loaded.api_key, Some("sk-test".into()));
    }

    #[test]
    fn instance_without_api_key_roundtrip() {
        let inst = Instance {
            name: "nokey".into(),
            runtime: "claude".into(),
            provider: "anthropic".into(),
            model: "haiku".into(),
            api_key: None,
            hooks: InstanceHooks::default(),
        };

        let toml = toml::to_string_pretty(&inst).unwrap();
        let loaded: Instance = toml::from_str(&toml).unwrap();

        assert_eq!(loaded.api_key, None);
    }

    #[test]
    fn instance_without_hooks_loads_all_enabled() {
        let toml_str = r#"
name = "old-inst"
runtime = "claude"
provider = "anthropic"
model = "sonnet"
"#;
        let inst: Instance = toml::from_str(toml_str).unwrap();
        assert!(inst.hooks.stop);
        assert!(inst.hooks.user_prompt_submit);
        assert!(inst.hooks.post_compact);
    }

    #[test]
    fn instance_hooks_roundtrip() {
        let inst = Instance {
            name: "hooks-test".into(),
            runtime: "claude".into(),
            provider: "zai".into(),
            model: "glm-5.1".into(),
            api_key: None,
            hooks: InstanceHooks { stop: false, user_prompt_submit: true, post_compact: false },
        };

        let toml = toml::to_string_pretty(&inst).unwrap();
        let loaded: Instance = toml::from_str(&toml).unwrap();

        assert!(!loaded.hooks.stop);
        assert!(loaded.hooks.user_prompt_submit);
        assert!(!loaded.hooks.post_compact);
    }
}

/// AI identity — runtime, provider, model. Stored globally.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blueprint {
    pub name: String,
    pub runtime: String, // "pi" | "claude" | "opencode"
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub model: String,
    /// API key stored in blueprint (optional — falls back to global key then env var).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Path to a CLAUDE.md template seeded into the env dir on first run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claude_md: Option<String>,
}

/// Per-instance hook toggle state. Stored in .helo.toml.
/// All hooks default to enabled for backward compat with old .helo.toml files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceHooks {
    #[serde(default = "default_true")]
    pub stop: bool,
    #[serde(default = "default_true")]
    pub user_prompt_submit: bool,
    #[serde(default = "default_true")]
    pub post_compact: bool,
}

fn default_true() -> bool { true }

impl Default for InstanceHooks {
    fn default() -> Self { Self { stop: true, user_prompt_submit: true, post_compact: true } }
}

/// A placed blueprint — self-contained copy stored inside the env dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub name: String,
    pub runtime: String,
    pub provider: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default)]
    pub hooks: InstanceHooks,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub blueprints: Vec<Blueprint>,
    /// Global API keys per provider. Auto-applied when creating blueprints.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub keys: HashMap<String, String>,
}
