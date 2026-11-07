use crate::error::{AppError, AppResult};
use crate::github::client::is_loopback_host;

pub const DEFAULT_HOST: &str = "github.com";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoints {
    pub host: String,
    pub api_base: String,
    pub web_base: String,
}

pub fn normalize_host(raw: &str) -> AppResult<String> {
    let host = raw.trim().to_lowercase();
    let valid = !host.is_empty()
        && host.len() <= 253
        && !host.starts_with('.')
        && !host.starts_with('-')
        && host.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | ':')
        });
    if valid {
        Ok(host)
    } else {
        Err(AppError::invalid_input(format!(
            "invalid GitHub host: {raw}"
        )))
    }
}

impl Endpoints {
    pub fn for_host(raw: &str) -> AppResult<Self> {
        let host = normalize_host(raw)?;
        if host == DEFAULT_HOST {
            return Ok(Self {
                host,
                api_base: "https://api.github.com".to_string(),
                web_base: "https://github.com".to_string(),
            });
        }
        if is_loopback_host(&host) {
            let base = format!("http://{host}");
            return Ok(Self {
                host,
                api_base: base.clone(),
                web_base: base,
            });
        }
        Ok(Self {
            api_base: format!("https://{host}/api/v3"),
            web_base: format!("https://{host}"),
            host,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_dot_com_uses_the_public_endpoints() {
        let endpoints = Endpoints::for_host("GitHub.com").expect("endpoints");
        assert_eq!(endpoints.api_base, "https://api.github.com");
        assert_eq!(endpoints.web_base, "https://github.com");
        assert_eq!(endpoints.host, "github.com");
    }

    #[test]
    fn enterprise_hosts_use_the_api_v3_path() {
        let endpoints = Endpoints::for_host("git.company.example").expect("endpoints");
        assert_eq!(endpoints.api_base, "https://git.company.example/api/v3");
        assert_eq!(endpoints.web_base, "https://git.company.example");
    }

    #[test]
    fn loopback_hosts_use_plain_http_for_local_servers() {
        let endpoints = Endpoints::for_host("127.0.0.1:8080").expect("endpoints");
        assert_eq!(endpoints.api_base, "http://127.0.0.1:8080");
    }

    #[test]
    fn rejects_hosts_with_schemes_paths_or_spaces() {
        for bad in [
            "",
            "https://github.com",
            "github.com/path",
            "git hub.com",
            "-x.com",
            ".x.com",
            "a@b.com",
        ] {
            assert!(
                Endpoints::for_host(bad).is_err(),
                "{bad} should be rejected"
            );
        }
    }
}
