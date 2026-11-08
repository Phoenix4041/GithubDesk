mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::collab::{
    edit_issue, list_milestones, list_repo_teams, remove_reviewers, request_reviewers,
    set_pull_draft, update_pull_branch, IssueEdit,
};
use serde_json::Value;

const ISSUE: &str = r#"{"number":7,"title":"New title","state":"open","user":{"login":"octo"},
  "labels":[{"name":"bug","color":"d73a4a"}],"assignees":[{"login":"hubot"}],"comments":0,
  "milestone":{"number":3,"title":"v1","state":"open","open_issues":2,"closed_issues":5},
  "created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-02T10:00:00Z","html_url":"u"}"#;

fn pull(node_id: &str) -> String {
    format!(
        r#"{{"number":7,"node_id":"{node_id}","title":"T","state":"open","draft":true,"user":{{"login":"octo"}},
        "created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-02T10:00:00Z","html_url":"u",
        "head":{{"ref":"feature","sha":"abc"}},"base":{{"ref":"main","sha":"def"}},
        "requested_teams":[{{"slug":"core","name":"Core"}}]}}"#
    )
}

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("PATCH", "/repos/o/r/issues/7") => MockResponse::json(200, ISSUE),
        ("POST", "/repos/o/r/pulls/7/requested_reviewers") => MockResponse::json(201, "{}"),
        ("DELETE", "/repos/o/r/pulls/7/requested_reviewers") => MockResponse::json(200, "{}"),
        ("GET", "/repos/o/r/teams") => MockResponse::json(
            200,
            r#"[{"slug":"core","name":"Core"},{"slug":"docs","name":"Docs"}]"#,
        ),
        ("GET", "/repos/o/solo/teams") => MockResponse::json(404, r#"{"message":"Not Found"}"#),
        ("GET", "/repos/o/r/milestones") => MockResponse::json(
            200,
            r#"[{"number":3,"title":"v1","state":"open","open_issues":2,"closed_issues":5,"due_on":"2026-06-01T00:00:00Z"}]"#,
        ),
        ("PUT", "/repos/o/r/pulls/7/update-branch") => {
            MockResponse::json(202, r#"{"message":"Updating pull request branch."}"#)
        }
        ("GET", "/repos/o/r/pulls/7") => MockResponse::json(200, &pull("PR_node")),
        ("GET", "/repos/o/nonode/pulls/7") => MockResponse::json(200, &pull("")),
        ("GET", "/repos/o/bad/pulls/7") => MockResponse::json(200, &pull("PR_bad")),
        ("POST", "/graphql") => {
            if request.body.contains("PR_bad") {
                MockResponse::json(
                    200,
                    r#"{"data":null,"errors":[{"message":"Pull request is not a draft"},{"message":"Second"}]}"#,
                )
            } else {
                MockResponse::json(200, r#"{"data":{"x":{"pullRequest":{"isDraft":false}}}}"#)
            }
        }
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

fn names(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

fn body_of(request: &MockRequest) -> Value {
    serde_json::from_str(&request.body).expect("json body")
}

#[tokio::test]
async fn editing_an_issue_sends_only_what_changed_and_returns_the_result() {
    let (server, client) = setup().await;
    let edit = IssueEdit {
        title: Some("  New title ".to_string()),
        labels: Some(names(&["bug", " help wanted "])),
        assignees: Some(names(&["hubot"])),
        milestone: Some(3),
        ..IssueEdit::default()
    };

    let issue = edit_issue(&client, "o", "r", 7, &edit).await.expect("edit");

    assert_eq!(issue.title, "New title");
    assert_eq!(issue.milestone.expect("milestone").title, "v1");
    let body = body_of(&server.requests()[0]);
    assert_eq!(body["title"], "New title");
    assert_eq!(body["labels"], serde_json::json!(["bug", "help wanted"]));
    assert_eq!(body["assignees"], serde_json::json!(["hubot"]));
    assert_eq!(body["milestone"], 3);
    assert!(body.get("body").is_none());
}

#[tokio::test]
async fn clearing_the_milestone_sends_null_and_an_empty_list_clears_labels() {
    let (server, client) = setup().await;
    let edit = IssueEdit {
        labels: Some(Vec::new()),
        clear_milestone: true,
        body: Some(String::new()),
        ..IssueEdit::default()
    };

    edit_issue(&client, "o", "r", 7, &edit).await.expect("edit");

    let body = body_of(&server.requests()[0]);
    assert!(body["milestone"].is_null());
    assert!(body.as_object().expect("object").contains_key("milestone"));
    assert_eq!(body["labels"], serde_json::json!([]));
    assert_eq!(body["body"], "");
    assert!(body.get("title").is_none());
}

#[tokio::test]
async fn invalid_edits_never_reach_the_server() {
    let (server, client) = setup().await;
    let edits = [
        IssueEdit {
            title: Some(" ".to_string()),
            ..IssueEdit::default()
        },
        IssueEdit {
            assignees: Some(names(&["a b"])),
            ..IssueEdit::default()
        },
        IssueEdit {
            milestone: Some(1),
            clear_milestone: true,
            ..IssueEdit::default()
        },
    ];

    for edit in &edits {
        let error = edit_issue(&client, "o", "r", 7, edit)
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
    let bad_repo = edit_issue(&client, "o", "../r", 7, &IssueEdit::default())
        .await
        .expect_err("repo");
    assert_eq!(bad_repo.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn reviewers_are_requested_and_removed_with_users_and_teams() {
    let (server, client) = setup().await;

    request_reviewers(&client, "o", "r", 7, &names(&["hubot"]), &names(&["core"]))
        .await
        .expect("request");
    remove_reviewers(&client, "o", "r", 7, &names(&["hubot"]), &[])
        .await
        .expect("remove");

    let requests = server.requests();
    assert_eq!(requests[0].method, "POST");
    let requested = body_of(&requests[0]);
    assert_eq!(requested["reviewers"], serde_json::json!(["hubot"]));
    assert_eq!(requested["team_reviewers"], serde_json::json!(["core"]));
    assert_eq!(requests[1].method, "DELETE");
    let removed = body_of(&requests[1]);
    assert_eq!(removed["reviewers"], serde_json::json!(["hubot"]));
    assert_eq!(removed["team_reviewers"], serde_json::json!([]));

    let empty = request_reviewers(&client, "o", "r", 7, &[], &[])
        .await
        .expect_err("nobody");
    assert_eq!(empty.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn teams_are_listed_and_a_user_repository_simply_has_none() {
    let (_server, client) = setup().await;

    let teams = list_repo_teams(&client, "o", "r").await.expect("teams");
    let none = list_repo_teams(&client, "o", "solo").await.expect("none");

    assert_eq!(teams.len(), 2);
    assert_eq!(teams[0].slug, "core");
    assert_eq!(teams[1].name, "Docs");
    assert!(none.is_empty());
}

#[tokio::test]
async fn milestones_are_listed_by_state() {
    let (server, client) = setup().await;

    let milestones = list_milestones(&client, "o", "r", "open")
        .await
        .expect("list");

    assert_eq!(milestones.len(), 1);
    assert_eq!(milestones[0].number, 3);
    assert_eq!(milestones[0].open_issues, 2);
    assert_eq!(
        milestones[0].due_on.as_deref(),
        Some("2026-06-01T00:00:00Z")
    );
    assert_eq!(server.requests()[0].query("state").as_deref(), Some("open"));
    let invalid = list_milestones(&client, "o", "r", "weird")
        .await
        .expect_err("state");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn updating_the_branch_uses_the_dedicated_endpoint() {
    let (server, client) = setup().await;

    update_pull_branch(&client, "o", "r", 7)
        .await
        .expect("update");

    let request = &server.requests()[0];
    assert_eq!(request.method, "PUT");
    assert_eq!(request.path(), "/repos/o/r/pulls/7/update-branch");
}

#[tokio::test]
async fn a_pull_request_goes_to_draft_and_back_through_graphql() {
    let (server, client) = setup().await;

    set_pull_draft(&client, "o", "r", 7, true)
        .await
        .expect("to draft");
    set_pull_draft(&client, "o", "r", 7, false)
        .await
        .expect("to ready");

    let graphql: Vec<MockRequest> = server
        .requests()
        .into_iter()
        .filter(|request| request.path() == "/graphql")
        .collect();
    assert_eq!(graphql.len(), 2);
    assert!(graphql[0].body.contains("convertPullRequestToDraft"));
    assert!(graphql[1].body.contains("markPullRequestReadyForReview"));
    assert_eq!(body_of(&graphql[0])["variables"]["id"], "PR_node");
    assert_eq!(graphql[0].header("authorization"), Some("Bearer tok"));
}

#[tokio::test]
async fn graphql_errors_become_validation_errors_with_every_message() {
    let (_server, client) = setup().await;

    let error = set_pull_draft(&client, "o", "bad", 7, false)
        .await
        .expect_err("graphql error");

    assert_eq!(error.kind, ErrorKind::GithubValidation);
    assert!(error.detail.contains("not a draft"), "{}", error.detail);
    assert!(error.detail.contains("Second"), "{}", error.detail);
}

#[tokio::test]
async fn a_pull_request_without_a_node_id_is_reported() {
    let (_server, client) = setup().await;

    let error = set_pull_draft(&client, "o", "nonode", 7, true)
        .await
        .expect_err("no node id");

    assert_eq!(error.kind, ErrorKind::GithubServerError);
}
