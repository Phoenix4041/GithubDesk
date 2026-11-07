use std::path::Path;

use crate::error::{AppResult, ErrorKind};
use crate::git::parse::diff::{parse_unified_diff, FileDiff};
use crate::git::parse::log::{
    parse_commit_detail, parse_log, parse_name_status, CommitDetail, CommitFile, CommitSummary,
    DETAIL_FORMAT, LOG_FORMAT,
};
use crate::git::runner::{git, git_unchecked, git_with_input};
use crate::git::validate::{ensure_commit_hash, ensure_relative_path, ensure_revision};

const MAX_PAGE_SIZE: u32 = 500;

pub async fn history_page(
    repo: &Path,
    revision: Option<&str>,
    skip: u32,
    limit: u32,
) -> AppResult<Vec<CommitSummary>> {
    let revision = revision
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");
    ensure_revision(revision)?;

    let count_argument = format!("--max-count={}", limit.clamp(1, MAX_PAGE_SIZE));
    let skip_argument = format!("--skip={skip}");
    let output = git_unchecked(
        repo,
        &[
            "log",
            "-z",
            "--decorate=full",
            LOG_FORMAT,
            &count_argument,
            &skip_argument,
            revision,
            "--",
        ],
    )
    .await?;

    if output.success() {
        return Ok(parse_log(&output.stdout));
    }
    let error = crate::error::AppError::from_git_failure(&output.text(), &output.stderr);
    if error.kind == ErrorKind::NoCommits {
        return Ok(Vec::new());
    }
    Err(error)
}

pub async fn commit_detail(repo: &Path, hash: &str) -> AppResult<Option<CommitDetail>> {
    ensure_commit_hash(hash)?;
    let output = git(
        repo,
        &["show", "-s", "--decorate=full", DETAIL_FORMAT, hash, "--"],
    )
    .await?;
    Ok(parse_commit_detail(&output.text()))
}

pub async fn empty_tree(repo: &Path) -> AppResult<String> {
    let empty_tree =
        git_with_input(repo, &["hash-object", "-t", "tree", "--stdin"], Vec::new()).await?;
    Ok(empty_tree.trimmed())
}

async fn diff_base(repo: &Path, hash: &str) -> AppResult<String> {
    let parent_reference = format!("{hash}^1");
    let parent = git_unchecked(repo, &["rev-parse", "--verify", "-q", &parent_reference]).await?;
    if parent.success() {
        return Ok(parent.trimmed());
    }
    let empty_tree =
        git_with_input(repo, &["hash-object", "-t", "tree", "--stdin"], Vec::new()).await?;
    Ok(empty_tree.trimmed())
}

pub async fn commit_files(repo: &Path, hash: &str) -> AppResult<Vec<CommitFile>> {
    ensure_commit_hash(hash)?;
    let base = diff_base(repo, hash).await?;
    let output = git(
        repo,
        &[
            "diff",
            "--name-status",
            "-z",
            "-M",
            "--no-color",
            &base,
            hash,
        ],
    )
    .await?;
    Ok(parse_name_status(&output.stdout))
}

pub async fn commit_file_diff(
    repo: &Path,
    hash: &str,
    path: &str,
    old_path: Option<&str>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    ensure_commit_hash(hash)?;
    ensure_relative_path(path)?;
    let base = diff_base(repo, hash).await?;

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
    args.extend([base.as_str(), hash, "--", path]);
    if let Some(old) = old_path {
        ensure_relative_path(old)?;
        args.push(old);
    }
    let output = git(repo, &args).await?;
    Ok(parse_unified_diff(path, &output.text()))
}

#[tauri::command]
pub async fn history_list(
    path: String,
    revision: Option<String>,
    skip: u32,
    limit: u32,
) -> AppResult<Vec<CommitSummary>> {
    history_page(Path::new(&path), revision.as_deref(), skip, limit).await
}

#[tauri::command]
pub async fn history_detail(path: String, hash: String) -> AppResult<Option<CommitDetail>> {
    commit_detail(Path::new(&path), &hash).await
}

#[tauri::command]
pub async fn history_files(path: String, hash: String) -> AppResult<Vec<CommitFile>> {
    commit_files(Path::new(&path), &hash).await
}

#[tauri::command]
pub async fn history_file_diff(
    path: String,
    hash: String,
    file_path: String,
    old_path: Option<String>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    commit_file_diff(
        Path::new(&path),
        &hash,
        &file_path,
        old_path.as_deref(),
        ignore_whitespace,
    )
    .await
}
