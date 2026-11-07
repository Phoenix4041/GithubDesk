mod common;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use common::mock_http::{MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::accounts::{AccountSource, AccountStore};
use githubdesk_lib::github::device_flow::{
    poll_once, request_device_code, wait_for_token, DeviceCode, PollOutcome, PollTiming,
};
use githubdesk_lib::github::secrets::{MemoryStore, SecretStore};
use githubdesk_lib::jobs::{CancelToken, JobRegistry};
use tempfile::TempDir;

fn host_of(server: &MockServer) -> String {
    server.base_url.trim_start_matches("http://").to_string()
}

fn user_server(login: &'static str) -> impl Fn(&common::mock_http::MockRequest) -> MockResponse {
    move |request| {
        if request.path() == "/user" && request.header("authorization") == Some("Bearer good-token")
        {
            MockResponse::json(
                200,
                &format!(
                    "{{\"login\":\"{login}\",\"name\":\"Mona Lisa\",\"avatar_url\":\"https://avatars.githubusercontent.com/u/1\"}}"
                ),
            )
        } else {
            MockResponse::json(401, "{\"message\":\"Bad credentials\"}")
        }
    }
}

fn store_in(directory: &TempDir) -> (AccountStore, Arc<MemoryStore>) {
    let secrets = Arc::new(MemoryStore::default());
    let store = AccountStore::new(directory.path().to_path_buf(), secrets.clone());
    (store, secrets)
}

#[tokio::test]
async fn adding_a_token_saves_the_account_and_keeps_the_secret_out_of_the_file() {
    let server = MockServer::start(user_server("MonaLisa")).await;
    let directory = TempDir::new().expect("dir");
    let (store, secrets) = store_in(&directory);

    let account = store
        .add_with_token(&host_of(&server), " good-token ", AccountSource::Token)
        .await
        .expect("add");
    assert_eq!(account.login, "MonaLisa");
    assert_eq!(account.id, format!("{}:monalisa", host_of(&server)));
    assert_eq!(account.source, AccountSource::Token);

    assert_eq!(
        secrets.get(&account.id).expect("secret").as_deref(),
        Some("good-token")
    );
    let file = std::fs::read_to_string(directory.path().join("accounts.json")).expect("file");
    assert!(file.contains("MonaLisa"));
    assert!(!file.contains("good-token"));

    let listed = store.list().await.expect("list");
    assert_eq!(listed, vec![account.clone()]);
    assert_eq!(store.token(&account.id).await.expect("token"), "good-token");
}

#[tokio::test]
async fn invalid_tokens_are_rejected_and_nothing_is_stored() {
    let server = MockServer::start(user_server("MonaLisa")).await;
    let directory = TempDir::new().expect("dir");
    let (store, secrets) = store_in(&directory);

    let error = store
        .add_with_token(&host_of(&server), "bad-token", AccountSource::Token)
        .await
        .expect_err("rejected");
    assert_eq!(error.kind, ErrorKind::GithubUnauthorized);
    assert!(store.list().await.expect("list").is_empty());
    assert_eq!(secrets.get("anything").expect("secret"), None);

    for bad in ["", "   ", "has space inside"] {
        let error = store
            .add_with_token(&host_of(&server), bad, AccountSource::Token)
            .await
            .expect_err("malformed");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
    assert_eq!(server.requests().len(), 1);
}

#[tokio::test]
async fn accounts_survive_a_restart_and_can_be_removed() {
    let server = MockServer::start(user_server("MonaLisa")).await;
    let directory = TempDir::new().expect("dir");
    let secrets = Arc::new(MemoryStore::default());
    let first = AccountStore::new(directory.path().to_path_buf(), secrets.clone());
    let account = first
        .add_with_token(&host_of(&server), "good-token", AccountSource::Oauth)
        .await
        .expect("add");

    let second = AccountStore::new(directory.path().to_path_buf(), secrets.clone());
    assert_eq!(second.list().await.expect("list").len(), 1);
    assert_eq!(
        second.get(&account.id).await.expect("get").login,
        "MonaLisa"
    );

    second.remove(&account.id).await.expect("remove");
    assert!(second.list().await.expect("list").is_empty());
    assert_eq!(secrets.get(&account.id).expect("secret"), None);
    let missing = second.get(&account.id).await.expect_err("gone");
    assert_eq!(missing.kind, ErrorKind::GithubNoAccount);
    let no_token = second.token(&account.id).await.expect_err("gone");
    assert_eq!(no_token.kind, ErrorKind::GithubNoAccount);
}

#[tokio::test]
async fn adding_the_same_account_twice_replaces_it() {
    let server = MockServer::start(user_server("MonaLisa")).await;
    let directory = TempDir::new().expect("dir");
    let (store, _) = store_in(&directory);
    store
        .add_with_token(&host_of(&server), "good-token", AccountSource::Token)
        .await
        .expect("first");
    store
        .add_with_token(&host_of(&server), "good-token", AccountSource::Oauth)
        .await
        .expect("second");
    let accounts = store.list().await.expect("list");
    assert_eq!(accounts.len(), 1);
    assert_eq!(accounts[0].source, AccountSource::Oauth);
}

#[tokio::test]
async fn clients_for_an_account_use_its_token_and_host() {
    let server = MockServer::start(|request| {
        if request.path() == "/user" {
            return MockResponse::json(
                200,
                "{\"login\":\"MonaLisa\",\"name\":null,\"avatar_url\":\"https://avatars.githubusercontent.com/u/1\"}",
            );
        }
        MockResponse::json(200, "{\"login\":\"seen\"}")
    })
    .await;
    let directory = TempDir::new().expect("dir");
    let (store, _) = store_in(&directory);
    let account = store
        .add_with_token(&host_of(&server), "good-token", AccountSource::Token)
        .await
        .expect("add");

    let (found, client) = store.client_for(&account.id, None).await.expect("client");
    assert_eq!(found.id, account.id);
    let value: serde_json::Value = client.get_json("/probe", &[]).await.expect("probe");
    assert_eq!(value["login"], "seen");
    let last = server.requests().pop().expect("request");
    assert_eq!(last.header("authorization"), Some("Bearer good-token"));
}

fn code_server(
    responses: Vec<&'static str>,
) -> (
    impl Fn(&common::mock_http::MockRequest) -> MockResponse,
    Arc<AtomicUsize>,
) {
    let counter = Arc::new(AtomicUsize::new(0));
    let shared = Arc::clone(&counter);
    let handler = move |request: &common::mock_http::MockRequest| {
        if request.path() == "/login/device/code" {
            return MockResponse::json(
                200,
                "{\"device_code\":\"dev-123\",\"user_code\":\"ABCD-1234\",\"verification_uri\":\"https://github.com/login/device\",\"expires_in\":900,\"interval\":5}",
            );
        }
        let index = shared.fetch_add(1, Ordering::SeqCst);
        let body = responses
            .get(index)
            .copied()
            .unwrap_or("{\"error\":\"authorization_pending\"}");
        MockResponse::json(200, body)
    };
    (handler, counter)
}

#[tokio::test]
async fn the_device_code_request_sends_the_client_id_and_scopes() {
    let (handler, _) = code_server(vec![]);
    let server = MockServer::start(handler).await;

    let code = request_device_code(&server.base_url, " my-client-id ", "repo workflow")
        .await
        .expect("code");
    assert_eq!(code.user_code, "ABCD-1234");
    assert_eq!(code.device_code, "dev-123");
    assert_eq!(code.interval, 5);

    let request = &server.requests()[0];
    assert_eq!(request.method, "POST");
    assert_eq!(request.header("accept"), Some("application/json"));
    assert!(request.body.contains("client_id=my-client-id"));
    assert!(
        request.body.contains("scope=repo+workflow")
            || request.body.contains("scope=repo%20workflow")
    );
}

#[tokio::test]
async fn an_empty_client_id_is_reported_as_missing_configuration() {
    let error = request_device_code("https://github.com", "  ", "repo")
        .await
        .expect_err("not configured");
    assert_eq!(error.kind, ErrorKind::GithubNotConfigured);
}

#[tokio::test]
async fn polling_reports_pending_and_slow_down_before_the_token() {
    let (handler, _) = code_server(vec![
        "{\"error\":\"authorization_pending\"}",
        "{\"error\":\"slow_down\",\"interval\":10}",
        "{\"access_token\":\"gho_secret\",\"token_type\":\"bearer\"}",
    ]);
    let server = MockServer::start(handler).await;

    assert_eq!(
        poll_once(&server.base_url, "cid", "dev-123")
            .await
            .expect("pending"),
        PollOutcome::Pending
    );
    assert_eq!(
        poll_once(&server.base_url, "cid", "dev-123")
            .await
            .expect("slow"),
        PollOutcome::SlowDown(Some(10))
    );
    assert_eq!(
        poll_once(&server.base_url, "cid", "dev-123")
            .await
            .expect("token"),
        PollOutcome::Token("gho_secret".into())
    );

    let body = &server.requests()[0].body;
    assert!(body.contains("device_code=dev-123"));
    assert!(body.contains("client_id=cid"));
    assert!(body.contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"));
}

fn quick_timing(expires_milliseconds: u64) -> PollTiming {
    PollTiming {
        interval: Duration::from_millis(15),
        slow_down_step: Duration::from_millis(15),
        expires_in: Duration::from_millis(expires_milliseconds),
    }
}

#[tokio::test]
async fn waiting_keeps_polling_until_the_user_authorizes() {
    let (handler, counter) = code_server(vec![
        "{\"error\":\"authorization_pending\"}",
        "{\"error\":\"authorization_pending\"}",
        "{\"access_token\":\"gho_after_wait\"}",
    ]);
    let server = MockServer::start(handler).await;

    let token = wait_for_token(
        &server.base_url,
        "cid",
        "dev-123",
        quick_timing(5000),
        CancelToken::never(),
    )
    .await
    .expect("token");
    assert_eq!(token, "gho_after_wait");
    assert_eq!(counter.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn denied_and_expired_codes_are_typed_errors() {
    let (handler, _) = code_server(vec!["{\"error\":\"access_denied\"}"]);
    let denied_server = MockServer::start(handler).await;
    let denied = wait_for_token(
        &denied_server.base_url,
        "cid",
        "d",
        quick_timing(5000),
        CancelToken::never(),
    )
    .await
    .expect_err("denied");
    assert_eq!(denied.kind, ErrorKind::GithubDeviceDenied);

    let (handler, _) = code_server(vec!["{\"error\":\"expired_token\"}"]);
    let expired_server = MockServer::start(handler).await;
    let expired = wait_for_token(
        &expired_server.base_url,
        "cid",
        "d",
        quick_timing(5000),
        CancelToken::never(),
    )
    .await
    .expect_err("expired");
    assert_eq!(expired.kind, ErrorKind::GithubDeviceExpired);

    let (handler, _) = code_server(vec![]);
    let silent_server = MockServer::start(handler).await;
    let timed_out = wait_for_token(
        &silent_server.base_url,
        "cid",
        "d",
        quick_timing(80),
        CancelToken::never(),
    )
    .await
    .expect_err("timeout");
    assert_eq!(timed_out.kind, ErrorKind::GithubDeviceExpired);
}

#[tokio::test]
async fn misconfigured_applications_are_explained() {
    let (handler, _) = code_server(vec!["{\"error\":\"device_flow_disabled\",\"error_description\":\"Device flow must be explicitly enabled\"}"]);
    let server = MockServer::start(handler).await;
    let error = wait_for_token(
        &server.base_url,
        "cid",
        "d",
        quick_timing(5000),
        CancelToken::never(),
    )
    .await
    .expect_err("disabled");
    assert_eq!(error.kind, ErrorKind::GithubNotConfigured);
    assert!(error.detail.contains("Device flow"));
}

#[tokio::test]
async fn waiting_can_be_cancelled() {
    let (handler, _) = code_server(vec![]);
    let server = MockServer::start(handler).await;
    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("device-job");

    let base = server.base_url.clone();
    let token = guard.token();
    let waiting = tokio::spawn(async move {
        wait_for_token(&base, "cid", "d", quick_timing(60_000), token).await
    });
    tokio::time::sleep(Duration::from_millis(60)).await;
    assert!(registry.cancel("device-job"));
    let error = waiting.await.expect("join").expect_err("cancelled");
    assert_eq!(error.kind, ErrorKind::Cancelled);
}

#[test]
fn device_code_timing_never_polls_faster_than_one_second() {
    let code = DeviceCode {
        device_code: "d".into(),
        user_code: "u".into(),
        verification_uri: "https://github.com/login/device".into(),
        expires_in: 900,
        interval: 0,
    };
    assert_eq!(
        PollTiming::from_code(&code).interval,
        Duration::from_secs(1)
    );
}
