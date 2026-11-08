mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::account_keys::{
    add_gpg_key, add_ssh_key, delete_gpg_key, delete_ssh_key, get_profile, list_emails,
    list_gpg_keys, list_ssh_keys, update_profile, ProfileUpdate,
};
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::notifications::{
    list_notifications, mark_all_read, mark_read, web_url,
};
use githubdesk_lib::github::org_admin::{
    add_team_member, cancel_invitation, create_team, delete_team, invite, list_invitations,
    list_members, list_outside_collaborators, list_team_members, list_teams, my_membership,
    remove_membership, remove_outside_collaborator, remove_team_member, set_membership,
};
use githubdesk_lib::github::security::list_alerts;
use serde_json::Value;

const PGP: &str =
    "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nmQINBF\n-----END PGP PUBLIC KEY BLOCK-----";

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/user") => MockResponse::json(
            200,
            r#"{"login":"octo","name":"Octo","bio":"Hi","company":null,"location":"Lima","blog":""}"#,
        ),
        ("PATCH", "/user") => MockResponse::json(
            200,
            r#"{"login":"octo","name":"Ana","bio":"Hi","company":null,"location":"Lima","blog":"https://ana.example"}"#,
        ),
        ("GET", "/user/emails") => MockResponse::json(
            200,
            r#"[{"email":"octo@example.com","primary":true,"verified":true,"visibility":"private"}]"#,
        ),
        ("GET", "/user/keys") => MockResponse::json(
            200,
            r#"[{"id":1,"title":"Laptop","key":"ssh-ed25519 AAAA","created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        ("POST", "/user/keys") | ("POST", "/user/ssh_signing_keys") => MockResponse::json(
            201,
            r#"{"id":2,"title":"New","key":"ssh-ed25519 BBBB","created_at":"2026-01-02T00:00:00Z"}"#,
        ),
        ("DELETE", "/user/keys/1") | ("DELETE", "/user/ssh_signing_keys/2") => {
            MockResponse::json(204, "")
        }
        ("GET", "/user/ssh_signing_keys") => MockResponse::json(200, "[]"),
        ("GET", "/user/gpg_keys") => MockResponse::json(
            200,
            r#"[{"id":5,"key_id":"3AA5C34371567BD2","name":"Main","emails":[{"email":"octo@example.com","verified":true}],"can_sign":true,"expires_at":null,"created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        ("POST", "/user/gpg_keys") => MockResponse::json(
            201,
            r#"{"id":6,"key_id":"AAAABBBBCCCCDDDD","emails":[],"can_sign":true,"created_at":"2026-01-03T00:00:00Z"}"#,
        ),
        ("DELETE", "/user/gpg_keys/5") => MockResponse::json(204, ""),
        ("GET", "/user/memberships/orgs/acme") => {
            MockResponse::json(200, r#"{"role":"admin","state":"active"}"#)
        }
        ("GET", "/orgs/acme/members") => {
            MockResponse::json(200, r#"[{"login":"hubot","avatar_url":"u"}]"#)
        }
        ("PUT", "/orgs/acme/memberships/hubot") => MockResponse::json(200, "{}"),
        ("DELETE", "/orgs/acme/memberships/hubot") => MockResponse::json(204, ""),
        ("GET", "/orgs/acme/invitations") => MockResponse::json(
            200,
            r#"[{"id":9,"login":"newbie","email":null,"role":"direct_member","created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        ("POST", "/orgs/acme/invitations") => MockResponse::json(201, "{}"),
        ("DELETE", "/orgs/acme/invitations/9") => MockResponse::json(204, ""),
        ("GET", "/users/newbie") => MockResponse::json(200, r#"{"id":4242,"login":"newbie"}"#),
        ("GET", "/orgs/acme/teams") => MockResponse::json(
            200,
            r#"[{"id":1,"slug":"core","name":"Core","description":null,"privacy":"closed"}]"#,
        ),
        ("POST", "/orgs/acme/teams") => MockResponse::json(
            201,
            r#"{"id":2,"slug":"docs","name":"Docs","description":"Docs team","privacy":"secret"}"#,
        ),
        ("DELETE", "/orgs/acme/teams/docs") => MockResponse::json(204, ""),
        ("GET", "/orgs/acme/teams/core/members") => {
            MockResponse::json(200, r#"[{"login":"hubot"}]"#)
        }
        ("PUT", "/orgs/acme/teams/core/memberships/octo")
        | ("DELETE", "/orgs/acme/teams/core/memberships/octo") => MockResponse::json(200, "{}"),
        ("GET", "/orgs/acme/outside_collaborators") => {
            MockResponse::json(200, r#"[{"login":"guest"}]"#)
        }
        ("DELETE", "/orgs/acme/outside_collaborators/guest") => MockResponse::json(204, ""),
        ("GET", "/notifications") => MockResponse::json(
            200,
            r#"[{"id":"123","unread":true,"reason":"review_requested","subject":{"title":"Add login","type":"PullRequest","url":"https://api.github.com/repos/acme/app/pulls/7"},"repository":{"full_name":"acme/app"},"updated_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        ("PATCH", "/notifications/threads/123") => MockResponse::json(205, ""),
        ("PUT", "/notifications") => MockResponse::json(202, ""),
        ("GET", "/repos/acme/app/dependabot/alerts") => MockResponse::json(
            200,
            r#"[{"number":3,"state":"open","dependency":{"package":{"name":"lodash","ecosystem":"npm"},"manifest_path":"package.json"},"security_advisory":{"summary":"Prototype pollution","severity":"high","cve_id":"CVE-2026-0001"},"html_url":"https://github.com/acme/app/security/dependabot/3","created_at":"2026-01-01T00:00:00Z"}]"#,
        ),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

fn body_of(request: &MockRequest) -> Value {
    serde_json::from_str(&request.body).expect("json body")
}

#[tokio::test]
async fn the_profile_and_emails_are_read_and_the_profile_edited_with_clean_values() {
    let (server, client) = setup().await;

    let profile = get_profile(&client).await.expect("profile");
    assert_eq!(profile.bio.as_deref(), Some("Hi"));
    assert_eq!(profile.company, None);
    let emails = list_emails(&client).await.expect("emails");
    assert!(emails[0].primary && emails[0].verified);

    update_profile(
        &client,
        &ProfileUpdate {
            name: " Ana ".to_string(),
            bio: "Hi".to_string(),
            company: String::new(),
            location: "Lima".to_string(),
            blog: "https://ana.example".to_string(),
        },
    )
    .await
    .expect("update");
    let body = body_of(&server.requests()[2]);
    assert_eq!(body["name"], "Ana");
    assert_eq!(body["blog"], "https://ana.example");

    let bad = update_profile(
        &client,
        &ProfileUpdate {
            name: String::new(),
            bio: "x".repeat(200),
            company: String::new(),
            location: String::new(),
            blog: String::new(),
        },
    )
    .await
    .expect_err("long bio");
    assert_eq!(bad.kind, ErrorKind::InvalidInput);
    assert_eq!(server.requests().len(), 3);
}

#[tokio::test]
async fn ssh_keys_for_access_and_for_signing_use_their_own_endpoints() {
    let (server, client) = setup().await;

    let access = list_ssh_keys(&client, false).await.expect("keys");
    assert_eq!(access[0].title, "Laptop");
    list_ssh_keys(&client, true).await.expect("signing keys");
    add_ssh_key(&client, false, " New ", "ssh-ed25519 BBBB")
        .await
        .expect("add");
    add_ssh_key(&client, true, "Sign", "ssh-ed25519 BBBB")
        .await
        .expect("add signing");
    delete_ssh_key(&client, false, 1).await.expect("delete");
    delete_ssh_key(&client, true, 2)
        .await
        .expect("delete signing");

    let paths: Vec<String> = server
        .requests()
        .iter()
        .map(|request| request.path().to_string())
        .collect();
    assert_eq!(
        paths,
        vec![
            "/user/keys",
            "/user/ssh_signing_keys",
            "/user/keys",
            "/user/ssh_signing_keys",
            "/user/keys/1",
            "/user/ssh_signing_keys/2"
        ]
    );
    assert_eq!(body_of(&server.requests()[2])["title"], "New");

    let private = add_ssh_key(&client, false, "x", "-----BEGIN OPENSSH PRIVATE KEY-----")
        .await
        .expect_err("private");
    assert_eq!(private.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn gpg_keys_are_listed_added_and_deleted_and_private_keys_are_refused() {
    let (server, client) = setup().await;

    let keys = list_gpg_keys(&client).await.expect("list");
    assert_eq!(keys[0].key_id, "3AA5C34371567BD2");
    assert!(keys[0].can_sign);
    add_gpg_key(&client, "Work", PGP).await.expect("add");
    delete_gpg_key(&client, 5).await.expect("delete");

    let body = body_of(&server.requests()[1]);
    assert_eq!(body["name"], "Work");
    assert!(body["armored_public_key"]
        .as_str()
        .expect("armored")
        .starts_with("-----BEGIN PGP PUBLIC KEY BLOCK-----"));
    let private = add_gpg_key(
        &client,
        "",
        "-----BEGIN PGP PRIVATE KEY BLOCK-----\nx\n-----END PGP PRIVATE KEY BLOCK-----",
    )
    .await
    .expect_err("private");
    assert_eq!(private.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn organization_members_roles_and_invitations_are_managed() {
    let (server, client) = setup().await;

    assert_eq!(
        my_membership(&client, "acme").await.expect("role").role,
        "admin"
    );
    let members = list_members(&client, "acme", "admin")
        .await
        .expect("members");
    assert_eq!(members[0].login, "hubot");
    assert_eq!(server.requests()[1].query("role").as_deref(), Some("admin"));
    set_membership(&client, "acme", "hubot", "admin")
        .await
        .expect("promote");
    remove_membership(&client, "acme", "hubot")
        .await
        .expect("remove");

    let invitations = list_invitations(&client, "acme")
        .await
        .expect("invitations");
    assert_eq!(invitations[0].login.as_deref(), Some("newbie"));
    invite(&client, "acme", "newbie", "direct_member")
        .await
        .expect("invite by login");
    invite(&client, "acme", "ana@example.com", "admin")
        .await
        .expect("invite by email");
    cancel_invitation(&client, "acme", 9).await.expect("cancel");

    let requests = server.requests();
    let by_login = requests
        .iter()
        .find(|request| request.method == "POST" && request.body.contains("invitee_id"))
        .expect("login invitation");
    assert_eq!(body_of(by_login)["invitee_id"], 4242);
    let by_email = requests
        .iter()
        .find(|request| request.method == "POST" && request.body.contains("email"))
        .expect("email invitation");
    assert_eq!(body_of(by_email)["email"], "ana@example.com");
    assert_eq!(body_of(by_email)["role"], "admin");
}

#[tokio::test]
async fn invalid_organization_requests_never_reach_github() {
    let (server, client) = setup().await;

    for result in [
        list_members(&client, "acme", "owner").await.map(|_| ()),
        set_membership(&client, "acme", "hubot", "owner").await,
        invite(&client, "acme", "x", "owner").await,
        invite(&client, "acme", "bad@", "admin").await,
        invite(&client, "../x", "octo", "admin").await,
        remove_membership(&client, "acme", "a b").await,
    ] {
        assert_eq!(result.expect_err("invalid").kind, ErrorKind::InvalidInput);
    }
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn teams_and_their_members_and_outside_collaborators_are_managed() {
    let (server, client) = setup().await;

    assert_eq!(
        list_teams(&client, "acme").await.expect("teams")[0].slug,
        "core"
    );
    let created = create_team(&client, "acme", " Docs ", "Docs team", true)
        .await
        .expect("create");
    assert_eq!(created.privacy, "secret");
    delete_team(&client, "acme", "docs").await.expect("delete");
    assert_eq!(
        list_team_members(&client, "acme", "core")
            .await
            .expect("members")[0]
            .login,
        "hubot"
    );
    add_team_member(&client, "acme", "core", "octo")
        .await
        .expect("add");
    remove_team_member(&client, "acme", "core", "octo")
        .await
        .expect("remove");
    assert_eq!(
        list_outside_collaborators(&client, "acme")
            .await
            .expect("guests")[0]
            .login,
        "guest"
    );
    remove_outside_collaborator(&client, "acme", "guest")
        .await
        .expect("remove guest");

    let body = body_of(&server.requests()[1]);
    assert_eq!(body["name"], "Docs");
    assert_eq!(body["privacy"], "secret");
    let bad = delete_team(&client, "acme", "../x")
        .await
        .expect_err("slug");
    assert_eq!(bad.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn notifications_are_listed_and_marked_as_read() {
    let (server, client) = setup().await;

    let list = list_notifications(&client, false).await.expect("list");
    assert!(list[0].unread);
    assert_eq!(list[0].subject.kind, "PullRequest");
    assert_eq!(list[0].repository.full_name, "acme/app");
    assert_eq!(server.requests()[0].query("all").as_deref(), Some("false"));
    assert_eq!(
        web_url(
            list[0].subject.url.as_deref(),
            &list[0].repository.full_name,
            &list[0].subject.kind
        )
        .as_deref(),
        Some("https://github.com/acme/app/pull/7")
    );

    mark_read(&client, "123").await.expect("read");
    mark_all_read(&client).await.expect("read all");
    let bad = mark_read(&client, "../x").await.expect_err("id");
    assert_eq!(bad.kind, ErrorKind::InvalidInput);
    let requests = server.requests();
    assert_eq!(requests[1].method, "PATCH");
    assert_eq!(requests[2].method, "PUT");
}

#[tokio::test]
async fn open_dependabot_alerts_come_with_their_severity() {
    let (server, client) = setup().await;

    let alerts = list_alerts(&client, "acme", "app").await.expect("alerts");

    assert_eq!(alerts.len(), 1);
    assert_eq!(alerts[0].security_advisory.severity, "high");
    assert_eq!(
        alerts[0]
            .dependency
            .as_ref()
            .expect("dependency")
            .package
            .as_ref()
            .expect("package")
            .name,
        "lodash"
    );
    assert_eq!(server.requests()[0].query("state").as_deref(), Some("open"));
}
