use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::header::{
    HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, ETAG, IF_NONE_MATCH, LINK, USER_AGENT,
};
use reqwest::{Method, RequestBuilder, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};

const API_VERSION: &str = "2022-11-28";
const CLIENT_USER_AGENT: &str = concat!("GithubDesk/", env!("CARGO_PKG_VERSION"));
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_CACHED_BODIES: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_page: Option<u32>,
}

#[derive(Default)]
pub struct EtagCache {
    entries: Mutex<HashMap<String, (String, String)>>,
}

impl EtagCache {
    fn lookup(&self, key: &str) -> Option<(String, String)> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(key)
            .cloned()
    }

    fn store(&self, key: String, etag: String, body: String) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if entries.len() >= MAX_CACHED_BODIES {
            entries.clear();
        }
        entries.insert(key, (etag, body));
    }
}

#[derive(Clone)]
pub struct GithubClient {
    http: reqwest::Client,
    api_base: String,
    token: Option<String>,
    cache: Option<(Arc<EtagCache>, String)>,
}

pub fn is_loopback_host(host: &str) -> bool {
    let name = host.split(':').next().unwrap_or(host);
    name == "localhost" || name == "127.0.0.1" || name == "[::1]" || name.ends_with(".localhost")
}

pub fn require_secure_url(base: &str) -> AppResult<()> {
    let parsed = url::Url::parse(base)
        .map_err(|error| AppError::invalid_input(format!("invalid GitHub address: {error}")))?;
    let host = parsed.host_str().unwrap_or_default();
    let secure = parsed.scheme() == "https" || is_loopback_host(host);
    if secure {
        Ok(())
    } else {
        Err(AppError::invalid_input("GitHub connections must use https"))
    }
}

pub fn build_http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))
}

impl GithubClient {
    pub fn new(api_base: &str, token: Option<String>) -> AppResult<Self> {
        require_secure_url(api_base)?;
        Ok(Self {
            http: build_http_client()?,
            api_base: api_base.trim_end_matches('/').to_string(),
            token,
            cache: None,
        })
    }

    pub fn with_cache(mut self, cache: Arc<EtagCache>, scope: String) -> Self {
        self.cache = Some((cache, scope));
        self
    }

    fn url(&self, path: &str) -> String {
        if path.starts_with("https://") || path.starts_with("http://") {
            path.to_string()
        } else {
            format!("{}/{}", self.api_base, path.trim_start_matches('/'))
        }
    }

    fn request(&self, method: Method, url: &str) -> RequestBuilder {
        let mut builder = self
            .http
            .request(method, url)
            .header(USER_AGENT, CLIENT_USER_AGENT)
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", API_VERSION);
        if let Some(token) = &self.token {
            if let Ok(mut value) = HeaderValue::from_str(&format!("Bearer {token}")) {
                value.set_sensitive(true);
                builder = builder.header(AUTHORIZATION, value);
            }
        }
        builder
    }

    async fn dispatch(&self, builder: RequestBuilder) -> AppResult<Response> {
        let response = builder.send().await.map_err(map_transport_error)?;
        if response.status().is_success() || response.status() == StatusCode::NOT_MODIFIED {
            return Ok(response);
        }
        let status = response.status();
        let headers = response.headers().clone();
        let body = response.text().await.unwrap_or_default();
        Err(map_status_error(status, &headers, &body))
    }

    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> AppResult<T> {
        let (body, _) = self.get_body(path, query).await?;
        parse_json(&body)
    }

    async fn get_body(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> AppResult<(String, Option<u32>)> {
        let url = self.url(path);
        let mut builder = self.request(Method::GET, &url);
        if !query.is_empty() {
            builder = builder.query(query);
        }
        let cache_key = self.cache.as_ref().map(|(_, scope)| {
            let mut key = format!("{scope}|{url}");
            for (name, value) in query {
                key.push_str(&format!("&{name}={value}"));
            }
            key
        });
        if let (Some((cache, _)), Some(key)) = (&self.cache, &cache_key) {
            if let Some((etag, _)) = cache.lookup(key) {
                if let Ok(value) = HeaderValue::from_str(&etag) {
                    builder = builder.header(IF_NONE_MATCH, value);
                }
            }
        }
        let response = self.dispatch(builder).await?;
        let next = next_page_number(response.headers());

        if response.status() == StatusCode::NOT_MODIFIED {
            if let (Some((cache, _)), Some(key)) = (&self.cache, &cache_key) {
                if let Some((_, body)) = cache.lookup(key) {
                    return Ok((body, next));
                }
            }
            return Err(AppError::new(
                ErrorKind::Unknown,
                "the server answered not modified without a cached copy",
            ));
        }

        let etag = response
            .headers()
            .get(ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let body = response.text().await.map_err(map_transport_error)?;
        if let (Some((cache, _)), Some(key), Some(etag)) = (&self.cache, cache_key, etag) {
            cache.store(key, etag, body.clone());
        }
        Ok((body, next))
    }

    pub async fn get_page<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
        page: u32,
        per_page: u32,
    ) -> AppResult<Page<T>> {
        let mut full_query: Vec<(&str, String)> = query.to_vec();
        full_query.push(("per_page", per_page.to_string()));
        full_query.push(("page", page.max(1).to_string()));
        let (body, next) = self.get_body(path, &full_query).await?;
        Ok(Page {
            items: parse_json(&body)?,
            next_page: next,
        })
    }

    pub async fn get_page_wrapped<W, T>(
        &self,
        path: &str,
        query: &[(&str, String)],
        page: u32,
        per_page: u32,
        unwrap: impl FnOnce(W) -> Vec<T>,
    ) -> AppResult<Page<T>>
    where
        W: DeserializeOwned,
    {
        let mut full_query: Vec<(&str, String)> = query.to_vec();
        full_query.push(("per_page", per_page.to_string()));
        full_query.push(("page", page.max(1).to_string()));
        let (body, next) = self.get_body(path, &full_query).await?;
        let wrapper: W = parse_json(&body)?;
        Ok(Page {
            items: unwrap(wrapper),
            next_page: next,
        })
    }

    pub async fn get_text(&self, path: &str) -> AppResult<String> {
        let url = self.url(path);
        let response = self
            .dispatch(self.request(Method::GET, &url).header(ACCEPT, "text/plain"))
            .await?;
        response.text().await.map_err(map_transport_error)
    }

    pub async fn send_json<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: &B,
    ) -> AppResult<T> {
        let url = self.url(path);
        let response = self.dispatch(self.request(method, &url).json(body)).await?;
        let text = response.text().await.map_err(map_transport_error)?;
        parse_json(&text)
    }

    pub async fn send_no_content<B: Serialize>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
    ) -> AppResult<()> {
        let url = self.url(path);
        let mut builder = self.request(method, &url);
        if let Some(payload) = body {
            builder = builder.json(payload);
        }
        self.dispatch(builder).await?;
        Ok(())
    }
}

fn parse_json<T: DeserializeOwned>(text: &str) -> AppResult<T> {
    serde_json::from_str(text).map_err(|error| {
        AppError::new(
            ErrorKind::GithubServerError,
            format!("unexpected response from GitHub: {error}"),
        )
    })
}

pub fn next_page_number(headers: &HeaderMap) -> Option<u32> {
    let link = headers.get(LINK)?.to_str().ok()?;
    for part in link.split(',') {
        if !part.contains("rel=\"next\"") {
            continue;
        }
        let target = part
            .split(';')
            .next()?
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>');
        let parsed = url::Url::parse(target).ok()?;
        return parsed
            .query_pairs()
            .find(|(name, _)| name == "page")
            .and_then(|(_, value)| value.parse().ok());
    }
    None
}

pub fn map_transport_error(error: reqwest::Error) -> AppError {
    if error.is_connect() || error.is_timeout() {
        AppError::new(ErrorKind::NetworkUnavailable, error.to_string())
    } else if error.is_decode() || error.is_body() {
        AppError::new(ErrorKind::GithubServerError, error.to_string())
    } else {
        AppError::new(ErrorKind::NetworkUnavailable, error.to_string())
    }
}

fn message_from_body(body: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return body.chars().take(300).collect();
    };
    let mut parts: Vec<String> = Vec::new();
    if let Some(message) = value.get("message").and_then(|message| message.as_str()) {
        parts.push(message.to_string());
    }
    if let Some(errors) = value.get("errors").and_then(|errors| errors.as_array()) {
        for error in errors {
            if let Some(text) = error.as_str() {
                parts.push(text.to_string());
            } else if let Some(text) = error.get("message").and_then(|message| message.as_str()) {
                parts.push(text.to_string());
            } else if let (Some(field), Some(code)) = (
                error.get("field").and_then(|field| field.as_str()),
                error.get("code").and_then(|code| code.as_str()),
            ) {
                parts.push(format!("{field}: {code}"));
            }
        }
    }
    parts.join(" | ")
}

pub fn map_status_error(status: StatusCode, headers: &HeaderMap, body: &str) -> AppError {
    let message = message_from_body(body);
    let exhausted = headers
        .get("x-ratelimit-remaining")
        .and_then(|value| value.to_str().ok())
        == Some("0");
    let limited_text = message.to_lowercase().contains("rate limit");

    match status.as_u16() {
        401 => AppError::new(ErrorKind::GithubUnauthorized, message),
        403 | 429 if exhausted || limited_text || status.as_u16() == 429 => {
            let reset = headers
                .get("x-ratelimit-reset")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            AppError::new(ErrorKind::GithubRateLimited, reset.to_string())
        }
        403 => AppError::new(ErrorKind::GithubForbidden, message),
        404 => AppError::new(ErrorKind::GithubNotFound, message),
        405 | 409 => AppError::new(ErrorKind::GithubNotMergeable, message),
        422 => AppError::new(ErrorKind::GithubValidation, message),
        500..=599 => AppError::new(ErrorKind::GithubServerError, message),
        _ => AppError::new(ErrorKind::Unknown, format!("{status}: {message}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(
                reqwest::header::HeaderName::from_bytes(name.as_bytes()).expect("name"),
                HeaderValue::from_str(value).expect("value"),
            );
        }
        map
    }

    #[test]
    fn finds_the_next_page_in_the_link_header() {
        let map = headers(&[(
            "link",
            "<https://api.github.com/repos/a/b/pulls?per_page=30&page=3>; rel=\"next\", <https://api.github.com/repos/a/b/pulls?page=9>; rel=\"last\"",
        )]);
        assert_eq!(next_page_number(&map), Some(3));
        let last_only = headers(&[("link", "<https://api.github.com/x?page=1>; rel=\"prev\"")]);
        assert_eq!(next_page_number(&last_only), None);
        assert_eq!(next_page_number(&HeaderMap::new()), None);
    }

    #[test]
    fn maps_common_statuses_to_error_kinds() {
        let empty = HeaderMap::new();
        assert_eq!(
            map_status_error(
                StatusCode::UNAUTHORIZED,
                &empty,
                "{\"message\":\"Bad credentials\"}"
            )
            .kind,
            ErrorKind::GithubUnauthorized
        );
        assert_eq!(
            map_status_error(StatusCode::NOT_FOUND, &empty, "{\"message\":\"Not Found\"}").kind,
            ErrorKind::GithubNotFound
        );
        assert_eq!(
            map_status_error(
                StatusCode::FORBIDDEN,
                &empty,
                "{\"message\":\"Resource not accessible\"}"
            )
            .kind,
            ErrorKind::GithubForbidden
        );
        assert_eq!(
            map_status_error(
                StatusCode::METHOD_NOT_ALLOWED,
                &empty,
                "{\"message\":\"Pull Request is not mergeable\"}"
            )
            .kind,
            ErrorKind::GithubNotMergeable
        );
        assert_eq!(
            map_status_error(StatusCode::BAD_GATEWAY, &empty, "").kind,
            ErrorKind::GithubServerError
        );
    }

    #[test]
    fn detects_rate_limits_by_header_and_by_message() {
        let exhausted = headers(&[
            ("x-ratelimit-remaining", "0"),
            ("x-ratelimit-reset", "1700000000"),
        ]);
        let error = map_status_error(StatusCode::FORBIDDEN, &exhausted, "{}");
        assert_eq!(error.kind, ErrorKind::GithubRateLimited);
        assert_eq!(error.detail, "1700000000");

        let secondary = map_status_error(
            StatusCode::FORBIDDEN,
            &HeaderMap::new(),
            "{\"message\":\"You have exceeded a secondary rate limit.\"}",
        );
        assert_eq!(secondary.kind, ErrorKind::GithubRateLimited);
    }

    #[test]
    fn validation_errors_keep_their_messages() {
        let body = "{\"message\":\"Validation Failed\",\"errors\":[{\"resource\":\"PullRequest\",\"field\":\"head\",\"code\":\"invalid\"},{\"message\":\"A pull request already exists\"}]}";
        let error = map_status_error(StatusCode::UNPROCESSABLE_ENTITY, &HeaderMap::new(), body);
        assert_eq!(error.kind, ErrorKind::GithubValidation);
        assert!(error.detail.contains("Validation Failed"));
        assert!(error.detail.contains("head: invalid"));
        assert!(error.detail.contains("A pull request already exists"));
    }

    #[test]
    fn plain_text_bodies_are_trimmed() {
        let error = map_status_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            &HeaderMap::new(),
            &"x".repeat(1000),
        );
        assert_eq!(error.detail.len(), 300);
    }

    #[test]
    fn only_https_or_loopback_addresses_are_allowed() {
        assert!(GithubClient::new("https://api.github.com", None).is_ok());
        assert!(GithubClient::new("http://127.0.0.1:8080", None).is_ok());
        assert!(GithubClient::new("http://localhost:3000", None).is_ok());
        assert!(GithubClient::new("http://api.github.com", None).is_err());
        assert!(GithubClient::new("not a url", None).is_err());
    }

    #[test]
    fn loopback_detection_ignores_ports() {
        assert!(is_loopback_host("127.0.0.1:9000"));
        assert!(is_loopback_host("localhost"));
        assert!(!is_loopback_host("github.com"));
        assert!(!is_loopback_host("localhost.evil.com"));
    }
}
