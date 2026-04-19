//! CLI integration tests — exercise all non-interactive commands via subprocess.
//!
//! Isolation: sets HELO_CONFIG_DIR to a temp dir so helo writes config there
//! instead of the real user config. Works on all platforms.

use std::path::PathBuf;
use std::process::Command;

/// Path to the compiled helo binary (set by cargo for integration tests).
fn helo_bin() -> PathBuf {
    std::env::var("CARGO_BIN_EXE_helo")
        .expect("CARGO_BIN_EXE_helo not set")
        .into()
}

/// Run helo with HELO_CONFIG_DIR redirected to a temp dir.
/// Returns (stdout, stderr, exit_code).
fn helo(config_dir: &std::path::Path, args: &[&str]) -> (String, String, Option<i32>) {
    let output = Command::new(helo_bin())
        .args(args)
        .env("HELO_CONFIG_DIR", config_dir)
        .output()
        .expect("failed to run helo");
    (
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
        output.status.code(),
    )
}

/// Run helo with config isolation AND a specific working directory.
fn helo_in_dir(config_dir: &std::path::Path, cwd: &std::path::Path, args: &[&str]) -> (String, String, Option<i32>) {
    let output = Command::new(helo_bin())
        .args(args)
        .env("HELO_CONFIG_DIR", config_dir)
        .current_dir(cwd)
        .output()
        .expect("failed to run helo");
    (
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
        output.status.code(),
    )
}

// ── add / list / remove lifecycle ─────────────────────────────────────────────

#[test]
fn add_list_remove_lifecycle() {
    let cfg = tempfile::tempdir().unwrap();

    // Empty list
    let (out, _, _) = helo(cfg.path(), &["list"]);
    assert!(out.contains("No blueprints"));

    // Add
    let (out, _, code) = helo(cfg.path(), &[
        "add", "test-bp", "--runtime", "claude", "--provider", "anthropic", "--model", "sonnet-4"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'test-bp'"));

    // List shows it
    let (out, _, _) = helo(cfg.path(), &["list"]);
    assert!(out.contains("test-bp"));
    assert!(out.contains("claude"));
    assert!(out.contains("sonnet-4"));

    // Remove
    let (out, _, code) = helo(cfg.path(), &["remove", "test-bp"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Removed 'test-bp'"));

    // Empty again
    let (out, _, _) = helo(cfg.path(), &["list"]);
    assert!(out.contains("No blueprints"));
}

#[test]
fn add_duplicate_fails() {
    let cfg = tempfile::tempdir().unwrap();

    helo(cfg.path(), &["add", "dup", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);
    let (_, err, code) = helo(cfg.path(), &["add", "dup", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("already exists"));
}

#[test]
fn remove_nonexistent_fails() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &["remove", "ghost"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no blueprint named 'ghost'"));
}

// ── list --json ───────────────────────────────────────────────────────────────

#[test]
fn list_json_output() {
    let cfg = tempfile::tempdir().unwrap();

    helo(cfg.path(), &["add", "j1", "--runtime", "claude", "--provider", "anthropic", "--model", "sonnet"]);
    helo(cfg.path(), &["add", "j2", "--runtime", "pi", "--provider", "openrouter", "--model", "gpt-4o"]);

    let (out, _, code) = helo(cfg.path(), &["list", "--json"]);
    assert_eq!(code, Some(0));

    let parsed: serde_json::Value = serde_json::from_str(out.trim()).expect("valid JSON");
    let arr = parsed.as_array().expect("JSON array");
    assert_eq!(arr.len(), 2);

    let names: Vec<&str> = arr.iter()
        .filter_map(|v| v.get("name").and_then(|n| n.as_str()))
        .collect();
    assert!(names.contains(&"j1"));
    assert!(names.contains(&"j2"));
}

#[test]
fn list_json_empty() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["list", "--json"]);
    assert_eq!(code, Some(0));
    assert_eq!(out.trim(), "[]");
}

// ── key command ───────────────────────────────────────────────────────────────

#[test]
fn key_set_and_clear() {
    let cfg = tempfile::tempdir().unwrap();

    helo(cfg.path(), &["add", "keytest", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);

    // Set key
    let (out, _, code) = helo(cfg.path(), &["key", "keytest", "sk-abc123"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Updated api_key for 'keytest'"));

    // Clear key
    let (out, _, code) = helo(cfg.path(), &["key", "keytest", ""]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Cleared api_key"));
}

#[test]
fn key_nonexistent_blueprint_fails() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &["key", "ghost", "sk-123"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no blueprint named 'ghost'"));
}

#[test]
fn key_stored_shows_in_status() {
    let cfg = tempfile::tempdir().unwrap();

    helo(cfg.path(), &["add", "k", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);
    helo(cfg.path(), &["key", "k", "sk-test"]);

    let (out, _, _) = helo(cfg.path(), &["status"]);
    assert!(out.contains("Blueprints: 1"));
}

// ── global keys ───────────────────────────────────────────────────────────────

#[test]
fn keys_list_empty() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["keys", "list"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("No global keys"));
}

#[test]
fn keys_set_and_list() {
    let cfg = tempfile::tempdir().unwrap();

    let (out, _, code) = helo(cfg.path(), &["keys", "set", "zai", "abc123longkey"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Set global key for 'zai'"));

    let (out, _, _) = helo(cfg.path(), &["keys", "list"]);
    assert!(out.contains("zai"));
    // Key should be masked (not full plaintext)
    assert!(!out.contains("abc123longkey"));
}

#[test]
fn keys_remove() {
    let cfg = tempfile::tempdir().unwrap();

    helo(cfg.path(), &["keys", "set", "anthropic", "sk-test"]);
    let (out, _, code) = helo(cfg.path(), &["keys", "remove", "anthropic"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Removed global key for 'anthropic'"));

    let (out, _, _) = helo(cfg.path(), &["keys", "list"]);
    assert!(out.contains("No global keys"));
}

#[test]
fn keys_remove_nonexistent() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &["keys", "remove", "ghost"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no global key for 'ghost'"));
}

#[test]
fn add_auto_fills_global_key() {
    let cfg = tempfile::tempdir().unwrap();

    // Set global key for anthropic
    helo(cfg.path(), &["keys", "set", "anthropic", "sk-global-key"]);

    // Add blueprint without --api-key — should auto-fill from global
    let (_, _, code) = helo(cfg.path(), &[
        "add", "autokey", "--runtime", "claude", "--provider", "anthropic", "--model", "sonnet"
    ]);
    assert_eq!(code, Some(0));

    // Verify via list --json that the key was stored
    // (list --json doesn't expose api_key, so check config.toml directly)
    let config_path = cfg.path().join("config.toml");
    let config_content = std::fs::read_to_string(config_path).unwrap();
    assert!(config_content.contains("sk-global-key"));
}

#[test]
fn add_flag_overrides_global_key() {
    let cfg = tempfile::tempdir().unwrap();

    // Set global key
    helo(cfg.path(), &["keys", "set", "anthropic", "sk-global"]);

    // Add with --api-key should use the flag value, not global
    helo(cfg.path(), &[
        "add", "override", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--api-key", "sk-flag"
    ]);

    let config_content = std::fs::read_to_string(cfg.path().join("config.toml")).unwrap();
    assert!(config_content.contains("sk-flag"));
}

// ── status --json ─────────────────────────────────────────────────────────────

#[test]
fn status_json_structure() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["status", "--json"]);
    assert_eq!(code, Some(0));

    let parsed: serde_json::Value = serde_json::from_str(out.trim()).expect("valid JSON");
    assert!(parsed.get("config_path").is_some());
    assert!(parsed.get("blueprints").is_some());
    assert!(parsed.get("api_keys").is_some());
    assert_eq!(parsed["blueprints"], 0);
}

// ── templates ─────────────────────────────────────────────────────────────────

#[test]
fn templates_list() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["templates", "list"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("coding"));
    assert!(out.contains("assistant"));
    assert!(out.contains("devops"));
}

#[test]
fn templates_show_coding() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["templates", "show", "coding"]);
    assert_eq!(code, Some(0));
    assert!(!out.trim().is_empty());
}

#[test]
fn templates_show_assistant() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["templates", "show", "assistant"]);
    assert_eq!(code, Some(0));
    assert!(!out.trim().is_empty());
}

#[test]
fn templates_show_unknown_fails() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &["templates", "show", "nonexistent"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("unknown template"));
}

#[test]
fn templates_init() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["templates", "init"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Templates written to"));
}

// ── add with --claude-md ──────────────────────────────────────────────────────

#[test]
fn add_with_template_name() {
    let cfg = tempfile::tempdir().unwrap();

    // Init templates first so the template file exists
    helo(cfg.path(), &["templates", "init"]);

    let (add_out, _, code) = helo(cfg.path(), &[
        "add", "tpl-bp", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--claude-md", "coding"
    ]);
    assert_eq!(code, Some(0));
    assert!(add_out.contains("Added blueprint 'tpl-bp'"));

    let (out, _, _) = helo(cfg.path(), &["list"]);
    assert!(out.contains("coding"));
}

#[test]
fn add_with_bad_template_name_fails() {
    let cfg = tempfile::tempdir().unwrap();
    helo(cfg.path(), &["templates", "init"]);

    let (_, err, code) = helo(cfg.path(), &[
        "add", "bad", "--runtime", "claude", "--provider", "anthropic",
        "--model", "s", "--claude-md", "nonexistent"
    ]);
    assert_ne!(code, Some(0));
    assert!(err.contains("unknown template"));
}

#[test]
fn add_with_file_path_claude_md() {
    let cfg = tempfile::tempdir().unwrap();

    let md_file = cfg.path().join("my-claude.md");
    std::fs::write(&md_file, "# Test instructions").unwrap();

    let (out, _, code) = helo(cfg.path(), &[
        "add", "file-bp", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--claude-md", md_file.to_str().unwrap()
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint"));
}

// ── defaults ──────────────────────────────────────────────────────────────────

#[test]
fn defaults_show_when_none() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["defaults", "show", "claude"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("No defaults set"));
}

#[test]
fn defaults_set_and_show() {
    let cfg = tempfile::tempdir().unwrap();

    let settings = cfg.path().join("my-settings.json");
    std::fs::write(&settings, "{\"model\": \"opus\"}").unwrap();

    let (out, _, code) = helo(cfg.path(), &[
        "defaults", "set", "claude", settings.to_str().unwrap()
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Saved defaults for 'claude'"));

    let (out, _, _) = helo(cfg.path(), &["defaults", "show", "claude"]);
    assert!(out.contains("opus"));
}

// ── add with api_key flag ─────────────────────────────────────────────────────

#[test]
fn add_with_api_key() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &[
        "add", "keyed", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--api-key", "sk-direct"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'keyed'"));
}

// ── add with zai provider ─────────────────────────────────────────────────────

#[test]
fn add_zai_provider() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &[
        "add", "zai-bp", "--runtime", "claude", "--provider", "zai",
        "--model", "glm-5.1", "--api-key", "zai-test-key"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'zai-bp'"));

    let (out, _, _) = helo(cfg.path(), &["list"]);
    assert!(out.contains("zai"));
    assert!(out.contains("glm-5.1"));
}

// ── run error cases ───────────────────────────────────────────────────────────

#[test]
fn run_nonexistent_blueprint() {
    let cfg = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();

    let (_, err, code) = helo_in_dir(cfg.path(), project.path(), &["run", "ghost"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no blueprint named 'ghost'"));
}

#[test]
fn run_no_name_no_instances() {
    let cfg = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();

    let (_, err, code) = helo_in_dir(cfg.path(), project.path(), &["run"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no instances"));
}

// ── clean ─────────────────────────────────────────────────────────────────────

#[test]
fn clean_project_no_instances() {
    // No name arg = clean all instances in current dir. Empty dir = success.
    let cfg = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let (out, _, code) = helo_in_dir(cfg.path(), project.path(), &["clean", "--yes"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("No instances"));
}

#[test]
fn clean_global_unknown_runtime_fails() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &["clean", "--global", "unknown", "--yes"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("unknown runtime"));
}

#[test]
fn clean_specific_instance_not_found() {
    let cfg = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let (_, err, code) = helo_in_dir(cfg.path(), project.path(), &["clean", "ghost", "--yes"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no instance named 'ghost'"));
}

// ── help output ───────────────────────────────────────────────────────────────

#[test]
fn help_flag() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["--help"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Isolated AI agent environments"));
    assert!(out.contains("Commands:"));
}

// ── version flag ─────────────────────────────────────────────────────────────

#[test]
fn version_flag() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["--version"]);
    // clap exits with 0 on --version (some versions use 2, accept both)
    assert!(code == Some(0) || code == Some(2));
    assert!(out.contains("helo"));
}

// ── name validation ──────────────────────────────────────────────────────────

#[test]
fn add_rejects_spaces_in_name() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &[
        "add", "bad name", "--runtime", "claude", "--provider", "anthropic", "--model", "s"
    ]);
    assert_ne!(code, Some(0));
    assert!(err.contains("letters, digits, hyphens, and underscores"));
}

#[test]
fn add_rejects_special_chars_in_name() {
    let cfg = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(cfg.path(), &[
        "add", "na/me", "--runtime", "claude", "--provider", "anthropic", "--model", "s"
    ]);
    assert_ne!(code, Some(0));
    assert!(err.contains("letters, digits, hyphens, and underscores"));
}

#[test]
fn add_allows_hyphens_and_underscores() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &[
        "add", "my-agent_v2", "--runtime", "claude", "--provider", "anthropic", "--model", "s"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'my-agent_v2'"));
}

// ── list --json has_key ──────────────────────────────────────────────────────

#[test]
fn list_json_has_key_field() {
    let cfg = tempfile::tempdir().unwrap();
    helo(cfg.path(), &[
        "add", "withkey", "--runtime", "claude", "--provider", "anthropic",
        "--model", "s", "--api-key", "sk-test"
    ]);
    helo(cfg.path(), &[
        "add", "nokey", "--runtime", "claude", "--provider", "anthropic", "--model", "s"
    ]);

    let (out, _, code) = helo(cfg.path(), &["list", "--json"]);
    assert_eq!(code, Some(0));
    let parsed: serde_json::Value = serde_json::from_str(out.trim()).unwrap();
    let arr = parsed.as_array().unwrap();

    let withkey = arr.iter().find(|v| v["name"] == "withkey").unwrap();
    assert_eq!(withkey["has_key"], true);

    let nokey = arr.iter().find(|v| v["name"] == "nokey").unwrap();
    assert_eq!(nokey["has_key"], false);
}

// ── runtime list ─────────────────────────────────────────────────────────────

#[test]
fn runtime_list() {
    let cfg = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(cfg.path(), &["runtime", "list"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("claude"));
    assert!(out.contains("pi"));
    assert!(out.contains("opencode"));
}

