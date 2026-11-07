mod common;

use std::sync::Arc;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use common::mock_http::{MockResponse, MockServer};
use common::{git_output, new_repository};
use githubdesk_lib::commands::github_repo::{arm_git_account, remote_repos};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::runner::git_unchecked;
use githubdesk_lib::github::accounts::AccountSource;
use githubdesk_lib::github::secrets::MemoryStore;
use githubdesk_lib::state::AppState;
use tempfile::TempDir;

#[tokio::test]
async fn remotes_pointing_to_github_hosts_are_listed_with_origin_first() {
    let workspace = new_repository().await;
    let repo = workspace.path.as_path();
    git_output(
        repo,
        &["remote", "add", "upstream", "git@github.com:octo/hello.git"],
    );
    git_output(
        repo,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/me/hello-fork.git",
        ],
    );
    git_output(repo, &["remote", "add", "backup", "C:/backups/hello.git"]);
    git_output(
        repo,
        &[
            "remote",
            "add",
            "work",
            "https://git.company.example/team/hello.git",
        ],
    );

    let repos = remote_repos(repo).await.expect("remotes");
    let summary: Vec<(String, String, String, String)> = repos
        .into_iter()
        .map(|item| (item.remote_name, item.host, item.owner, item.name))
        .collect();
    assert_eq!(
        summary[0],
        (
            "origin".into(),
            "github.com".into(),
            "me".into(),
            "hello-fork".into()
        )
    );
    assert_eq!(summary.len(), 3);
    assert!(summary
        .iter()
        .any(|item| item.0 == "upstream" && item.2 == "octo"));
    assert!(summary
        .iter()
        .any(|item| item.0 == "work" && item.1 == "git.company.example"));
    assert!(!summary.iter().any(|item| item.0 == "backup"));
}

#[tokio::test]
async fn repositories_without_remotes_have_no_github_remotes() {
    let workspace = new_repository().await;
    assert!(remote_repos(workspace.path.as_path())
        .await
        .expect("remotes")
        .is_empty());
}

#[tokio::test]
async fn an_armed_account_gives_git_a_scoped_header_only_for_that_repository() {
    let server = MockServer::start(|request| {
        if request.header("authorization") == Some("Bearer account-token") {
            MockResponse::json(
                200,
                "{\"login\":\"MonaLisa\",\"name\":null,\"avatar_url\":\"https://avatars.githubusercontent.com/u/1\"}",
            )
        } else {
            MockResponse::json(401, "{}")
        }
    })
    .await;
    let host = server.base_url.trim_start_matches("http://").to_string();
    let directory = TempDir::new().expect("dir");
    let state = AppState::with_secrets(
        directory.path().to_path_buf(),
        Arc::new(MemoryStore::default()),
    );
    let account = state
        .accounts
        .add_with_token(&host, "account-token", AccountSource::Token)
        .await
        .expect("account");

    let armed = new_repository().await;
    let other = new_repository().await;
    let key = format!("http.http://{host}/.extraheader");

    let before = git_unchecked(armed.path.as_path(), &["config", "--get", &key])
        .await
        .expect("config");
    assert!(!before.success());

    arm_git_account(&state, armed.path.as_path(), Some(&account.id))
        .await
        .expect("arm");
    let header = git_unchecked(armed.path.as_path(), &["config", "--get", &key])
        .await
        .expect("config");
    assert!(header.success());
    let value = header.trimmed();
    let encoded = value
        .strip_prefix("AUTHORIZATION: basic ")
        .expect("basic auth");
    let decoded = String::from_utf8(STANDARD.decode(encoded).expect("base64")).expect("utf8");
    assert_eq!(decoded, "x-access-token:account-token");

    let untouched = git_unchecked(other.path.as_path(), &["config", "--get", &key])
        .await
        .expect("config");
    assert!(!untouched.success());

    let helper = git_unchecked(
        armed.path.as_path(),
        &["config", "--get-all", "credential.helper"],
    )
    .await
    .expect("config");
    assert_eq!(helper.trimmed(), "");

    arm_git_account(&state, armed.path.as_path(), None)
        .await
        .expect("disarm");
    let after = git_unchecked(armed.path.as_path(), &["config", "--get", &key])
        .await
        .expect("config");
    assert!(!after.success());
}

#[tokio::test]
async fn arming_an_unknown_account_fails_without_changing_anything() {
    let directory = TempDir::new().expect("dir");
    let state = AppState::with_secrets(
        directory.path().to_path_buf(),
        Arc::new(MemoryStore::default()),
    );
    let workspace = new_repository().await;
    let error = arm_git_account(&state, workspace.path.as_path(), Some("github.com:nobody"))
        .await
        .expect_err("unknown");
    assert_eq!(error.kind, ErrorKind::GithubNoAccount);
}
