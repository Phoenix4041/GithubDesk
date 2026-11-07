use std::path::Path;

use serde::Serialize;

use crate::commands::operation::current_operation;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::merge::parse_merge_tree;
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::ensure_revision;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseOntoPreview {
    pub replay: u32,
    pub incoming: u32,
    pub has_merges: bool,
    pub up_to_date: bool,
    pub conflicts: Vec<String>,
}

async fn count(repo: &Path, args: &[&str]) -> AppResult<u32> {
    let mut full = vec!["rev-list", "--count"];
    full.extend_from_slice(args);
    let output = git(repo, &full).await?;
    Ok(output.trimmed().parse().unwrap_or(0))
}

pub async fn preview_rebase_onto(repo: &Path, target: &str) -> AppResult<RebaseOntoPreview> {
    ensure_revision(target)?;
    let target = target.trim();
    git(
        repo,
        &["rev-parse", "--verify", &format!("{target}^{{commit}}")],
    )
    .await?;

    let range_replay = format!("{target}..HEAD");
    let range_incoming = format!("HEAD..{target}");
    let replay = count(repo, &[&range_replay]).await?;
    let incoming = count(repo, &[&range_incoming]).await?;
    let has_merges = count(repo, &["--merges", &range_replay]).await? > 0;

    let mut conflicts = Vec::new();
    if incoming > 0 && replay > 0 {
        let tree = git_unchecked(
            repo,
            &[
                "merge-tree",
                "--write-tree",
                "--name-only",
                "--no-messages",
                "HEAD",
                target,
            ],
        )
        .await?;
        if tree.exit_code == 1 {
            conflicts = parse_merge_tree(&tree.text()).conflicts;
        }
    }

    Ok(RebaseOntoPreview {
        replay,
        incoming,
        has_merges,
        up_to_date: incoming == 0,
        conflicts,
    })
}

pub async fn rebase_onto_branch(repo: &Path, target: &str, keep_merges: bool) -> AppResult<()> {
    ensure_revision(target)?;
    let target = target.trim();
    if current_operation(repo).await?.is_some() {
        return Err(AppError::new(
            ErrorKind::OperationInProgress,
            "another operation is in progress",
        ));
    }
    let preview = preview_rebase_onto(repo, target).await?;
    if preview.up_to_date {
        return Err(AppError::new(ErrorKind::NothingToRebase, target));
    }
    let mut args = vec!["rebase", "--autostash"];
    if keep_merges {
        args.push("--rebase-merges");
    }
    args.push(target);
    git(repo, &args).await?;
    Ok(())
}

#[tauri::command]
pub async fn rebase_onto_preview(path: String, target: String) -> AppResult<RebaseOntoPreview> {
    preview_rebase_onto(Path::new(&path), &target).await
}

#[tauri::command]
pub async fn rebase_onto_run(path: String, target: String, keep_merges: bool) -> AppResult<()> {
    rebase_onto_branch(Path::new(&path), &target, keep_merges).await
}
