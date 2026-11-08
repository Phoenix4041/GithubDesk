use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::jobs::CancelToken;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
const EMBEDDED_CLIENT_ID: Option<&str> = option_env!("GITHUBDESK_OAUTH_CLIENT_ID");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LoginMethod {
    System,
    Cli,
}

#[derive(Debug, Clone)]
pub struct Tool {
    pub program: String,
    pub prefix: Vec<String>,
}

impl Tool {
    pub fn git() -> Self {
        Self {
            program: "git".to_string(),
            prefix: Vec::new(),
        }
    }

    pub fn github_cli() -> Self {
        Self {
            program: "gh".to_string(),
            prefix: Vec::new(),
        }
    }

    pub fn custom(program: &str, prefix: &[&str]) -> Self {
        Self {
            program: program.to_string(),
            prefix: prefix.iter().map(|item| (*item).to_string()).collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemCredential {
    pub username: Option<String>,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginOptions {
    pub system: bool,
    pub cli: bool,
    pub embedded_client_id: Option<String>,
}

struct Captured {
    code: i32,
    stdout: String,
    stderr: String,
}

async fn run(
    tool: &Tool,
    args: &[&str],
    input: Option<&str>,
    cancel: &mut CancelToken,
    timeout: Duration,
) -> AppResult<Captured> {
    let mut command = Command::new(&tool.program);
    command
        .args(&tool.prefix)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::new(ErrorKind::SystemLoginUnavailable, tool.program.clone())
        } else {
            error.into()
        }
    })?;
    if let (Some(text), Some(mut stdin)) = (input, child.stdin.take()) {
        let bytes = text.as_bytes().to_vec();
        tokio::spawn(async move {
            let _ = stdin.write_all(&bytes).await;
            let _ = stdin.shutdown().await;
        });
    }

    tokio::select! {
        output = child.wait_with_output() => {
            let output = output?;
            Ok(Captured {
                code: output.status.code().unwrap_or(-1),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            })
        }
        () = cancel.cancelled() => Err(AppError::new(ErrorKind::Cancelled, "login cancelled")),
        () = tokio::time::sleep(timeout) => Err(AppError::new(ErrorKind::GithubDeviceExpired, "login timed out")),
    }
}

fn credential_request(host: &str) -> String {
    format!("protocol=https\nhost={host}\n\n")
}

fn parse_credential(output: &str) -> Option<SystemCredential> {
    let mut username = None;
    let mut token = None;
    for line in output.lines() {
        if let Some(value) = line.strip_prefix("password=") {
            token = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("username=") {
            username = Some(value.trim().to_string());
        }
    }
    token
        .filter(|value| !value.is_empty())
        .map(|token| SystemCredential { username, token })
}

pub async fn credential_fill(
    tool: &Tool,
    host: &str,
    cancel: &mut CancelToken,
) -> AppResult<SystemCredential> {
    let request = credential_request(host);
    let captured = run(
        tool,
        &["credential", "fill"],
        Some(&request),
        cancel,
        LOGIN_TIMEOUT,
    )
    .await?;
    if captured.code != 0 {
        return Err(AppError::new(
            ErrorKind::SystemLoginUnavailable,
            captured.stderr.trim().to_string(),
        ));
    }
    parse_credential(&captured.stdout).ok_or_else(|| {
        AppError::new(
            ErrorKind::SystemLoginUnavailable,
            "the credential helper returned no token",
        )
    })
}

pub async fn credential_reject(
    tool: &Tool,
    host: &str,
    credential: &SystemCredential,
    cancel: &mut CancelToken,
) {
    let mut request = format!("protocol=https\nhost={host}\n");
    if let Some(username) = &credential.username {
        request.push_str(&format!("username={username}\n"));
    }
    request.push_str(&format!("password={}\n\n", credential.token));
    let _ = run(
        tool,
        &["credential", "reject"],
        Some(&request),
        cancel,
        PROBE_TIMEOUT,
    )
    .await;
}

pub async fn cli_token(
    tool: &Tool,
    host: &str,
    cancel: &mut CancelToken,
) -> AppResult<SystemCredential> {
    let captured = run(
        tool,
        &["auth", "token", "--hostname", host],
        None,
        cancel,
        PROBE_TIMEOUT,
    )
    .await?;
    let token = captured.stdout.trim().to_string();
    if captured.code != 0 || token.is_empty() || token.chars().any(char::is_whitespace) {
        return Err(AppError::new(
            ErrorKind::SystemLoginUnavailable,
            captured.stderr.trim().to_string(),
        ));
    }
    Ok(SystemCredential {
        username: None,
        token,
    })
}

pub async fn has_credential_helper(tool: &Tool) -> bool {
    let mut cancel = CancelToken::never();
    match run(
        tool,
        &["config", "--get-all", "credential.helper"],
        None,
        &mut cancel,
        PROBE_TIMEOUT,
    )
    .await
    {
        Ok(captured) => captured.code == 0 && !captured.stdout.trim().is_empty(),
        Err(_) => false,
    }
}

pub async fn has_github_cli(tool: &Tool) -> bool {
    let mut cancel = CancelToken::never();
    matches!(
        run(tool, &["--version"], None, &mut cancel, PROBE_TIMEOUT).await,
        Ok(captured) if captured.code == 0
    )
}

pub fn embedded_client_id() -> Option<String> {
    EMBEDDED_CLIENT_ID
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub async fn login_options(git: &Tool, cli: &Tool) -> LoginOptions {
    LoginOptions {
        system: has_credential_helper(git).await,
        cli: has_github_cli(cli).await,
        embedded_client_id: embedded_client_id(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_credential_answer_is_read_for_its_password_and_user() {
        let parsed =
            parse_credential("protocol=https\nhost=github.com\nusername=octo\npassword=gho_fake\n");
        assert_eq!(
            parsed,
            Some(SystemCredential {
                username: Some("octo".to_string()),
                token: "gho_fake".to_string()
            })
        );
    }

    #[test]
    fn an_answer_without_a_password_is_not_a_credential() {
        assert_eq!(parse_credential("username=octo\n"), None);
        assert_eq!(parse_credential("password=\n"), None);
    }

    #[test]
    fn the_request_names_only_the_protocol_and_the_host() {
        assert_eq!(
            credential_request("github.com"),
            "protocol=https\nhost=github.com\n\n"
        );
    }
}
