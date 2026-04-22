/// Built-in provider definitions. Adding a new provider = one new row here.
pub struct ProviderDef {
    pub name: &'static str,
    /// Env var name for this provider's API key.
    pub key_env: &'static str,
    /// If Some, sets ANTHROPIC_BASE_URL at launch and generates an env block in settings.json.
    pub base_url: Option<&'static str>,
    /// Env var to inject the API key into at launch (usually ANTHROPIC_API_KEY, ZAI uses AUTH_TOKEN).
    pub auth_var: &'static str,
    /// Remove inherited ANTHROPIC_API_KEY before launch (ZAI: prevents "detected custom key" prompt).
    pub clear_api_key: bool,
    /// Set ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL env vars at launch.
    pub set_model_defaults: bool,
    /// Extra static key=value pairs injected into the settings.json env block.
    pub extra_env: &'static [(&'static str, &'static str)],
    /// If Some, sets "effortLevel" in settings.json.
    pub effort_level: Option<&'static str>,
}

pub const PROVIDERS: &[ProviderDef] = &[
    ProviderDef {
        name: "anthropic",
        key_env: "ANTHROPIC_API_KEY",
        base_url: None,
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
    ProviderDef {
        name: "zai",
        key_env: "ZAI_API_KEY",
        base_url: Some("https://api.z.ai/api/anthropic"),
        auth_var: "ANTHROPIC_AUTH_TOKEN",
        clear_api_key: true,
        set_model_defaults: true,
        extra_env: &[
            ("API_TIMEOUT_MS", "3000000"),
            ("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"),
        ],
        effort_level: Some("high"),
    },
    ProviderDef {
        name: "openrouter",
        key_env: "OPENROUTER_API_KEY",
        base_url: Some("https://openrouter.ai/api"),
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
    ProviderDef {
        name: "deepseek",
        key_env: "DEEPSEEK_API_KEY",
        base_url: Some("https://api.deepseek.com/anthropic"),
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
    ProviderDef {
        name: "openai",
        key_env: "OPENAI_API_KEY",
        base_url: None,
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
    ProviderDef {
        name: "groq",
        key_env: "GROQ_API_KEY",
        base_url: None,
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
    ProviderDef {
        name: "mistral",
        key_env: "MISTRAL_API_KEY",
        base_url: None,
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
    ProviderDef {
        name: "gemini",
        key_env: "GEMINI_API_KEY",
        base_url: None,
        auth_var: "ANTHROPIC_API_KEY",
        clear_api_key: false,
        set_model_defaults: false,
        extra_env: &[],
        effort_level: None,
    },
];

/// Look up a provider by name. Returns None for unknown providers.
pub fn find_provider(name: &str) -> Option<&'static ProviderDef> {
    PROVIDERS.iter().find(|p| p.name == name)
}

/// Return the env var name for a provider's API key.
/// Unknown providers produce "{UPPER}_API_KEY".
pub fn provider_key_env(name: &str) -> String {
    find_provider(name)
        .map(|p| p.key_env.to_string())
        .unwrap_or_else(|| format!("{}_API_KEY", name.to_uppercase()))
}

/// Built-in runtime definitions. Runtimes that generate a settings.json list has_settings_json=true.
pub struct RuntimeDef {
    pub name: &'static str,
    #[allow(dead_code)]
    pub config_env: &'static str,
    pub has_settings_json: bool,
}

pub const RUNTIMES: &[RuntimeDef] = &[
    RuntimeDef { name: "claude",   config_env: "CLAUDE_CONFIG_DIR",   has_settings_json: true  },
    RuntimeDef { name: "pi",       config_env: "PI_CODING_AGENT_DIR", has_settings_json: false },
    RuntimeDef { name: "opencode", config_env: "OPENCODE_CONFIG",     has_settings_json: false },
];

pub fn find_runtime(name: &str) -> Option<&'static RuntimeDef> {
    RUNTIMES.iter().find(|r| r.name == name)
}

pub fn runtime_has_settings_json(name: &str) -> bool {
    find_runtime(name).map_or(false, |r| r.has_settings_json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_key_env_known() {
        assert_eq!(provider_key_env("anthropic"),  "ANTHROPIC_API_KEY");
        assert_eq!(provider_key_env("zai"),         "ZAI_API_KEY");
        assert_eq!(provider_key_env("openrouter"),  "OPENROUTER_API_KEY");
        assert_eq!(provider_key_env("deepseek"),    "DEEPSEEK_API_KEY");
        assert_eq!(provider_key_env("openai"),      "OPENAI_API_KEY");
        assert_eq!(provider_key_env("groq"),        "GROQ_API_KEY");
        assert_eq!(provider_key_env("mistral"),     "MISTRAL_API_KEY");
        assert_eq!(provider_key_env("gemini"),      "GEMINI_API_KEY");
    }

    #[test]
    fn provider_key_env_unknown_uppercases() {
        assert_eq!(provider_key_env("myprovider"), "MYPROVIDER_API_KEY");
    }

    #[test]
    fn zai_provider_fields() {
        let p = find_provider("zai").unwrap();
        assert_eq!(p.base_url, Some("https://api.z.ai/api/anthropic"));
        assert_eq!(p.auth_var, "ANTHROPIC_AUTH_TOKEN");
        assert!(p.clear_api_key);
        assert!(p.set_model_defaults);
        assert_eq!(p.effort_level, Some("high"));
    }

    #[test]
    fn anthropic_has_no_env_block() {
        let p = find_provider("anthropic").unwrap();
        assert!(p.base_url.is_none());
    }

    #[test]
    fn openrouter_has_env_block() {
        let p = find_provider("openrouter").unwrap();
        assert!(p.base_url.is_some());
    }

    #[test]
    fn claude_runtime_has_settings_json() {
        assert!(runtime_has_settings_json("claude"));
        assert!(!runtime_has_settings_json("pi"));
        assert!(!runtime_has_settings_json("opencode"));
        assert!(!runtime_has_settings_json("unknown"));
    }
}
