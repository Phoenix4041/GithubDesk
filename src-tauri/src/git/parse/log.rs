use serde::Serialize;

use crate::git::parse::status::ChangeKind;

pub const LOG_FORMAT: &str = "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s";
pub const DETAIL_FORMAT: &str =
    "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s%x1f%cn%x1f%ct%x1f%b";
const FIELD_SEPARATOR: char = '\u{1f}';

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    Head,
    LocalBranch,
    RemoteBranch,
    Tag,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub refs: Vec<RefLabel>,
    pub subject: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub summary: CommitSummary,
    pub body: String,
    pub committer_name: String,
    pub committer_time: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: ChangeKind,
}

pub fn parse_decorations(raw: &str) -> Vec<RefLabel> {
    let mut labels = Vec::new();
    for item in raw
        .split(", ")
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        if let Some(target) = item.strip_prefix("HEAD -> ") {
            labels.push(RefLabel {
                name: "HEAD".to_string(),
                kind: RefKind::Head,
            });
            if let Some(branch) = target.strip_prefix("refs/heads/") {
                labels.push(RefLabel {
                    name: branch.to_string(),
                    kind: RefKind::LocalBranch,
                });
            }
        } else if item == "HEAD" {
            labels.push(RefLabel {
                name: "HEAD".to_string(),
                kind: RefKind::Head,
            });
        } else if let Some(tag) = item.strip_prefix("tag: ") {
            let name = tag.strip_prefix("refs/tags/").unwrap_or(tag);
            labels.push(RefLabel {
                name: name.to_string(),
                kind: RefKind::Tag,
            });
        } else if let Some(branch) = item.strip_prefix("refs/heads/") {
            labels.push(RefLabel {
                name: branch.to_string(),
                kind: RefKind::LocalBranch,
            });
        } else if let Some(branch) = item.strip_prefix("refs/remotes/") {
            if !branch.ends_with("/HEAD") {
                labels.push(RefLabel {
                    name: branch.to_string(),
                    kind: RefKind::RemoteBranch,
                });
            }
        }
    }
    labels
}

fn short(hash: &str) -> String {
    hash.chars().take(7).collect()
}

fn summary_from_fields(fields: &[&str]) -> Option<CommitSummary> {
    if fields.len() < 7 {
        return None;
    }
    let hash = fields[0].trim();
    if hash.is_empty() {
        return None;
    }
    Some(CommitSummary {
        hash: hash.to_string(),
        short_hash: short(hash),
        parents: fields[1].split_whitespace().map(str::to_string).collect(),
        author_name: fields[2].to_string(),
        author_email: fields[3].to_string(),
        author_time: fields[4].parse().unwrap_or(0),
        refs: parse_decorations(fields[5]),
        subject: fields[6].to_string(),
    })
}

pub fn parse_log(bytes: &[u8]) -> Vec<CommitSummary> {
    String::from_utf8_lossy(bytes)
        .split('\0')
        .filter_map(|record| {
            let record = record.trim_start_matches('\n');
            if record.is_empty() {
                return None;
            }
            let fields: Vec<&str> = record.split(FIELD_SEPARATOR).collect();
            summary_from_fields(&fields)
        })
        .collect()
}

pub fn parse_commit_detail(text: &str) -> Option<CommitDetail> {
    let fields: Vec<&str> = text.splitn(10, FIELD_SEPARATOR).collect();
    if fields.len() < 10 {
        return None;
    }
    let summary = summary_from_fields(&fields)?;
    Some(CommitDetail {
        summary,
        committer_name: fields[7].to_string(),
        committer_time: fields[8].parse().unwrap_or(0),
        body: fields[9].trim().to_string(),
    })
}

fn status_from_letter(letter: char) -> ChangeKind {
    match letter {
        'A' => ChangeKind::Added,
        'D' => ChangeKind::Deleted,
        'R' => ChangeKind::Renamed,
        'C' => ChangeKind::Copied,
        'T' => ChangeKind::TypeChanged,
        'U' => ChangeKind::Unmerged,
        _ => ChangeKind::Modified,
    }
}

pub fn parse_name_status(bytes: &[u8]) -> Vec<CommitFile> {
    let text = String::from_utf8_lossy(bytes);
    let mut tokens = text.split('\0').filter(|token| !token.is_empty());
    let mut files = Vec::new();

    while let Some(status) = tokens.next() {
        let Some(letter) = status.chars().next() else {
            continue;
        };
        let kind = status_from_letter(letter);
        if matches!(kind, ChangeKind::Renamed | ChangeKind::Copied) {
            let (Some(old_path), Some(path)) = (tokens.next(), tokens.next()) else {
                break;
            };
            files.push(CommitFile {
                path: path.to_string(),
                old_path: Some(old_path.to_string()),
                status: kind,
            });
        } else {
            let Some(path) = tokens.next() else {
                break;
            };
            files.push(CommitFile {
                path: path.to_string(),
                old_path: None,
                status: kind,
            });
        }
    }

    files
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(fields: &[&str]) -> String {
        format!("{}\0", fields.join("\u{1f}"))
    }

    #[test]
    fn parses_log_records_with_decorations() {
        let first = record(&[
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc",
            "Ana",
            "ana@example.com",
            "1700000000",
            "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0",
            "Merge feature",
        ]);
        let second = record(&[
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "",
            "Luis",
            "luis@example.com",
            "1690000000",
            "",
            "Initial commit",
        ]);
        let commits = parse_log(format!("{first}\n{second}").as_bytes());
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].short_hash, "aaaaaaa");
        assert_eq!(commits[0].parents.len(), 2);
        assert_eq!(commits[0].author_time, 1_700_000_000);
        assert_eq!(commits[0].refs.len(), 4);
        assert_eq!(commits[0].refs[1].kind, RefKind::LocalBranch);
        assert_eq!(commits[0].refs[2].name, "origin/main");
        assert_eq!(commits[0].refs[3].kind, RefKind::Tag);
        assert!(commits[1].parents.is_empty());
        assert_eq!(commits[1].subject, "Initial commit");
    }

    #[test]
    fn skips_malformed_records() {
        let commits = parse_log(b"garbage\0\0");
        assert!(commits.is_empty());
    }

    #[test]
    fn parses_decorations_without_remote_head() {
        let labels =
            parse_decorations("HEAD, refs/remotes/origin/HEAD, refs/heads/feature/x, refs/stash");
        let names: Vec<&str> = labels.iter().map(|label| label.name.as_str()).collect();
        assert_eq!(names, vec!["HEAD", "feature/x"]);
    }

    #[test]
    fn parses_commit_detail_with_multiline_body() {
        let text = [
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "",
            "Ana",
            "ana@example.com",
            "1700000000",
            "",
            "Subject",
            "Committer",
            "1700000100",
            "Line one\n\nLine three\n",
        ]
        .join("\u{1f}");
        let detail = parse_commit_detail(&text).expect("detail");
        assert_eq!(detail.committer_name, "Committer");
        assert_eq!(detail.committer_time, 1_700_000_100);
        assert_eq!(detail.body, "Line one\n\nLine three");
        assert_eq!(detail.summary.subject, "Subject");
    }

    #[test]
    fn parses_name_status_with_renames() {
        let bytes = b"M\0src/a.rs\0A\0new.txt\0R100\0old name.txt\0new name.txt\0D\0gone.txt\0";
        let files = parse_name_status(bytes);
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].status, ChangeKind::Modified);
        assert_eq!(files[1].status, ChangeKind::Added);
        assert_eq!(files[2].status, ChangeKind::Renamed);
        assert_eq!(files[2].old_path.as_deref(), Some("old name.txt"));
        assert_eq!(files[2].path, "new name.txt");
        assert_eq!(files[3].status, ChangeKind::Deleted);
    }
}
