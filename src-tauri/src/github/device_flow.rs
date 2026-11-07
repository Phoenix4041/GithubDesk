use std::time::Duration;

use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::github::client::{build_http_client, map_transport_error, require_secure_url};
use crate::jobs::CancelToken;

pub const DEVICE_SCOPES: &str = "repo workflow read:org";
const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";
const DEFAULT_INTERVAL_SECONDS: u64 = 5;
const SLOW_DOWN_STEP: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct RawDeviceCode {
    device_code: Option<String>,
    user_code: Option<String>,
    verification_uri: Option<String>,
    expires_in: Option<u64>,
    interval: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawToken {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PollOutcome {
    Token(String),
    Pending,
    SlowDown(Option<u64>),
}

fn configuration_error(error: &str, description: Option<String>) -> AppError {
    AppError::new(
        ErrorKind::GithubNotConfigured,
        description.unwrap_or_else(|| error.to_string()),
    )
}

pub async fn request_device_code(
    web_base: &str,
    client_id: &str,
    scope: &str,
) -> AppResult<DeviceCode> {
    require_secure_url(web_base)?;
    let client_id = client_id.trim();
    if client_id.is_empty() {
        return Err(AppError::new(
            ErrorKind::GithubNotConfigured,
            "the OAuth client id is empty",
        ));
    }
    let url = format!("{}/login/device/code", web_base.trim_end_matches('/'));
    let response = build_http_client()?
        .post(url)
        .header(ACCEPT, "application/json")
        .header(
            USER_AGENT,
            concat!("GithubDesk/", env!("CARGO_PKG_VERSION")),
        )
        .form(&[("client_id", client_id), ("scope", scope)])
        .send()
        .await
        .map_err(map_transport_error)?;
    let status = response.status();
    let raw: RawDeviceCode = response.json().await.map_err(|_| {
        AppError::new(
            ErrorKind::GithubNotConfigured,
            format!("unexpected answer from the authorization server ({status})"),
        )
    })?;
    if let Some(error) = raw.error {
        return Err(configuration_error(&error, raw.error_description));
    }
    match (raw.device_code, raw.user_code, raw.verification_uri) {
        (Some(device_code), Some(user_code), Some(verification_uri)) => Ok(DeviceCode {
            device_code,
            user_code,
            verification_uri,
            expires_in: raw.expires_in.unwrap_or(900),
            interval: raw.interval.unwrap_or(DEFAULT_INTERVAL_SECONDS),
        }),
        _ => Err(AppError::new(
            ErrorKind::GithubNotConfigured,
            "the authorization server did not return a device code",
        )),
    }
}

pub async fn poll_once(
    web_base: &str,
    client_id: &str,
    device_code: &str,
) -> AppResult<PollOutcome> {
    require_secure_url(web_base)?;
    let url = format!(
        "{}/login/oauth/access_token",
        web_base.trim_end_matches('/')
    );
    let response = build_http_client()?
        .post(url)
        .header(ACCEPT, "application/json")
        .header(
            USER_AGENT,
            concat!("GithubDesk/", env!("CARGO_PKG_VERSION")),
        )
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", GRANT_TYPE),
        ])
        .send()
        .await
        .map_err(map_transport_error)?;
    let raw: RawToken = response.json().await.map_err(|_| {
        AppError::new(
            ErrorKind::GithubServerError,
            "unexpected answer while waiting for the authorization",
        )
    })?;
    if let Some(token) = raw.access_token {
        return Ok(PollOutcome::Token(token));
    }
    match raw.error.as_deref() {
        Some("authorization_pending") => Ok(PollOutcome::Pending),
        Some("slow_down") => Ok(PollOutcome::SlowDown(raw.interval)),
        Some("expired_token") => Err(AppError::new(
            ErrorKind::GithubDeviceExpired,
            "the code expired",
        )),
        Some("access_denied") => Err(AppError::new(
            ErrorKind::GithubDeviceDenied,
            "the authorization was denied",
        )),
        Some(other) => Err(configuration_error(other, raw.error_description)),
        None => Err(AppError::new(
            ErrorKind::GithubServerError,
            "empty answer while waiting for the authorization",
        )),
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PollTiming {
    pub interval: Duration,
    pub slow_down_step: Duration,
    pub expires_in: Duration,
}

impl PollTiming {
    pub fn from_code(code: &DeviceCode) -> Self {
        Self {
            interval: Duration::from_secs(code.interval.max(1)),
            slow_down_step: SLOW_DOWN_STEP,
            expires_in: Duration::from_secs(code.expires_in),
        }
    }
}

pub async fn wait_for_token(
    web_base: &str,
    client_id: &str,
    device_code: &str,
    timing: PollTiming,
    mut cancel: CancelToken,
) -> AppResult<String> {
    let mut interval = timing.interval;
    let mut waited = Duration::ZERO;
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(AppError::cancelled()),
            _ = tokio::time::sleep(interval) => {}
        }
        waited += interval;
        match poll_once(web_base, client_id, device_code).await? {
            PollOutcome::Token(token) => return Ok(token),
            PollOutcome::Pending => {}
            PollOutcome::SlowDown(new_interval) => {
                interval = match new_interval {
                    Some(seconds) => Duration::from_secs(seconds),
                    None => interval + timing.slow_down_step,
                };
            }
        }
        if waited >= timing.expires_in {
            return Err(AppError::new(
                ErrorKind::GithubDeviceExpired,
                "the code expired",
            ));
        }
    }
}
