use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRepo {
    pub remote_name: String,
    pub url: String,
    pub host: String,
    pub owner: String,
    pub name: String,
}

fn strip_suffixes(path: &str) -> &str {
    let trimmed = path.trim_matches('/');
    trimmed.strip_suffix(".git").unwrap_or(trimmed)
}

fn split_owner_and_name(path: &str) -> Option<(String, String)> {
    let clean = strip_suffixes(path);
    let mut parts = clean.split('/').filter(|part| !part.is_empty());
    let owner = parts.next()?;
    let name = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    let valid = |part: &str| {
        part.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    };
    if valid(owner) && valid(name) && name != "." && name != ".." {
        Some((owner.to_string(), name.to_string()))
    } else {
        None
    }
}

fn normalize_host(host: &str) -> String {
    let lowered = host.to_lowercase();
    let without_port = match lowered.rsplit_once(':') {
        Some((name, port)) if port.chars().all(|character| character.is_ascii_digit()) => name,
        _ => lowered.as_str(),
    };
    match without_port {
        "ssh.github.com" | "www.github.com" => "github.com".to_string(),
        other => other.to_string(),
    }
}

pub fn parse_remote_url(url: &str) -> Option<(String, String, String)> {
    let trimmed = url.trim();
    if let Some((_, rest)) = trimmed.split_once("://") {
        let (authority, path) = rest.split_once('/')?;
        let host = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host);
        let (owner, name) = split_owner_and_name(path)?;
        return Some((normalize_host(host), owner, name));
    }
    let (authority, path) = trimmed.split_once(':')?;
    let drive_letter = authority.len() == 1
        && authority
            .chars()
            .all(|character| character.is_ascii_alphabetic());
    if drive_letter || authority.contains('/') || path.starts_with("//") {
        return None;
    }
    let host = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    let (owner, name) = split_owner_and_name(path)?;
    Some((normalize_host(host), owner, name))
}

pub fn to_remote_repo(remote_name: &str, url: &str) -> Option<RemoteRepo> {
    let (host, owner, name) = parse_remote_url(url)?;
    Some(RemoteRepo {
        remote_name: remote_name.to_string(),
        url: url.to_string(),
        host,
        owner,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(url: &str) -> Option<(String, String, String)> {
        parse_remote_url(url)
    }

    fn triple(host: &str, owner: &str, name: &str) -> Option<(String, String, String)> {
        Some((host.to_string(), owner.to_string(), name.to_string()))
    }

    #[test]
    fn parses_https_remotes() {
        assert_eq!(
            parsed("https://github.com/octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("https://github.com/octo/hello"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("https://github.com/octo/hello/"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("https://user@github.com/octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("https://ghp_token:x-oauth-basic@github.com/octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
    }

    #[test]
    fn parses_ssh_and_git_remotes() {
        assert_eq!(
            parsed("git@github.com:octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("ssh://git@github.com/octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("ssh://git@ssh.github.com:443/octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
        assert_eq!(
            parsed("git://github.com/octo/hello.git"),
            triple("github.com", "octo", "hello")
        );
    }

    #[test]
    fn keeps_enterprise_hosts_and_lowercases_them() {
        assert_eq!(
            parsed("https://Git.Company.Example/team/app.git"),
            triple("git.company.example", "team", "app")
        );
        assert_eq!(
            parsed("git@git.company.example:team/app.git"),
            triple("git.company.example", "team", "app")
        );
    }

    #[test]
    fn keeps_dots_and_dashes_in_names() {
        assert_eq!(
            parsed("https://github.com/my-org/my.repo-name.git"),
            triple("github.com", "my-org", "my.repo-name")
        );
    }

    #[test]
    fn rejects_local_and_malformed_remotes() {
        assert_eq!(parsed("C:\\Phoenix\\repo"), None);
        assert_eq!(parsed("C:/backups/hello.git"), None);
        assert_eq!(parsed("d:/work/team/repo.git"), None);
        assert_eq!(parsed("/home/user/repo.git"), None);
        assert_eq!(parsed("../relative/path"), None);
        assert_eq!(parsed("https://github.com/only-owner"), None);
        assert_eq!(parsed("https://github.com/a/b/c"), None);
        assert_eq!(parsed("https://github.com/a b/c"), None);
        assert_eq!(parsed("file:///C:/repo"), None);
        assert_eq!(parsed(""), None);
    }

    #[test]
    fn builds_a_remote_repo_with_its_names() {
        let repo = to_remote_repo("origin", "git@github.com:octo/hello.git").expect("repo");
        assert_eq!(repo.remote_name, "origin");
        assert_eq!(repo.owner, "octo");
        assert_eq!(repo.name, "hello");
        assert_eq!(repo.host, "github.com");
    }
}
