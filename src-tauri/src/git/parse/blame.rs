use std::collections::HashMap;

use serde::Serialize;

pub const MAX_BLAME_LINES: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub author_time: i64,
    pub summary: String,
    pub uncommitted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub commit_index: u32,
    pub original_line: u32,
    pub content: String,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ParsedBlame {
    pub commits: Vec<BlameCommit>,
    pub lines: Vec<BlameLine>,
    pub truncated: bool,
}

struct Pending {
    hash: String,
    original_line: u32,
    author: String,
    author_time: i64,
    summary: String,
}

fn is_object_name(token: &str) -> bool {
    (token.len() == 40 || token.len() == 64)
        && token.chars().all(|character| character.is_ascii_hexdigit())
}

fn parse_header(line: &str) -> Option<Pending> {
    let mut parts = line.split(' ');
    let hash = parts.next()?;
    if !is_object_name(hash) {
        return None;
    }
    let original_line = parts.next()?.parse().ok()?;
    Some(Pending {
        hash: hash.to_string(),
        original_line,
        author: String::new(),
        author_time: 0,
        summary: String::new(),
    })
}

pub fn parse_blame(text: &str) -> ParsedBlame {
    let mut parsed = ParsedBlame::default();
    let mut index_by_hash: HashMap<String, u32> = HashMap::new();
    let mut pending: Option<Pending> = None;

    for line in text.split('\n') {
        if let Some(content) = line.strip_prefix('\t') {
            let Some(current) = pending.take() else {
                continue;
            };
            if parsed.lines.len() >= MAX_BLAME_LINES {
                parsed.truncated = true;
                break;
            }
            let commit_index = match index_by_hash.get(&current.hash) {
                Some(index) => *index,
                None => {
                    let index = u32::try_from(parsed.commits.len()).unwrap_or(u32::MAX);
                    let uncommitted = current.hash.chars().all(|character| character == '0');
                    parsed.commits.push(BlameCommit {
                        short_hash: current.hash.chars().take(7).collect(),
                        hash: current.hash.clone(),
                        author: current.author,
                        author_time: current.author_time,
                        summary: current.summary,
                        uncommitted,
                    });
                    index_by_hash.insert(current.hash, index);
                    index
                }
            };
            parsed.lines.push(BlameLine {
                commit_index,
                original_line: current.original_line,
                content: content.trim_end_matches('\r').to_string(),
            });
            continue;
        }

        match pending.as_mut() {
            None => {
                pending = parse_header(line);
            }
            Some(current) => {
                if let Some(author) = line.strip_prefix("author ") {
                    current.author = author.to_string();
                } else if let Some(time) = line.strip_prefix("author-time ") {
                    current.author_time = time.trim().parse().unwrap_or(0);
                } else if let Some(summary) = line.strip_prefix("summary ") {
                    current.summary = summary.to_string();
                }
            }
        }
    }
    parsed
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIRST: &str = "1111111111111111111111111111111111111111";
    const SECOND: &str = "2222222222222222222222222222222222222222";
    const UNCOMMITTED: &str = "0000000000000000000000000000000000000000";

    fn record(
        hash: &str,
        original: u32,
        fin: u32,
        author: &str,
        time: i64,
        summary: &str,
        content: &str,
    ) -> String {
        format!(
            "{hash} {original} {fin} 1\nauthor {author}\nauthor-mail <a@example.com>\nauthor-time {time}\nauthor-tz +0000\ncommitter {author}\ncommitter-time {time}\nsummary {summary}\nfilename f.txt\n\t{content}\n"
        )
    }

    #[test]
    fn groups_lines_by_commit_and_keeps_their_metadata() {
        let text = format!(
            "{}{}{}",
            record(FIRST, 1, 1, "Ada", 100, "first change", "alpha"),
            record(SECOND, 1, 2, "Grace", 200, "second change", "beta"),
            record(FIRST, 3, 3, "Ada", 100, "first change", "gamma"),
        );
        let parsed = parse_blame(&text);
        assert_eq!(parsed.commits.len(), 2);
        assert_eq!(parsed.commits[0].author, "Ada");
        assert_eq!(parsed.commits[0].short_hash, "1111111");
        assert_eq!(parsed.commits[1].summary, "second change");
        assert_eq!(
            parsed
                .lines
                .iter()
                .map(|line| line.commit_index)
                .collect::<Vec<_>>(),
            vec![0, 1, 0]
        );
        assert_eq!(parsed.lines[2].original_line, 3);
        assert_eq!(parsed.lines[1].content, "beta");
        assert!(!parsed.truncated);
    }

    #[test]
    fn marks_lines_that_are_not_committed_yet() {
        let text = record(
            UNCOMMITTED,
            1,
            1,
            "Not Committed Yet",
            300,
            "Version of f.txt from f.txt",
            "draft",
        );
        let parsed = parse_blame(&text);
        assert!(parsed.commits[0].uncommitted);
    }

    #[test]
    fn keeps_empty_lines_and_strips_carriage_returns() {
        let text = format!(
            "{}{}",
            record(FIRST, 1, 1, "Ada", 1, "s", ""),
            record(FIRST, 2, 2, "Ada", 1, "s", "windows line\r"),
        );
        let parsed = parse_blame(&text);
        assert_eq!(parsed.lines[0].content, "");
        assert_eq!(parsed.lines[1].content, "windows line");
    }

    #[test]
    fn ignores_boundary_markers_and_other_metadata() {
        let text = format!(
            "{FIRST} 1 1 1\nauthor Ada\nauthor-time 5\nsummary root\nboundary\nfilename f.txt\n\tonly line\n"
        );
        let parsed = parse_blame(&text);
        assert_eq!(parsed.lines.len(), 1);
        assert_eq!(parsed.commits[0].summary, "root");
    }

    #[test]
    fn handles_a_tab_inside_the_content() {
        let text = record(FIRST, 1, 1, "Ada", 1, "s", "a\tb");
        assert_eq!(parse_blame(&text).lines[0].content, "a\tb");
    }

    #[test]
    fn returns_nothing_for_empty_input() {
        let parsed = parse_blame("");
        assert!(parsed.lines.is_empty());
        assert!(parsed.commits.is_empty());
    }
}
