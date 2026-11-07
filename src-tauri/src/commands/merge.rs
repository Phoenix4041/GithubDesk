use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::merge::parse_merge_tree;
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::ensure_revision;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeMode {
    Merge,
    NoFastForward,
    Squash,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeOutcome {
    FastForward,
    Merged,
    Squashed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub commits: u32,
    pub files_changed: u32,
    pub up_to_date: bool,
    pub can_fast_forward: bool,
    pub unrelated: bool,
    pub conflicts: Vec<String>,
}

async fn count_commits(repo: &Path, range: &str) -> AppResult<u32> {
    let output = git(repo, &["rev-list", "--count", range]).await?;
    Ok(output.trimmed().parse().unwrap_or(0))
}

async fn merge_base(repo: &Path, source: &str) -> AppResult<Option<String>> {
    let output = git_unchecked(repo, &["merge-base", "HEAD", source]).await?;
    if output.success() {
        Ok(Some(output.trimmed()))
    } else if output.exit_code == 1 {
        Ok(None)
    } else {
        Err(AppError::from_git_failure(
            &String::from_utf8_lossy(&output.stdout),
            &output.stderr,
        ))
    }
}

pub async fn preview_merge(repo: &Path, source: &str) -> AppResult<MergePreview> {
    ensure_revision(source)?;
    let source = source.trim();
    let head = git(repo, &["rev-parse", "--verify", "HEAD"])
        .await?
        .trimmed();
    git(
        repo,
        &["rev-parse", "--verify", &format!("{source}^{{commit}}")],
    )
    .await?;

    let base = merge_base(repo, source).await?;
    let unrelated = base.is_none();
    let commits = if unrelated {
        count_commits(repo, source).await?
    } else {
        count_commits(repo, &format!("HEAD..{source}")).await?
    };
    let can_fast_forward = base.as_deref() == Some(head.as_str()) && commits > 0;

    let files_changed = if unrelated {
        0
    } else {
        let names = git(repo, &["diff", "--name-only", &format!("HEAD...{source}")]).await?;
        names.text().lines().filter(|line| !line.is_empty()).count() as u32
    };

    let mut conflicts = Vec::new();
    if !unrelated && !can_fast_forward && commits > 0 {
        let tree = git_unchecked(
            repo,
            &[
                "merge-tree",
                "--write-tree",
                "--name-only",
                "--no-messages",
                "HEAD",
                source,
            ],
        )
        .await?;
        if tree.exit_code == 1 {
            conflicts = parse_merge_tree(&tree.text()).conflicts;
        }
    }

    Ok(MergePreview {
        commits,
        files_changed,
        up_to_date: commits == 0 && !unrelated,
        can_fast_forward,
        unrelated,
        conflicts,
    })
}

pub async fn merge_into_current(
    repo: &Path,
    source: &str,
    mode: MergeMode,
    message: Option<&str>,
) -> AppResult<MergeOutcome> {
    ensure_revision(source)?;
    let source = source.trim();
    let preview = preview_merge(repo, source).await?;
    if preview.up_to_date {
        return Err(AppError::new(ErrorKind::NothingToMerge, source));
    }

    let mut args: Vec<&str> = vec!["merge"];
    match mode {
        MergeMode::Merge => {}
        MergeMode::NoFastForward => args.push("--no-ff"),
        MergeMode::Squash => args.push("--squash"),
    }
    let message = message.map(str::trim).filter(|text| !text.is_empty());
    if mode != MergeMode::Squash {
        if let Some(text) = message {
            args.push("-m");
            args.push(text);
        } else {
            args.push("--no-edit");
        }
    }
    args.push(source);
    git(repo, &args).await?;

    Ok(match mode {
        MergeMode::Squash => MergeOutcome::Squashed,
        MergeMode::Merge if preview.can_fast_forward => MergeOutcome::FastForward,
        _ => MergeOutcome::Merged,
    })
}

#[tauri::command]
pub async fn merge_preview_get(path: String, source: String) -> AppResult<MergePreview> {
    preview_merge(Path::new(&path), &source).await
}

#[tauri::command]
pub async fn merge_branch_into_current(
    path: String,
    source: String,
    mode: MergeMode,
    message: Option<String>,
) -> AppResult<MergeOutcome> {
    merge_into_current(Path::new(&path), &source, mode, message.as_deref()).await
}
