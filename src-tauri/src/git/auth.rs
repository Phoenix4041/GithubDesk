use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, RwLock};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

#[derive(Clone, PartialEq, Eq)]
pub struct GitAuth {
    pub web_base: String,
    pub token: String,
}

impl std::fmt::Debug for GitAuth {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("GitAuth")
            .field("web_base", &self.web_base)
            .field("token", &"[redacted]")
            .finish()
    }
}

static REPO_AUTH: LazyLock<RwLock<HashMap<String, GitAuth>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

fn key_for(repo: &Path) -> String {
    repo.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

pub fn set_repo_auth(repo: &Path, auth: Option<GitAuth>) {
    let mut map = REPO_AUTH
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match auth {
        Some(value) => {
            map.insert(key_for(repo), value);
        }
        None => {
            map.remove(&key_for(repo));
        }
    }
}

pub fn extra_header_key(web_base: &str) -> String {
    format!("http.{}/.extraheader", web_base.trim_end_matches('/'))
}

pub fn auth_environment(repo: &Path) -> Vec<(String, String)> {
    let map = REPO_AUTH
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(auth) = map.get(&key_for(repo)) else {
        return Vec::new();
    };
    let credentials = STANDARD.encode(format!("x-access-token:{}", auth.token));
    vec![
        ("GIT_CONFIG_COUNT".to_string(), "2".to_string()),
        (
            "GIT_CONFIG_KEY_0".to_string(),
            "credential.helper".to_string(),
        ),
        ("GIT_CONFIG_VALUE_0".to_string(), String::new()),
        (
            "GIT_CONFIG_KEY_1".to_string(),
            extra_header_key(&auth.web_base),
        ),
        (
            "GIT_CONFIG_VALUE_1".to_string(),
            format!("AUTHORIZATION: basic {credentials}"),
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn auth(token: &str) -> GitAuth {
        GitAuth {
            web_base: "https://github.com".to_string(),
            token: token.to_string(),
        }
    }

    #[test]
    fn the_token_never_appears_when_the_value_is_printed_for_debugging() {
        let printed = format!("{:?}", auth("tok123-secret"));
        assert!(!printed.contains("tok123"));
        assert!(printed.contains("https://github.com"));
    }

    #[test]
    fn no_environment_without_a_registered_account() {
        assert!(auth_environment(Path::new("C:/unregistered/repo")).is_empty());
    }

    #[test]
    fn registered_repositories_get_a_scoped_basic_header() {
        let repo = PathBuf::from("C:/Phoenix/auth-test-one");
        set_repo_auth(&repo, Some(auth("tok123")));
        let environment = auth_environment(&repo);
        set_repo_auth(&repo, None);

        let lookup = |name: &str| {
            environment
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
        };
        assert_eq!(lookup("GIT_CONFIG_COUNT").as_deref(), Some("2"));
        assert_eq!(
            lookup("GIT_CONFIG_KEY_1").as_deref(),
            Some("http.https://github.com/.extraheader")
        );
        let header = lookup("GIT_CONFIG_VALUE_1").expect("header");
        let encoded = header
            .strip_prefix("AUTHORIZATION: basic ")
            .expect("prefix");
        let decoded = String::from_utf8(STANDARD.decode(encoded).expect("base64")).expect("utf8");
        assert_eq!(decoded, "x-access-token:tok123");
        assert_eq!(lookup("GIT_CONFIG_VALUE_0").as_deref(), Some(""));
    }

    #[test]
    fn path_style_differences_map_to_the_same_repository() {
        set_repo_auth(Path::new("C:\\Phoenix\\Auth-Test-Two\\"), Some(auth("x")));
        let found = !auth_environment(Path::new("c:/phoenix/auth-test-two")).is_empty();
        set_repo_auth(Path::new("c:/phoenix/auth-test-two"), None);
        assert!(found);
        assert!(auth_environment(Path::new("C:/Phoenix/Auth-Test-Two")).is_empty());
    }

    #[test]
    fn clearing_removes_the_registration() {
        let repo = PathBuf::from("C:/Phoenix/auth-test-three");
        set_repo_auth(&repo, Some(auth("x")));
        set_repo_auth(&repo, None);
        assert!(auth_environment(&repo).is_empty());
    }
}
