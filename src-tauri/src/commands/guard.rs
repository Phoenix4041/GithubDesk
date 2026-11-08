use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::git::runner::{git, git_unchecked, git_with_input};
use crate::git::validate::ensure_relative_path;

pub const LARGE_FILE_WARNING: u64 = 50 * 1024 * 1024;
pub const LARGE_FILE_BLOCKING: u64 = 100 * 1024 * 1024;
const IGNORE_KEY: &str = "githubdesk.guardignore";
const MAX_FINDINGS: usize = 200;
const MAX_LINE_LENGTH: usize = 2000;
const RISKY_DIRECTORIES: [&str; 2] = ["node_modules/", ".venv/"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingKind {
    Secret,
    LargeFile,
    ConflictMarker,
    RiskyFile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingLevel {
    Warning,
    Blocking,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub path: String,
    pub line: Option<u32>,
    pub kind: FindingKind,
    pub rule: String,
    pub level: FindingLevel,
    pub size: Option<u64>,
}

fn is_token_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '-'
}

fn run_after(line: &str, prefix: &str, minimum: usize, allowed: fn(char) -> bool) -> bool {
    let mut start = 0;
    while let Some(found) = line[start..].find(prefix) {
        let begin = start + found;
        let before_ok = line[..begin]
            .chars()
            .next_back()
            .is_none_or(|character| !character.is_ascii_alphanumeric());
        let rest = &line[begin + prefix.len()..];
        let length = rest
            .chars()
            .take_while(|character| allowed(*character))
            .count();
        if before_ok && length >= minimum {
            return true;
        }
        start = begin + prefix.len();
    }
    false
}

fn aws_key(line: &str) -> bool {
    ["AKIA", "ASIA"].iter().any(|prefix| {
        run_after(line, prefix, 16, |character| {
            character.is_ascii_uppercase() || character.is_ascii_digit()
        })
    })
}

fn github_token(line: &str) -> bool {
    ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"]
        .iter()
        .any(|prefix| {
            run_after(line, prefix, 36, |character| {
                character.is_ascii_alphanumeric()
            })
        })
        || run_after(line, "github_pat_", 22, is_token_char)
}

fn slack_token(line: &str) -> bool {
    ["xoxb-", "xoxa-", "xoxp-", "xoxr-", "xoxs-"]
        .iter()
        .any(|prefix| run_after(line, prefix, 10, is_token_char))
}

fn stripe_key(line: &str) -> bool {
    ["sk_live_", "rk_live_"].iter().any(|prefix| {
        run_after(line, prefix, 16, |character| {
            character.is_ascii_alphanumeric()
        })
    })
}

fn private_key(line: &str) -> bool {
    match (line.find("-----BEGIN "), line.find("PRIVATE KEY-----")) {
        (Some(begin), Some(end)) => begin < end,
        _ => false,
    }
}

const SECRET_NAMES: [&str; 8] = [
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "access_key",
    "auth_token",
    "token",
];
const PLACEHOLDERS: [&str; 14] = [
    "example",
    "your",
    "xxx",
    "changeme",
    "placeholder",
    "<",
    ">",
    "${",
    "{{",
    "process.env",
    "env.",
    "dummy",
    "sample",
    "todo",
];

fn generic_secret(line: &str) -> bool {
    let lowered = line.to_ascii_lowercase();
    for name in SECRET_NAMES {
        let mut start = 0;
        while let Some(found) = lowered[start..].find(name) {
            let begin = start + found;
            let after = &line[begin + name.len()..];
            start = begin + name.len();
            let trimmed = after.trim_start_matches(|character: char| {
                character.is_ascii_alphanumeric() || character == '_'
            });
            let trimmed = trimmed.trim_start_matches(['"', '\'', ' ']);
            let Some(value_part) = trimmed
                .strip_prefix('=')
                .or_else(|| trimmed.strip_prefix(':'))
            else {
                continue;
            };
            let value_part = value_part.trim_start_matches([' ', '"', '\'', '=', '>']);
            let value: String = value_part
                .chars()
                .take_while(|character| {
                    !matches!(character, '"' | '\'' | ' ' | ',' | ';' | ')' | '}')
                })
                .collect();
            if value.len() < 8
                || value.contains('(')
                || value.contains('.') && !value.contains(char::is_numeric)
            {
                continue;
            }
            let value_lower = value.to_ascii_lowercase();
            if PLACEHOLDERS
                .iter()
                .any(|marker| value_lower.contains(marker))
            {
                continue;
            }
            let first = value.chars().next();
            if value.chars().all(|character| Some(character) == first) {
                continue;
            }
            if !value.chars().any(|character| character.is_ascii_digit())
                && !value
                    .chars()
                    .any(|character| character.is_ascii_uppercase())
                && value
                    .chars()
                    .all(|character| character.is_ascii_lowercase())
            {
                continue;
            }
            return true;
        }
    }
    false
}

pub fn secret_rule(line: &str) -> Option<&'static str> {
    if line.len() > MAX_LINE_LENGTH {
        return None;
    }
    if private_key(line) {
        Some("private-key")
    } else if aws_key(line) {
        Some("aws-access-key")
    } else if github_token(line) {
        Some("github-token")
    } else if slack_token(line) {
        Some("slack-token")
    } else if stripe_key(line) {
        Some("stripe-key")
    } else if generic_secret(line) {
        Some("generic-secret")
    } else {
        None
    }
}

pub fn is_conflict_marker(line: &str) -> bool {
    line.starts_with("<<<<<<< ")
        || line.starts_with(">>>>>>> ")
        || line == "======="
        || line == "<<<<<<<"
        || line == ">>>>>>>"
}

pub fn risky_path(path: &str) -> Option<&'static str> {
    let name = path.rsplit('/').next().unwrap_or(path);
    if name == ".env"
        || (name.starts_with(".env.")
            && !name.ends_with(".example")
            && !name.ends_with(".sample")
            && !name.ends_with(".template"))
    {
        return Some("env-file");
    }
    if matches!(name, "id_rsa" | "id_ed25519" | "id_ecdsa" | "id_dsa") {
        return Some("ssh-private-key");
    }
    if RISKY_DIRECTORIES
        .iter()
        .any(|directory| path.starts_with(directory) || path.contains(&format!("/{directory}")))
    {
        return Some("dependency-folder");
    }
    None
}

pub fn scan_patch(patch: &str) -> Vec<Finding> {
    let mut findings = Vec::new();
    let mut path: Option<String> = None;
    let mut line_number = 0u32;
    for line in patch.lines() {
        if let Some(rest) = line.strip_prefix("+++ b/") {
            path = Some(rest.to_string());
            continue;
        }
        if line.starts_with("+++ ") || line.starts_with("--- ") {
            if line.starts_with("+++ /dev/null") {
                path = None;
            }
            continue;
        }
        if let Some(header) = line.strip_prefix("@@ ") {
            line_number = header
                .split('+')
                .nth(1)
                .and_then(|part| part.split([',', ' ']).next())
                .and_then(|number| number.parse::<u32>().ok())
                .unwrap_or(1);
            continue;
        }
        let Some(added) = line.strip_prefix('+') else {
            if !line.starts_with('-') && !line.starts_with('\\') {
                line_number += 1;
            }
            continue;
        };
        if let Some(current) = &path {
            let rule = if is_conflict_marker(added) {
                Some((FindingKind::ConflictMarker, "conflict-marker"))
            } else {
                secret_rule(added).map(|rule| (FindingKind::Secret, rule))
            };
            if let Some((kind, rule)) = rule {
                if findings.len() < MAX_FINDINGS {
                    findings.push(Finding {
                        path: current.clone(),
                        line: Some(line_number),
                        kind,
                        rule: rule.to_string(),
                        level: FindingLevel::Warning,
                        size: None,
                    });
                }
            }
        }
        line_number += 1;
    }
    findings
}

async fn staged_sizes(repo: &Path) -> AppResult<Vec<(String, u64)>> {
    let listing = git(
        repo,
        &[
            "diff",
            "--cached",
            "--raw",
            "-z",
            "--no-renames",
            "--diff-filter=AM",
        ],
    )
    .await?;
    let text = listing.text();
    let mut blobs: Vec<(String, String)> = Vec::new();
    let mut parts = text.split('\0').filter(|part| !part.is_empty());
    while let Some(meta) = parts.next() {
        let Some(path) = parts.next() else { break };
        let fields: Vec<&str> = meta.trim_start_matches(':').split(' ').collect();
        if fields.len() >= 4 {
            blobs.push((path.to_string(), fields[3].to_string()));
        }
    }
    if blobs.is_empty() {
        return Ok(Vec::new());
    }
    let input: String = blobs.iter().map(|(_, hash)| format!("{hash}\n")).collect();
    let sizes = git_with_input(
        repo,
        &["cat-file", "--batch-check=%(objectsize)"],
        input.into_bytes(),
    )
    .await?;
    Ok(blobs
        .into_iter()
        .zip(
            sizes
                .text()
                .lines()
                .map(|line| line.trim().parse::<u64>().unwrap_or(0)),
        )
        .map(|((path, _), size)| (path, size))
        .collect())
}

async fn ignored_pairs(repo: &Path) -> Vec<String> {
    match git_unchecked(repo, &["config", "--local", "--get-all", IGNORE_KEY]).await {
        Ok(output) if output.success() => output.text().lines().map(str::to_string).collect(),
        _ => Vec::new(),
    }
}

fn pair(rule: &str, path: &str) -> String {
    format!("{rule}:{path}")
}

pub async fn scan_staged(repo: &Path) -> AppResult<Vec<Finding>> {
    let patch = git(
        repo,
        &[
            "diff",
            "--cached",
            "--no-color",
            "--no-renames",
            "-U0",
            "--diff-filter=AM",
            "--text",
        ],
    )
    .await?;
    let mut findings = scan_patch(&patch.text());

    for (path, size) in staged_sizes(repo).await? {
        if size >= LARGE_FILE_WARNING {
            findings.push(Finding {
                path: path.clone(),
                line: None,
                kind: FindingKind::LargeFile,
                rule: "large-file".to_string(),
                level: if size >= LARGE_FILE_BLOCKING {
                    FindingLevel::Blocking
                } else {
                    FindingLevel::Warning
                },
                size: Some(size),
            });
        }
        if let Some(rule) = risky_path(&path) {
            findings.push(Finding {
                path,
                line: None,
                kind: FindingKind::RiskyFile,
                rule: rule.to_string(),
                level: FindingLevel::Warning,
                size: Some(size),
            });
        }
    }

    let ignored = ignored_pairs(repo).await;
    findings.retain(|finding| !ignored.contains(&pair(&finding.rule, &finding.path)));
    Ok(findings)
}

pub async fn silence(repo: &Path, rule: &str, path: &str) -> AppResult<()> {
    ensure_relative_path(path)?;
    if rule.is_empty() || rule.contains(':') || rule.chars().any(char::is_whitespace) {
        return Err(AppError::invalid_input("invalid rule"));
    }
    let entry = pair(rule, path);
    if ignored_pairs(repo).await.contains(&entry) {
        return Ok(());
    }
    git(repo, &["config", "--local", "--add", IGNORE_KEY, &entry]).await?;
    Ok(())
}

#[tauri::command]
pub async fn guard_scan(path: String) -> AppResult<Vec<Finding>> {
    scan_staged(Path::new(&path)).await
}

#[tauri::command]
pub async fn guard_silence(path: String, rule: String, file: String) -> AppResult<()> {
    silence(Path::new(&path), &rule, &file).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn well_known_token_formats_are_found() {
        assert_eq!(
            secret_rule("key = AKIAIOSFODNN7EXAMPLQ"),
            Some("aws-access-key")
        );
        assert_eq!(
            secret_rule("const t = \"ghp_abcdefghijklmnopqrstuvwxyz0123456789\";"),
            Some("github-token")
        );
        assert_eq!(
            secret_rule("github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuv"),
            Some("github-token")
        );
        assert_eq!(
            secret_rule("SLACK=xoxb-1234567890-abcdefghij"),
            Some("slack-token")
        );
        assert_eq!(
            secret_rule("sk_live_abcdefghijklmnop1234"),
            Some("stripe-key")
        );
        assert_eq!(
            secret_rule("-----BEGIN RSA PRIVATE KEY-----"),
            Some("private-key")
        );
    }

    #[test]
    fn assignments_with_real_looking_values_are_found() {
        assert_eq!(
            secret_rule("password = \"Hunter2hunter2\""),
            Some("generic-secret")
        );
        assert_eq!(
            secret_rule("api_key: 9f8e7d6c5b4a3210"),
            Some("generic-secret")
        );
        assert_eq!(
            secret_rule("\"auth_token\": \"abcDEF123456\","),
            Some("generic-secret")
        );
    }

    #[test]
    fn placeholders_and_ordinary_code_are_left_alone() {
        for line in [
            "password = \"changeme\"",
            "password: process.env.DB_PASSWORD",
            "api_key = \"<your-api-key>\"",
            "token = ${{ secrets.TOKEN }}",
            "const password = getPassword();",
            "secret = \"xxxxxxxxxxxx\"",
            "let token = next_token();",
            "password_field: string",
            "password: \"example-password\"",
            "token = \"abcdefghijkl\"",
            "AKIA short",
            "ghp_tooshort",
            "// the password is read from the keyring",
        ] {
            assert_eq!(secret_rule(line), None, "{line}");
        }
    }

    #[test]
    fn very_long_lines_are_skipped() {
        let line = format!("password = \"{}\"", "Ab1".repeat(1000));
        assert_eq!(secret_rule(&line), None);
    }

    #[test]
    fn conflict_markers_are_exact() {
        assert!(is_conflict_marker("<<<<<<< HEAD"));
        assert!(is_conflict_marker(">>>>>>> feature"));
        assert!(is_conflict_marker("======="));
        assert!(!is_conflict_marker("========"));
        assert!(!is_conflict_marker("a <<<<<<< b"));
        assert!(!is_conflict_marker("=== heading ==="));
    }

    #[test]
    fn risky_paths_skip_example_files() {
        assert_eq!(risky_path(".env"), Some("env-file"));
        assert_eq!(risky_path("config/.env.production"), Some("env-file"));
        assert_eq!(risky_path(".env.example"), None);
        assert_eq!(risky_path("home/id_rsa"), Some("ssh-private-key"));
        assert_eq!(
            risky_path("web/node_modules/x/index.js"),
            Some("dependency-folder")
        );
        assert_eq!(risky_path("src/main.rs"), None);
    }

    #[test]
    fn a_patch_gives_the_file_and_line_of_each_finding() {
        let patch = "diff --git a/a.env b/a.env\n--- a/a.env\n+++ b/a.env\n@@ -1,2 +10,3 @@\n context\n+ok line\n+password = \"Hunter2hunter2\"\n";
        let findings = scan_patch(patch);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].path, "a.env");
        assert_eq!(findings[0].line, Some(12));
        assert_eq!(findings[0].kind, FindingKind::Secret);
    }

    #[test]
    fn removed_lines_and_deleted_files_never_count() {
        let patch = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-password = \"Hunter2hunter2\"\n+fine\n--- a/y\n+++ /dev/null\n@@ -1 +0,0 @@\n-ghp_abcdefghijklmnopqrstuvwxyz0123456789\n";
        assert!(scan_patch(patch).is_empty());
    }
}
