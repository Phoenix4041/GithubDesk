mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::issues::{
    create_issue, get_issue_bundle, list_assignees, list_issues, list_labels, set_issue_state,
    NewIssue,
};
use serde_json::Value;

const ISSUE: &str = r#"{"number":7,"title":"Crash on start","state":"open","state_reason":null,"body":"Steps",
  "user":{"login":"octocat","avatar_url":"https://avatars.githubusercontent.com/u/1"},
  "labels":[{"name":"bug","color":"d73a4a"}],"assignees":[],"comments":2,
  "created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-02T10:00:00Z","html_url":"https://github.com/o/r/issues/7"}"#;

const PULL_AS_ISSUE: &str = r#"{"number":8,"title":"A pull request","state":"open","user":{"login":"hubot"},
  "created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-02T10:00:00Z","html_url":"u",
  "pull_request":{"url":"https://api.github.com/repos/o/r/pulls/8"}}"#;

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/repos/o/r/issues") => {
            MockResponse::json(200, &format!("[{ISSUE},{PULL_AS_ISSUE}]"))
        }
        ("GET", "/search/issues") => {
            MockResponse::json(200, &format!("{{\"total_count\":1,\"items\":[{ISSUE}]}}"))
        }
        ("GET", "/repos/o/r/issues/7") => MockResponse::json(200, ISSUE),
        ("GET", "/repos/o/r/issues/7/comments") => MockResponse::json(
            200,
            r#"[{"id":3,"user":{"login":"hubot"},"body":"Can reproduce","created_at":"2026-01-03T10:00:00Z","html_url":"u"}]"#,
        ),
        ("POST", "/repos/o/r/issues") => MockResponse::json(201, ISSUE),
        ("PATCH", "/repos/o/r/issues/7") => MockResponse::json(200, ISSUE),
        ("GET", "/repos/o/r/labels") => MockResponse::json(
            200,
            r#"[{"name":"bug","color":"d73a4a","description":"Something is broken"},{"name":"help wanted","color":"008672"}]"#,
        ),
        ("GET", "/repos/o/r/assignees") => {
            MockResponse::json(200, r#"[{"login":"octocat"},{"login":"hubot"}]"#)
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
async fn issue_lists_hide_pull_requests_and_pass_filters() {
    let (server, client) = setup().await;
    let page = list_issues(&client, "o", "r", "open", Some("bug"), None, 1)
        .await
        .expect("list");
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].number, 7);
    assert_eq!(page.items[0].labels[0].name, "bug");

    let request = &server.requests()[0];
    assert_eq!(request.query("state").as_deref(), Some("open"));
    assert_eq!(request.query("labels").as_deref(), Some("bug"));
    assert_eq!(request.query("sort").as_deref(), Some("updated"));

    let invalid = list_issues(&client, "o", "r", "merged", None, None, 1)
        .await
        .expect_err("state");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn text_searches_use_the_search_api_scoped_to_the_repository() {
    let (server, client) = setup().await;
    let page = list_issues(
        &client,
        "o",
        "r",
        "closed",
        Some("help wanted"),
        Some("  crash\nstart "),
        2,
    )
    .await
    .expect("search");
    assert_eq!(page.items.len(), 1);

    let request = &server.requests()[0];
    assert_eq!(request.path(), "/search/issues");
    let query = request
        .query("q")
        .expect("q")
        .replace('+', " ")
        .replace("%3A", ":")
        .replace("%22", "\"")
        .replace("%2F", "/");
    assert!(query.contains("repo:o/r"));
    assert!(query.contains("is:issue"));
    assert!(query.contains("crash start"));
    assert!(query.contains("state:closed"));
    assert!(query.contains("label:\"help wanted\"") || query.contains("label:%22help%20wanted%22"));
    assert_eq!(request.query("page").as_deref(), Some("2"));
}

#[tokio::test]
async fn a_blank_search_falls_back_to_the_plain_list() {
    let (server, client) = setup().await;
    list_issues(&client, "o", "r", "all", None, Some("   "), 1)
        .await
        .expect("list");
    assert_eq!(server.requests()[0].path(), "/repos/o/r/issues");
}

#[tokio::test]
async fn issue_bundles_include_comments() {
    let (_, client) = setup().await;
    let bundle = get_issue_bundle(&client, "o", "r", 7)
        .await
        .expect("bundle");
    assert_eq!(bundle.issue.title, "Crash on start");
    assert_eq!(bundle.comments[0].body.as_deref(), Some("Can reproduce"));
}

#[tokio::test]
async fn creating_an_issue_sends_labels_and_assignees() {
    let (server, client) = setup().await;
    create_issue(
        &client,
        "o",
        "r",
        &NewIssue {
            title: " Crash on start ".into(),
            body: "Steps".into(),
            labels: vec!["bug".into()],
            assignees: vec!["octocat".into()],
        },
    )
    .await
    .expect("create");
    let body: Value = serde_json::from_str(&server.requests()[0].body).expect("json");
    assert_eq!(body["title"], "Crash on start");
    assert_eq!(body["labels"][0], "bug");
    assert_eq!(body["assignees"][0], "octocat");

    let empty = NewIssue {
        title: "  ".into(),
        body: String::new(),
        labels: vec![],
        assignees: vec![],
    };
    assert_eq!(
        create_issue(&client, "o", "r", &empty)
            .await
            .expect_err("title")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(server.requests().len(), 1);
}

#[tokio::test]
async fn closing_and_reopening_send_the_state_and_reason() {
    let (server, client) = setup().await;
    set_issue_state(&client, "o", "r", 7, "closed", Some("not_planned"))
        .await
        .expect("close");
    set_issue_state(&client, "o", "r", 7, "open", None)
        .await
        .expect("reopen");

    let requests = server.requests();
    let first: Value = serde_json::from_str(&requests[0].body).expect("json");
    assert_eq!(first["state"], "closed");
    assert_eq!(first["state_reason"], "not_planned");
    let second: Value = serde_json::from_str(&requests[1].body).expect("json");
    assert_eq!(second["state"], "open");
    assert!(second.get("state_reason").is_none());

    assert_eq!(
        set_issue_state(&client, "o", "r", 7, "locked", None)
            .await
            .expect_err("state")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(
        set_issue_state(&client, "o", "r", 7, "closed", Some("because"))
            .await
            .expect_err("reason")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(server.requests().len(), 2);
}

#[tokio::test]
async fn labels_and_assignees_can_be_listed() {
    let (_, client) = setup().await;
    let labels = list_labels(&client, "o", "r").await.expect("labels");
    assert_eq!(labels.len(), 2);
    assert_eq!(
        labels[0].description.as_deref(),
        Some("Something is broken")
    );
    let assignees = list_assignees(&client, "o", "r").await.expect("assignees");
    assert_eq!(
        assignees
            .iter()
            .map(|user| user.login.as_str())
            .collect::<Vec<_>>(),
        vec!["octocat", "hubot"]
    );
}
