use serde::{Deserialize, Serialize};

/// AI identity — runtime, provider, model. Stored globally.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blueprint {
    pub name: String,
    pub runtime: String, // "pi" | "claude" | "opencode"
    pub provider: String,
    pub model: String,
    /// API key stored in blueprint (optional — falls back to env var).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Path to a CLAUDE.md template seeded into the env dir on first run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claude_md: Option<String>,
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
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub blueprints: Vec<Blueprint>,
}
