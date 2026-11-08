use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::commands::rebase::remove_rebase_files;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::repo_state::{read_operation, OperationKind, RepoOperation};
use crate::git::runner::git;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OperationAction {
    Continue,
    Skip,
    Abort,
}

pub async fn current_operation(repo: &Path) -> AppResult<Option<RepoOperation>> {
    let output = git(repo, &["rev-parse", "--absolute-git-dir"]).await?;
    let git_dir = PathBuf::from(output.trimmed());
    tokio::task::spawn_blocking(move || {
        let operation = read_operation(&git_dir);
        if operation.is_none() {
            remove_rebase_files(&git_dir);
        }
        operation
    })
    .await
    .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))
}

fn verb_for(kind: OperationKind) -> &'static str {
    match kind {
        OperationKind::Merge => "merge",
        OperationKind::CherryPick => "cherry-pick",
        OperationKind::Revert => "revert",
        OperationKind::Rebase => "rebase",
        OperationKind::Am => "am",
    }
}

pub async fn run_operation_action(repo: &Path, action: OperationAction) -> AppResult<()> {
    let Some(operation) = current_operation(repo).await? else {
        return Err(AppError::new(
            ErrorKind::NoOperationInProgress,
            "no operation in progress",
        ));
    };
    let verb = verb_for(operation.kind);
    match (operation.kind, action) {
        (OperationKind::Merge, OperationAction::Continue) => {
            git(repo, &["commit", "--no-edit"]).await?;
        }
        (OperationKind::Merge, OperationAction::Skip) => {
            return Err(AppError::invalid_input("a merge cannot be skipped"));
        }
        (_, OperationAction::Continue) => {
            git(repo, &[verb, "--continue"]).await?;
        }
        (_, OperationAction::Skip) => {
            git(repo, &[verb, "--skip"]).await?;
        }
        (_, OperationAction::Abort) => {
            git(repo, &[verb, "--abort"]).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn operation_state(path: String) -> AppResult<Option<RepoOperation>> {
    current_operation(Path::new(&path)).await
}

#[tauri::command]
pub async fn operation_run(path: String, action: OperationAction) -> AppResult<()> {
    run_operation_action(Path::new(&path), action).await
}
