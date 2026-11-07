use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::commands::history::history_search;
use crate::commands::operation::current_operation;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::history_query::HistoryQuery;
use crate::git::parse::rebase_todo::{build_todo, RebaseStep};
use crate::git::runner::{git, git_unchecked, git_with_env};
use crate::git::validate::ensure_commit_hash;

pub const REBASE_FILES_DIRECTORY: &str = "githubdesk-rebase";
const MAX_REBASE_COMMITS: u32 = 500;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseCommit {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author_name: String,
    pub pushed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebasePlan {
    pub base: String,
    pub commits: Vec<RebaseCommit>,
}

async fn git_directory(repo: &Path) -> AppResult<PathBuf> {
    let output = git(repo, &["rev-parse", "--absolute-git-dir"]).await?;
    Ok(PathBuf::from(output.trimmed()))
}

pub fn remove_rebase_files(git_dir: &Path) {
    let _ = std::fs::remove_dir_all(git_dir.join(REBASE_FILES_DIRECTORY));
}

async fn ensure_base_is_ancestor(repo: &Path, base: &str) -> AppResult<()> {
    ensure_commit_hash(base)?;
    let probe = git_unchecked(repo, &["merge-base", "--is-ancestor", base, "HEAD"]).await?;
    if probe.success() {
        Ok(())
    } else {
        Err(AppError::invalid_input(
            "the chosen commit is not part of the current branch",
        ))
    }
}

pub async fn plan_rebase(repo: &Path, base: &str) -> AppResult<RebasePlan> {
    ensure_base_is_ancestor(repo, base).await?;

    let range = format!("{base}..HEAD");
    let query = HistoryQuery {
        revision: Some(range.clone()),
        ..HistoryQuery::default()
    };
    let mut commits = history_search(repo, &query, 0, MAX_REBASE_COMMITS, None).await?;
    commits.reverse();

    if commits.is_empty() {
        return Err(AppError::new(
            ErrorKind::NothingToRebase,
            "there are no commits after the chosen one",
        ));
    }
    if commits.iter().any(|commit| commit.parents.len() > 1) {
        return Err(AppError::new(
            ErrorKind::RebaseHasMerges,
            "the range contains merge commits",
        ));
    }

    let unpushed = git(repo, &["rev-list", &range, "--not", "--remotes"]).await?;
    let unpushed: HashSet<String> = unpushed.text().lines().map(str::to_string).collect();

    Ok(RebasePlan {
        base: base.to_string(),
        commits: commits
            .into_iter()
            .map(|commit| RebaseCommit {
                pushed: !unpushed.contains(&commit.hash),
                hash: commit.hash,
                short_hash: commit.short_hash,
                subject: commit.subject,
                author_name: commit.author_name,
            })
            .collect(),
    })
}

fn ensure_plan_matches(plan: &RebasePlan, steps: &[RebaseStep]) -> AppResult<()> {
    let expected: HashSet<&str> = plan
        .commits
        .iter()
        .map(|commit| commit.hash.as_str())
        .collect();
    let given: HashSet<&str> = steps.iter().map(|step| step.hash.as_str()).collect();
    if expected != given || steps.len() != plan.commits.len() {
        return Err(AppError::invalid_input(
            "the commits changed since the plan was made",
        ));
    }
    Ok(())
}

pub async fn start_rebase(repo: &Path, base: &str, steps: &[RebaseStep]) -> AppResult<()> {
    for step in steps {
        ensure_commit_hash(&step.hash)?;
    }
    if current_operation(repo).await?.is_some() {
        return Err(AppError::new(
            ErrorKind::OperationInProgress,
            "another operation is in progress",
        ));
    }
    let plan = plan_rebase(repo, base).await?;
    ensure_plan_matches(&plan, steps)?;

    let git_dir = git_directory(repo).await?;
    let files_directory = git_dir.join(REBASE_FILES_DIRECTORY);
    let message_directory_text = files_directory.to_string_lossy().replace('\\', "/");
    let path_for = |index: usize| format!("{message_directory_text}/msg-{index}.txt");
    let script = build_todo(steps, &path_for)?;

    tokio::fs::create_dir_all(&files_directory).await?;
    for (index, message) in script.messages.iter().enumerate() {
        let mut text = message.clone();
        text.push('\n');
        tokio::fs::write(files_directory.join(format!("msg-{index}.txt")), text).await?;
    }
    let todo_path = files_directory.join("todo.txt");
    tokio::fs::write(&todo_path, script.todo.as_bytes()).await?;

    let editor = format!("cp \"{}\"", todo_path.to_string_lossy().replace('\\', "/"));
    let result = git_with_env(
        repo,
        &["rebase", "-i", "--autostash", base],
        &[("GIT_SEQUENCE_EDITOR", editor.as_str())],
    )
    .await;

    let _ = tokio::fs::remove_file(&todo_path).await;
    if current_operation(repo).await?.is_none() {
        remove_rebase_files(&git_dir);
    }
    result.map(|_| ())
}

#[tauri::command]
pub async fn rebase_plan(path: String, base: String) -> AppResult<RebasePlan> {
    plan_rebase(Path::new(&path), &base).await
}

#[tauri::command]
pub async fn rebase_start(path: String, base: String, steps: Vec<RebaseStep>) -> AppResult<()> {
    start_rebase(Path::new(&path), &base, &steps).await
}
