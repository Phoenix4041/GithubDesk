use serde::Serialize;

pub const STASH_FORMAT: &str = "--format=%H%x1f%ct%x1f%gs";
const FIELD_SEPARATOR: char = '\u{1f}';

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    pub index: u32,
    pub hash: String,
    pub branch: Option<String>,
    pub message: String,
    pub time: i64,
}

fn strip_leading_hash(text: &str) -> &str {
    match text.split_once(' ') {
        Some((first, rest))
            if first.len() >= 7 && first.chars().all(|character| character.is_ascii_hexdigit()) =>
        {
            rest
        }
        _ => text,
    }
}

fn parse_subject(subject: &str) -> (Option<String>, String) {
    if let Some(rest) = subject.strip_prefix("WIP on ") {
        if let Some((branch, tail)) = rest.split_once(": ") {
            return (
                Some(branch.to_string()),
                format!("WIP: {}", strip_leading_hash(tail)),
            );
        }
    }
    if let Some(rest) = subject.strip_prefix("On ") {
        if let Some((branch, message)) = rest.split_once(": ") {
            return (Some(branch.to_string()), message.to_string());
        }
    }
    (None, subject.to_string())
}

pub fn parse_stashes(text: &str) -> Vec<Stash> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .enumerate()
        .filter_map(|(position, line)| {
            let mut fields = line.splitn(3, FIELD_SEPARATOR);
            let hash = fields.next()?.trim();
            let time = fields.next()?.trim().parse().unwrap_or(0);
            let subject = fields.next()?.trim();
            if hash.is_empty() {
                return None;
            }
            let (branch, message) = parse_subject(subject);
            Some(Stash {
                index: u32::try_from(position).ok()?,
                hash: hash.to_string(),
                branch,
                message,
                time,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(hash: &str, time: &str, subject: &str) -> String {
        format!("{hash}\u{1f}{time}\u{1f}{subject}")
    }

    #[test]
    fn parses_stashes_with_a_custom_message() {
        let text = line("aaaa111", "1700000000", "On feature/x: save before lunch");
        let stashes = parse_stashes(&text);
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].index, 0);
        assert_eq!(stashes[0].branch.as_deref(), Some("feature/x"));
        assert_eq!(stashes[0].message, "save before lunch");
        assert_eq!(stashes[0].time, 1_700_000_000);
    }

    #[test]
    fn parses_default_wip_messages_without_the_hash() {
        let text = line("bbbb222", "5", "WIP on main: 1a2b3c4 Fix the parser");
        let stashes = parse_stashes(&text);
        assert_eq!(stashes[0].branch.as_deref(), Some("main"));
        assert_eq!(stashes[0].message, "WIP: Fix the parser");
    }

    #[test]
    fn numbers_entries_in_listing_order() {
        let text = format!(
            "{}\n{}\n",
            line("c1", "3", "On main: newest"),
            line("c2", "2", "On main: older")
        );
        let stashes = parse_stashes(&text);
        assert_eq!(
            stashes.iter().map(|stash| stash.index).collect::<Vec<_>>(),
            vec![0, 1]
        );
        assert_eq!(stashes[1].message, "older");
    }

    #[test]
    fn keeps_unknown_subjects_as_the_message() {
        let text = line("d1", "1", "custom reflog text");
        let stashes = parse_stashes(&text);
        assert_eq!(stashes[0].branch, None);
        assert_eq!(stashes[0].message, "custom reflog text");
    }

    #[test]
    fn ignores_blank_lines() {
        assert!(parse_stashes("\n\n").is_empty());
    }
}
