mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::update_check::check_latest;

fn release(tag: &str, draft: bool, prerelease: bool) -> String {
    format!(
        r#"{{"tag_name":"{tag}","html_url":"https://github.com/o/r/releases/tag/{tag}","draft":{draft},"prerelease":{prerelease}}}"#
    )
}

fn handler_for(body: String) -> impl Fn(&MockRequest) -> MockResponse + Send + Sync + 'static {
    move |request: &MockRequest| match request.path() {
        "/repos/o/r/releases/latest" => MockResponse::json(200, &body),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn start(
    handler: impl Fn(&MockRequest) -> MockResponse + Send + Sync + 'static,
) -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, None).expect("client");
    (server, client)
}

#[tokio::test]
async fn a_newer_release_is_reported_with_its_link() {
    let (server, client) = start(handler_for(release("v0.6.0", false, false))).await;
    let status = check_latest(&client, "o/r", "0.5.0").await.expect("status");
    assert!(status.configured);
    assert!(status.update_available);
    assert_eq!(status.latest.as_deref(), Some("0.6.0"));
    assert_eq!(
        status.url.as_deref(),
        Some("https://github.com/o/r/releases/tag/v0.6.0")
    );
    assert!(server.requests()[0].header("authorization").is_none());
}

#[tokio::test]
async fn the_same_or_an_older_release_is_not_an_update() {
    let (_server, client) = start(handler_for(release("v0.5.0", false, false))).await;
    let status = check_latest(&client, "o/r", "0.5.0").await.expect("status");
    assert!(!status.update_available);
    assert_eq!(status.latest.as_deref(), Some("0.5.0"));
    assert!(status.url.is_none());
}

#[tokio::test]
async fn drafts_and_prereleases_are_never_offered() {
    let (_server, client) = start(handler_for(release("v9.0.0", false, true))).await;
    assert!(
        !check_latest(&client, "o/r", "0.5.0")
            .await
            .expect("status")
            .update_available
    );
    let (_server, client) = start(handler_for(release("v9.0.0", true, false))).await;
    assert!(
        !check_latest(&client, "o/r", "0.5.0")
            .await
            .expect("status")
            .update_available
    );
}

#[tokio::test]
async fn a_repository_without_releases_is_not_an_error() {
    let (_server, client) =
        start(|_: &MockRequest| MockResponse::json(404, r#"{"message":"Not Found"}"#)).await;
    let status = check_latest(&client, "o/r", "0.5.0").await.expect("status");
    assert!(status.configured);
    assert!(status.latest.is_none());
    assert!(!status.update_available);
}

#[tokio::test]
async fn malformed_repository_names_never_reach_the_network() {
    let (server, client) = start(handler_for(release("v1.0.0", false, false))).await;
    for name in ["noslash", "o/", "/r", "o/r/extra", "../x", "o/../r"] {
        let error = check_latest(&client, name, "0.5.0")
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput, "{name}");
    }
    assert!(server.requests().is_empty());
}
