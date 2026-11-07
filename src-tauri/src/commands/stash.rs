use std::path::Path;

use crate::commands::history::{commit_file_diff, commit_files, empty_tree};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::diff::{parse_unified_diff, FileDiff};
use crate::git::parse::log::CommitFile;
use crate::git::parse::stash::{parse_stashes, Stash, STASH_FORMAT};
use crate::git::parse::status::ChangeKind;
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::{ensure_commit_hash, ensure_relative_path, ensure_valid_branch_name};

pub async fn list_stashes(repo: &Path) -> AppResult<Vec<Stash>> {
    let output = git(repo, &["stash", "list", STASH_FORMAT]).await?;
    Ok(parse_stashes(&output.text()))
}

async fn stash_reference(repo: &Path, hash: &str) -> AppResult<String> {
    ensure_commit_hash(hash)?;
    let stashes = list_stashes(repo).await?;
    stashes
        .iter()
        .find(|stash| stash.hash.starts_with(hash) || hash.starts_with(&stash.hash))
        .map(|stash| format!("stash@{{{}}}", stash.index))
        .ok_or_else(|| AppError::new(ErrorKind::StashNotFound, "stash entry not found"))
}

pub async fn save_stash(
    repo: &Path,
    message: Option<&str>,
    include_untracked: bool,
) -> AppResult<()> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("--include-untracked");
    }
    let message = message.map(str::trim).filter(|value| !value.is_empty());
    if let Some(text) = message {
        args.push("-m");
        args.push(text);
    }
    let output = git(repo, &args).await?;
    if output.text().contains("No local changes to save") {
        return Err(AppError::new(
            ErrorKind::NothingToStash,
            "no local changes to save",
        ));
    }
    Ok(())
}

pub async fn apply_stash(repo: &Path, hash: &str, pop: bool) -> AppResult<()> {
    let reference = stash_reference(repo, hash).await?;
    let verb = if pop { "pop" } else { "apply" };
    git(repo, &["stash", verb, &reference]).await?;
    Ok(())
}

pub async fn drop_stash(repo: &Path, hash: &str) -> AppResult<()> {
    let reference = stash_reference(repo, hash).await?;
    git(repo, &["stash", "drop", &reference]).await?;
    Ok(())
}

pub async fn branch_from_stash(repo: &Path, hash: &str, name: &str) -> AppResult<()> {
    ensure_valid_branch_name(repo, name).await?;
    let reference = stash_reference(repo, hash).await?;
    git(repo, &["stash", "branch", name.trim(), &reference]).await?;
    Ok(())
}

async fn untracked_revision(repo: &Path, hash: &str) -> AppResult<Option<String>> {
    let revision = format!("{hash}^3");
    let probe = git_unchecked(repo, &["rev-parse", "--verify", "-q", &revision]).await?;
    Ok(if probe.success() {
        Some(revision)
    } else {
        None
    })
}

pub async fn stash_files(repo: &Path, hash: &str) -> AppResult<Vec<CommitFile>> {
    ensure_commit_hash(hash)?;
    let mut files = commit_files(repo, hash).await?;
    if let Some(revision) = untracked_revision(repo, hash).await? {
        let listing = git(repo, &["ls-tree", "-r", "-z", "--name-only", &revision]).await?;
        for path in String::from_utf8_lossy(&listing.stdout)
            .split('\0')
            .filter(|path| !path.is_empty())
        {
            files.push(CommitFile {
                path: path.to_string(),
                old_path: None,
                status: ChangeKind::Added,
            });
        }
    }
    Ok(files)
}

pub async fn stash_file_diff(
    repo: &Path,
    hash: &str,
    path: &str,
    old_path: Option<&str>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    ensure_commit_hash(hash)?;
    ensure_relative_path(path)?;

    if let Some(revision) = untracked_revision(repo, hash).await? {
        let object = format!("{revision}:{path}");
        let exists = git_unchecked(repo, &["cat-file", "-e", &object]).await?;
        if exists.success() {
            let base = empty_tree(repo).await?;
            let mut args = vec![
                "diff",
                "--no-color",
                "--no-ext-diff",
                "--no-textconv",
                "-U3",
            ];
            if ignore_whitespace {
                args.push("-w");
            }
            args.extend([base.as_str(), revision.as_str(), "--", path]);
            let output = git(repo, &args).await?;
            return Ok(parse_unified_diff(path, &output.text()));
        }
    }
    commit_file_diff(repo, hash, path, old_path, ignore_whitespace).await
}

#[tauri::command]
pub async fn stash_list(path: String) -> AppResult<Vec<Stash>> {
    list_stashes(Path::new(&path)).await
}

#[tauri::command]
pub async fn stash_save(
    path: String,
    message: Option<String>,
    include_untracked: bool,
) -> AppResult<()> {
    save_stash(Path::new(&path), message.as_deref(), include_untracked).await
}

#[tauri::command]
pub async fn stash_apply(path: String, hash: String, pop: bool) -> AppResult<()> {
    apply_stash(Path::new(&path), &hash, pop).await
}

#[tauri::command]
pub async fn stash_drop(path: String, hash: String) -> AppResult<()> {
    drop_stash(Path::new(&path), &hash).await
}

#[tauri::command]
pub async fn stash_branch(path: String, hash: String, name: String) -> AppResult<()> {
    branch_from_stash(Path::new(&path), &hash, &name).await
}

#[tauri::command]
pub async fn stash_changed_files(path: String, hash: String) -> AppResult<Vec<CommitFile>> {
    stash_files(Path::new(&path), &hash).await
}

#[tauri::command]
pub async fn stash_diff(
    path: String,
    hash: String,
    file_path: String,
    old_path: Option<String>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    stash_file_diff(
        Path::new(&path),
        &hash,
        &file_path,
        old_path.as_deref(),
        ignore_whitespace,
    )
    .await
}
