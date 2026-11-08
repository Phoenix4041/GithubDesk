use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::State;
use tokio::sync::Semaphore;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git_streaming, git_unchecked};
use crate::jobs::CancelToken;
use crate::state::AppState;

const MAX_PARALLEL: usize = 3;
const MAX_REPOSITORIES: usize = 200;
const STATUS_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRow {
    pub path: String,
    pub available: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub changes: u32,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OutcomeState {
    Done,
    Updated,
    UpToDate,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoOutcome {
    pub path: String,
    pub state: OutcomeState,
    pub detail: Option<String>,
}

pub fn parse_status(path: &str, output: &str) -> RepoRow {
    let mut row = RepoRow {
        path: path.to_string(),
        available: true,
        branch: None,
        upstream: None,
        changes: 0,
        ahead: 0,
        behind: 0,
    };
    for line in output.lines() {
        let Some(header) = line.strip_prefix("## ") else {
            if !line.trim().is_empty() {
                row.changes += 1;
            }
            continue;
        };
        if let Some(name) = header.strip_prefix("No commits yet on ") {
            row.branch = Some(name.to_string());
            continue;
        }
        if header.starts_with("HEAD (no branch)") {
            row.branch = Some("HEAD".to_string());
            continue;
        }
        let (names, counts) = match header.split_once(" [") {
            Some((names, counts)) => (names, Some(counts.trim_end_matches(']'))),
            None => (header, None),
        };
        match names.split_once("...") {
            Some((branch, upstream)) => {
                row.branch = Some(branch.to_string());
                row.upstream = Some(upstream.to_string());
            }
            None => row.branch = Some(names.to_string()),
        }
        if let Some(counts) = counts {
            for part in counts.split(", ") {
                if let Some(number) = part.strip_prefix("ahead ") {
                    row.ahead = number.parse().unwrap_or(0);
                } else if let Some(number) = part.strip_prefix("behind ") {
                    row.behind = number.parse().unwrap_or(0);
                }
            }
        }
    }
    row
}

fn unavailable(path: &str) -> RepoRow {
    RepoRow {
        path: path.to_string(),
        available: false,
        branch: None,
        upstream: None,
        changes: 0,
        ahead: 0,
        behind: 0,
    }
}

pub async fn repo_row(path: &str) -> RepoRow {
    let directory = Path::new(path);
    if !directory.is_dir() {
        return unavailable(path);
    }
    let run = git_unchecked(
        directory,
        &["status", "--porcelain=v1", "-b", "--untracked-files=normal"],
    );
    match tokio::time::timeout(STATUS_TIMEOUT, run).await {
        Ok(Ok(output)) if output.success() => parse_status(path, &output.text()),
        _ => unavailable(path),
    }
}

fn limit(paths: &[String]) -> AppResult<&[String]> {
    if paths.len() > MAX_REPOSITORIES {
        return Err(AppError::invalid_input("too many repositories"));
    }
    Ok(paths)
}

async fn for_each_repo<F, Fut>(paths: &[String], cancel: &CancelToken, work: F) -> Vec<RepoOutcome>
where
    F: Fn(String, CancelToken) -> Fut + Send + Sync + Clone + 'static,
    Fut: std::future::Future<Output = RepoOutcome> + Send + 'static,
{
    let semaphore = Arc::new(Semaphore::new(MAX_PARALLEL));
    let mut handles = Vec::new();
    for path in paths {
        let semaphore = Arc::clone(&semaphore);
        let work = work.clone();
        let token = cancel.clone();
        let path = path.clone();
        handles.push(tokio::spawn(async move {
            let Ok(_permit) = semaphore.acquire().await else {
                return RepoOutcome {
                    path,
                    state: OutcomeState::Failed,
                    detail: None,
                };
            };
            if token.is_cancelled() {
                return RepoOutcome {
                    path,
                    state: OutcomeState::Skipped,
                    detail: Some("cancelled".to_string()),
                };
            }
            work(path, token).await
        }));
    }
    let mut outcomes = Vec::new();
    for handle in handles {
        if let Ok(outcome) = handle.await {
            outcomes.push(outcome);
        }
    }
    outcomes
}

pub async fn fetch_all(paths: &[String], cancel: &CancelToken) -> AppResult<Vec<RepoOutcome>> {
    let paths = limit(paths)?;
    Ok(for_each_repo(paths, cancel, |path, token| async move {
        let directory = Path::new(&path);
        if !directory.is_dir() {
            return RepoOutcome {
                path,
                state: OutcomeState::Failed,
                detail: Some("missing".to_string()),
            };
        }
        match git_streaming(
            Some(directory),
            &["fetch", "--all", "--prune"],
            token,
            &|_| {},
        )
        .await
        {
            Ok(output) if output.success() => RepoOutcome {
                path,
                state: OutcomeState::Done,
                detail: None,
            },
            Ok(output) => RepoOutcome {
                path,
                state: OutcomeState::Failed,
                detail: Some(AppError::from_git_failure(&output.text(), &output.stderr).detail),
            },
            Err(error) if error.kind == ErrorKind::Cancelled => RepoOutcome {
                path,
                state: OutcomeState::Skipped,
                detail: Some("cancelled".to_string()),
            },
            Err(error) => RepoOutcome {
                path,
                state: OutcomeState::Failed,
                detail: Some(error.detail),
            },
        }
    })
    .await)
}

pub async fn pull_all(paths: &[String], cancel: &CancelToken) -> AppResult<Vec<RepoOutcome>> {
    let paths = limit(paths)?;
    Ok(for_each_repo(paths, cancel, |path, token| async move {
        let row = repo_row(&path).await;
        let skip = |reason: &str| RepoOutcome {
            path: path.clone(),
            state: OutcomeState::Skipped,
            detail: Some(reason.to_string()),
        };
        if !row.available {
            return skip("missing");
        }
        if row.upstream.is_none() {
            return skip("noUpstream");
        }
        if row.behind == 0 {
            return RepoOutcome {
                path,
                state: OutcomeState::UpToDate,
                detail: None,
            };
        }
        if row.ahead > 0 {
            return skip("diverged");
        }
        match git_streaming(
            Some(Path::new(&path)),
            &["pull", "--ff-only"],
            token,
            &|_| {},
        )
        .await
        {
            Ok(output) if output.success() => RepoOutcome {
                path,
                state: OutcomeState::Updated,
                detail: None,
            },
            Ok(output) => RepoOutcome {
                path,
                state: OutcomeState::Failed,
                detail: Some(AppError::from_git_failure(&output.text(), &output.stderr).detail),
            },
            Err(error) => RepoOutcome {
                path,
                state: OutcomeState::Failed,
                detail: Some(error.detail),
            },
        }
    })
    .await)
}

pub async fn statuses(paths: &[String]) -> AppResult<Vec<RepoRow>> {
    let paths = limit(paths)?;
    let semaphore = Arc::new(Semaphore::new(MAX_PARALLEL));
    let mut handles = Vec::new();
    for path in paths {
        let semaphore = Arc::clone(&semaphore);
        let path = path.clone();
        handles.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await;
            repo_row(&path).await
        }));
    }
    let mut rows = Vec::new();
    for handle in handles {
        if let Ok(row) = handle.await {
            rows.push(row);
        }
    }
    Ok(rows)
}

#[tauri::command]
pub async fn multi_status(paths: Vec<String>) -> AppResult<Vec<RepoRow>> {
    statuses(&paths).await
}

#[tauri::command]
pub async fn multi_fetch(
    state: State<'_, AppState>,
    paths: Vec<String>,
    job_id: String,
) -> AppResult<Vec<RepoOutcome>> {
    let guard = state.jobs.register(&job_id);
    fetch_all(&paths, &guard.token()).await
}

#[tauri::command]
pub async fn multi_pull(
    state: State<'_, AppState>,
    paths: Vec<String>,
    job_id: String,
) -> AppResult<Vec<RepoOutcome>> {
    let guard = state.jobs.register(&job_id);
    pull_all(&paths, &guard.token()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_branch_line_gives_branch_upstream_and_counts() {
        let row = parse_status(
            "/r",
            "## main...origin/main [ahead 2, behind 3]\n M a.txt\n?? b.txt\n",
        );
        assert_eq!(row.branch.as_deref(), Some("main"));
        assert_eq!(row.upstream.as_deref(), Some("origin/main"));
        assert_eq!((row.ahead, row.behind, row.changes), (2, 3, 2));
    }

    #[test]
    fn local_only_detached_and_empty_repositories_are_understood() {
        assert_eq!(parse_status("/r", "## topic\n").upstream, None);
        assert_eq!(
            parse_status("/r", "## HEAD (no branch)\n")
                .branch
                .as_deref(),
            Some("HEAD")
        );
        assert_eq!(
            parse_status("/r", "## No commits yet on main\n")
                .branch
                .as_deref(),
            Some("main")
        );
        let gone = parse_status("/r", "## main...origin/main [gone]\n");
        assert_eq!((gone.ahead, gone.behind), (0, 0));
    }
}
