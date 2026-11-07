use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::git::parse::log::LOG_FORMAT;
use crate::git::validate::{ensure_relative_path, ensure_revision};

pub const MAX_PAGE_SIZE: u32 = 500;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HistoryScope {
    #[default]
    Current,
    All,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContentMode {
    #[default]
    Text,
    Regex,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HistoryQuery {
    pub revision: Option<String>,
    pub scope: HistoryScope,
    pub text: Option<String>,
    pub author: Option<String>,
    pub content: Option<String>,
    pub content_mode: ContentMode,
    pub path: Option<String>,
    pub follow: bool,
    pub since: Option<String>,
    pub until: Option<String>,
    pub topo_order: bool,
}

fn clean(value: &Option<String>) -> AppResult<Option<&str>> {
    let Some(text) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    if text.contains('\0') {
        return Err(AppError::invalid_input("search text contains a null byte"));
    }
    Ok(Some(text))
}

fn is_plain_date(value: &str) -> bool {
    let parts: Vec<&str> = value.split('-').collect();
    parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts
            .iter()
            .all(|part| part.chars().all(|character| character.is_ascii_digit()))
}

impl HistoryQuery {
    pub fn has_content_search(&self) -> bool {
        self.content
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    }
}

pub fn build_log_arguments(query: &HistoryQuery, skip: u32, limit: u32) -> AppResult<Vec<String>> {
    let mut args: Vec<String> = vec![
        "log".into(),
        "-z".into(),
        "--decorate=full".into(),
        LOG_FORMAT.into(),
        format!("--max-count={}", limit.clamp(1, MAX_PAGE_SIZE)),
        format!("--skip={skip}"),
    ];
    if query.topo_order {
        args.push("--topo-order".into());
    }

    let text = clean(&query.text)?;
    let author = clean(&query.author)?;
    if text.is_some() || author.is_some() {
        args.push("--regexp-ignore-case".into());
        args.push("--fixed-strings".into());
    }
    if let Some(text) = text {
        args.push(format!("--grep={text}"));
    }
    if let Some(author) = author {
        args.push(format!("--author={author}"));
    }
    if let Some(content) = clean(&query.content)? {
        match query.content_mode {
            ContentMode::Text => args.push(format!("-S{content}")),
            ContentMode::Regex => args.push(format!("-G{content}")),
        }
    }
    if let Some(since) = clean(&query.since)? {
        args.push(format!("--since={since}"));
    }
    if let Some(until) = clean(&query.until)? {
        if is_plain_date(until) {
            args.push(format!("--until={until} 23:59:59"));
        } else {
            args.push(format!("--until={until}"));
        }
    }

    let path = clean(&query.path)?;
    if let Some(path) = path {
        ensure_relative_path(path)?;
        if query.follow {
            args.push("--follow".into());
        }
    }

    match query.scope {
        HistoryScope::All => {
            args.extend(["--branches", "--remotes", "--tags", "HEAD"].map(String::from));
        }
        HistoryScope::Current => {
            let revision = query
                .revision
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("HEAD");
            ensure_revision(revision)?;
            args.push(revision.to_string());
        }
    }

    args.push("--".into());
    if let Some(path) = path {
        args.push(path.to_string());
    }
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(query: &HistoryQuery) -> Vec<String> {
        build_log_arguments(query, 0, 50).expect("arguments")
    }

    #[test]
    fn default_query_walks_head_without_filters() {
        let args = build(&HistoryQuery::default());
        assert_eq!(args[0], "log");
        assert!(args.contains(&"--max-count=50".to_string()));
        assert!(args.contains(&"--skip=0".to_string()));
        assert_eq!(args[args.len() - 2], "HEAD");
        assert_eq!(args[args.len() - 1], "--");
        assert!(!args.iter().any(|arg| arg.starts_with("--grep")));
    }

    #[test]
    fn page_size_is_clamped() {
        let args = build_log_arguments(&HistoryQuery::default(), 10, 100_000).expect("args");
        assert!(args.contains(&format!("--max-count={MAX_PAGE_SIZE}")));
        assert!(args.contains(&"--skip=10".to_string()));
    }

    #[test]
    fn text_and_author_are_case_insensitive_fixed_strings() {
        let query = HistoryQuery {
            text: Some(" fix bug ".into()),
            author: Some("Ada".into()),
            ..HistoryQuery::default()
        };
        let args = build(&query);
        assert!(args.contains(&"--grep=fix bug".to_string()));
        assert!(args.contains(&"--author=Ada".to_string()));
        assert!(args.contains(&"--fixed-strings".to_string()));
        assert!(args.contains(&"--regexp-ignore-case".to_string()));
    }

    #[test]
    fn option_like_text_stays_attached_to_its_flag() {
        let query = HistoryQuery {
            text: Some("--output=evil".into()),
            content: Some("--upload-pack=evil".into()),
            ..HistoryQuery::default()
        };
        let args = build(&query);
        assert!(args.contains(&"--grep=--output=evil".to_string()));
        assert!(args.contains(&"-S--upload-pack=evil".to_string()));
        assert!(!args.contains(&"--output=evil".to_string()));
    }

    #[test]
    fn content_search_chooses_pickaxe_or_regex() {
        let text = HistoryQuery {
            content: Some("needle".into()),
            ..HistoryQuery::default()
        };
        assert!(build(&text).contains(&"-Sneedle".to_string()));
        assert!(text.has_content_search());

        let regex = HistoryQuery {
            content: Some("ne+dle".into()),
            content_mode: ContentMode::Regex,
            ..HistoryQuery::default()
        };
        assert!(build(&regex).contains(&"-Gne+dle".to_string()));
    }

    #[test]
    fn plain_until_dates_include_the_whole_day() {
        let query = HistoryQuery {
            since: Some("2026-01-01".into()),
            until: Some("2026-01-31".into()),
            ..HistoryQuery::default()
        };
        let args = build(&query);
        assert!(args.contains(&"--since=2026-01-01".to_string()));
        assert!(args.contains(&"--until=2026-01-31 23:59:59".to_string()));
    }

    #[test]
    fn path_filter_follows_renames_only_when_asked() {
        let plain = HistoryQuery {
            path: Some("src/main.rs".into()),
            ..HistoryQuery::default()
        };
        let args = build(&plain);
        assert_eq!(args.last().map(String::as_str), Some("src/main.rs"));
        assert!(!args.contains(&"--follow".to_string()));

        let follow = HistoryQuery {
            follow: true,
            ..plain
        };
        assert!(build(&follow).contains(&"--follow".to_string()));
    }

    #[test]
    fn follow_without_a_path_is_ignored() {
        let query = HistoryQuery {
            follow: true,
            ..HistoryQuery::default()
        };
        assert!(!build(&query).contains(&"--follow".to_string()));
    }

    #[test]
    fn all_scope_lists_every_branch_remote_and_tag() {
        let query = HistoryQuery {
            scope: HistoryScope::All,
            topo_order: true,
            ..HistoryQuery::default()
        };
        let args = build(&query);
        assert!(args.contains(&"--topo-order".to_string()));
        assert!(args.contains(&"--branches".to_string()));
        assert!(args.contains(&"--remotes".to_string()));
        assert!(args.contains(&"--tags".to_string()));
    }

    #[test]
    fn rejects_unsafe_input() {
        let revision = HistoryQuery {
            revision: Some("--upload-pack=evil".into()),
            ..HistoryQuery::default()
        };
        assert!(build_log_arguments(&revision, 0, 10).is_err());

        let path = HistoryQuery {
            path: Some("../outside".into()),
            ..HistoryQuery::default()
        };
        assert!(build_log_arguments(&path, 0, 10).is_err());

        let nul = HistoryQuery {
            text: Some("a\0b".into()),
            ..HistoryQuery::default()
        };
        assert!(build_log_arguments(&nul, 0, 10).is_err());
    }
}
