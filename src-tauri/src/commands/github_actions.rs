use std::collections::BTreeMap;

use tauri::State;

use crate::commands::github_pulls::client_for;
use crate::error::AppResult;
use crate::github::actions::{self, JobLog};
use crate::github::client::Page;
use crate::github::models::{CheckRun, Job, Workflow, WorkflowRun};
use crate::state::AppState;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_runs_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    branch: Option<String>,
    status: Option<String>,
    page: u32,
) -> AppResult<Page<WorkflowRun>> {
    let client = client_for(&state, &account_id).await?;
    actions::list_runs(
        &client,
        &owner,
        &repo,
        branch.as_deref(),
        status.as_deref(),
        page,
    )
    .await
}

#[tauri::command]
pub async fn github_commit_checks(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    sha: String,
) -> AppResult<Vec<CheckRun>> {
    let client = client_for(&state, &account_id).await?;
    actions::commit_checks(&client, &owner, &repo, &sha).await
}

#[tauri::command]
pub async fn github_run_get(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    run_id: u64,
) -> AppResult<WorkflowRun> {
    let client = client_for(&state, &account_id).await?;
    actions::get_run(&client, &owner, &repo, run_id).await
}

#[tauri::command]
pub async fn github_run_jobs(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    run_id: u64,
) -> AppResult<Vec<Job>> {
    let client = client_for(&state, &account_id).await?;
    actions::list_jobs(&client, &owner, &repo, run_id).await
}

#[tauri::command]
pub async fn github_job_log(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    job_id: u64,
) -> AppResult<JobLog> {
    let client = client_for(&state, &account_id).await?;
    actions::get_job_log(&client, &owner, &repo, job_id).await
}

#[tauri::command]
pub async fn github_run_rerun(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    run_id: u64,
    failed_only: bool,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions::rerun(&client, &owner, &repo, run_id, failed_only).await
}

#[tauri::command]
pub async fn github_run_cancel(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    run_id: u64,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions::cancel_run(&client, &owner, &repo, run_id).await
}

#[tauri::command]
pub async fn github_workflows_list(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
) -> AppResult<Vec<Workflow>> {
    let client = client_for(&state, &account_id).await?;
    actions::list_workflows(&client, &owner, &repo).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_workflow_dispatch(
    state: State<'_, AppState>,
    account_id: String,
    owner: String,
    repo: String,
    workflow_id: u64,
    reference: String,
    inputs: BTreeMap<String, String>,
) -> AppResult<()> {
    let client = client_for(&state, &account_id).await?;
    actions::dispatch_workflow(&client, &owner, &repo, workflow_id, &reference, &inputs).await
}
