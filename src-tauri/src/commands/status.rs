use std::path::Path;

use serde::Deserialize;

use crate::error::AppResult;
use crate::git::parse::diff::{
    diff_from_raw_file, parse_unified_diff, FileDiff, MAX_RAW_FILE_BYTES,
};
use crate::git::parse::status::{parse_status, StatusSnapshot};
use crate::git::patch::{build_patch, LineSelection, PatchDirection};
use crate::git::runner::{git, git_unchecked, git_with_input};
use crate::git::validate::ensure_relative_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffSource {
    Staged,
    Unstaged,
    Raw,
}

fn pathspec_input(paths: &[String]) -> AppResult<Vec<u8>> {
    let mut input = Vec::new();
    for path in paths {
        ensure_relative_path(path)?;
        input.extend_from_slice(path.as_bytes());
        input.push(0);
    }
    Ok(input)
}

pub async fn get_status(repo: &Path) -> AppResult<StatusSnapshot> {
    let output = git(
        repo,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )
    .await?;
    parse_status(&output.stdout)
}

pub async fn get_file_diff(
    repo: &Path,
    path: &str,
    original_path: Option<&str>,
    source: DiffSource,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    ensure_relative_path(path)?;

    if source == DiffSource::Raw {
        let full_path = repo.join(path);
        let metadata = match tokio::fs::metadata(&full_path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(FileDiff::empty(path));
            }
            Err(error) => return Err(error.into()),
        };
        if metadata.is_dir() {
            return Ok(FileDiff::empty(path));
        }
        if usize::try_from(metadata.len()).map_or(true, |size| size > MAX_RAW_FILE_BYTES) {
            return Ok(FileDiff::too_large(path));
        }
        let bytes = tokio::fs::read(&full_path).await?;
        return Ok(diff_from_raw_file(path, &bytes));
    }

    let mut args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "-U3",
        "-M",
    ];
    if source == DiffSource::Staged {
        args.push("--cached");
    }
    if ignore_whitespace {
        args.push("-w");
    }
    args.push("--");
    args.push(path);
    if let Some(original) = original_path {
        ensure_relative_path(original)?;
        args.push(original);
    }

    let output = git(repo, &args).await?;
    let mut diff = parse_unified_diff(path, &output.text());
    if ignore_whitespace {
        diff.partial_staging_allowed = false;
    }
    Ok(diff)
}

pub async fn stage_paths(repo: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let input = pathspec_input(paths)?;
    git_with_input(
        repo,
        &[
            "--literal-pathspecs",
            "add",
            "-A",
            "--pathspec-from-file=-",
            "--pathspec-file-nul",
        ],
        input,
    )
    .await?;
    Ok(())
}

pub async fn unstage_paths(repo: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let input = pathspec_input(paths)?;
    let has_head = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"])
        .await?
        .success();

    if has_head {
        git_with_input(
            repo,
            &[
                "--literal-pathspecs",
                "restore",
                "--staged",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            input,
        )
        .await?;
    } else {
        git_with_input(
            repo,
            &[
                "--literal-pathspecs",
                "rm",
                "--cached",
                "-r",
                "-q",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            input,
        )
        .await?;
    }
    Ok(())
}

async fn discard_untracked(repo: &Path, paths: &[String]) -> AppResult<()> {
    for path in paths {
        ensure_relative_path(path)?;
        let full_path = repo.join(path);
        let metadata = match tokio::fs::symlink_metadata(&full_path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        if metadata.is_dir() {
            tokio::fs::remove_dir_all(&full_path).await?;
        } else {
            tokio::fs::remove_file(&full_path).await?;
        }
    }
    Ok(())
}

pub async fn discard_changes(
    repo: &Path,
    tracked: &[String],
    untracked: &[String],
) -> AppResult<()> {
    if !tracked.is_empty() {
        let input = pathspec_input(tracked)?;
        git_with_input(
            repo,
            &[
                "--literal-pathspecs",
                "restore",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            input,
        )
        .await?;
    }
    discard_untracked(repo, untracked).await
}

pub async fn apply_selection(
    repo: &Path,
    diff: &FileDiff,
    selections: &[LineSelection],
    direction: PatchDirection,
) -> AppResult<()> {
    ensure_relative_path(&diff.path)?;
    let patch = build_patch(diff, selections, direction)
        .ok_or_else(|| crate::error::AppError::invalid_input("no changes selected"))?;

    let mut args = vec!["apply", "--cached", "--recount", "--whitespace=nowarn"];
    if direction == PatchDirection::Unstage {
        args.push("--reverse");
    }
    args.push("-");
    git_with_input(repo, &args, patch.into_bytes()).await?;
    Ok(())
}

#[tauri::command]
pub async fn status_get(path: String) -> AppResult<StatusSnapshot> {
    get_status(Path::new(&path)).await
}

#[tauri::command]
pub async fn diff_file(
    path: String,
    file_path: String,
    original_path: Option<String>,
    source: DiffSource,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    get_file_diff(
        Path::new(&path),
        &file_path,
        original_path.as_deref(),
        source,
        ignore_whitespace,
    )
    .await
}

#[tauri::command]
pub async fn changes_stage(path: String, paths: Vec<String>) -> AppResult<()> {
    stage_paths(Path::new(&path), &paths).await
}

#[tauri::command]
pub async fn changes_unstage(path: String, paths: Vec<String>) -> AppResult<()> {
    unstage_paths(Path::new(&path), &paths).await
}

#[tauri::command]
pub async fn changes_discard(
    path: String,
    tracked: Vec<String>,
    untracked: Vec<String>,
) -> AppResult<()> {
    discard_changes(Path::new(&path), &tracked, &untracked).await
}

#[tauri::command]
pub async fn changes_stage_selection(
    path: String,
    diff: FileDiff,
    selections: Vec<LineSelection>,
) -> AppResult<()> {
    apply_selection(Path::new(&path), &diff, &selections, PatchDirection::Stage).await
}

#[tauri::command]
pub async fn changes_unstage_selection(
    path: String,
    diff: FileDiff,
    selections: Vec<LineSelection>,
) -> AppResult<()> {
    apply_selection(
        Path::new(&path),
        &diff,
        &selections,
        PatchDirection::Unstage,
    )
    .await
}
