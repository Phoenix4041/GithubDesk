mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::hooks::{
    add_deploy_key, create_hook, delete_deploy_key, delete_hook, list_deploy_keys, list_hooks,
    ping_hook, update_hook, HookUpdate, NewHook,
};
use githubdesk_lib::github::protection::{
    delete_protection, get_protection, list_branches, put_protection, ProtectionSettings,
};
use githubdesk_lib::github::repo_admin::{
    add_collaborator, cancel_invitation, delete_repository, get_repo_settings, list_collaborators,
    list_invitations, list_team_access, remove_collaborator, remove_team_access, replace_topics,
    set_team_access, transfer_repository, update_repo_settings, RepoSettingsPatch,
};
use serde_json::Value;

const REPO: &str = r#"{"name":"app","full_name":"acme/app","owner":{"login":"acme","type":"Organization"},
  "description":"An app","homepage":"https://acme.test","private":true,"archived":false,"fork":false,
  "default_branch":"main","topics":["rust"],"has_issues":true,"has_wiki":false,"has_projects":true,
  "allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":false,"allow_auto_merge":false,
  "delete_branch_on_merge":true,"html_url":"https://github.com/acme/app"}"#;

const HOOK: &str = r#"{"id":5,"active":true,"events":["push"],"config":{"url":"https://example.com/hook","content_type":"json","insecure_ssl":"0"},
  "last_response":{"code":200,"status":"active","message":"OK"},"updated_at":"2026-01-01T00:00:00Z"}"#;

const PROTECTION: &str = r#"{"required_pull_request_reviews":{"required_approving_review_count":2,"dismiss_stale_reviews":true,"require_code_owner_reviews":false},
  "required_status_checks":{"strict":true,"contexts":["ci"]},"enforce_admins":{"enabled":true},
  "required_linear_history":{"enabled":false},"allow_force_pushes":{"enabled":false},
  "allow_deletions":{"enabled":false},"required_conversation_resolution":{"enabled":true}}"#;

fn empty(status: u16) -> MockResponse {
    MockResponse::json(status, "")
}

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/repos/acme/app") => MockResponse::json(200, REPO),
        ("PATCH", "/repos/acme/app") => MockResponse::json(200, REPO),
        ("PUT", "/repos/acme/app/topics") => MockResponse::json(200, r#"{"names":["rust","cli"]}"#),
        ("GET", "/repos/acme/app/collaborators") => MockResponse::json(
            200,
            r#"[{"login":"hubot","avatar_url":"u","role_name":"write","permissions":{"admin":false,"maintain":false,"push":true,"triage":true,"pull":true}}]"#,
        ),
        ("PUT", "/repos/acme/app/collaborators/hubot") => MockResponse::json(201, r#"{"id":9}"#),
        ("PUT", "/repos/acme/app/collaborators/member") => empty(204),
        ("DELETE", "/repos/acme/app/collaborators/hubot") => empty(204),
        ("GET", "/repos/acme/app/invitations") => MockResponse::json(
            200,
            r#"[{"id":9,"invitee":{"login":"newbie","avatar_url":"u"},"permissions":"write","created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        ("DELETE", "/repos/acme/app/invitations/9") => empty(204),
        ("GET", "/repos/acme/app/teams") => MockResponse::json(
            200,
            r#"[{"slug":"core","name":"Core","permission":"push"}]"#,
        ),
        ("GET", "/repos/acme/solo/teams") => MockResponse::json(404, r#"{"message":"Not Found"}"#),
        ("PUT", "/orgs/acme/teams/core/repos/acme/app") => empty(204),
        ("DELETE", "/orgs/acme/teams/core/repos/acme/app") => empty(204),
        ("POST", "/repos/acme/app/transfer") => MockResponse::json(202, REPO),
        ("DELETE", "/repos/acme/app") => empty(204),
        ("DELETE", "/repos/acme/locked") => {
            MockResponse::json(403, r#"{"message":"Must have admin rights"}"#)
                .with_header("X-OAuth-Scopes", "repo")
                .with_header("X-Accepted-OAuth-Scopes", "delete_repo")
        }
        ("GET", "/repos/acme/app/branches") => MockResponse::json(
            200,
            r#"[{"name":"main","protected":true},{"name":"feature/x","protected":false}]"#,
        ),
        ("GET", "/repos/acme/app/branches/main/protection") => MockResponse::json(200, PROTECTION),
        ("GET", "/repos/acme/app/branches/feature%2Fx/protection") => {
            MockResponse::json(404, r#"{"message":"Branch not protected"}"#)
        }
        ("PUT", "/repos/acme/app/branches/feature%2Fx/protection") => MockResponse::json(200, "{}"),
        ("DELETE", "/repos/acme/app/branches/main/protection") => empty(204),
        ("GET", "/repos/acme/app/hooks") => MockResponse::json(200, &format!("[{HOOK}]")),
        ("POST", "/repos/acme/app/hooks") => MockResponse::json(201, HOOK),
        ("PATCH", "/repos/acme/app/hooks/5") => MockResponse::json(200, HOOK),
        ("DELETE", "/repos/acme/app/hooks/5") => empty(204),
        ("POST", "/repos/acme/app/hooks/5/pings") => empty(204),
        ("GET", "/repos/acme/app/keys") => MockResponse::json(
            200,
            r#"[{"id":4,"title":"CI","key":"ssh-ed25519 AAAA","read_only":true,"verified":true,"created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        ("POST", "/repos/acme/app/keys") => MockResponse::json(
            201,
            r#"{"id":5,"title":"Deploy","key":"ssh-ed25519 BBBB","read_only":false,"verified":true,"created_at":"2026-01-01T00:00:00Z"}"#,
        ),
        ("DELETE", "/repos/acme/app/keys/4") => empty(204),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

fn json_body(request: &MockRequest) -> Value {
    serde_json::from_str(&request.body).expect("json body")
}

fn settings() -> ProtectionSettings {
    ProtectionSettings {
        required_reviews: Some(1),
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        required_checks: None,
        strict_checks: false,
        enforce_admins: false,
        require_linear_history: true,
        allow_force_pushes: false,
        allow_deletions: false,
        require_conversation_resolution: false,
    }
}

#[tokio::test]
async fn repository_settings_are_read_and_only_the_changed_fields_are_sent() {
    let (server, client) = setup().await;

    let current = get_repo_settings(&client, "acme", "app")
        .await
        .expect("get");
    assert_eq!(current.owner.kind, "Organization");
    assert_eq!(current.topics, vec!["rust".to_string()]);
    assert!(current.delete_branch_on_merge);

    let patch = RepoSettingsPatch {
        description: Some("New text".to_string()),
        has_wiki: Some(true),
        private: Some(false),
        name: Some(" renamed ".to_string()),
        ..RepoSettingsPatch::default()
    };
    update_repo_settings(&client, "acme", "app", &patch)
        .await
        .expect("update");

    let body = json_body(&server.requests()[1]);
    assert_eq!(body["description"], "New text");
    assert_eq!(body["has_wiki"], true);
    assert_eq!(body["private"], false);
    assert_eq!(body["name"], "renamed");
    assert!(body.get("homepage").is_none());
    assert!(body.get("archived").is_none());
}

#[tokio::test]
async fn invalid_settings_never_reach_github() {
    let (server, client) = setup().await;

    for patch in [
        RepoSettingsPatch {
            name: Some("bad name".to_string()),
            ..RepoSettingsPatch::default()
        },
        RepoSettingsPatch {
            homepage: Some("javascript:x".to_string()),
            ..RepoSettingsPatch::default()
        },
    ] {
        let error = update_repo_settings(&client, "acme", "app", &patch)
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
    let topics = replace_topics(&client, "acme", "app", &["Bad Topic".to_string()])
        .await
        .expect_err("topic");
    assert_eq!(topics.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn topics_are_normalized_before_they_are_sent() {
    let (server, client) = setup().await;

    let names = replace_topics(
        &client,
        "acme",
        "app",
        &["Rust".to_string(), "cli".to_string()],
    )
    .await
    .expect("topics");

    assert_eq!(names, vec!["rust".to_string(), "cli".to_string()]);
    assert_eq!(
        json_body(&server.requests()[0])["names"],
        serde_json::json!(["rust", "cli"])
    );
}

#[tokio::test]
async fn collaborators_are_listed_invited_and_removed() {
    let (server, client) = setup().await;

    let list = list_collaborators(&client, "acme", "app")
        .await
        .expect("list");
    assert_eq!(list[0].login, "hubot");
    assert!(list[0].permissions.as_ref().expect("permissions").push);
    assert_eq!(
        server.requests()[0].query("affiliation").as_deref(),
        Some("direct")
    );

    add_collaborator(&client, "acme", "app", "hubot", "push")
        .await
        .expect("invite");
    add_collaborator(&client, "acme", "app", "member", "admin")
        .await
        .expect("already member");
    remove_collaborator(&client, "acme", "app", "hubot")
        .await
        .expect("remove");

    let requests = server.requests();
    assert_eq!(requests[1].method, "PUT");
    assert_eq!(json_body(&requests[1])["permission"], "push");
    assert_eq!(requests[3].method, "DELETE");

    for (login, permission) in [("a b", "push"), ("hubot", "owner"), ("../x", "pull")] {
        let error = add_collaborator(&client, "acme", "app", login, permission)
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
}

#[tokio::test]
async fn pending_invitations_can_be_listed_and_cancelled() {
    let (server, client) = setup().await;

    let invitations = list_invitations(&client, "acme", "app")
        .await
        .expect("list");
    cancel_invitation(&client, "acme", "app", 9)
        .await
        .expect("cancel");

    assert_eq!(invitations[0].id, 9);
    assert_eq!(
        invitations[0].invitee.as_ref().expect("invitee").login,
        "newbie"
    );
    assert_eq!(server.requests()[1].path(), "/repos/acme/app/invitations/9");
}

#[tokio::test]
async fn team_access_uses_the_organization_endpoints() {
    let (server, client) = setup().await;

    let teams = list_team_access(&client, "acme", "app")
        .await
        .expect("teams");
    let none = list_team_access(&client, "acme", "solo")
        .await
        .expect("none");
    set_team_access(&client, "acme", "app", "core", "maintain")
        .await
        .expect("set");
    remove_team_access(&client, "acme", "app", "core")
        .await
        .expect("remove");

    assert_eq!(teams[0].permission, "push");
    assert!(none.is_empty());
    let requests = server.requests();
    assert_eq!(requests[2].path(), "/orgs/acme/teams/core/repos/acme/app");
    assert_eq!(json_body(&requests[2])["permission"], "maintain");
    assert_eq!(requests[3].method, "DELETE");

    let bad = set_team_access(&client, "acme", "app", "../x", "push")
        .await
        .expect_err("slug");
    assert_eq!(bad.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn transferring_and_deleting_need_the_exact_repository_name() {
    let (server, client) = setup().await;

    let wrong = delete_repository(&client, "acme", "app", "app")
        .await
        .expect_err("wrong");
    let wrong_transfer = transfer_repository(&client, "acme", "app", "octo", None, "acme/App")
        .await
        .expect_err("wrong");
    assert_eq!(wrong.kind, ErrorKind::InvalidInput);
    assert_eq!(wrong_transfer.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());

    transfer_repository(&client, "acme", "app", "octo", Some("renamed"), "acme/app")
        .await
        .expect("transfer");
    delete_repository(&client, "acme", "app", "acme/app")
        .await
        .expect("delete");

    let requests = server.requests();
    let body = json_body(&requests[0]);
    assert_eq!(body["new_owner"], "octo");
    assert_eq!(body["new_name"], "renamed");
    assert_eq!(requests[1].method, "DELETE");
    assert_eq!(requests[1].path(), "/repos/acme/app");
}

#[tokio::test]
async fn deleting_without_the_permission_asks_for_it() {
    let (_server, client) = setup().await;

    let error = delete_repository(&client, "acme", "locked", "acme/locked")
        .await
        .expect_err("scope");

    assert_eq!(error.kind, ErrorKind::GithubMissingScope);
    assert_eq!(error.detail, "delete_repo");
}

#[tokio::test]
async fn branch_protection_is_read_written_and_removed_with_encoded_names() {
    let (server, client) = setup().await;

    let branches = list_branches(&client, "acme", "app")
        .await
        .expect("branches");
    assert!(branches[0].protected);
    assert_eq!(branches[1].name, "feature/x");

    let main = get_protection(&client, "acme", "app", "main")
        .await
        .expect("get")
        .expect("rules");
    assert_eq!(main.required_reviews, Some(2));
    assert_eq!(main.required_checks, Some(vec!["ci".to_string()]));
    assert!(main.enforce_admins);
    assert!(main.require_conversation_resolution);

    let none = get_protection(&client, "acme", "app", "feature/x")
        .await
        .expect("get");
    assert_eq!(none, None);

    put_protection(&client, "acme", "app", "feature/x", &settings())
        .await
        .expect("put");
    delete_protection(&client, "acme", "app", "main")
        .await
        .expect("delete");

    let requests = server.requests();
    let put = requests
        .iter()
        .find(|request| request.method == "PUT")
        .expect("put request");
    assert_eq!(
        put.path(),
        "/repos/acme/app/branches/feature%2Fx/protection"
    );
    let body = json_body(put);
    assert_eq!(
        body["required_pull_request_reviews"]["required_approving_review_count"],
        1
    );
    assert!(body["required_status_checks"].is_null());
    assert!(body["restrictions"].is_null());
    assert_eq!(body["required_linear_history"], true);
}

#[tokio::test]
async fn unsafe_branch_names_are_refused() {
    let (server, client) = setup().await;

    let error = get_protection(&client, "acme", "app", "a..b")
        .await
        .expect_err("branch");

    assert_eq!(error.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn webhooks_are_created_updated_pinged_and_deleted() {
    let (server, client) = setup().await;

    let hooks = list_hooks(&client, "acme", "app").await.expect("list");
    assert_eq!(hooks[0].id, 5);
    assert_eq!(hooks[0].config.url, "https://example.com/hook");
    assert_eq!(
        hooks[0].last_response.as_ref().expect("response").code,
        Some(200)
    );

    let request = NewHook {
        url: " https://example.com/hook ".to_string(),
        events: vec!["push".to_string(), "pull_request".to_string()],
        secret: Some("s3cret".to_string()),
        active: true,
    };
    create_hook(&client, "acme", "app", &request)
        .await
        .expect("create");
    update_hook(
        &client,
        "acme",
        "app",
        5,
        &HookUpdate {
            active: Some(false),
            events: None,
        },
    )
    .await
    .expect("update");
    ping_hook(&client, "acme", "app", 5).await.expect("ping");
    delete_hook(&client, "acme", "app", 5)
        .await
        .expect("delete");

    let requests = server.requests();
    let created = json_body(&requests[1]);
    assert_eq!(created["name"], "web");
    assert_eq!(
        created["events"],
        serde_json::json!(["push", "pull_request"])
    );
    assert_eq!(created["config"]["url"], "https://example.com/hook");
    assert_eq!(created["config"]["content_type"], "json");
    assert_eq!(created["config"]["secret"], "s3cret");
    assert_eq!(json_body(&requests[2])["active"], false);
    assert!(json_body(&requests[2]).get("events").is_none());
    assert_eq!(requests[3].path(), "/repos/acme/app/hooks/5/pings");
    assert_eq!(requests[4].method, "DELETE");
}

#[tokio::test]
async fn invalid_webhooks_are_refused_before_any_call() {
    let (server, client) = setup().await;
    let base = NewHook {
        url: "https://example.com".to_string(),
        events: vec!["push".to_string()],
        secret: None,
        active: true,
    };

    for request in [
        NewHook {
            url: "http://example.com".to_string(),
            ..base.clone()
        },
        NewHook {
            events: Vec::new(),
            ..base.clone()
        },
        NewHook {
            secret: Some("a\nb".to_string()),
            ..base.clone()
        },
    ] {
        let error = create_hook(&client, "acme", "app", &request)
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
    let empty = update_hook(&client, "acme", "app", 5, &HookUpdate::default())
        .await
        .expect_err("nothing");
    assert_eq!(empty.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn deploy_keys_are_listed_added_and_deleted() {
    let (server, client) = setup().await;

    let keys = list_deploy_keys(&client, "acme", "app")
        .await
        .expect("list");
    assert!(keys[0].read_only);
    let added = add_deploy_key(
        &client,
        "acme",
        "app",
        " Deploy ",
        "ssh-ed25519 BBBB",
        false,
    )
    .await
    .expect("add");
    delete_deploy_key(&client, "acme", "app", 4)
        .await
        .expect("delete");

    assert_eq!(added.id, 5);
    let requests = server.requests();
    let body = json_body(&requests[1]);
    assert_eq!(body["title"], "Deploy");
    assert_eq!(body["key"], "ssh-ed25519 BBBB");
    assert_eq!(body["read_only"], false);
    assert_eq!(requests[2].path(), "/repos/acme/app/keys/4");

    let private = add_deploy_key(
        &client,
        "acme",
        "app",
        "CI",
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        true,
    )
    .await
    .expect_err("private key");
    assert_eq!(private.kind, ErrorKind::InvalidInput);
}
