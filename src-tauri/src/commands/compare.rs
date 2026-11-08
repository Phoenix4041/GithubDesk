use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::git::parse::diff::{parse_unified_diff, FileDiff};
use crate::git::parse::log::{parse_name_status, CommitFile};
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::{ensure_relative_path, ensure_revision};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareSummary {
    pub only_in_base: u32,
    pub only_in_head: u32,
    pub merge_base: Option<String>,
}

fn parse_counts(text: &str) -> AppResult<(u32, u32)> {
    let mut parts = text.split_whitespace();
    let left = parts.next().and_then(|value| value.parse().ok());
    let right = parts.next().and_then(|value| value.parse().ok());
    match (left, right) {
        (Some(left), Some(right)) => Ok((left, right)),
        _ => Err(AppError::invalid_input(format!(
            "unexpected rev-list output: {text}"
        ))),
    }
}

pub async fn compare_summary(repo: &Path, base: &str, head: &str) -> AppResult<CompareSummary> {
    ensure_revision(base)?;
    ensure_revision(head)?;
    let range = format!("{}...{}", base.trim(), head.trim());
    let counts = git(repo, &["rev-list", "--left-right", "--count", &range]).await?;
    let (only_in_base, only_in_head) = parse_counts(&counts.text())?;

    let merge_base = git_unchecked(repo, &["merge-base", base.trim(), head.trim()]).await?;
    Ok(CompareSummary {
        only_in_base,
        only_in_head,
        merge_base: if merge_base.success() {
            Some(merge_base.trimmed())
        } else {
            None
        },
    })
}

pub async fn range_files(repo: &Path, range: &str) -> AppResult<Vec<CommitFile>> {
    let output = git(
        repo,
        &["diff", "--name-status", "-z", "-M", "--no-color", range],
    )
    .await?;
    Ok(parse_name_status(&output.stdout))
}

pub async fn compare_files(repo: &Path, base: &str, head: &str) -> AppResult<Vec<CommitFile>> {
    ensure_revision(base)?;
    ensure_revision(head)?;
    range_files(repo, &format!("{}...{}", base.trim(), head.trim())).await
}

pub async fn range_file_diff(
    repo: &Path,
    range: &str,
    path: &str,
    old_path: Option<&str>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    ensure_relative_path(path)?;
    let mut args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "-U3",
        "-M",
    ];
    if ignore_whitespace {
        args.push("-w");
    }
    args.extend([range, "--", path]);
    if let Some(old) = old_path {
        ensure_relative_path(old)?;
        args.push(old);
    }
    let output = git(repo, &args).await?;
    Ok(parse_unified_diff(path, &output.text()))
}

pub async fn compare_file_diff(
    repo: &Path,
    base: &str,
    head: &str,
    path: &str,
    old_path: Option<&str>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    ensure_revision(base)?;
    ensure_revision(head)?;
    let range = format!("{}...{}", base.trim(), head.trim());
    range_file_diff(repo, &range, path, old_path, ignore_whitespace).await
}

#[tauri::command]
pub async fn compare_get_summary(
    path: String,
    base: String,
    head: String,
) -> AppResult<CompareSummary> {
    compare_summary(Path::new(&path), &base, &head).await
}

#[tauri::command]
pub async fn compare_changed_files(
    path: String,
    base: String,
    head: String,
) -> AppResult<Vec<CommitFile>> {
    compare_files(Path::new(&path), &base, &head).await
}

#[tauri::command]
pub async fn compare_diff(
    path: String,
    base: String,
    head: String,
    file_path: String,
    old_path: Option<String>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    compare_file_diff(
        Path::new(&path),
        &base,
        &head,
        &file_path,
        old_path.as_deref(),
        ignore_whitespace,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_left_and_right_counts() {
        assert_eq!(parse_counts("3\t5\n").expect("counts"), (3, 5));
        assert_eq!(parse_counts("0 0").expect("counts"), (0, 0));
    }

    #[test]
    fn rejects_unexpected_output() {
        assert!(parse_counts("").is_err());
        assert!(parse_counts("x y").is_err());
    }
}
