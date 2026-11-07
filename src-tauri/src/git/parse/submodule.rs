use std::collections::HashMap;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SubmoduleState {
    Uninitialized,
    UpToDate,
    Modified,
    Conflict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Submodule {
    pub name: String,
    pub path: String,
    pub url: Option<String>,
    pub branch: Option<String>,
    pub commit: String,
    pub state: SubmoduleState,
    pub describe: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusLine {
    pub state: SubmoduleState,
    pub commit: String,
    pub path: String,
    pub describe: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ModuleConfig {
    pub name: String,
    pub path: Option<String>,
    pub url: Option<String>,
    pub branch: Option<String>,
}

pub fn parse_submodule_status(text: &str) -> Vec<StatusLine> {
    text.lines().filter_map(parse_status_line).collect()
}

fn parse_status_line(line: &str) -> Option<StatusLine> {
    let mut characters = line.chars();
    let marker = characters.next()?;
    let state = match marker {
        '-' => SubmoduleState::Uninitialized,
        '+' => SubmoduleState::Modified,
        'U' => SubmoduleState::Conflict,
        ' ' => SubmoduleState::UpToDate,
        _ => return None,
    };
    let rest = characters.as_str();
    let (commit, remainder) = rest.split_once(' ')?;
    if commit.is_empty()
        || !commit
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return None;
    }
    let remainder = remainder.trim_end();
    let (path, describe) = match remainder.rfind(" (") {
        Some(index) if remainder.ends_with(')') => (
            &remainder[..index],
            Some(remainder[index + 2..remainder.len() - 1].to_string()),
        ),
        _ => (remainder, None),
    };
    if path.is_empty() {
        return None;
    }
    Some(StatusLine {
        state,
        commit: commit.to_string(),
        path: path.to_string(),
        describe,
    })
}

pub fn parse_gitmodules(text: &str) -> Vec<ModuleConfig> {
    let mut order: Vec<String> = Vec::new();
    let mut configs: HashMap<String, ModuleConfig> = HashMap::new();

    for entry in text.split('\0') {
        if entry.is_empty() {
            continue;
        }
        let (key, value) = entry.split_once('\n').unwrap_or((entry, ""));
        let Some(rest) = key.strip_prefix("submodule.") else {
            continue;
        };
        let Some((name, property)) = rest.rsplit_once('.') else {
            continue;
        };
        if !configs.contains_key(name) {
            order.push(name.to_string());
            configs.insert(
                name.to_string(),
                ModuleConfig {
                    name: name.to_string(),
                    ..ModuleConfig::default()
                },
            );
        }
        if let Some(config) = configs.get_mut(name) {
            match property.to_lowercase().as_str() {
                "path" => config.path = Some(value.to_string()),
                "url" => config.url = Some(value.to_string()),
                "branch" => config.branch = Some(value.to_string()),
                _ => {}
            }
        }
    }

    order
        .into_iter()
        .filter_map(|name| configs.remove(&name))
        .collect()
}

pub fn merge_submodules(statuses: Vec<StatusLine>, configs: Vec<ModuleConfig>) -> Vec<Submodule> {
    statuses
        .into_iter()
        .map(|status| {
            let config = configs
                .iter()
                .find(|config| config.path.as_deref() == Some(status.path.as_str()));
            Submodule {
                name: config
                    .map(|config| config.name.clone())
                    .unwrap_or_else(|| status.path.clone()),
                path: status.path,
                url: config.and_then(|config| config.url.clone()),
                branch: config.and_then(|config| config.branch.clone()),
                commit: status.commit,
                state: status.state,
                describe: status.describe,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_status_marker() {
        let text = " 1111111111111111111111111111111111111111 libs/ok (heads/main)\n-2222222222222222222222222222222222222222 libs/new\n+3333333333333333333333333333333333333333 libs/moved (v1.2-3-gabc)\nU4444444444444444444444444444444444444444 libs/conflict\n";
        let lines = parse_submodule_status(text);
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0].state, SubmoduleState::UpToDate);
        assert_eq!(lines[0].path, "libs/ok");
        assert_eq!(lines[0].describe.as_deref(), Some("heads/main"));
        assert_eq!(lines[1].state, SubmoduleState::Uninitialized);
        assert_eq!(lines[1].describe, None);
        assert_eq!(lines[2].state, SubmoduleState::Modified);
        assert_eq!(lines[2].describe.as_deref(), Some("v1.2-3-gabc"));
        assert_eq!(lines[3].state, SubmoduleState::Conflict);
    }

    #[test]
    fn keeps_paths_with_spaces() {
        let text = " abcdef0 my libs/with space (heads/dev)\n-abcdef1 other dir/x\n";
        let lines = parse_submodule_status(text);
        assert_eq!(lines[0].path, "my libs/with space");
        assert_eq!(lines[0].describe.as_deref(), Some("heads/dev"));
        assert_eq!(lines[1].path, "other dir/x");
    }

    #[test]
    fn ignores_garbage_lines() {
        assert!(parse_submodule_status("fatal: something\n\nnot a line\n").is_empty());
    }

    #[test]
    fn parses_gitmodules_entries_in_order_with_dotted_names() {
        let text = "submodule.libs/a.path\nlibs/a\0submodule.libs/a.url\nhttps://example.com/a.git\0submodule.b.v2.path\nvendor/b\0submodule.b.v2.url\n../b.git\0submodule.b.v2.branch\ndevelop\0submodule.libs/a.update\nrebase\0";
        let configs = parse_gitmodules(text);
        assert_eq!(configs.len(), 2);
        assert_eq!(configs[0].name, "libs/a");
        assert_eq!(configs[0].path.as_deref(), Some("libs/a"));
        assert_eq!(configs[0].url.as_deref(), Some("https://example.com/a.git"));
        assert_eq!(configs[1].name, "b.v2");
        assert_eq!(configs[1].branch.as_deref(), Some("develop"));
    }

    #[test]
    fn merges_status_with_configuration_by_path() {
        let statuses =
            parse_submodule_status(" abc123 vendor/b (heads/main)\n-def456 unknown/path\n");
        let configs = parse_gitmodules("submodule.b.path\nvendor/b\0submodule.b.url\n../b.git\0");
        let merged = merge_submodules(statuses, configs);
        assert_eq!(merged[0].name, "b");
        assert_eq!(merged[0].url.as_deref(), Some("../b.git"));
        assert_eq!(merged[1].name, "unknown/path");
        assert_eq!(merged[1].url, None);
    }
}
