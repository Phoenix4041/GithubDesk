mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::orgs::{create_repo, list_context_repos, list_orgs, NewRepo};
use serde_json::Value;

const REPO: &str = r#"{"name":"hello","full_name":"octo/hello","owner":{"login":"octo"},"description":"Hi",
  "private":true,"fork":false,"archived":false,"default_branch":"main","pushed_at":"2026-01-02T10:00:00Z",
  "language":"Rust","html_url":"https://github.com/octo/hello","clone_url":"https://github.com/octo/hello.git",
  "ssh_url":"git@github.com:octo/hello.git","permissions":{"admin":true,"push":true,"pull":true}}"#;

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/user/orgs") => MockResponse::json(
            200,
            r#"[{"login":"acme","description":"Acme Inc","avatar_url":"https://a/1"},{"login":"labs","avatar_url":"https://a/2"}]"#,
        ),
        ("GET", "/user/repos") => MockResponse::json(200, &format!("[{REPO}]"))
            .with_header("Link", "<http://x/user/repos?page=2>; rel=\"next\""),
        ("GET", "/orgs/acme/repos") => MockResponse::json(200, &format!("[{REPO}]")),
        ("GET", "/search/repositories") => {
            MockResponse::json(200, &format!("{{\"total_count\":1,\"items\":[{REPO}]}}"))
        }
        ("POST", "/user/repos") => MockResponse::json(201, REPO),
        ("POST", "/orgs/acme/repos") => MockResponse::json(201, REPO),
        ("POST", "/orgs/taken/repos") => MockResponse::json(
            422,
            r#"{"message":"Repository creation failed.","errors":[{"message":"name already exists on this account"}]}"#,
        ),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

fn new_repo(name: &str) -> NewRepo {
    NewRepo {
        name: name.to_string(),
        description: String::new(),
        private: false,
        auto_init: false,
        gitignore_template: None,
        license_template: None,
    }
}

#[tokio::test]
async fn organizations_come_with_their_description_and_avatar() {
    let (_server, client) = setup().await;

    let orgs = list_orgs(&client).await.expect("orgs");

    assert_eq!(orgs.len(), 2);
    assert_eq!(orgs[0].login, "acme");
    assert_eq!(orgs[0].description.as_deref(), Some("Acme Inc"));
    assert_eq!(orgs[1].description, None);
    assert_eq!(orgs[1].avatar_url, "https://a/2");
}

#[tokio::test]
async fn the_personal_context_lists_owned_and_shared_repositories() {
    let (server, client) = setup().await;

    let page = list_context_repos(&client, "octo", None, None, 1)
        .await
        .expect("repos");

    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].full_name, "octo/hello");
    assert_eq!(page.items[0].owner.login, "octo");
    assert!(
        page.items[0]
            .permissions
            .as_ref()
            .expect("permissions")
            .admin
    );
    assert_eq!(page.next_page, Some(2));
    let request = &server.requests()[0];
    assert_eq!(request.path(), "/user/repos");
    assert_eq!(
        request.query("affiliation").as_deref(),
        Some("owner%2Ccollaborator")
    );
    assert_eq!(request.query("sort").as_deref(), Some("pushed"));
    assert_eq!(request.query("per_page").as_deref(), Some("30"));
}

#[tokio::test]
async fn an_organization_context_lists_that_organization() {
    let (server, client) = setup().await;

    let page = list_context_repos(&client, "octo", Some("acme"), Some("   "), 2)
        .await
        .expect("repos");

    assert_eq!(page.items.len(), 1);
    let request = &server.requests()[0];
    assert_eq!(request.path(), "/orgs/acme/repos");
    assert_eq!(request.query("type").as_deref(), Some("all"));
    assert_eq!(request.query("page").as_deref(), Some("2"));
}

#[tokio::test]
async fn searching_scopes_the_query_to_the_user_or_the_organization() {
    let (server, client) = setup().await;

    list_context_repos(&client, "octo", None, Some("hel\nlo"), 1)
        .await
        .expect("personal search");
    list_context_repos(&client, "octo", Some("acme"), Some("hello"), 1)
        .await
        .expect("org search");

    let requests = server.requests();
    assert_eq!(requests[0].path(), "/search/repositories");
    let personal = requests[0].query("q").expect("q");
    assert!(
        personal.contains("user%3Aocto") || personal.contains("user:octo"),
        "{personal}"
    );
    assert!(
        personal.contains("hel") && personal.contains("lo"),
        "{personal}"
    );
    assert!(
        !personal.contains("%0A") && !personal.contains('\n'),
        "{personal}"
    );
    let org = requests[1].query("q").expect("q");
    assert!(
        org.contains("org%3Aacme") || org.contains("org:acme"),
        "{org}"
    );
}

#[tokio::test]
async fn an_unsafe_organization_name_never_reaches_the_server() {
    let (server, client) = setup().await;

    let error = list_context_repos(&client, "octo", Some("../orgs"), None, 1)
        .await
        .expect_err("rejected");

    assert_eq!(error.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn repositories_are_created_for_the_user_or_for_an_organization() {
    let (server, client) = setup().await;
    let mut request = new_repo("hello");
    request.description = " A greeting\n ".to_string();
    request.private = true;
    request.auto_init = true;
    request.gitignore_template = Some("Rust".to_string());

    let created = create_repo(&client, None, &request)
        .await
        .expect("user repo");
    create_repo(&client, Some("acme"), &new_repo("hello"))
        .await
        .expect("org repo");

    assert_eq!(created.full_name, "octo/hello");
    let requests = server.requests();
    assert_eq!(requests[0].path(), "/user/repos");
    let body: Value = serde_json::from_str(&requests[0].body).expect("json");
    assert_eq!(body["name"], "hello");
    assert_eq!(body["description"], "A greeting");
    assert_eq!(body["private"], true);
    assert_eq!(body["auto_init"], true);
    assert_eq!(body["gitignore_template"], "Rust");
    assert!(body.get("license_template").is_none());
    assert_eq!(requests[1].path(), "/orgs/acme/repos");
}

#[tokio::test]
async fn invalid_repository_requests_are_refused_before_any_call() {
    let (server, client) = setup().await;
    let mut long_description = new_repo("ok");
    long_description.description = "x".repeat(351);
    let mut bad_template = new_repo("ok");
    bad_template.license_template = Some("../etc".to_string());

    for request in [
        new_repo("has space"),
        new_repo(""),
        long_description,
        bad_template,
    ] {
        let error = create_repo(&client, None, &request)
            .await
            .expect_err("refused");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
    let org = create_repo(&client, Some("a/b"), &new_repo("ok"))
        .await
        .expect_err("org");
    assert_eq!(org.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn a_name_that_is_already_taken_is_a_validation_error_with_the_reason() {
    let (_server, client) = setup().await;

    let error = create_repo(&client, Some("taken"), &new_repo("hello"))
        .await
        .expect_err("taken");

    assert_eq!(error.kind, ErrorKind::GithubValidation);
    assert!(
        error.detail.contains("name already exists"),
        "{}",
        error.detail
    );
}
