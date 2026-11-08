mod common;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use common::{commit_file, git_output, new_repository};
use githubdesk_lib::commands::github_home::publish_repository;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::inbox::load_inbox;
use githubdesk_lib::github::orgs::NewRepo;
use githubdesk_lib::jobs::JobRegistry;
use serde_json::{json, Value};
use tempfile::TempDir;

fn search_item(number: u64, title: &str, pull: bool, draft: bool) -> Value {
    let mut item = json!({
        "number": number,
        "title": title,
        "html_url": format!("https://github.com/acme/app/issues/{number}"),
        "updated_at": "2026-02-01T10:00:00Z",
        "repository_url": "https://api.github.com/repos/acme/app",
        "user": {"login": "hubot"},
        "comments": 3,
        "draft": draft,
    });
    if pull {
        item["pull_request"] = json!({"url": "https://api.github.com/repos/acme/app/pulls/1"});
    }
    item
}

fn inbox_handler(request: &MockRequest) -> MockResponse {
    if request.path() != "/search/issues" {
        return MockResponse::json(404, "{}");
    }
    let query = request.query("q").unwrap_or_default();
    let items = if query.contains("review-requested") {
        vec![search_item(7, "Please review", true, false)]
    } else if query.contains("assignee") {
        vec![
            search_item(8, "Fix the crash", false, false),
            search_item(9, "Draft work", true, true),
        ]
    } else {
        vec![]
    };
    MockResponse::json(
        200,
        &json!({"total_count": items.len(), "items": items}).to_string(),
    )
}

async fn inbox_client() -> (MockServer, GithubClient) {
    let server = MockServer::start(inbox_handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

#[tokio::test]
async fn the_inbox_groups_what_waits_for_the_user() {
    let (server, client) = inbox_client().await;

    let inbox = load_inbox(&client, "octo", None).await.expect("inbox");

    assert_eq!(inbox.review_requested.len(), 1);
    assert_eq!(inbox.review_requested[0].number, 7);
    assert_eq!(inbox.review_requested[0].repository, "acme/app");
    assert!(inbox.review_requested[0].pull_request);
    assert_eq!(inbox.review_requested[0].author.as_deref(), Some("hubot"));
    assert_eq!(inbox.assigned.len(), 2);
    assert!(!inbox.assigned[0].pull_request);
    assert!(inbox.assigned[1].draft);
    assert!(inbox.authored.is_empty());

    let queries: Vec<String> = server
        .requests()
        .iter()
        .map(|request| request.query("q").unwrap_or_default())
        .collect();
    assert_eq!(queries.len(), 3);
    for query in &queries {
        assert!(
            query.contains("is%3Aopen") || query.contains("is:open"),
            "{query}"
        );
        assert!(
            query.contains("archived%3Afalse") || query.contains("archived:false"),
            "{query}"
        );
    }
}

#[tokio::test]
async fn an_organization_narrows_every_search() {
    let (server, client) = inbox_client().await;

    load_inbox(&client, "octo", Some("acme"))
        .await
        .expect("inbox");

    for request in server.requests() {
        let query = request.query("q").unwrap_or_default();
        assert!(
            query.contains("org%3Aacme") || query.contains("org:acme"),
            "{query}"
        );
    }
}

#[tokio::test]
async fn unsafe_names_never_reach_the_search() {
    let (server, client) = inbox_client().await;

    let login = load_inbox(&client, "octo cat", None)
        .await
        .expect_err("login");
    let org = load_inbox(&client, "octo", Some("a b"))
        .await
        .expect_err("org");

    assert_eq!(login.kind, ErrorKind::InvalidInput);
    assert_eq!(org.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

fn bare_remote() -> (TempDir, PathBuf) {
    let root = TempDir::new().expect("temp dir");
    git_output(
        root.path(),
        &["init", "-q", "--bare", "-b", "main", "remote.git"],
    );
    let path = root.path().join("remote.git");
    (root, path)
}

fn creation_handler(clone_url: String) -> impl Fn(&MockRequest) -> MockResponse {
    move |request| {
        if request.method == "POST" && request.path() == "/user/repos" {
            let body = json!({
                "name": "work",
                "full_name": "octo/work",
                "owner": {"login": "octo"},
                "html_url": "https://github.com/octo/work",
                "clone_url": clone_url,
                "ssh_url": "git@github.com:octo/work.git",
                "default_branch": "main",
            });
            MockResponse::json(201, &body.to_string())
        } else if request.method == "POST" && request.path() == "/orgs/taken/repos" {
            MockResponse::json(
                422,
                r#"{"message":"Repository creation failed.","errors":[{"message":"name already exists on this account"}]}"#,
            )
        } else {
            MockResponse::json(404, "{}")
        }
    }
}

fn new_repo() -> NewRepo {
    NewRepo {
        name: "work".to_string(),
        description: "A repo".to_string(),
        private: true,
        auto_init: true,
        gitignore_template: None,
        license_template: None,
    }
}

async fn publish(repo: &Path, client: &GithubClient, org: Option<&str>) -> Result<(), ErrorKind> {
    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("job");
    publish_repository(repo, client, org, &new_repo(), guard.token(), &|_| {})
        .await
        .map(|_| ())
        .map_err(|error| error.kind)
}

#[tokio::test]
async fn publishing_creates_the_remote_repository_adds_origin_and_pushes_the_branch() {
    let (_root, bare) = bare_remote();
    let server = MockServer::start(creation_handler(bare.to_string_lossy().into_owned())).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let tip = commit_file(repo, "a.txt", "one", "first").await;

    publish(repo, &client, None).await.expect("publish");

    let requests = server.requests();
    assert_eq!(requests.len(), 1);
    let body: Value = serde_json::from_str(&requests[0].body).expect("json");
    assert_eq!(body["name"], "work");
    assert_eq!(body["private"], true);
    assert_eq!(body["auto_init"], false);
    assert_eq!(
        git_output(repo, &["remote", "get-url", "origin"]).trim(),
        bare.to_string_lossy()
    );
    assert_eq!(
        git_output(repo, &["rev-parse", "--abbrev-ref", "main@{upstream}"]).trim(),
        "origin/main"
    );
    assert_eq!(git_output(&bare, &["rev-parse", "main"]).trim(), tip);
}

#[tokio::test]
async fn an_existing_origin_is_left_alone_and_github_is_used_instead() {
    let (_root, bare) = bare_remote();
    let server = MockServer::start(creation_handler(bare.to_string_lossy().into_owned())).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;
    git_output(
        repo,
        &["remote", "add", "origin", "https://gitlab.example/x/y.git"],
    );

    publish(repo, &client, None).await.expect("publish");

    assert_eq!(
        git_output(repo, &["remote", "get-url", "origin"]).trim(),
        "https://gitlab.example/x/y.git"
    );
    assert_eq!(
        git_output(repo, &["remote", "get-url", "github"]).trim(),
        bare.to_string_lossy()
    );
}

#[tokio::test]
async fn nothing_is_created_when_there_is_nothing_to_publish_or_no_free_remote_name() {
    let (_root, bare) = bare_remote();
    let server = MockServer::start(creation_handler(bare.to_string_lossy().into_owned())).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");

    let empty = new_repository().await;
    assert_eq!(
        publish(&empty.path, &client, None)
            .await
            .expect_err("no commits"),
        ErrorKind::NoCommits
    );

    let crowded = new_repository().await;
    commit_file(&crowded.path, "a.txt", "one", "first").await;
    git_output(
        &crowded.path,
        &["remote", "add", "origin", "https://a.example/x.git"],
    );
    git_output(
        &crowded.path,
        &["remote", "add", "github", "https://b.example/x.git"],
    );
    assert_eq!(
        publish(&crowded.path, &client, None)
            .await
            .expect_err("remotes"),
        ErrorKind::InvalidInput
    );

    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn a_name_that_already_exists_leaves_the_repository_untouched() {
    let (_root, bare) = bare_remote();
    let server = MockServer::start(creation_handler(bare.to_string_lossy().into_owned())).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one", "first").await;

    let error = publish(repo, &client, Some("taken"))
        .await
        .expect_err("taken");

    assert_eq!(error, ErrorKind::GithubValidation);
    assert!(git_output(repo, &["remote"]).trim().is_empty());
}
