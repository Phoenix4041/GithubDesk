mod common;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::commit::create_commit;
use githubdesk_lib::commands::signing::{
    commit_signature, list_signing_keys, read_signing_config, test_signing, write_signing_config,
    SigningUpdate,
};
use githubdesk_lib::commands::status::stage_paths;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::parse::signing::SignatureStatus;
use tempfile::TempDir;

struct GpgHome {
    _directory: TempDir,
    key_id: String,
}

impl GpgHome {
    fn shutdown(&self) {
        let _ = Command::new("gpgconf").args(["--kill", "all"]).output();
    }
}

fn gpg_available() -> bool {
    Command::new("gpg")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn ssh_keygen_available() -> bool {
    Command::new("ssh-keygen")
        .arg("-?")
        .output()
        .map(|output| !output.stderr.is_empty() || output.status.success())
        .unwrap_or(false)
}

fn generate_key() -> bool {
    Command::new("gpg")
        .args([
            "--batch",
            "--pinentry-mode",
            "loopback",
            "--passphrase",
            "",
            "--quick-generate-key",
            "Sign Tester <sign@example.com>",
            "default",
            "default",
            "never",
        ])
        .output()
        .is_ok_and(|output| output.status.success())
}

fn gpg_home() -> &'static GpgHome {
    static HOME: OnceLock<GpgHome> = OnceLock::new();
    HOME.get_or_init(|| {
        let directory = tempfile::Builder::new()
            .prefix("gh")
            .tempdir()
            .expect("gpg home");
        let path = directory.path().to_path_buf();
        std::env::remove_var("GNUPGHOME");
        std::env::set_var("HOME", &path);
        std::env::set_var("USERPROFILE", &path);
        assert!(generate_key(), "gpg could not create a key");
        let listing = Command::new("gpg")
            .args([
                "--list-secret-keys",
                "--with-colons",
                "--keyid-format",
                "long",
            ])
            .output()
            .expect("gpg lists");
        let text = String::from_utf8_lossy(&listing.stdout).into_owned();
        let key_id = text
            .lines()
            .find(|line| line.starts_with("sec:"))
            .and_then(|line| line.split(':').nth(4))
            .expect("key id")
            .to_string();
        GpgHome {
            _directory: directory,
            key_id,
        }
    })
}

fn update(scope: &str, enabled: bool, format: &str, key: Option<&str>) -> SigningUpdate {
    SigningUpdate {
        scope: scope.to_string(),
        enabled,
        format: format.to_string(),
        key: key.map(str::to_string),
        allowed_signers: None,
    }
}

#[tokio::test]
async fn unsigned_commits_report_no_signature_and_the_default_configuration() {
    let workspace = new_repository().await;
    let hash = commit_file(&workspace.path, "a.txt", "one", "first").await;

    let signature = commit_signature(&workspace.path, &hash)
        .await
        .expect("signature");
    assert_eq!(signature.status, SignatureStatus::None);
    assert_eq!(signature.signer, None);

    let config = read_signing_config(&workspace.path).await.expect("config");
    assert!(!config.enabled);
    assert_eq!(config.format, "openpgp");
    assert_eq!(config.key, None);
}

#[tokio::test]
async fn the_signing_configuration_is_written_and_read_back_per_scope() {
    let workspace = new_repository().await;
    write_signing_config(
        &workspace.path,
        &update("local", true, "ssh", Some("/home/me/.ssh/id_ed25519.pub")),
    )
    .await
    .expect("write");

    let config = read_signing_config(&workspace.path).await.expect("config");
    assert!(config.enabled);
    assert_eq!(config.format, "ssh");
    assert_eq!(config.key.as_deref(), Some("/home/me/.ssh/id_ed25519.pub"));
    assert_eq!(config.scope.as_deref(), Some("local"));

    write_signing_config(&workspace.path, &update("local", false, "openpgp", None))
        .await
        .expect("disable");
    let disabled = read_signing_config(&workspace.path).await.expect("config");
    assert!(!disabled.enabled);
    assert_eq!(disabled.format, "openpgp");
    assert_eq!(disabled.key, None);
}

#[tokio::test]
async fn invalid_signing_settings_are_rejected() {
    let workspace = new_repository().await;
    let bad_scope = write_signing_config(&workspace.path, &update("system", true, "ssh", None))
        .await
        .expect_err("scope");
    assert_eq!(bad_scope.kind, ErrorKind::InvalidInput);

    let bad_format = write_signing_config(&workspace.path, &update("local", true, "x509", None))
        .await
        .expect_err("format");
    assert_eq!(bad_format.kind, ErrorKind::InvalidInput);

    let bad_key = write_signing_config(
        &workspace.path,
        &update("local", true, "openpgp", Some("--evil")),
    )
    .await
    .expect_err("key");
    assert_eq!(bad_key.kind, ErrorKind::InvalidInput);

    let bad_hash = commit_signature(&workspace.path, "--oops")
        .await
        .expect_err("hash");
    assert_eq!(bad_hash.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn gpg_signed_commits_verify_as_good_and_the_key_is_listed() {
    if !gpg_available() {
        eprintln!("gpg is not installed, skipping");
        return;
    }
    let home = gpg_home();
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;

    let keys = list_signing_keys(&workspace.path).await.expect("keys");
    assert!(keys.gpg_available);
    let listed = keys
        .gpg
        .iter()
        .find(|key| key.key_id == home.key_id)
        .expect("generated key is listed");
    assert_eq!(
        listed.user.as_deref(),
        Some("Sign Tester <sign@example.com>")
    );
    assert!(!listed.expired);

    write_signing_config(
        &workspace.path,
        &update("local", true, "openpgp", Some(&home.key_id)),
    )
    .await
    .expect("write");
    test_signing(&workspace.path).await.expect("signing works");

    write_file(&workspace.path, "b.txt", "two");
    stage_paths(&workspace.path, &["b.txt".to_string()])
        .await
        .expect("stage");
    let hash = create_commit(&workspace.path, "signed commit", "", false)
        .await
        .expect("signed commit");

    let signature = commit_signature(&workspace.path, &hash)
        .await
        .expect("signature");
    assert_eq!(signature.status, SignatureStatus::Good);
    assert_eq!(
        signature.signer.as_deref(),
        Some("Sign Tester <sign@example.com>")
    );
    assert!(signature.key.is_some());

    missing_gpg_key_fails_with_a_typed_signing_error().await;
    home.shutdown();
}

async fn missing_gpg_key_fails_with_a_typed_signing_error() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    write_signing_config(
        &workspace.path,
        &update("local", true, "openpgp", Some("DEADBEEFDEADBEEF")),
    )
    .await
    .expect("write");

    let error = test_signing(&workspace.path)
        .await
        .expect_err("no such key");
    assert!(
        matches!(
            error.kind,
            ErrorKind::SigningKeyMissing | ErrorKind::SigningFailed
        ),
        "unexpected error kind: {:?} ({})",
        error.kind,
        error.detail
    );

    write_file(&workspace.path, "b.txt", "two");
    stage_paths(&workspace.path, &["b.txt".to_string()])
        .await
        .expect("stage");
    let commit_error = create_commit(&workspace.path, "will not be signed", "", false)
        .await
        .expect_err("commit must fail when signing fails");
    assert!(matches!(
        commit_error.kind,
        ErrorKind::SigningKeyMissing | ErrorKind::SigningFailed
    ));
}

fn generate_ssh_key(directory: &Path) -> PathBuf {
    let key = directory.join("id_test");
    let output = Command::new("ssh-keygen")
        .args([
            "-q",
            "-t",
            "ed25519",
            "-N",
            "",
            "-C",
            "sign@example.com",
            "-f",
        ])
        .arg(&key)
        .output()
        .expect("ssh-keygen runs");
    assert!(
        output.status.success(),
        "ssh-keygen failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    key
}

#[tokio::test]
async fn ssh_signed_commits_verify_as_good_with_allowed_signers() {
    if !ssh_keygen_available() {
        eprintln!("ssh-keygen is not installed, skipping");
        return;
    }
    let keys_directory = TempDir::new().expect("keys directory");
    let private_key = generate_ssh_key(keys_directory.path());
    let public_path = PathBuf::from(format!("{}.pub", private_key.display()));
    let public_text = std::fs::read_to_string(&public_path).expect("public key");
    let signers = keys_directory.path().join("allowed_signers");
    let mut parts = public_text.split_whitespace();
    let key_type = parts.next().expect("type");
    let key_blob = parts.next().expect("blob");
    std::fs::write(
        &signers,
        format!("sign@example.com {key_type} {key_blob}\n"),
    )
    .expect("allowed signers");

    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    git_output(
        &workspace.path,
        &["config", "user.email", "sign@example.com"],
    );

    write_signing_config(
        &workspace.path,
        &SigningUpdate {
            scope: "local".to_string(),
            enabled: true,
            format: "ssh".to_string(),
            key: Some(public_path.to_string_lossy().into_owned()),
            allowed_signers: Some(signers.to_string_lossy().into_owned()),
        },
    )
    .await
    .expect("write");

    let config = read_signing_config(&workspace.path).await.expect("config");
    assert_eq!(config.format, "ssh");
    assert!(config.allowed_signers.is_some());

    test_signing(&workspace.path)
        .await
        .expect("ssh signing works");

    write_file(&workspace.path, "b.txt", "two");
    stage_paths(&workspace.path, &["b.txt".to_string()])
        .await
        .expect("stage");
    let hash = create_commit(&workspace.path, "ssh signed commit", "", false)
        .await
        .expect("signed commit");
    let signature = commit_signature(&workspace.path, &hash)
        .await
        .expect("signature");
    assert_eq!(signature.status, SignatureStatus::Good);
    assert_eq!(signature.signer.as_deref(), Some("sign@example.com"));
}
