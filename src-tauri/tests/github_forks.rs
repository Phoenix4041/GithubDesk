mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use common::{git_output, new_repository};
use githubdesk_lib::commands::github_forks::add_upstream_remote;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::forks::{fork_info, sync_fork, ForkSyncStatus};
use serde_json::Value;

const FORK: &str = r#"{"name":"app","full_name":"me/app","fork":true,"default_branch":"main","parent":{"name":"app","full_name":"acme/app","owner":{"login":"acme"},"clone_url":"https://github.com/acme/app.git","html_url":"https://github.com/acme/app","default_branch":"trunk"}}"#;

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/repos/me/app") => MockResponse::json(200, FORK),
        ("GET", "/repos/acme/app") => MockResponse::json(
            200,
            r#"{"name":"app","full_name":"acme/app","fork":false,"default_branch":"trunk"}"#,
        ),
        ("GET", "/repos/me/gone") | ("POST", "/repos/me/gone/merge-upstream") => {
            MockResponse::json(404, r#"{"message":"Not Found"}"#)
        }
        ("POST", "/repos/me/app/merge-upstream") => {
            let body: Value = serde_json::from_str(&request.body).unwrap_or(Value::Null);
            match body["branch"].as_str() {
                Some("main") => MockResponse::json(
                    200,
                    r#"{"message":"Successfully fetched and fast-forwarded from upstream acme:trunk.","merge_type":"fast-forward","base_branch":"acme:trunk"}"#,
                ),
                Some("docs") => MockResponse::json(
                    200,
                    r#"{"message":"This branch is not behind the upstream acme:trunk.","merge_type":"none","base_branch":"acme:trunk"}"#,
                ),
                Some("feature") => MockResponse::json(
                    200,
                    r#"{"message":"Successfully fetched and merged from upstream acme:trunk.","merge_type":"merge","base_branch":"acme:trunk"}"#,
                ),
                Some("busy") => {
                    MockResponse::json(409, r#"{"message":"There are merge conflicts"}"#)
                }
                _ => MockResponse::json(422, r#"{"message":"Branch not found"}"#),
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

#[tokio::test]
async fn a_fork_reports_its_parent_and_a_plain_repository_does_not() {
    let (_server, client) = setup().await;

    let fork = fork_info(&client, "me", "app").await.expect("fork");
    assert!(fork.is_fork);
    assert_eq!(fork.default_branch, "main");
    let parent = fork.parent.expect("parent");
    assert_eq!(parent.full_name, "acme/app");
    assert_eq!(parent.owner, "acme");
    assert_eq!(parent.clone_url, "https://github.com/acme/app.git");
    assert_eq!(parent.default_branch, "trunk");

    let plain = fork_info(&client, "acme", "app").await.expect("plain");
    assert!(!plain.is_fork);
    assert!(plain.parent.is_none());

    let missing = fork_info(&client, "me", "gone").await.expect_err("missing");
    assert_eq!(missing.kind, ErrorKind::GithubNotFound);
}

#[tokio::test]
async fn syncing_reports_the_kind_of_update_and_conflicts() {
    let (server, client) = setup().await;

    let forwarded = sync_fork(&client, "me", "app", "main").await.expect("ok");
    assert_eq!(forwarded.status, ForkSyncStatus::FastForward);
    assert_eq!(forwarded.base_branch, "acme:trunk");
    assert_eq!(forwarded.branch, "main");

    let same = sync_fork(&client, "me", "app", "docs").await.expect("same");
    assert_eq!(same.status, ForkSyncStatus::UpToDate);

    let merged = sync_fork(&client, "me", "app", "feature")
        .await
        .expect("merged");
    assert_eq!(merged.status, ForkSyncStatus::Merged);

    let conflict = sync_fork(&client, "me", "app", "busy")
        .await
        .expect("conflict");
    assert_eq!(conflict.status, ForkSyncStatus::Conflict);
    assert!(conflict.message.contains("merge conflicts"));

    let invalid = sync_fork(&client, "me", "app", "nope")
        .await
        .expect_err("invalid");
    assert_eq!(invalid.kind, ErrorKind::GithubValidation);

    let missing = sync_fork(&client, "me", "gone", "main")
        .await
        .expect_err("missing");
    assert_eq!(missing.kind, ErrorKind::GithubNotFound);

    let refused = sync_fork(&client, "me", "app", "bad..name")
        .await
        .expect_err("refused");
    assert_eq!(refused.kind, ErrorKind::InvalidInput);

    let posted: Vec<MockRequest> = server
        .requests()
        .into_iter()
        .filter(|request| request.method == "POST")
        .collect();
    assert_eq!(posted.len(), 6);
    let first: Value = serde_json::from_str(&posted[0].body).expect("json");
    assert_eq!(first, serde_json::json!({ "branch": "main" }));
}

#[tokio::test]
async fn the_upstream_remote_is_added_once_with_the_parent_url() {
    let workspace = new_repository().await;
    let repo = &workspace.path;

    add_upstream_remote(repo, "https://github.com/acme/app.git")
        .await
        .expect("added");
    let url = git_output(repo, &["remote", "get-url", "upstream"]);
    assert_eq!(url.trim(), "https://github.com/acme/app.git");

    let again = add_upstream_remote(repo, "https://github.com/acme/other.git")
        .await
        .expect_err("exists");
    assert_eq!(again.kind, ErrorKind::InvalidInput);
    let url = git_output(repo, &["remote", "get-url", "upstream"]);
    assert_eq!(url.trim(), "https://github.com/acme/app.git");

    let bad = add_upstream_remote(repo, "--upload-pack=evil")
        .await
        .expect_err("bad url");
    assert_eq!(bad.kind, ErrorKind::InvalidInput);
}
