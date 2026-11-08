mod common;

use std::sync::Arc;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::{ErrorKind, SuggestedAction};
use githubdesk_lib::github::accounts::{AccountSource, AccountStore};
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::device_flow::{request_device_code, DEVICE_SCOPES};
use githubdesk_lib::github::scopes::{token_info, union_scopes};
use githubdesk_lib::github::secrets::{MemoryStore, SecretStore};
use serde_json::Value;
use tempfile::TempDir;

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/user") => MockResponse::json(
            200,
            r#"{"login":"MonaLisa","name":"Mona","avatar_url":"u"}"#,
        )
        .with_header("X-OAuth-Scopes", "repo, workflow, read:org")
        .with_header("X-Accepted-OAuth-Scopes", "")
        .with_header(
            "github-authentication-token-expiration",
            "2026-12-01 10:30:00 UTC",
        )
        .with_header("X-RateLimit-Limit", "5000")
        .with_header("X-RateLimit-Remaining", "4321")
        .with_header("X-RateLimit-Reset", "1900000000"),
        ("GET", "/orgs/acme/members") => MockResponse::json(
            403,
            r#"{"message":"Resource not accessible by personal access token"}"#,
        )
        .with_header("X-OAuth-Scopes", "repo")
        .with_header("X-Accepted-OAuth-Scopes", "admin:org, write:org"),
        ("GET", "/orgs/covered/members") => {
            MockResponse::json(403, r#"{"message":"Must be an owner"}"#)
                .with_header("X-OAuth-Scopes", "admin:org")
                .with_header("X-Accepted-OAuth-Scopes", "write:org")
        }
        ("GET", "/repos/o/private") => MockResponse::json(404, r#"{"message":"Not Found"}"#)
            .with_header("X-OAuth-Scopes", "read:org")
            .with_header("X-Accepted-OAuth-Scopes", "repo"),
        ("GET", "/repos/o/missing") => MockResponse::json(404, r#"{"message":"Not Found"}"#)
            .with_header("X-OAuth-Scopes", "repo")
            .with_header("X-Accepted-OAuth-Scopes", "repo"),
        ("GET", "/limited") => MockResponse::json(403, r#"{"message":"API rate limit exceeded"}"#)
            .with_header("X-OAuth-Scopes", "repo")
            .with_header("X-Accepted-OAuth-Scopes", "admin:org")
            .with_header("X-RateLimit-Remaining", "0")
            .with_header("X-RateLimit-Reset", "1900000000"),
        ("POST", "/login/device/code") => MockResponse::json(
            200,
            r#"{"device_code":"dc","user_code":"ABCD-1234","verification_uri":"https://github.com/login/device","expires_in":900,"interval":5}"#,
        ),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

#[tokio::test]
async fn the_token_report_reads_scopes_expiry_and_rate_limit_from_the_headers() {
    let (_server, client) = setup().await;

    let info = token_info(&client).await.expect("info");

    assert_eq!(info.login, "MonaLisa");
    assert_eq!(
        info.scopes,
        Some(vec![
            "repo".to_string(),
            "workflow".to_string(),
            "read:org".to_string()
        ])
    );
    assert_eq!(info.expires_at.as_deref(), Some("2026-12-01T10:30:00Z"));
    let limit = info.rate_limit.expect("rate limit");
    assert_eq!(
        (limit.limit, limit.remaining, limit.reset_at),
        (5000, 4321, 1_900_000_000)
    );
    let granted = |id: &str| {
        info.capabilities
            .iter()
            .find(|item| item.id == id)
            .expect(id)
            .granted
    };
    assert_eq!(granted("repos"), Some(true));
    assert_eq!(granted("orgRead"), Some(true));
    assert_eq!(granted("orgAdmin"), Some(false));
    assert_eq!(granted("sshKeys"), Some(false));
}

#[tokio::test]
async fn a_token_that_hides_its_scopes_reports_them_as_unknown() {
    let server = MockServer::start(|request| {
        if request.path() == "/user" {
            MockResponse::json(200, r#"{"login":"bot"}"#)
        } else {
            MockResponse::json(404, "{}")
        }
    })
    .await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");

    let info = token_info(&client).await.expect("info");

    assert_eq!(info.scopes, None);
    assert_eq!(info.expires_at, None);
    assert_eq!(info.rate_limit, None);
    assert!(info.capabilities.iter().all(|item| item.granted.is_none()));
}

#[tokio::test]
async fn a_forbidden_answer_that_lacks_a_scope_names_the_missing_ones() {
    let (_server, client) = setup().await;

    let error = client
        .get_json::<Value>("/orgs/acme/members", &[])
        .await
        .expect_err("forbidden");

    assert_eq!(error.kind, ErrorKind::GithubMissingScope);
    assert_eq!(error.detail, "admin:org,write:org");
    assert_eq!(error.suggested_action, Some(SuggestedAction::GrantScopes));
}

#[tokio::test]
async fn a_forbidden_answer_with_the_scope_granted_stays_a_plain_forbidden() {
    let (_server, client) = setup().await;

    let error = client
        .get_json::<Value>("/orgs/covered/members", &[])
        .await
        .expect_err("forbidden");

    assert_eq!(error.kind, ErrorKind::GithubForbidden);
}

#[tokio::test]
async fn not_found_on_a_private_repository_without_the_repo_scope_asks_for_it() {
    let (_server, client) = setup().await;

    let hidden = client
        .get_json::<Value>("/repos/o/private", &[])
        .await
        .expect_err("hidden");
    assert_eq!(hidden.kind, ErrorKind::GithubMissingScope);
    assert_eq!(hidden.detail, "repo");

    let missing = client
        .get_json::<Value>("/repos/o/missing", &[])
        .await
        .expect_err("missing");
    assert_eq!(missing.kind, ErrorKind::GithubNotFound);
}

#[tokio::test]
async fn rate_limits_win_over_missing_scopes() {
    let (_server, client) = setup().await;

    let error = client
        .get_json::<Value>("/limited", &[])
        .await
        .expect_err("limited");

    assert_eq!(error.kind, ErrorKind::GithubRateLimited);
}

#[tokio::test]
async fn the_device_flow_asks_for_the_base_scopes_plus_the_extra_ones() {
    let (server, _client) = setup().await;
    let scope = union_scopes(
        DEVICE_SCOPES,
        &["admin:org".to_string(), "repo".to_string()],
    )
    .expect("scopes");

    request_device_code(&server.base_url, "client-1", &scope)
        .await
        .expect("device code");

    let body = server.requests()[0].body.clone();
    assert!(body.contains("client_id=client-1"), "{body}");
    assert!(
        body.contains("scope=repo+workflow+read%3Aorg+admin%3Aorg"),
        "{body}"
    );
}

#[tokio::test]
async fn authorizing_a_different_account_than_expected_stores_nothing() {
    let server = MockServer::start(|request| {
        if request.path() == "/user" {
            MockResponse::json(
                200,
                r#"{"login":"MonaLisa","name":"Mona","avatar_url":"u"}"#,
            )
        } else {
            MockResponse::json(404, "{}")
        }
    })
    .await;
    let host = server.base_url.trim_start_matches("http://").to_string();
    let directory = TempDir::new().expect("dir");
    let secrets = Arc::new(MemoryStore::default());
    let store = AccountStore::new(directory.path().to_path_buf(), secrets.clone());

    let mismatch = store
        .add_with_token_expecting(&host, "tok", AccountSource::Oauth, Some("someone-else"))
        .await
        .expect_err("mismatch");
    assert_eq!(mismatch.kind, ErrorKind::GithubAccountMismatch);
    assert_eq!(mismatch.detail, "MonaLisa");
    assert!(store.list().await.expect("list").is_empty());
    assert_eq!(
        secrets.get(&format!("{host}:monalisa")).expect("secret"),
        None
    );

    let account = store
        .add_with_token_expecting(&host, "tok", AccountSource::Oauth, Some("monalisa"))
        .await
        .expect("same account, other case");
    assert_eq!(account.login, "MonaLisa");
}
