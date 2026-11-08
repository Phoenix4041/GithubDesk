use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::github::client::GithubClient;
use crate::github::models::{Issue, Milestone, PullRequest, TeamRef};
use crate::github::orgs::ensure_login;
use crate::github::pulls::repo_path;

const MAX_TITLE_LENGTH: usize = 256;
const MAX_LABELS: usize = 100;
const MAX_LABEL_LENGTH: usize = 50;
const MAX_ASSIGNEES: usize = 10;
const MAX_REVIEWERS: usize = 15;
const LIST_PAGE_SIZE: &str = "100";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueEdit {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub labels: Option<Vec<String>>,
    #[serde(default)]
    pub assignees: Option<Vec<String>>,
    #[serde(default)]
    pub milestone: Option<u64>,
    #[serde(default)]
    pub clear_milestone: bool,
}

#[derive(Serialize)]
struct IssueEditBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    labels: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assignees: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    milestone: Option<Option<u64>>,
}

#[derive(Serialize)]
struct ReviewersBody<'a> {
    reviewers: &'a [String],
    team_reviewers: &'a [String],
}

fn ensure_slug(value: &str) -> AppResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid team: {value}")))
    }
}

fn validate_edit(edit: &IssueEdit) -> AppResult<()> {
    if let Some(title) = &edit.title {
        let trimmed = title.trim();
        if trimmed.is_empty() || trimmed.chars().count() > MAX_TITLE_LENGTH {
            return Err(AppError::invalid_input("invalid title"));
        }
    }
    if let Some(labels) = &edit.labels {
        let valid = labels.len() <= MAX_LABELS
            && labels.iter().all(|label| {
                let trimmed = label.trim();
                !trimmed.is_empty()
                    && trimmed.chars().count() <= MAX_LABEL_LENGTH
                    && !trimmed.chars().any(char::is_control)
            });
        if !valid {
            return Err(AppError::invalid_input("invalid labels"));
        }
    }
    if let Some(assignees) = &edit.assignees {
        if assignees.len() > MAX_ASSIGNEES {
            return Err(AppError::invalid_input("too many assignees"));
        }
        for login in assignees {
            ensure_login(login)?;
        }
    }
    if edit.clear_milestone && edit.milestone.is_some() {
        return Err(AppError::invalid_input(
            "a milestone cannot be set and cleared at once",
        ));
    }
    Ok(())
}

pub async fn edit_issue(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    edit: &IssueEdit,
) -> AppResult<Issue> {
    validate_edit(edit)?;
    let labels: Option<Vec<String>> = edit
        .labels
        .as_ref()
        .map(|items| items.iter().map(|item| item.trim().to_string()).collect());
    let milestone = if edit.clear_milestone {
        Some(None)
    } else {
        edit.milestone.map(Some)
    };
    let body = IssueEditBody {
        title: edit.title.as_deref().map(str::trim),
        body: edit.body.as_deref(),
        labels: labels.as_deref(),
        assignees: edit.assignees.as_deref(),
        milestone,
    };
    let path = format!("{}/issues/{number}", repo_path(owner, repo)?);
    client.send_json(Method::PATCH, &path, &body).await
}

fn validate_reviewers(reviewers: &[String], teams: &[String]) -> AppResult<()> {
    if reviewers.is_empty() && teams.is_empty() {
        return Err(AppError::invalid_input("no reviewers selected"));
    }
    if reviewers.len() + teams.len() > MAX_REVIEWERS {
        return Err(AppError::invalid_input("too many reviewers"));
    }
    for login in reviewers {
        ensure_login(login)?;
    }
    for slug in teams {
        ensure_slug(slug)?;
    }
    Ok(())
}

pub async fn request_reviewers(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    reviewers: &[String],
    teams: &[String],
) -> AppResult<()> {
    validate_reviewers(reviewers, teams)?;
    let path = format!(
        "{}/pulls/{number}/requested_reviewers",
        repo_path(owner, repo)?
    );
    let body = ReviewersBody {
        reviewers,
        team_reviewers: teams,
    };
    client
        .send_json::<_, Value>(Method::POST, &path, &body)
        .await
        .map(|_| ())
}

pub async fn remove_reviewers(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    reviewers: &[String],
    teams: &[String],
) -> AppResult<()> {
    validate_reviewers(reviewers, teams)?;
    let path = format!(
        "{}/pulls/{number}/requested_reviewers",
        repo_path(owner, repo)?
    );
    let body = ReviewersBody {
        reviewers,
        team_reviewers: teams,
    };
    client
        .send_no_content(Method::DELETE, &path, Some(&body))
        .await
}

pub async fn list_repo_teams(
    client: &GithubClient,
    owner: &str,
    repo: &str,
) -> AppResult<Vec<TeamRef>> {
    let path = format!("{}/teams", repo_path(owner, repo)?);
    match client
        .get_json::<Vec<TeamRef>>(&path, &[("per_page", LIST_PAGE_SIZE.to_string())])
        .await
    {
        Err(error) if error.kind == ErrorKind::GithubNotFound => Ok(Vec::new()),
        other => other,
    }
}

pub async fn list_milestones(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    state: &str,
) -> AppResult<Vec<Milestone>> {
    if !matches!(state, "open" | "closed" | "all") {
        return Err(AppError::invalid_input(format!("invalid state: {state}")));
    }
    let path = format!("{}/milestones", repo_path(owner, repo)?);
    client
        .get_json(
            &path,
            &[
                ("state", state.to_string()),
                ("per_page", LIST_PAGE_SIZE.to_string()),
            ],
        )
        .await
}

pub async fn update_pull_branch(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
) -> AppResult<()> {
    let path = format!("{}/pulls/{number}/update-branch", repo_path(owner, repo)?);
    client
        .send_json::<_, Value>(Method::PUT, &path, &json!({}))
        .await
        .map(|_| ())
}

pub async fn set_pull_draft(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    draft: bool,
) -> AppResult<()> {
    let path = format!("{}/pulls/{number}", repo_path(owner, repo)?);
    let pull: PullRequest = client.get_json(&path, &[]).await?;
    if pull.node_id.is_empty() {
        return Err(AppError::new(
            ErrorKind::GithubServerError,
            "the pull request has no node id",
        ));
    }
    let mutation = if draft {
        "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { pullRequest { isDraft } } }"
    } else {
        "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }"
    };
    client
        .graphql::<Value>(mutation, json!({ "id": pull.node_id }))
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edit() -> IssueEdit {
        IssueEdit::default()
    }

    #[test]
    fn titles_labels_and_assignees_are_checked() {
        let mut bad_title = edit();
        bad_title.title = Some("   ".to_string());
        assert!(validate_edit(&bad_title).is_err());

        let mut long_title = edit();
        long_title.title = Some("x".repeat(257));
        assert!(validate_edit(&long_title).is_err());

        let mut bad_label = edit();
        bad_label.labels = Some(vec!["bug".to_string(), " ".to_string()]);
        assert!(validate_edit(&bad_label).is_err());

        let mut bad_login = edit();
        bad_login.assignees = Some(vec!["octo cat".to_string()]);
        assert!(validate_edit(&bad_login).is_err());

        let mut many = edit();
        many.assignees = Some((0..11).map(|index| format!("user{index}")).collect());
        assert!(validate_edit(&many).is_err());

        let mut both = edit();
        both.milestone = Some(3);
        both.clear_milestone = true;
        assert!(validate_edit(&both).is_err());

        let mut fine = edit();
        fine.title = Some("A title".to_string());
        fine.labels = Some(vec!["bug".to_string(), "help wanted".to_string()]);
        fine.assignees = Some(vec!["octocat".to_string()]);
        assert!(validate_edit(&fine).is_ok());
    }

    #[test]
    fn reviewers_need_valid_names_and_at_least_one() {
        assert!(validate_reviewers(&[], &[]).is_err());
        assert!(validate_reviewers(&["octo".to_string()], &[]).is_ok());
        assert!(validate_reviewers(&[], &["core-team".to_string()]).is_ok());
        assert!(validate_reviewers(&["a b".to_string()], &[]).is_err());
        assert!(validate_reviewers(&[], &["../x".to_string()]).is_err());
    }
}
