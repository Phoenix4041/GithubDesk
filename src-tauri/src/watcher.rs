use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer_opt, DebounceEventResult, Debouncer, NoCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult, ErrorKind};

const DEBOUNCE_MILLISECONDS: u64 = 400;
const CHANGE_EVENT: &str = "repo-changed";

const WATCHED_GIT_ENTRIES: [&str; 12] = [
    "HEAD",
    "index",
    "refs",
    "packed-refs",
    "MERGE_HEAD",
    "REBASE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "sequencer",
    "ORIG_HEAD",
    "rebase-merge",
    "rebase-apply",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoChanged {
    path: String,
}

pub struct RepoWatcher {
    _debouncer: Debouncer<RecommendedWatcher, NoCache>,
}

pub fn is_relevant_change(repo: &Path, changed: &Path) -> bool {
    if changed
        .extension()
        .is_some_and(|extension| extension == "lock")
    {
        return false;
    }
    let Ok(relative) = changed.strip_prefix(repo) else {
        return false;
    };
    let mut components = relative.components();
    match components.next() {
        Some(Component::Normal(first)) if first == ".git" => match components.next() {
            Some(Component::Normal(second)) => {
                WATCHED_GIT_ENTRIES.contains(&second.to_string_lossy().as_ref())
            }
            _ => false,
        },
        Some(_) => true,
        None => false,
    }
}

pub fn start_watching(app: AppHandle, repo: PathBuf) -> AppResult<RepoWatcher> {
    let watched = repo.clone();
    let payload_path = repo.to_string_lossy().into_owned();

    let handler = move |result: DebounceEventResult| {
        let Ok(events) = result else {
            return;
        };
        let relevant = events.iter().any(|event| {
            !matches!(event.kind, EventKind::Access(_))
                && event
                    .paths
                    .iter()
                    .any(|path| is_relevant_change(&watched, path))
        });
        if relevant {
            let _ = app.emit(
                CHANGE_EVENT,
                RepoChanged {
                    path: payload_path.clone(),
                },
            );
        }
    };

    let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NoCache>(
        Duration::from_millis(DEBOUNCE_MILLISECONDS),
        None,
        handler,
        NoCache::new(),
        Config::default(),
    )
    .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))?;
    debouncer
        .watch(&repo, RecursiveMode::Recursive)
        .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))?;

    Ok(RepoWatcher {
        _debouncer: debouncer,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_object_store_and_lock_files() {
        let repo = Path::new("/work/repo");
        assert!(!is_relevant_change(
            repo,
            Path::new("/work/repo/.git/objects/ab/cdef")
        ));
        assert!(!is_relevant_change(
            repo,
            Path::new("/work/repo/.git/index.lock")
        ));
        assert!(!is_relevant_change(
            repo,
            Path::new("/work/repo/.git/refs/heads/main.lock")
        ));
        assert!(!is_relevant_change(repo, Path::new("/elsewhere/file.txt")));
    }

    #[test]
    fn accepts_worktree_files_and_git_state() {
        let repo = Path::new("/work/repo");
        assert!(is_relevant_change(
            repo,
            Path::new("/work/repo/src/main.rs")
        ));
        assert!(is_relevant_change(repo, Path::new("/work/repo/.git/HEAD")));
        assert!(is_relevant_change(repo, Path::new("/work/repo/.git/index")));
        assert!(is_relevant_change(
            repo,
            Path::new("/work/repo/.git/refs/heads/main")
        ));
        assert!(is_relevant_change(repo, Path::new("/work/repo/.gitignore")));
    }
}
