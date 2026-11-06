use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub url: String,
}

pub fn parse_remotes(bytes: &[u8]) -> Vec<Remote> {
    let text = String::from_utf8_lossy(bytes);
    let mut remotes: Vec<Remote> = Vec::new();

    for entry in text.split('\0').filter(|entry| !entry.is_empty()) {
        let Some((key, value)) = entry.split_once('\n') else {
            continue;
        };
        let Some(name) = key
            .strip_prefix("remote.")
            .and_then(|rest| rest.strip_suffix(".url"))
        else {
            continue;
        };
        if remotes.iter().any(|remote| remote.name == name) {
            continue;
        }
        remotes.push(Remote {
            name: name.to_string(),
            url: value.to_string(),
        });
    }

    remotes
}

pub fn preferred_remote(remotes: &[Remote]) -> Option<&Remote> {
    remotes
        .iter()
        .find(|remote| remote.name == "origin")
        .or_else(|| remotes.first())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_config_entries_with_dotted_names() {
        let bytes = b"remote.origin.url\nhttps://example.com/a.git\0remote.my.fork.url\ngit@example.com:b/c.git\0";
        let remotes = parse_remotes(bytes);
        assert_eq!(remotes.len(), 2);
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[1].name, "my.fork");
        assert_eq!(remotes[1].url, "git@example.com:b/c.git");
    }

    #[test]
    fn prefers_origin_then_first() {
        let remotes = vec![
            Remote {
                name: "fork".into(),
                url: "a".into(),
            },
            Remote {
                name: "origin".into(),
                url: "b".into(),
            },
        ];
        assert_eq!(
            preferred_remote(&remotes).map(|r| r.name.as_str()),
            Some("origin")
        );
        assert_eq!(
            preferred_remote(&remotes[..1]).map(|r| r.name.as_str()),
            Some("fork")
        );
        assert!(preferred_remote(&[]).is_none());
    }
}
