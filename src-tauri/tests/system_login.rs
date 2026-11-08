mod common;

use std::sync::Arc;
use std::time::Duration;

use common::mock_http::{MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::accounts::{AccountSource, AccountStore};
use githubdesk_lib::github::secrets::{MemoryStore, SecretStore};
use githubdesk_lib::github::system_login::{
    cli_token, credential_fill, has_credential_helper, has_github_cli, LoginMethod, Tool,
};
use githubdesk_lib::jobs::{CancelToken, JobRegistry};
use tempfile::TempDir;

fn host_of(server: &MockServer) -> String {
    server.base_url.trim_start_matches("http://").to_string()
}

async fn github_server() -> MockServer {
    MockServer::start(|request| {
        if request.path() == "/user" && request.header("authorization") == Some("Bearer good-token")
        {
            MockResponse::json(
                200,
                "{\"id\":7,\"login\":\"MonaLisa\",\"name\":\"Mona\",\"avatar_url\":\"https://avatars.githubusercontent.com/u/7\"}",
            )
        } else {
            MockResponse::json(401, "{\"message\":\"Bad credentials\"}")
        }
    })
    .await
}

fn store_in(directory: &TempDir) -> (AccountStore, Arc<MemoryStore>) {
    let secrets = Arc::new(MemoryStore::default());
    (
        AccountStore::new(directory.path().to_path_buf(), secrets.clone()),
        secrets,
    )
}

fn helper(script: &str) -> Tool {
    let setting = format!("credential.helper=!f() {{ {script}; }}; f");
    Tool::custom("git", &["-c", "credential.helper=", "-c", &setting])
}

fn cli(script: &str) -> Tool {
    let alias = format!("alias.fakegh=!f() {{ {script}; }}; f");
    Tool::custom("git", &["-c", &alias, "fakegh"])
}

fn forward(directory: &TempDir, name: &str) -> String {
    directory
        .path()
        .join(name)
        .to_string_lossy()
        .replace('\\', "/")
}

#[tokio::test]
async fn the_system_credential_helper_signs_in_and_the_token_goes_to_the_keyring_only() {
    let server = github_server().await;
    let directory = TempDir::new().expect("dir");
    let (store, secrets) = store_in(&directory);
    let git = helper("echo username=octo; echo password=good-token");

    let account = store
        .login_with_system(
            &host_of(&server),
            LoginMethod::System,
            &git,
            &Tool::github_cli(),
            &mut CancelToken::never(),
        )
        .await
        .expect("login");

    assert_eq!(account.login, "MonaLisa");
    assert_eq!(account.source, AccountSource::System);
    assert_eq!(
        secrets.get(&account.id).expect("secret").as_deref(),
        Some("good-token")
    );
    let file = std::fs::read_to_string(directory.path().join("accounts.json")).expect("file");
    assert!(!file.contains("good-token"));
}

#[tokio::test]
async fn a_stale_token_is_rejected_from_the_helper_and_a_fresh_one_is_requested() {
    let server = github_server().await;
    let directory = TempDir::new().expect("dir");
    let (store, _) = store_in(&directory);
    let flag = forward(&directory, "rejected");
    let script = format!(
        "case \"$1\" in get) echo username=octo; if [ -f \"{flag}\" ]; then echo password=good-token; else echo password=stale-token; fi;; erase) touch \"{flag}\";; esac"
    );
    let git = helper(&script);

    let account = store
        .login_with_system(
            &host_of(&server),
            LoginMethod::System,
            &git,
            &Tool::github_cli(),
            &mut CancelToken::never(),
        )
        .await
        .expect("login");

    assert_eq!(account.login, "MonaLisa");
    assert!(directory.path().join("rejected").exists());
}

#[tokio::test]
async fn a_token_that_stays_invalid_is_reported_as_unauthorized() {
    let server = github_server().await;
    let directory = TempDir::new().expect("dir");
    let (store, secrets) = store_in(&directory);
    let git = helper("echo username=octo; echo password=stale-token");

    let error = store
        .login_with_system(
            &host_of(&server),
            LoginMethod::System,
            &git,
            &Tool::github_cli(),
            &mut CancelToken::never(),
        )
        .await
        .expect_err("unauthorized");

    assert_eq!(error.kind, ErrorKind::GithubUnauthorized);
    assert!(!error.detail.contains("stale-token"));
    assert!(store.list().await.expect("list").is_empty());
    assert!(secrets.get("anything").expect("secret").is_none());
}

#[tokio::test]
async fn without_a_credential_helper_the_login_is_reported_as_unavailable() {
    let mut cancel = CancelToken::never();
    let git = Tool::custom("git", &["-c", "credential.helper="]);
    let error = credential_fill(&git, "github.com", &mut cancel)
        .await
        .expect_err("no helper");
    assert_eq!(error.kind, ErrorKind::SystemLoginUnavailable);
}

#[tokio::test]
async fn the_github_cli_token_is_imported_with_its_own_source() {
    let server = github_server().await;
    let directory = TempDir::new().expect("dir");
    let (store, _) = store_in(&directory);

    let account = store
        .login_with_system(
            &host_of(&server),
            LoginMethod::Cli,
            &Tool::git(),
            &cli("echo good-token"),
            &mut CancelToken::never(),
        )
        .await
        .expect("login");

    assert_eq!(account.source, AccountSource::Cli);
    assert_eq!(account.login, "MonaLisa");
}

#[tokio::test]
async fn a_failing_or_missing_github_cli_is_reported_as_unavailable() {
    let mut cancel = CancelToken::never();
    let failing = cli("echo not logged in >&2; exit 1");
    let error = cli_token(&failing, "github.com", &mut cancel)
        .await
        .expect_err("failing");
    assert_eq!(error.kind, ErrorKind::SystemLoginUnavailable);

    let missing = Tool::custom("githubdesk-no-such-program", &[]);
    let error = cli_token(&missing, "github.com", &mut cancel)
        .await
        .expect_err("missing");
    assert_eq!(error.kind, ErrorKind::SystemLoginUnavailable);

    let spaced = cli("echo two words");
    assert!(cli_token(&spaced, "github.com", &mut cancel).await.is_err());
}

#[tokio::test]
async fn waiting_for_the_browser_can_be_cancelled() {
    let registry = Arc::new(JobRegistry::default());
    let guard = registry.register("login");
    let mut cancel = guard.token();
    let git = helper("sleep 4");

    let waiter =
        tokio::spawn(async move { credential_fill(&git, "github.com", &mut cancel).await });
    tokio::time::sleep(Duration::from_millis(400)).await;
    assert!(registry.cancel("login"));
    let error = waiter.await.expect("join").expect_err("cancelled");
    assert_eq!(error.kind, ErrorKind::Cancelled);
}

#[tokio::test]
async fn the_available_methods_are_detected() {
    let configured = Tool::custom("git", &["-c", "credential.helper=manager"]);
    assert!(has_credential_helper(&configured).await);
    assert!(!has_github_cli(&Tool::custom("githubdesk-no-such-program", &[])).await);
    assert!(has_github_cli(&Tool::git()).await);
}
