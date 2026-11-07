use std::collections::BTreeMap;

use reqwest::Method;
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::github::client::{GithubClient, Page};
use crate::github::models::{
    Job, JobsResponse, Workflow, WorkflowRun, WorkflowRunsResponse, WorkflowsResponse,
};
use crate::github::pulls::{repo_path, PAGE_SIZE};

const MAX_LOG_BYTES: usize = 400_000;

const RUN_STATUSES: [&str; 16] = [
    "queued",
    "in_progress",
    "completed",
    "waiting",
    "requested",
    "pending",
    "success",
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "neutral",
    "action_required",
    "stale",
    "startup_failure",
    "all",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobLog {
    pub text: String,
    pub truncated: bool,
}

fn ensure_branch(branch: &str) -> AppResult<()> {
    if branch.is_empty() || branch.chars().any(char::is_control) {
        Err(AppError::invalid_input("invalid branch name"))
    } else {
        Ok(())
    }
}

pub fn cap_log(text: String) -> JobLog {
    if text.len() <= MAX_LOG_BYTES {
        return JobLog {
            text,
            truncated: false,
        };
    }
    let mut start = text.len() - MAX_LOG_BYTES;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    JobLog {
        text: text[start..].to_string(),
        truncated: true,
    }
}

pub async fn list_runs(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    branch: Option<&str>,
    status: Option<&str>,
    page: u32,
) -> AppResult<Page<WorkflowRun>> {
    let base = repo_path(owner, repo)?;
    let mut query: Vec<(&str, String)> = Vec::new();
    if let Some(name) = branch.map(str::trim).filter(|value| !value.is_empty()) {
        ensure_branch(name)?;
        query.push(("branch", name.to_string()));
    }
    if let Some(value) = status.map(str::trim).filter(|value| !value.is_empty()) {
        if !RUN_STATUSES.contains(&value) {
            return Err(AppError::invalid_input(format!("invalid status: {value}")));
        }
        if value != "all" {
            query.push(("status", value.to_string()));
        }
    }
    client
        .get_page_wrapped::<WorkflowRunsResponse, WorkflowRun>(
            &format!("{base}/actions/runs"),
            &query,
            page,
            PAGE_SIZE,
            |response| response.workflow_runs,
        )
        .await
}

pub async fn get_run(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    run_id: u64,
) -> AppResult<WorkflowRun> {
    let base = repo_path(owner, repo)?;
    client
        .get_json(&format!("{base}/actions/runs/{run_id}"), &[])
        .await
}

pub async fn list_jobs(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    run_id: u64,
) -> AppResult<Vec<Job>> {
    let base = repo_path(owner, repo)?;
    let page = client
        .get_page_wrapped::<JobsResponse, Job>(
            &format!("{base}/actions/runs/{run_id}/jobs"),
            &[("filter", "latest".to_string())],
            1,
            100,
            |response| response.jobs,
        )
        .await?;
    Ok(page.items)
}

pub async fn get_job_log(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    job_id: u64,
) -> AppResult<JobLog> {
    let base = repo_path(owner, repo)?;
    let text = client
        .get_text(&format!("{base}/actions/jobs/{job_id}/logs"))
        .await?;
    Ok(cap_log(text))
}

pub async fn rerun(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    run_id: u64,
    failed_only: bool,
) -> AppResult<()> {
    let base = repo_path(owner, repo)?;
    let suffix = if failed_only {
        "rerun-failed-jobs"
    } else {
        "rerun"
    };
    client
        .send_no_content(
            Method::POST,
            &format!("{base}/actions/runs/{run_id}/{suffix}"),
            None::<&()>,
        )
        .await
}

pub async fn cancel_run(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    run_id: u64,
) -> AppResult<()> {
    let base = repo_path(owner, repo)?;
    client
        .send_no_content(
            Method::POST,
            &format!("{base}/actions/runs/{run_id}/cancel"),
            None::<&()>,
        )
        .await
}

pub async fn list_workflows(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<Workflow>> {
    let base = repo_path(owner, repo)?;
    let page = client
        .get_page_wrapped::<WorkflowsResponse, Workflow>(
            &format!("{base}/actions/workflows"),
            &[],
            1,
            100,
            |response| response.workflows,
        )
        .await?;
    Ok(page.items)
}

#[derive(Serialize)]
struct DispatchBody<'a> {
    #[serde(rename = "ref")]
    reference: &'a str,
    inputs: &'a BTreeMap<String, String>,
}

pub async fn dispatch_workflow(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    workflow_id: u64,
    reference: &str,
    inputs: &BTreeMap<String, String>,
) -> AppResult<()> {
    let base = repo_path(owner, repo)?;
    let reference = reference.trim();
    ensure_branch(reference)?;
    if inputs
        .keys()
        .any(|key| key.trim().is_empty() || key.chars().any(char::is_control))
    {
        return Err(AppError::invalid_input("invalid workflow input name"));
    }
    client
        .send_no_content(
            Method::POST,
            &format!("{base}/actions/workflows/{workflow_id}/dispatches"),
            Some(&DispatchBody { reference, inputs }),
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_logs_are_kept_whole() {
        let log = cap_log("line one\nline two\n".to_string());
        assert!(!log.truncated);
        assert_eq!(log.text, "line one\nline two\n");
    }

    #[test]
    fn long_logs_keep_the_tail_on_a_character_boundary() {
        let text = "é".repeat(MAX_LOG_BYTES);
        let log = cap_log(text);
        assert!(log.truncated);
        assert!(log.text.len() <= MAX_LOG_BYTES);
        assert!(log.text.chars().all(|character| character == 'é'));
    }

    #[test]
    fn branches_reject_control_characters() {
        assert!(ensure_branch("main").is_ok());
        assert!(ensure_branch("").is_err());
        assert!(ensure_branch("a\nb").is_err());
    }
}
