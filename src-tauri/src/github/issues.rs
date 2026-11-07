use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::github::client::{GithubClient, Page};
use crate::github::models::{Comment, Issue, Label, UserRef};
use crate::github::pulls::{repo_path, PAGE_SIZE};

fn ensure_state(state: &str) -> AppResult<()> {
    if matches!(state, "open" | "closed" | "all") {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid state: {state}")))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueBundle {
    pub issue: Issue,
    pub comments: Vec<Comment>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    items: Vec<Issue>,
}

fn without_pull_requests(items: Vec<Issue>) -> Vec<Issue> {
    items
        .into_iter()
        .filter(|issue| issue.pull_request.is_none())
        .collect()
}

fn clean_search_text(text: &str) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub async fn list_issues(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    state: &str,
    label: Option<&str>,
    search: Option<&str>,
    page: u32,
) -> AppResult<Page<Issue>> {
    ensure_state(state)?;
    let base = repo_path(owner, repo)?;
    let text = search
        .map(clean_search_text)
        .filter(|value| !value.is_empty());

    if let Some(text) = text {
        let mut query = format!("repo:{owner}/{repo} is:issue {text}");
        if state != "all" {
            query.push_str(&format!(" state:{state}"));
        }
        if let Some(name) = label.map(str::trim).filter(|value| !value.is_empty()) {
            query.push_str(&format!(" label:\"{}\"", name.replace('"', "")));
        }
        return client
            .get_page_wrapped::<SearchResponse, Issue>(
                "/search/issues",
                &[
                    ("q", query),
                    ("sort", "updated".to_string()),
                    ("order", "desc".to_string()),
                ],
                page,
                PAGE_SIZE,
                |response| response.items,
            )
            .await;
    }

    let mut query = vec![
        ("state", state.to_string()),
        ("sort", "updated".to_string()),
        ("direction", "desc".to_string()),
    ];
    if let Some(name) = label.map(str::trim).filter(|value| !value.is_empty()) {
        query.push(("labels", name.to_string()));
    }
    let page: Page<Issue> = client
        .get_page(&format!("{base}/issues"), &query, page, PAGE_SIZE)
        .await?;
    Ok(Page {
        items: without_pull_requests(page.items),
        next_page: page.next_page,
    })
}

pub async fn get_issue_bundle(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
) -> AppResult<IssueBundle> {
    let base = repo_path(owner, repo)?;
    let issue: Issue = client
        .get_json(&format!("{base}/issues/{number}"), &[])
        .await?;
    let comments: Page<Comment> = client
        .get_page(&format!("{base}/issues/{number}/comments"), &[], 1, 100)
        .await?;
    Ok(IssueBundle {
        issue,
        comments: comments.items,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewIssue {
    pub title: String,
    pub body: String,
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
}

#[derive(Serialize)]
struct CreateIssueBody<'a> {
    title: &'a str,
    body: &'a str,
    labels: &'a [String],
    assignees: &'a [String],
}

pub async fn create_issue(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    request: &NewIssue,
) -> AppResult<Issue> {
    if request.title.trim().is_empty() {
        return Err(AppError::invalid_input("the title is empty"));
    }
    let path = format!("{}/issues", repo_path(owner, repo)?);
    client
        .send_json(
            Method::POST,
            &path,
            &CreateIssueBody {
                title: request.title.trim(),
                body: &request.body,
                labels: &request.labels,
                assignees: &request.assignees,
            },
        )
        .await
}

#[derive(Serialize)]
struct IssueStateBody<'a> {
    state: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    state_reason: Option<&'a str>,
}

pub async fn set_issue_state(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    state: &str,
    reason: Option<&str>,
) -> AppResult<Issue> {
    if !matches!(state, "open" | "closed") {
        return Err(AppError::invalid_input(format!("invalid state: {state}")));
    }
    if let Some(value) = reason {
        if !matches!(value, "completed" | "not_planned" | "reopened") {
            return Err(AppError::invalid_input(format!("invalid reason: {value}")));
        }
    }
    let path = format!("{}/issues/{number}", repo_path(owner, repo)?);
    client
        .send_json(
            Method::PATCH,
            &path,
            &IssueStateBody {
                state,
                state_reason: reason,
            },
        )
        .await
}

pub async fn list_labels(client: &GithubClient, owner: &str, repo: &str) -> AppResult<Vec<Label>> {
    let path = format!("{}/labels", repo_path(owner, repo)?);
    let page: Page<Label> = client.get_page(&path, &[], 1, 100).await?;
    Ok(page.items)
}

pub async fn list_assignees(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<UserRef>> {
    let path = format!("{}/assignees", repo_path(owner, repo)?);
    let page: Page<UserRef> = client.get_page(&path, &[], 1, 100).await?;
    Ok(page.items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_text_loses_control_characters() {
        assert_eq!(clean_search_text("  crash\non start\t "), "crash on start");
        assert_eq!(clean_search_text("\n\t"), "");
    }

    #[test]
    fn states_are_validated() {
        assert!(ensure_state("open").is_ok());
        assert!(ensure_state("all").is_ok());
        assert!(ensure_state("merged").is_err());
    }
}
