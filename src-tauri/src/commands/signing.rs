use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::{AppError, AppResult};
use crate::git::parse::signing::{
    parse_gpg_secret_keys, parse_scoped_value, parse_signature, parse_ssh_fingerprint,
    parse_ssh_public_key, GpgKey, SignatureInfo, SshKey, SIGNATURE_FORMAT,
};
use crate::git::runner::{git, git_unchecked, git_with_input};
use crate::git::validate::ensure_commit_hash;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningConfig {
    pub enabled: bool,
    pub format: String,
    pub key: Option<String>,
    pub allowed_signers: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningUpdate {
    pub scope: String,
    pub enabled: bool,
    pub format: String,
    pub key: Option<String>,
    pub allowed_signers: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningKeys {
    pub gpg_available: bool,
    pub gpg: Vec<GpgKey>,
    pub ssh: Vec<SshKey>,
}

async fn config_value(repo: &Path, key: &str) -> AppResult<Option<(String, String)>> {
    let output = git_unchecked(repo, &["config", "--show-scope", "--get", key]).await?;
    if !output.success() {
        return Ok(None);
    }
    Ok(parse_scoped_value(&output.text()))
}

fn is_true(value: &str) -> bool {
    matches!(value.to_lowercase().as_str(), "true" | "yes" | "on" | "1")
}

pub async fn read_signing_config(repo: &Path) -> AppResult<SigningConfig> {
    let enabled = config_value(repo, "commit.gpgsign").await?;
    let format = config_value(repo, "gpg.format").await?;
    let key = config_value(repo, "user.signingkey").await?;
    let allowed = config_value(repo, "gpg.ssh.allowedSignersFile").await?;
    Ok(SigningConfig {
        enabled: enabled
            .as_ref()
            .map(|(_, value)| is_true(value))
            .unwrap_or(false),
        format: format
            .map(|(_, value)| value)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "openpgp".to_string()),
        key: key
            .map(|(_, value)| value)
            .filter(|value| !value.is_empty()),
        allowed_signers: allowed
            .map(|(_, value)| value)
            .filter(|value| !value.is_empty()),
        scope: enabled.map(|(scope, _)| scope),
    })
}

fn clean_value(value: &Option<String>) -> AppResult<Option<String>> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.starts_with('-') || trimmed.chars().any(char::is_control) {
        return Err(AppError::invalid_input("invalid signing setting"));
    }
    Ok(Some(trimmed.to_string()))
}

fn scope_flag(scope: &str) -> AppResult<&'static str> {
    match scope {
        "local" => Ok("--local"),
        "global" => Ok("--global"),
        other => Err(AppError::invalid_input(format!("invalid scope: {other}"))),
    }
}

async fn apply_value(repo: &Path, flag: &str, key: &str, value: Option<&str>) -> AppResult<()> {
    match value {
        Some(text) => {
            git(repo, &["config", flag, key, text]).await?;
        }
        None => {
            let output = git_unchecked(repo, &["config", flag, "--unset-all", key]).await?;
            if !output.success() && output.exit_code != 5 {
                return Err(AppError::from_git_failure(
                    &String::from_utf8_lossy(&output.stdout),
                    &output.stderr,
                ));
            }
        }
    }
    Ok(())
}

pub async fn write_signing_config(repo: &Path, update: &SigningUpdate) -> AppResult<()> {
    let flag = scope_flag(&update.scope)?;
    if !matches!(update.format.as_str(), "openpgp" | "ssh") {
        return Err(AppError::invalid_input(format!(
            "invalid signature format: {}",
            update.format
        )));
    }
    let key = clean_value(&update.key)?;
    let allowed = clean_value(&update.allowed_signers)?;

    apply_value(
        repo,
        flag,
        "commit.gpgsign",
        Some(if update.enabled { "true" } else { "false" }),
    )
    .await?;
    apply_value(repo, flag, "gpg.format", Some(&update.format)).await?;
    apply_value(repo, flag, "user.signingkey", key.as_deref()).await?;
    let signers = if update.format == "ssh" {
        allowed.as_deref()
    } else {
        None
    };
    apply_value(repo, flag, "gpg.ssh.allowedSignersFile", signers).await?;
    Ok(())
}

fn home_directory() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

async fn run_tool(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    if let Some(directory) = Path::new(program)
        .parent()
        .filter(|directory| !directory.as_os_str().is_empty())
    {
        let mut entries = vec![directory.to_path_buf()];
        if let Some(existing) = std::env::var_os("PATH") {
            entries.extend(std::env::split_paths(&existing));
        }
        if let Ok(joined) = std::env::join_paths(entries) {
            command.env("PATH", joined);
        }
    }
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().await.ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}

async fn list_ssh_keys() -> Vec<SshKey> {
    let Some(directory) = home_directory().map(|home| home.join(".ssh")) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&directory) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "pub"))
        .collect();
    paths.sort();

    let mut keys = Vec::new();
    for path in paths {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let display = path.to_string_lossy().into_owned();
        let Some(mut key) = parse_ssh_public_key(&text, &display) else {
            continue;
        };
        if let Some(output) = run_tool("ssh-keygen", &["-lf", &display]).await {
            key.fingerprint = parse_ssh_fingerprint(&output);
        }
        keys.push(key);
    }
    keys
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let candidates: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    };
    for directory in std::env::split_paths(&path) {
        for candidate in &candidates {
            let full = directory.join(candidate);
            if full.is_file() {
                return Some(full);
            }
        }
    }
    None
}

async fn bundled_gpg(repo: &Path) -> Option<PathBuf> {
    let output = git_unchecked(repo, &["--exec-path"]).await.ok()?;
    if !output.success() {
        return None;
    }
    let exec_path = PathBuf::from(output.trimmed());
    let root = exec_path
        .ancestors()
        .find(|ancestor| ancestor.join("usr").join("bin").join("gpg.exe").is_file())?;
    Some(root.join("usr").join("bin").join("gpg.exe"))
}

async fn locate_gpg(repo: &Path) -> AppResult<String> {
    if let Some((_, program)) = config_value(repo, "gpg.program").await? {
        if !program.is_empty() {
            return Ok(program);
        }
    }
    if let Some(found) = find_in_path("gpg") {
        return Ok(found.to_string_lossy().into_owned());
    }
    if let Some(bundled) = bundled_gpg(repo).await {
        return Ok(bundled.to_string_lossy().into_owned());
    }
    Ok("gpg".to_string())
}

pub async fn list_signing_keys(repo: &Path) -> AppResult<SigningKeys> {
    let program = locate_gpg(repo).await?;
    let listing = run_tool(
        &program,
        &[
            "--list-secret-keys",
            "--with-colons",
            "--keyid-format",
            "long",
            "--fixed-list-mode",
        ],
    )
    .await;
    Ok(SigningKeys {
        gpg_available: listing.is_some(),
        gpg: listing
            .map(|text| parse_gpg_secret_keys(&text))
            .unwrap_or_default(),
        ssh: list_ssh_keys().await,
    })
}

pub async fn test_signing(repo: &Path) -> AppResult<()> {
    let tree = git_with_input(repo, &["hash-object", "-t", "tree", "--stdin"], Vec::new()).await?;
    let tree_id = tree.trimmed();
    git(
        repo,
        &[
            "commit-tree",
            "-S",
            &tree_id,
            "-m",
            "signing test from GithubDesk",
        ],
    )
    .await?;
    Ok(())
}

pub async fn commit_signature(repo: &Path, hash: &str) -> AppResult<SignatureInfo> {
    ensure_commit_hash(hash)?;
    let output = git_unchecked(repo, &["log", "-1", SIGNATURE_FORMAT, hash, "--"]).await?;
    if !output.success() {
        return Err(AppError::from_git_failure(
            &String::from_utf8_lossy(&output.stdout),
            &output.stderr,
        ));
    }
    Ok(parse_signature(&output.text()))
}

#[tauri::command]
pub async fn signing_config_get(path: String) -> AppResult<SigningConfig> {
    read_signing_config(Path::new(&path)).await
}

#[tauri::command]
pub async fn signing_config_set(path: String, update: SigningUpdate) -> AppResult<()> {
    write_signing_config(Path::new(&path), &update).await
}

#[tauri::command]
pub async fn signing_keys_list(path: String) -> AppResult<SigningKeys> {
    list_signing_keys(Path::new(&path)).await
}

#[tauri::command]
pub async fn signing_test(path: String) -> AppResult<()> {
    test_signing(Path::new(&path)).await
}

#[tauri::command]
pub async fn commit_signature_get(path: String, hash: String) -> AppResult<SignatureInfo> {
    commit_signature(Path::new(&path), &hash).await
}
