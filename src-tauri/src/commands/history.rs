use std::path::Path;

use tauri::State;

use crate::error::{AppResult, ErrorKind};
use crate::git::history_query::{build_log_arguments, HistoryQuery};
use crate::git::parse::diff::{parse_unified_diff, FileDiff};
use crate::git::parse::log::{
    parse_commit_detail, parse_log, parse_name_status, CommitDetail, CommitFile, CommitSummary,
    DETAIL_FORMAT,
};
use crate::git::runner::{git, git_streaming, git_unchecked, git_with_input};
use crate::git::validate::{ensure_commit_hash, ensure_relative_path};
use crate::jobs::CancelToken;
use crate::state::AppState;

pub async fn history_page(
    repo: &Path,
    revision: Option<&str>,
    skip: u32,
    limit: u32,
) -> AppResult<Vec<CommitSummary>> {
    let query = HistoryQuery {
        revision: revision.map(str::to_string),
        ..HistoryQuery::default()
    };
    history_search(repo, &query, skip, limit, None).await
}

pub async fn history_search(
    repo: &Path,
    query: &HistoryQuery,
    skip: u32,
    limit: u32,
    cancel: Option<CancelToken>,
) -> AppResult<Vec<CommitSummary>> {
    let arguments = build_log_arguments(query, skip, limit)?;
    let borrowed: Vec<&str> = arguments.iter().map(String::as_str).collect();
    let result = match cancel {
        Some(token) => git_streaming(Some(repo), &borrowed, token, &|_| {}).await,
        None => git(repo, &borrowed).await,
    };
    match result {
        Ok(output) => Ok(parse_log(&output.stdout)),
        Err(error) if error.kind == ErrorKind::NoCommits => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

pub async fn prepare_commit_graph(repo: &Path) -> AppResult<()> {
    let probe = git(
        repo,
        &["rev-parse", "--git-path", "objects/info/commit-graph"],
    )
    .await?;
    let single = repo.join(probe.trimmed());
    let split = repo.join(
        git(
            repo,
            &["rev-parse", "--git-path", "objects/info/commit-graphs"],
        )
        .await?
        .trimmed(),
    );
    if single.exists() || split.exists() {
        return Ok(());
    }
    let _ = git_unchecked(repo, &["commit-graph", "write", "--reachable"]).await?;
    Ok(())
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
    state: State<'_, AppState>,
    path: String,
    query: HistoryQuery,
    skip: u32,
    limit: u32,
    job_id: Option<String>,
) -> AppResult<Vec<CommitSummary>> {
    let guard = job_id.as_deref().map(|id| state.jobs.register(id));
    history_search(
        Path::new(&path),
        &query,
        skip,
        limit,
        guard.as_ref().map(|guard| guard.token()),
    )
    .await
}

#[tauri::command]
pub async fn history_prepare_graph(path: String) -> AppResult<()> {
    prepare_commit_graph(Path::new(&path)).await
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
