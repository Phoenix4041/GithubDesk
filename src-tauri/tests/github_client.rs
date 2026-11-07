mod common;

use std::sync::Arc;

use common::mock_http::{MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::{EtagCache, GithubClient};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, PartialEq)]
struct Item {
    id: u32,
    name: String,
}

#[derive(Serialize)]
struct Payload {
    title: String,
}

#[tokio::test]
async fn requests_carry_the_token_and_github_headers() {
    let server =
        MockServer::start(|_| MockResponse::json(200, "{\"id\":1,\"name\":\"one\"}")).await;
    let client = GithubClient::new(&server.base_url, Some("secret-token".into())).expect("client");

    let item: Item = client.get_json("/items/1", &[]).await.expect("get");
    assert_eq!(
        item,
        Item {
            id: 1,
            name: "one".into()
        }
    );

    let request = &server.requests()[0];
    assert_eq!(request.method, "GET");
    assert_eq!(request.path(), "/items/1");
    assert_eq!(request.header("authorization"), Some("Bearer secret-token"));
    assert_eq!(
        request.header("accept"),
        Some("application/vnd.github+json")
    );
    assert_eq!(request.header("x-github-api-version"), Some("2022-11-28"));
    assert!(request
        .header("user-agent")
        .unwrap_or_default()
        .starts_with("GithubDesk/"));
}

#[tokio::test]
async fn anonymous_clients_send_no_authorization_header() {
    let server =
        MockServer::start(|_| MockResponse::json(200, "{\"id\":2,\"name\":\"two\"}")).await;
    let client = GithubClient::new(&server.base_url, None).expect("client");
    let _: Item = client.get_json("/items/2", &[]).await.expect("get");
    assert_eq!(server.requests()[0].header("authorization"), None);
}

#[tokio::test]
async fn pages_report_the_next_page_from_the_link_header() {
    let server = MockServer::start(|request| {
        let page: u32 = request
            .query("page")
            .and_then(|value| value.parse().ok())
            .unwrap_or(1);
        let body = format!("[{{\"id\":{page},\"name\":\"page {page}\"}}]");
        let response = MockResponse::json(200, &body);
        if page < 3 {
            let link = format!(
                "<http://example.test/items?page={}>; rel=\"next\"",
                page + 1
            );
            response.with_header("Link", &link)
        } else {
            response
        }
    })
    .await;
    let client = GithubClient::new(&server.base_url, None).expect("client");

    let first = client
        .get_page::<Item>("/items", &[], 1, 30)
        .await
        .expect("first");
    assert_eq!(first.items.len(), 1);
    assert_eq!(first.next_page, Some(2));
    let last = client
        .get_page::<Item>("/items", &[], 3, 30)
        .await
        .expect("last");
    assert_eq!(last.next_page, None);

    let request = &server.requests()[0];
    assert_eq!(request.query("per_page").as_deref(), Some("30"));
    assert_eq!(request.query("page").as_deref(), Some("1"));
}

#[tokio::test]
async fn extra_query_values_are_sent_encoded() {
    let server = MockServer::start(|_| MockResponse::json(200, "[]")).await;
    let client = GithubClient::new(&server.base_url, None).expect("client");
    let _ = client
        .get_page::<Item>(
            "/items",
            &[
                ("state", "open".into()),
                ("labels", "bug,help wanted".into()),
            ],
            1,
            10,
        )
        .await
        .expect("get");
    let target = server.requests()[0].target.clone();
    assert!(target.contains("state=open"));
    assert!(
        target.contains("labels=bug%2Chelp+wanted")
            || target.contains("labels=bug%2Chelp%20wanted")
    );
}

#[tokio::test]
async fn unchanged_responses_are_served_from_the_etag_cache() {
    let server = MockServer::start(|request| {
        if request.header("if-none-match") == Some("\"v1\"") {
            MockResponse::json(304, "")
        } else {
            MockResponse::json(200, "[{\"id\":7,\"name\":\"cached\"}]")
                .with_header("ETag", "\"v1\"")
        }
    })
    .await;
    let cache = Arc::new(EtagCache::default());
    let client = GithubClient::new(&server.base_url, None)
        .expect("client")
        .with_cache(Arc::clone(&cache), "account-a".into());

    let first = client
        .get_page::<Item>("/items", &[], 1, 30)
        .await
        .expect("first");
    let second = client
        .get_page::<Item>("/items", &[], 1, 30)
        .await
        .expect("second");
    assert_eq!(first.items, second.items);

    let requests = server.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].header("if-none-match"), None);
    assert_eq!(requests[1].header("if-none-match"), Some("\"v1\""));

    let other_account = GithubClient::new(&server.base_url, None)
        .expect("client")
        .with_cache(cache, "account-b".into());
    let _ = other_account
        .get_page::<Item>("/items", &[], 1, 30)
        .await
        .expect("other");
    assert_eq!(server.requests()[2].header("if-none-match"), None);
}

#[tokio::test]
async fn error_statuses_become_typed_errors() {
    let server = MockServer::start(|request| match request.path() {
        "/unauthorized" => MockResponse::json(401, "{\"message\":\"Bad credentials\"}"),
        "/missing" => MockResponse::json(404, "{\"message\":\"Not Found\"}"),
        "/limited" => MockResponse::json(403, "{\"message\":\"API rate limit exceeded\"}")
            .with_header("x-ratelimit-remaining", "0")
            .with_header("x-ratelimit-reset", "1900000000"),
        "/invalid" => MockResponse::json(
            422,
            "{\"message\":\"Validation Failed\",\"errors\":[{\"message\":\"No commits between main and topic\"}]}",
        ),
        "/boom" => MockResponse::text(500, "oops"),
        _ => MockResponse::json(200, "{}"),
    })
    .await;
    let client = GithubClient::new(&server.base_url, Some("t".into())).expect("client");

    let kind = |path: &'static str| {
        let client = client.clone();
        async move { client.get_json::<Item>(path, &[]).await.expect_err("error") }
    };
    assert_eq!(
        kind("/unauthorized").await.kind,
        ErrorKind::GithubUnauthorized
    );
    assert_eq!(kind("/missing").await.kind, ErrorKind::GithubNotFound);
    let limited = kind("/limited").await;
    assert_eq!(limited.kind, ErrorKind::GithubRateLimited);
    assert_eq!(limited.detail, "1900000000");
    let invalid = kind("/invalid").await;
    assert_eq!(invalid.kind, ErrorKind::GithubValidation);
    assert!(invalid.detail.contains("No commits between"));
    assert_eq!(kind("/boom").await.kind, ErrorKind::GithubServerError);
}

#[tokio::test]
async fn bodies_are_sent_as_json_and_responses_parsed() {
    let server = MockServer::start(|request| {
        assert_eq!(request.method, "PATCH");
        assert_eq!(request.header("content-type"), Some("application/json"));
        MockResponse::json(200, "{\"id\":9,\"name\":\"patched\"}")
    })
    .await;
    let client = GithubClient::new(&server.base_url, Some("t".into())).expect("client");
    let item: Item = client
        .send_json(
            Method::PATCH,
            "/items/9",
            &Payload {
                title: "new".into(),
            },
        )
        .await
        .expect("patch");
    assert_eq!(item.name, "patched");
    assert_eq!(server.requests()[0].body, "{\"title\":\"new\"}");
}

#[tokio::test]
async fn empty_responses_are_accepted_when_nothing_is_expected() {
    let server = MockServer::start(|_| MockResponse::json(204, "")).await;
    let client = GithubClient::new(&server.base_url, Some("t".into())).expect("client");
    client
        .send_no_content::<Payload>(Method::POST, "/runs/1/cancel", None)
        .await
        .expect("no content");
    assert_eq!(server.requests()[0].method, "POST");
}

#[tokio::test]
async fn invalid_json_is_reported_as_a_server_problem() {
    let server = MockServer::start(|_| MockResponse::json(200, "<html>not json</html>")).await;
    let client = GithubClient::new(&server.base_url, None).expect("client");
    let error = client
        .get_json::<Item>("/items", &[])
        .await
        .expect_err("bad json");
    assert_eq!(error.kind, ErrorKind::GithubServerError);
}

#[tokio::test]
async fn unreachable_servers_are_reported_as_network_problems() {
    let client = GithubClient::new("http://127.0.0.1:1", None).expect("client");
    let error = client
        .get_json::<Item>("/items", &[])
        .await
        .expect_err("unreachable");
    assert_eq!(error.kind, ErrorKind::NetworkUnavailable);
}

#[tokio::test]
async fn redirects_to_another_origin_do_not_carry_the_token() {
    let target = MockServer::start(|_| MockResponse::text(200, "log line one\nlog line two")).await;
    let target_url = format!("{}/download", target.base_url);
    let origin = MockServer::start(move |_| {
        MockResponse::text(302, "").with_header("Location", &target_url)
    })
    .await;
    let client = GithubClient::new(&origin.base_url, Some("secret-token".into())).expect("client");

    let text = client.get_text("/logs").await.expect("text");
    assert!(text.contains("log line two"));
    assert_eq!(
        origin.requests()[0].header("authorization"),
        Some("Bearer secret-token")
    );
    assert_eq!(target.requests()[0].header("authorization"), None);
}
