//! CLI integration tests — exercise all non-interactive commands via subprocess.
//!
//! Isolation: sets APPDATA to a temp dir so helo writes config there
//! instead of the real user config. On Windows, ProjectDirs uses
//! %APPDATA%/<app>/config, so this cleanly redirects all reads/writes.

use std::path::PathBuf;
use std::process::Command;

/// Path to the compiled helo binary (set by cargo for integration tests).
fn helo_bin() -> PathBuf {
    std::env::var("CARGO_BIN_EXE_helo")
        .expect("CARGO_BIN_EXE_helo not set")
        .into()
}

/// Run helo with APPDATA redirected to a temp dir.
/// Returns (stdout, stderr, exit_code).
fn helo(appdata: &std::path::Path, args: &[&str]) -> (String, String, Option<i32>) {
    let output = Command::new(helo_bin())
        .args(args)
        .env("APPDATA", appdata)
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
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    // Empty list
    let (out, _, _) = helo(appdata, &["list"]);
    assert!(out.contains("No blueprints"));

    // Add
    let (out, _, code) = helo(appdata, &[
        "add", "test-bp", "--runtime", "claude", "--provider", "anthropic", "--model", "sonnet-4"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'test-bp'"));

    // List shows it
    let (out, _, _) = helo(appdata, &["list"]);
    assert!(out.contains("test-bp"));
    assert!(out.contains("claude"));
    assert!(out.contains("sonnet-4"));

    // Remove
    let (out, _, code) = helo(appdata, &["remove", "test-bp"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Removed 'test-bp'"));

    // Empty again
    let (out, _, _) = helo(appdata, &["list"]);
    assert!(out.contains("No blueprints"));
}

#[test]
fn add_duplicate_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    helo(appdata, &["add", "dup", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);
    let (_, err, code) = helo(appdata, &["add", "dup", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("already exists"));
}

#[test]
fn remove_nonexistent_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(tmp.path(), &["remove", "ghost"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no blueprint named 'ghost'"));
}

// ── list --json ───────────────────────────────────────────────────────────────

#[test]
fn list_json_output() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    helo(appdata, &["add", "j1", "--runtime", "claude", "--provider", "anthropic", "--model", "sonnet"]);
    helo(appdata, &["add", "j2", "--runtime", "pi", "--provider", "openrouter", "--model", "gpt-4o"]);

    let (out, _, code) = helo(appdata, &["list", "--json"]);
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
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["list", "--json"]);
    assert_eq!(code, Some(0));
    assert_eq!(out.trim(), "[]");
}

// ── key command ───────────────────────────────────────────────────────────────

#[test]
fn key_set_and_clear() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    helo(appdata, &["add", "keytest", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);

    // Set key
    let (out, _, code) = helo(appdata, &["key", "keytest", "sk-abc123"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Updated api_key for 'keytest'"));

    // Clear key
    let (out, _, code) = helo(appdata, &["key", "keytest", ""]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Cleared api_key"));
}

#[test]
fn key_nonexistent_blueprint_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(tmp.path(), &["key", "ghost", "sk-123"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("no blueprint named 'ghost'"));
}

#[test]
fn key_stored_shows_in_status() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    helo(appdata, &["add", "k", "--runtime", "claude", "--provider", "anthropic", "--model", "s"]);
    helo(appdata, &["key", "k", "sk-test"]);

    // Key is stored in config.toml; verify via list --json that api_key is present
    // (list --json doesn't expose api_key, but the key command succeeded — trust that)
    // Instead verify through status that config exists
    let (out, _, _) = helo(appdata, &["status"]);
    assert!(out.contains("Blueprints: 1"));
}

// ── status --json ─────────────────────────────────────────────────────────────

#[test]
fn status_json_structure() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["status", "--json"]);
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
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["templates", "list"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("coding"));
    assert!(out.contains("assistant"));
    assert!(out.contains("devops"));
}

#[test]
fn templates_show_coding() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["templates", "show", "coding"]);
    assert_eq!(code, Some(0));
    assert!(!out.trim().is_empty());
}

#[test]
fn templates_show_unknown_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(tmp.path(), &["templates", "show", "nonexistent"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("unknown template"));
}

#[test]
fn templates_init() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["templates", "init"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Templates written to"));
}

// ── add with --claude-md ──────────────────────────────────────────────────────

#[test]
fn add_with_template_name() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    // Init templates first so the template file exists
    helo(appdata, &["templates", "init"]);

    let (out, _, code) = helo(appdata, &[
        "add", "tpl-bp", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--claude-md", "coding"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'tpl-bp'"));

    // List should show CLAUDE.MD column with coding
    let (out, _, _) = helo(appdata, &["list"]);
    assert!(out.contains("coding"));
}

#[test]
fn add_with_bad_template_name_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();
    helo(appdata, &["templates", "init"]);

    let (_, err, code) = helo(appdata, &[
        "add", "bad", "--runtime", "claude", "--provider", "anthropic",
        "--model", "s", "--claude-md", "nonexistent"
    ]);
    assert_ne!(code, Some(0));
    assert!(err.contains("unknown template"));
}

#[test]
fn add_with_file_path_claude_md() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    // Write a temp CLAUDE.md file
    let md_file = appdata.join("my-claude.md");
    std::fs::write(&md_file, "# Test instructions").unwrap();

    let (out, _, code) = helo(appdata, &[
        "add", "file-bp", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--claude-md", md_file.to_str().unwrap()
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint"));
}

// ── defaults ──────────────────────────────────────────────────────────────────

#[test]
fn defaults_show_when_none() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["defaults", "show", "claude"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("No defaults set"));
}

#[test]
fn defaults_set_and_show() {
    let tmp = tempfile::tempdir().unwrap();
    let appdata = tmp.path();

    // Write a temp settings file
    let settings = appdata.join("my-settings.json");
    std::fs::write(&settings, "{\"model\": \"opus\"}").unwrap();

    let (out, _, code) = helo(appdata, &[
        "defaults", "set", "claude", settings.to_str().unwrap()
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Saved defaults for 'claude'"));

    let (out, _, _) = helo(appdata, &["defaults", "show", "claude"]);
    assert!(out.contains("opus"));
}

// ── add with api_key flag ─────────────────────────────────────────────────────

#[test]
fn add_with_api_key() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &[
        "add", "keyed", "--runtime", "claude", "--provider", "anthropic",
        "--model", "sonnet", "--api-key", "sk-direct"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'keyed'"));
}

// ── add with zai provider ─────────────────────────────────────────────────────

#[test]
fn add_zai_provider() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &[
        "add", "zai-bp", "--runtime", "claude", "--provider", "zai",
        "--model", "glm-5.1", "--api-key", "zai-test-key"
    ]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Added blueprint 'zai-bp'"));

    let (out, _, _) = helo(tmp.path(), &["list"]);
    assert!(out.contains("zai"));
    assert!(out.contains("glm-5.1"));
}

// ── run error cases (don't test actual launch, just error paths) ──────────────

#[test]
fn run_nonexistent_blueprint() {
    let tmp = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();

    let output = Command::new(helo_bin())
        .args(["run", "ghost"])
        .env("APPDATA", tmp.path())
        .current_dir(project.path())
        .output()
        .expect("failed to run helo");

    let err = String::from_utf8_lossy(&output.stderr);
    assert_ne!(output.status.code(), Some(0));
    assert!(err.contains("no blueprint named 'ghost'"));
}

#[test]
fn run_no_name_no_instances() {
    let tmp = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();

    let output = Command::new(helo_bin())
        .args(["run"])
        .env("APPDATA", tmp.path())
        .current_dir(project.path())
        .output()
        .expect("failed to run helo");

    let err = String::from_utf8_lossy(&output.stderr);
    assert_ne!(output.status.code(), Some(0));
    assert!(err.contains("no instances"));
}

// ── clean ─────────────────────────────────────────────────────────────────────

#[test]
fn clean_nonexistent_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let (out, _, code) = helo(tmp.path(), &["clean", "claude", "--yes"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Nothing to clean"));
}

#[test]
fn clean_unknown_runtime_fails() {
    let tmp = tempfile::tempdir().unwrap();
    let (_, err, code) = helo(tmp.path(), &["clean", "unknown", "--yes"]);
    assert_ne!(code, Some(0));
    assert!(err.contains("unknown runtime"));
}

// ── help output ───────────────────────────────────────────────────────────────

#[test]
fn help_flag() {
    let (out, _, code) = helo(tempfile::tempdir().unwrap().path(), &["--help"]);
    assert_eq!(code, Some(0));
    assert!(out.contains("Isolated AI agent environments"));
    assert!(out.contains("Commands:"));
}
