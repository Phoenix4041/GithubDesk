mod common;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use common::mock_http::{MockRequest, MockResponse, MockServer};
use crypto_box::aead::OsRng;
use crypto_box::SecretKey;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::actions_secrets::{
    create_variable, delete_secret, delete_variable, encrypt_secret, list_secrets, list_variables,
    put_secret, update_variable, Scope,
};
use githubdesk_lib::github::client::GithubClient;
use serde_json::Value;

const LIBSODIUM_SECRET: &str = "rRQMRQlBD+sJthzOcut9NTxTZjIuVdCNpZJXx1xC6AM=";
const LIBSODIUM_PUBLIC: &str = "W/dKFLdLHSe08xm9kY8bsPwCvFWEkEQUaqP/3jG9biY=";
const LIBSODIUM_CIPHER: &str =
    "IzOXb5pKQiW9eCXX9KzkMXeXVI1NRTzfPsJgMiE0/C3AXAIa/mMf8Vh/OosJm8WKfAFwnaxl9zSIleeyAHiClA+d3Aw=";
const LIBSODIUM_PLAIN: &str = "valor-secreto-ñ-123";

fn secret_key_from(base64: &str) -> SecretKey {
    SecretKey::from_slice(&STANDARD.decode(base64).expect("base64")).expect("key")
}

fn server_key() -> (SecretKey, String) {
    let secret = SecretKey::generate(&mut OsRng);
    let public = STANDARD.encode(secret.public_key().as_bytes());
    (secret, public)
}

fn handler_for(public: String) -> impl Fn(&MockRequest) -> MockResponse {
    move |request| match (request.method.as_str(), request.path()) {
        ("GET", "/repos/o/r/actions/secrets/public-key")
        | ("GET", "/orgs/acme/actions/secrets/public-key") => {
            MockResponse::json(200, &format!(r#"{{"key_id":"key-1","key":"{public}"}}"#))
        }
        ("PUT", "/repos/o/r/actions/secrets/API_TOKEN")
        | ("PUT", "/orgs/acme/actions/secrets/ORG_TOKEN") => MockResponse::json(201, ""),
        ("DELETE", "/repos/o/r/actions/secrets/API_TOKEN") => MockResponse::json(204, ""),
        ("GET", "/repos/o/r/actions/secrets") => MockResponse::json(
            200,
            r#"{"total_count":2,"secrets":[{"name":"API_TOKEN","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-02T00:00:00Z"},{"name":"DEPLOY_KEY","created_at":"a","updated_at":"b"}]}"#,
        ),
        ("GET", "/orgs/acme/actions/variables") => MockResponse::json(
            200,
            r#"{"total_count":1,"variables":[{"name":"REGION","value":"eu-west-1","created_at":"a","updated_at":"b","visibility":"all"}]}"#,
        ),
        ("POST", "/repos/o/r/actions/variables") | ("POST", "/orgs/acme/actions/variables") => {
            MockResponse::json(201, "")
        }
        ("PATCH", "/repos/o/r/actions/variables/REGION") => MockResponse::json(204, ""),
        ("DELETE", "/repos/o/r/actions/variables/REGION") => MockResponse::json(204, ""),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup(public: String) -> (MockServer, GithubClient) {
    let server = MockServer::start(handler_for(public)).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

const REPO: Scope<'static> = Scope::Repository {
    owner: "o",
    repo: "r",
};
const ORG: Scope<'static> = Scope::Organization { org: "acme" };

fn body_of(request: &MockRequest) -> Value {
    serde_json::from_str(&request.body).expect("json body")
}

#[test]
fn a_sealed_value_can_be_opened_only_with_the_matching_key() {
    let (secret, public) = server_key();
    let first = encrypt_secret(&public, "hunter2").expect("seal");
    let second = encrypt_secret(&public, "hunter2").expect("seal");

    assert_ne!(first, second, "every sealing uses a fresh ephemeral key");
    let opened = secret
        .unseal(&STANDARD.decode(&first).expect("base64"))
        .expect("unseal");
    assert_eq!(opened, b"hunter2");
    let other = SecretKey::generate(&mut OsRng);
    assert!(other
        .unseal(&STANDARD.decode(&first).expect("base64"))
        .is_err());
}

#[test]
fn a_libsodium_sealed_box_is_opened_by_the_same_format() {
    let secret = secret_key_from(LIBSODIUM_SECRET);
    assert_eq!(
        STANDARD.encode(secret.public_key().as_bytes()),
        LIBSODIUM_PUBLIC
    );

    let opened = secret
        .unseal(&STANDARD.decode(LIBSODIUM_CIPHER).expect("base64"))
        .expect("libsodium ciphertext");

    assert_eq!(String::from_utf8(opened).expect("utf8"), LIBSODIUM_PLAIN);
}

#[tokio::test]
async fn a_secret_is_encrypted_before_it_leaves_the_application() {
    let (secret, public) = server_key();
    let (server, client) = setup(public).await;

    put_secret(&client, REPO, "API_TOKEN", "super-secret-value", None)
        .await
        .expect("put");

    let requests = server.requests();
    assert_eq!(requests[0].path(), "/repos/o/r/actions/secrets/public-key");
    assert_eq!(requests[1].method, "PUT");
    assert!(!requests[1].body.contains("super-secret-value"));
    let body = body_of(&requests[1]);
    assert_eq!(body["key_id"], "key-1");
    assert!(body.get("visibility").is_none());
    let sealed = STANDARD
        .decode(body["encrypted_value"].as_str().expect("string"))
        .expect("base64");
    assert_eq!(
        secret.unseal(&sealed).expect("unseal"),
        b"super-secret-value"
    );
}

#[tokio::test]
async fn organization_secrets_carry_a_visibility() {
    let (_secret, public) = server_key();
    let (server, client) = setup(public).await;

    put_secret(&client, ORG, "ORG_TOKEN", "value", Some("all"))
        .await
        .expect("all");
    put_secret(&client, ORG, "ORG_TOKEN", "value", None)
        .await
        .expect("default");

    let puts: Vec<Value> = server
        .requests()
        .iter()
        .filter(|request| request.method == "PUT")
        .map(body_of)
        .collect();
    assert_eq!(puts[0]["visibility"], "all");
    assert_eq!(puts[1]["visibility"], "private");

    let selected = put_secret(&client, ORG, "ORG_TOKEN", "value", Some("selected"))
        .await
        .expect_err("selected");
    assert_eq!(selected.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn invalid_secrets_never_reach_github() {
    let (_secret, public) = server_key();
    let (server, client) = setup(public).await;

    for (name, value) in [
        ("GITHUB_TOKEN", "x"),
        ("1ABC", "x"),
        ("OK_NAME", ""),
        ("has space", "x"),
    ] {
        let error = put_secret(&client, REPO, name, value, None)
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput, "{name}");
    }
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn a_broken_public_key_from_github_is_reported() {
    let (_server, client) = setup("not-a-key".to_string()).await;

    let error = put_secret(&client, REPO, "API_TOKEN", "value", None)
        .await
        .expect_err("bad key");

    assert_eq!(error.kind, ErrorKind::GithubServerError);
}

#[tokio::test]
async fn secrets_are_listed_by_name_only_and_deleted() {
    let (server, client) = setup("unused".to_string()).await;

    let secrets = list_secrets(&client, REPO).await.expect("list");
    delete_secret(&client, REPO, "API_TOKEN")
        .await
        .expect("delete");

    assert_eq!(secrets.len(), 2);
    assert_eq!(secrets[0].name, "API_TOKEN");
    assert_eq!(secrets[0].updated_at, "2026-01-02T00:00:00Z");
    assert_eq!(
        server.requests()[0].query("per_page").as_deref(),
        Some("100")
    );
    assert_eq!(server.requests()[1].method, "DELETE");
}

#[tokio::test]
async fn variables_are_listed_created_updated_and_deleted() {
    let (server, client) = setup("unused".to_string()).await;

    let variables = list_variables(&client, ORG).await.expect("list");
    assert_eq!(variables[0].name, "REGION");
    assert_eq!(variables[0].value, "eu-west-1");
    assert_eq!(variables[0].visibility.as_deref(), Some("all"));
    assert_eq!(
        server.requests()[0].query("per_page").as_deref(),
        Some("30")
    );

    create_variable(&client, REPO, "REGION", "us-east-1", None)
        .await
        .expect("create");
    create_variable(&client, ORG, "REGION", "us-east-1", Some("all"))
        .await
        .expect("org create");
    update_variable(&client, REPO, "REGION", "eu-west-1")
        .await
        .expect("update");
    delete_variable(&client, REPO, "REGION")
        .await
        .expect("delete");

    let requests = server.requests();
    let created = body_of(&requests[1]);
    assert_eq!(created["name"], "REGION");
    assert_eq!(created["value"], "us-east-1");
    assert!(created.get("visibility").is_none());
    assert_eq!(body_of(&requests[2])["visibility"], "all");
    assert_eq!(requests[3].method, "PATCH");
    assert_eq!(body_of(&requests[3])["value"], "eu-west-1");
    assert_eq!(requests[4].method, "DELETE");
}
