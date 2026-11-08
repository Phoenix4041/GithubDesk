use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::commands::status::get_status;
use crate::error::AppResult;
use crate::git::parse::status::StatusSnapshot;
use crate::git::runner::git;
use crate::github::inbox::{load_failing, load_mentions, InboxItem};
use crate::state::AppState;

const MAX_REPOSITORIES: usize = 20;
const MAX_FILES: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeRepoState {
    pub path: String,
    pub available: bool,
    pub branch: Option<String>,
    pub dirty: bool,
    pub ahead: u32,
    pub behind: u32,
}

pub fn state_from_snapshot(path: &str, snapshot: &StatusSnapshot) -> HomeRepoState {
    HomeRepoState {
        path: path.to_string(),
        available: true,
        branch: snapshot.branch.head.clone(),
        dirty: !snapshot.entries.is_empty(),
        ahead: snapshot.branch.ahead,
        behind: snapshot.branch.behind,
    }
}

fn unavailable(path: &str) -> HomeRepoState {
    HomeRepoState {
        path: path.to_string(),
        available: false,
        branch: None,
        dirty: false,
        ahead: 0,
        behind: 0,
    }
}

pub fn split_file_list(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .take(MAX_FILES)
        .map(str::to_string)
        .collect()
}

#[tauri::command]
pub async fn home_repo_states(paths: Vec<String>) -> AppResult<Vec<HomeRepoState>> {
    let mut states = Vec::new();
    for path in paths.iter().take(MAX_REPOSITORIES) {
        if !Path::new(path).is_dir() {
            states.push(unavailable(path));
            continue;
        }
        match get_status(Path::new(path)).await {
            Ok(snapshot) => states.push(state_from_snapshot(path, &snapshot)),
            Err(_) => states.push(unavailable(path)),
        }
    }
    Ok(states)
}

#[tauri::command]
pub async fn home_list_files(path: String) -> AppResult<Vec<String>> {
    let output = git(Path::new(&path), &["ls-files", "-z"]).await?;
    Ok(split_file_list(&output.stdout))
}

#[tauri::command]
pub async fn github_home_mentions(
    state: State<'_, AppState>,
    account_id: String,
    org: Option<String>,
) -> AppResult<Vec<InboxItem>> {
    let account = state.accounts.get(&account_id).await?;
    let client = client_for(&state, &account_id).await?;
    load_mentions(&client, &account.login, org.as_deref()).await
}

#[tauri::command]
pub async fn github_home_failing(
    state: State<'_, AppState>,
    account_id: String,
    org: Option<String>,
) -> AppResult<Vec<InboxItem>> {
    let account = state.accounts.get(&account_id).await?;
    let client = client_for(&state, &account_id).await?;
    load_failing(&client, &account.login, org.as_deref()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::parse::status::{BranchStatus, ChangeKind, StatusEntry};

    fn entry() -> StatusEntry {
        StatusEntry {
            path: "a.txt".to_string(),
            original_path: None,
            index: ChangeKind::Unmodified,
            worktree: ChangeKind::Modified,
            conflicted: false,
            untracked: false,
            submodule: false,
        }
    }

    #[test]
    fn a_clean_branch_reports_no_changes() {
        let snapshot = StatusSnapshot {
            branch: BranchStatus {
                head: Some("main".to_string()),
                ahead: 2,
                behind: 1,
                ..BranchStatus::default()
            },
            entries: Vec::new(),
        };
        let state = state_from_snapshot("/repo", &snapshot);
        assert_eq!(state.branch.as_deref(), Some("main"));
        assert!(!state.dirty);
        assert_eq!((state.ahead, state.behind), (2, 1));
        assert!(state.available);
    }

    #[test]
    fn pending_entries_mark_the_repository_as_dirty() {
        let snapshot = StatusSnapshot {
            branch: BranchStatus::default(),
            entries: vec![entry()],
        };
        assert!(state_from_snapshot("/repo", &snapshot).dirty);
    }

    #[test]
    fn missing_folders_are_reported_as_unavailable() {
        assert!(!unavailable("/gone").available);
    }

    #[test]
    fn the_file_list_splits_on_null_bytes() {
        let files = split_file_list(b"a.txt\0src/b.rs\0\0");
        assert_eq!(files, vec!["a.txt".to_string(), "src/b.rs".to_string()]);
    }
}
