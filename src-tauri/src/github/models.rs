use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct UserRef {
    pub login: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Label {
    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Milestone {
    pub number: u64,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub open_issues: u64,
    #[serde(default)]
    pub closed_issues: u64,
    #[serde(default)]
    pub due_on: Option<String>,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct TeamRef {
    pub slug: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RepoRef {
    #[serde(default)]
    pub full_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct BranchRef {
    #[serde(default)]
    pub label: String,
    #[serde(rename(serialize = "refName", deserialize = "ref"))]
    pub ref_name: String,
    pub sha: String,
    #[serde(default)]
    pub repo: Option<RepoRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct PullRequest {
    pub number: u64,
    #[serde(default)]
    pub node_id: String,
    pub title: String,
    pub state: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub body: Option<String>,
    pub user: Option<UserRef>,
    #[serde(default)]
    pub labels: Vec<Label>,
    #[serde(default)]
    pub assignees: Vec<UserRef>,
    #[serde(default)]
    pub requested_reviewers: Vec<UserRef>,
    #[serde(default)]
    pub requested_teams: Vec<TeamRef>,
    #[serde(default)]
    pub milestone: Option<Milestone>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub closed_at: Option<String>,
    #[serde(default)]
    pub merged_at: Option<String>,
    pub html_url: String,
    pub head: BranchRef,
    pub base: BranchRef,
    #[serde(default)]
    pub merged: Option<bool>,
    #[serde(default)]
    pub mergeable: Option<bool>,
    #[serde(default)]
    pub mergeable_state: Option<String>,
    #[serde(default)]
    pub additions: Option<u64>,
    #[serde(default)]
    pub deletions: Option<u64>,
    #[serde(default)]
    pub changed_files: Option<u64>,
    #[serde(default)]
    pub commits: Option<u64>,
    #[serde(default)]
    pub comments: Option<u64>,
    #[serde(default)]
    pub review_comments: Option<u64>,
    #[serde(default)]
    pub merged_by: Option<UserRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Comment {
    pub id: u64,
    pub user: Option<UserRef>,
    #[serde(default)]
    pub body: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub author_association: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ReviewComment {
    pub id: u64,
    pub user: Option<UserRef>,
    #[serde(default)]
    pub body: Option<String>,
    pub path: String,
    #[serde(default)]
    pub line: Option<u64>,
    #[serde(default)]
    pub original_line: Option<u64>,
    #[serde(default)]
    pub side: Option<String>,
    #[serde(default)]
    pub in_reply_to_id: Option<u64>,
    #[serde(default)]
    pub commit_id: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Review {
    pub id: u64,
    pub user: Option<UserRef>,
    pub state: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub submitted_at: Option<String>,
    #[serde(default)]
    pub html_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct CheckRun {
    pub id: u64,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub conclusion: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CheckRunsResponse {
    #[serde(default)]
    pub check_runs: Vec<CheckRun>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Permissions {
    #[serde(default)]
    pub admin: bool,
    #[serde(default)]
    pub push: bool,
    #[serde(default)]
    pub pull: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RepoInfo {
    pub full_name: String,
    pub default_branch: String,
    #[serde(default)]
    pub private: bool,
    pub html_url: String,
    #[serde(default)]
    pub permissions: Option<Permissions>,
    #[serde(default = "default_true")]
    pub allow_merge_commit: bool,
    #[serde(default = "default_true")]
    pub allow_squash_merge: bool,
    #[serde(default = "default_true")]
    pub allow_rebase_merge: bool,
    #[serde(default)]
    pub has_issues: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub state: String,
    #[serde(default)]
    pub state_reason: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    pub user: Option<UserRef>,
    #[serde(default)]
    pub labels: Vec<Label>,
    #[serde(default)]
    pub assignees: Vec<UserRef>,
    #[serde(default)]
    pub comments: u64,
    #[serde(default)]
    pub milestone: Option<Milestone>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub closed_at: Option<String>,
    pub html_url: String,
    #[serde(default, skip_serializing)]
    pub pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct WorkflowRun {
    pub id: u64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub display_title: Option<String>,
    #[serde(default)]
    pub head_branch: Option<String>,
    pub head_sha: String,
    pub event: String,
    pub status: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
    pub run_number: u64,
    #[serde(default)]
    pub run_attempt: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub run_started_at: Option<String>,
    pub html_url: String,
    #[serde(default)]
    pub actor: Option<UserRef>,
    #[serde(default)]
    pub workflow_id: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct WorkflowRunsResponse {
    #[serde(default)]
    pub workflow_runs: Vec<WorkflowRun>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JobStep {
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub conclusion: Option<String>,
    pub number: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Job {
    pub id: u64,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub conclusion: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    #[serde(default)]
    pub steps: Vec<JobStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct JobsResponse {
    #[serde(default)]
    pub jobs: Vec<Job>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Workflow {
    pub id: u64,
    pub name: String,
    pub path: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct WorkflowsResponse {
    #[serde(default)]
    pub workflows: Vec<Workflow>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const PULL: &str = r#"{
      "number": 42, "state": "open", "title": "Add feature", "draft": false, "body": null,
      "user": {"login": "octocat", "avatar_url": "https://avatars.githubusercontent.com/u/1", "html_url": "https://github.com/octocat"},
      "labels": [{"name": "bug", "color": "d73a4a", "description": null}],
      "assignees": [], "requested_reviewers": [{"login": "hubot"}],
      "created_at": "2026-01-01T10:00:00Z", "updated_at": "2026-01-02T10:00:00Z",
      "closed_at": null, "merged_at": null, "html_url": "https://github.com/o/r/pull/42",
      "head": {"label": "octocat:topic", "ref": "topic", "sha": "abc", "repo": {"full_name": "octocat/r"}},
      "base": {"label": "o:main", "ref": "main", "sha": "def", "repo": {"full_name": "o/r"}},
      "merged": false, "mergeable": true, "mergeable_state": "clean",
      "additions": 10, "deletions": 2, "changed_files": 3, "commits": 1, "comments": 0, "review_comments": 4
    }"#;

    #[test]
    fn pull_requests_map_github_fields_to_camel_case() {
        let pull: PullRequest = serde_json::from_str(PULL).expect("pull");
        assert_eq!(pull.number, 42);
        assert_eq!(pull.head.ref_name, "topic");
        assert_eq!(
            pull.base.repo.as_ref().map(|repo| repo.full_name.as_str()),
            Some("o/r")
        );
        assert_eq!(pull.requested_reviewers[0].login, "hubot");
        assert_eq!(pull.mergeable_state.as_deref(), Some("clean"));

        let json = serde_json::to_value(&pull).expect("json");
        assert_eq!(json["head"]["refName"], "topic");
        assert_eq!(json["htmlUrl"], "https://github.com/o/r/pull/42");
        assert_eq!(json["changedFiles"], 3);
        assert_eq!(
            json["user"]["avatarUrl"],
            "https://avatars.githubusercontent.com/u/1"
        );
        assert!(json.get("html_url").is_none());
    }

    #[test]
    fn pull_requests_from_list_responses_work_without_detail_fields() {
        let minimal = r#"{
          "number": 1, "state": "closed", "title": "t", "user": null,
          "created_at": "a", "updated_at": "b", "html_url": "u",
          "head": {"ref": "h", "sha": "1"}, "base": {"ref": "b", "sha": "2"}
        }"#;
        let pull: PullRequest = serde_json::from_str(minimal).expect("pull");
        assert!(pull.user.is_none());
        assert_eq!(pull.additions, None);
        assert!(pull.labels.is_empty());
    }

    #[test]
    fn issues_hide_the_pull_request_marker_when_serialized() {
        let text = r#"{"number":7,"title":"x","state":"open","user":{"login":"a"},
          "created_at":"a","updated_at":"b","html_url":"u","comments":2,
          "pull_request":{"url":"https://api.github.com/repos/o/r/pulls/7"}}"#;
        let issue: Issue = serde_json::from_str(text).expect("issue");
        assert!(issue.pull_request.is_some());
        let json = serde_json::to_value(&issue).expect("json");
        assert!(json.get("pullRequest").is_none());
        assert_eq!(json["comments"], 2);
    }

    #[test]
    fn workflow_runs_and_jobs_parse_their_wrappers() {
        let runs: WorkflowRunsResponse = serde_json::from_str(
            r#"{"total_count":1,"workflow_runs":[{"id":9,"name":"CI","display_title":"Fix","head_branch":"main",
              "head_sha":"abc","event":"push","status":"completed","conclusion":"success","run_number":5,
              "created_at":"a","updated_at":"b","html_url":"u","actor":{"login":"octocat"},"workflow_id":3}]}"#,
        )
        .expect("runs");
        assert_eq!(runs.workflow_runs[0].conclusion.as_deref(), Some("success"));
        assert_eq!(runs.workflow_runs[0].workflow_id, Some(3));

        let jobs: JobsResponse = serde_json::from_str(
            r#"{"jobs":[{"id":1,"name":"build","status":"in_progress","conclusion":null,
              "steps":[{"name":"Set up","status":"completed","conclusion":"success","number":1}]}]}"#,
        )
        .expect("jobs");
        assert_eq!(jobs.jobs[0].steps[0].number, 1);
        assert_eq!(jobs.jobs[0].conclusion, None);
    }

    #[test]
    fn repository_info_defaults_merge_methods_to_allowed() {
        let info: RepoInfo = serde_json::from_str(
            r#"{"full_name":"o/r","default_branch":"main","html_url":"u","permissions":{"admin":false,"push":true,"pull":true}}"#,
        )
        .expect("info");
        assert!(info.allow_merge_commit && info.allow_squash_merge && info.allow_rebase_merge);
        assert!(info.permissions.expect("permissions").push);
    }
}
