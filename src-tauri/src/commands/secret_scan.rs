use std::path::Path;

use crate::commands::gitignore::append_ignore_lines;
use crate::error::AppResult;
use crate::git::parse::ignore::parse_nul_paths;
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::ensure_relative_path;
use crate::secret_scan::{ignore_pattern, scan_diff, scan_env_paths, SecretFinding};

pub async fn scan_staged(repo: &Path) -> AppResult<Vec<SecretFinding>> {
    let names = git(
        repo,
        &["diff", "--cached", "--name-only", "--diff-filter=AMR", "-z"],
    )
    .await?;
    let mut findings = scan_env_paths(&parse_nul_paths(&names.text()));
    let diff = git(
        repo,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--cached",
            "--no-color",
            "--no-ext-diff",
            "--unified=0",
            "--diff-filter=AMR",
        ],
    )
    .await?;
    findings.extend(scan_diff(&diff.text()));
    Ok(findings)
}

pub async fn unstage_paths(repo: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    for path in paths {
        ensure_relative_path(path)?;
    }
    let has_head = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"])
        .await?
        .success();
    let mut args: Vec<&str> = if has_head {
        vec!["restore", "--staged", "--"]
    } else {
        vec!["rm", "--cached", "-q", "--"]
    };
    args.extend(paths.iter().map(String::as_str));
    git(repo, &args).await?;
    Ok(())
}

pub fn ignore_paths(repo: &Path, paths: &[String]) -> AppResult<usize> {
    for path in paths {
        ensure_relative_path(path)?;
    }
    let lines: Vec<String> = paths.iter().map(|path| ignore_pattern(path)).collect();
    append_ignore_lines(repo, &lines)
}

#[tauri::command]
pub async fn secret_scan_staged(path: String) -> AppResult<Vec<SecretFinding>> {
    scan_staged(Path::new(&path)).await
}

#[tauri::command]
pub async fn secret_scan_unstage(path: String, paths: Vec<String>) -> AppResult<()> {
    unstage_paths(Path::new(&path), &paths).await
}

#[tauri::command]
pub async fn secret_scan_ignore(path: String, paths: Vec<String>) -> AppResult<usize> {
    ignore_paths(Path::new(&path), &paths)
}
