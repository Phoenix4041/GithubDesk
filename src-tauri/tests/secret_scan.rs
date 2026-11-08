mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::gitignore::read_ignore_file;
use githubdesk_lib::commands::secret_scan::{ignore_paths, scan_staged, unstage_paths};
use githubdesk_lib::secret_scan::{is_env_file, scan_line};

fn github_token() -> String {
    format!("ghp_{}", "a1B2c3D4".repeat(5))
}

fn aws_key() -> String {
    format!("AKIA{}", "ABCD1234EFGH5678")
}

fn stripe_key() -> String {
    format!("sk_live_{}", "abcdEFGH12345678wxyz")
}

fn slack_token() -> String {
    format!("xoxb-{}", "1234567890-abcdefghij")
}

#[test]
fn known_token_formats_are_detected() {
    assert_eq!(scan_line(&format!("token = \"{}\"", github_token())), Some("github-token"));
    assert_eq!(
        scan_line(&format!("x {}", format_args!("github_pat_{}", "A".repeat(30)))),
        Some("github-token")
    );
    assert_eq!(scan_line(&format!("key: {}", aws_key())), Some("aws-access-key"));
    assert_eq!(scan_line("-----BEGIN RSA PRIVATE KEY-----"), Some("private-key"));
    assert_eq!(scan_line(&format!("SLACK={}", slack_token())), Some("slack-token"));
    assert_eq!(scan_line(&format!("stripe: {}", stripe_key())), Some("stripe-key"));
}

#[test]
fn secret_assignments_are_detected() {
    assert_eq!(scan_line("password = \"hunter2hunter2\""), Some("secret-assignment"));
    assert_eq!(scan_line("API_KEY=9f8e7d6c5b4a"), Some("secret-assignment"));
    assert_eq!(scan_line("\"client_secret\": \"Zx81kLmQ\""), Some("secret-assignment"));
}

#[test]
fn harmless_lines_are_not_flagged() {
    assert_eq!(scan_line("let password = read_password();"), None);
    assert_eq!(scan_line("password = \"changeme\""), None);
    assert_eq!(scan_line("api_key = process.env.API_KEY"), None);
    assert_eq!(scan_line("password: ${DB_PASSWORD}"), None);
    assert_eq!(scan_line("password = \"short\""), None);
    assert_eq!(scan_line("const message = \"hello world\";"), None);
    assert_eq!(scan_line("ghp_tooshort"), None);
    assert_eq!(scan_line("-----BEGIN CERTIFICATE-----"), None);
}

#[test]
fn the_ignore_marker_silences_a_line() {
    let line = format!("token = \"{}\" // secretscan:ignore", github_token());
    assert_eq!(scan_line(&line), None);
}

#[test]
fn env_files_are_recognised_except_templates() {
    assert!(is_env_file(".env"));
    assert!(is_env_file("app/.env.local"));
    assert!(!is_env_file(".env.example"));
    assert!(!is_env_file("src/environment.ts"));
}

#[tokio::test]
async fn staged_scan_reports_added_lines_with_numbers() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "readme.md", "hello\n", "init").await;
    let content = format!("one\ntwo\ntoken = \"{}\"\n", github_token());
    write_file(&workspace.path, "src/config.txt", &content);
    git_output(&workspace.path, &["add", "-A"]);

    let findings = scan_staged(&workspace.path).await.expect("scan");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].file, "src/config.txt");
    assert_eq!(findings[0].line, 3);
    assert_eq!(findings[0].rule, "github-token");
}

#[tokio::test]
async fn staged_scan_ignores_removed_lines_and_unstaged_files() {
    let workspace = new_repository().await;
    let secret = format!("token = \"{}\"\n", github_token());
    commit_file(&workspace.path, "old.txt", &secret, "add secret").await;
    write_file(&workspace.path, "old.txt", "clean\n");
    write_file(&workspace.path, "loose.txt", &secret);
    git_output(&workspace.path, &["add", "old.txt"]);

    let findings = scan_staged(&workspace.path).await.expect("scan");
    assert!(findings.is_empty());
}

#[tokio::test]
async fn staged_scan_flags_env_files_and_skips_ignored_lines() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "readme.md", "hello\n", "init").await;
    write_file(&workspace.path, ".env", "MODE=dev\n");
    write_file(&workspace.path, ".env.example", "MODE=dev\n");
    let marked = format!("token = \"{}\" # secretscan:ignore\n", github_token());
    write_file(&workspace.path, "fixture.txt", &marked);
    git_output(&workspace.path, &["add", "-A"]);

    let findings = scan_staged(&workspace.path).await.expect("scan");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].file, ".env");
    assert_eq!(findings[0].rule, "env-file");
}

#[tokio::test]
async fn unstaging_and_ignoring_paths_work() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "readme.md", "hello\n", "init").await;
    write_file(&workspace.path, ".env", "MODE=dev\n");
    git_output(&workspace.path, &["add", "-A"]);

    unstage_paths(&workspace.path, &[".env".to_string()])
        .await
        .expect("unstage");
    assert_eq!(git_output(&workspace.path, &["diff", "--cached", "--name-only"]).trim(), "");

    let added = ignore_paths(&workspace.path, &[".env".to_string()]).expect("ignore");
    assert_eq!(added, 1);
    assert_eq!(read_ignore_file(&workspace.path).expect("read").content, "/.env\n");
    assert!(ignore_paths(&workspace.path, &["../outside".to_string()]).is_err());
}

#[tokio::test]
async fn unstaging_works_before_the_first_commit() {
    let workspace = new_repository().await;
    write_file(&workspace.path, ".env", "MODE=dev\n");
    git_output(&workspace.path, &["add", "-A"]);

    unstage_paths(&workspace.path, &[".env".to_string()])
        .await
        .expect("unstage");
    assert_eq!(git_output(&workspace.path, &["diff", "--cached", "--name-only"]).trim(), "");
}
