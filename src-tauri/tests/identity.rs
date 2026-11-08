mod common;

use common::{git_output, new_repository};
use githubdesk_lib::commands::identity::{
    apply_identity, read_identity, IdentitySigning, IdentityUpdate,
};
use githubdesk_lib::error::ErrorKind;

fn update(name: &str, email: &str, signing: Option<(&str, &str)>) -> IdentityUpdate {
    IdentityUpdate {
        name: name.to_string(),
        email: email.to_string(),
        signing: signing.map(|(key, format)| IdentitySigning {
            key: key.to_string(),
            format: format.to_string(),
        }),
    }
}

#[tokio::test]
async fn a_repository_without_configuration_has_no_identity() {
    let workspace = new_repository().await;

    let identity = read_identity(&workspace.path).await.expect("identity");

    assert_eq!(identity.name, None);
    assert_eq!(identity.email, None);
    assert_eq!(identity.signing_key, None);
    assert!(!identity.signing_enabled);
}

#[tokio::test]
async fn applying_a_profile_writes_the_local_configuration() {
    let workspace = new_repository().await;
    let repo = &workspace.path;

    apply_identity(repo, &update(" Ana Pérez ", "ana@example.com", None))
        .await
        .expect("apply");

    let identity = read_identity(repo).await.expect("identity");
    let name = identity.name.expect("name");
    assert_eq!(name.value, "Ana Pérez");
    assert_eq!(name.scope, "local");
    let email = identity.email.expect("email");
    assert_eq!(email.value, "ana@example.com");
    assert_eq!(email.scope, "local");
    assert_eq!(
        git_output(repo, &["config", "--local", "--get", "user.name"]).trim(),
        "Ana Pérez"
    );
}

#[tokio::test]
async fn applying_twice_replaces_the_values_instead_of_stacking_them() {
    let workspace = new_repository().await;
    let repo = &workspace.path;

    apply_identity(repo, &update("First", "first@example.com", None))
        .await
        .expect("first");
    apply_identity(repo, &update("Second", "second@example.com", None))
        .await
        .expect("second");

    let names = git_output(repo, &["config", "--local", "--get-all", "user.name"]);
    assert_eq!(names.trim(), "Second");
    let identity = read_identity(repo).await.expect("identity");
    assert_eq!(identity.email.expect("email").value, "second@example.com");
}

#[tokio::test]
async fn a_signing_key_is_written_and_then_cleared_by_a_profile_without_one() {
    let workspace = new_repository().await;
    let repo = &workspace.path;

    apply_identity(
        repo,
        &update("Ana", "ana@example.com", Some(("ABCD1234", "openpgp"))),
    )
    .await
    .expect("with key");
    let signed = read_identity(repo).await.expect("identity");
    assert_eq!(signed.signing_key.expect("key").value, "ABCD1234");
    assert!(signed.signing_enabled);
    assert_eq!(
        git_output(repo, &["config", "--local", "--get", "gpg.format"]).trim(),
        "openpgp"
    );

    apply_identity(repo, &update("Ana", "ana@example.com", None))
        .await
        .expect("without key");
    let plain = read_identity(repo).await.expect("identity");
    assert_eq!(plain.signing_key, None);
    assert!(!plain.signing_enabled);

    apply_identity(repo, &update("Ana", "ana@example.com", None))
        .await
        .expect("clearing nothing is fine");
}

#[tokio::test]
async fn invalid_values_are_refused_and_nothing_is_written() {
    let workspace = new_repository().await;
    let repo = &workspace.path;

    for request in [
        update("", "ana@example.com", None),
        update("Ana", "not-an-email", None),
        update("--global", "ana@example.com", None),
        update("Ana", "ana@example.com", Some(("-evil", "openpgp"))),
        update("Ana", "ana@example.com", Some(("KEY", "unknown"))),
        update("Ana\nBob", "ana@example.com", None),
    ] {
        let error = apply_identity(repo, &request).await.expect_err("refused");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }

    let identity = read_identity(repo).await.expect("identity");
    assert_eq!(identity.name, None);
    assert_eq!(identity.email, None);
}
