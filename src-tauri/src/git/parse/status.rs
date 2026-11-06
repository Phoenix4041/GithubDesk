use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    Unmodified,
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
    Untracked,
}

impl ChangeKind {
    fn from_code(code: char) -> Self {
        match code {
            'M' => Self::Modified,
            'A' => Self::Added,
            'D' => Self::Deleted,
            'R' => Self::Renamed,
            'C' => Self::Copied,
            'T' => Self::TypeChanged,
            'U' => Self::Unmerged,
            _ => Self::Unmodified,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    pub path: String,
    pub original_path: Option<String>,
    pub index: ChangeKind,
    pub worktree: ChangeKind,
    pub conflicted: bool,
    pub untracked: bool,
    pub submodule: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchStatus {
    pub head: Option<String>,
    pub oid: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub detached: bool,
    pub unborn: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusSnapshot {
    pub branch: BranchStatus,
    pub entries: Vec<StatusEntry>,
}

fn malformed(token: &str) -> AppError {
    AppError::new(
        ErrorKind::Unknown,
        format!("unexpected status entry: {token}"),
    )
}

fn parse_header(header: &str, branch: &mut BranchStatus) {
    if let Some(value) = header.strip_prefix("branch.oid ") {
        if value == "(initial)" {
            branch.unborn = true;
        } else {
            branch.oid = Some(value.to_string());
        }
    } else if let Some(value) = header.strip_prefix("branch.head ") {
        if value == "(detached)" {
            branch.detached = true;
        } else {
            branch.head = Some(value.to_string());
        }
    } else if let Some(value) = header.strip_prefix("branch.upstream ") {
        branch.upstream = Some(value.to_string());
    } else if let Some(value) = header.strip_prefix("branch.ab ") {
        for part in value.split(' ') {
            if let Some(number) = part.strip_prefix('+') {
                branch.ahead = number.parse().unwrap_or(0);
            } else if let Some(number) = part.strip_prefix('-') {
                branch.behind = number.parse().unwrap_or(0);
            }
        }
    }
}

fn status_codes(field: &str) -> (ChangeKind, ChangeKind) {
    let mut characters = field.chars();
    let index = characters.next().map(ChangeKind::from_code);
    let worktree = characters.next().map(ChangeKind::from_code);
    (
        index.unwrap_or(ChangeKind::Unmodified),
        worktree.unwrap_or(ChangeKind::Unmodified),
    )
}

fn is_submodule(field: &str) -> bool {
    field.starts_with('S')
}

pub fn parse_status(bytes: &[u8]) -> AppResult<StatusSnapshot> {
    let text = String::from_utf8_lossy(bytes);
    let mut tokens = text.split('\0').filter(|token| !token.is_empty());
    let mut snapshot = StatusSnapshot::default();

    while let Some(token) = tokens.next() {
        if let Some(header) = token.strip_prefix("# ") {
            parse_header(header, &mut snapshot.branch);
            continue;
        }

        let marker = token.chars().next().ok_or_else(|| malformed(token))?;
        match marker {
            '1' => {
                let fields: Vec<&str> = token.splitn(9, ' ').collect();
                if fields.len() < 9 {
                    return Err(malformed(token));
                }
                let (index, worktree) = status_codes(fields[1]);
                snapshot.entries.push(StatusEntry {
                    path: fields[8].to_string(),
                    original_path: None,
                    index,
                    worktree,
                    conflicted: false,
                    untracked: false,
                    submodule: is_submodule(fields[2]),
                });
            }
            '2' => {
                let fields: Vec<&str> = token.splitn(10, ' ').collect();
                if fields.len() < 10 {
                    return Err(malformed(token));
                }
                let original = tokens.next().ok_or_else(|| malformed(token))?;
                let (index, worktree) = status_codes(fields[1]);
                snapshot.entries.push(StatusEntry {
                    path: fields[9].to_string(),
                    original_path: Some(original.to_string()),
                    index,
                    worktree,
                    conflicted: false,
                    untracked: false,
                    submodule: is_submodule(fields[2]),
                });
            }
            'u' => {
                let fields: Vec<&str> = token.splitn(11, ' ').collect();
                if fields.len() < 11 {
                    return Err(malformed(token));
                }
                snapshot.entries.push(StatusEntry {
                    path: fields[10].to_string(),
                    original_path: None,
                    index: ChangeKind::Unmerged,
                    worktree: ChangeKind::Unmerged,
                    conflicted: true,
                    untracked: false,
                    submodule: is_submodule(fields[2]),
                });
            }
            '?' => {
                let path = token.get(2..).ok_or_else(|| malformed(token))?;
                snapshot.entries.push(StatusEntry {
                    path: path.to_string(),
                    original_path: None,
                    index: ChangeKind::Unmodified,
                    worktree: ChangeKind::Untracked,
                    conflicted: false,
                    untracked: true,
                    submodule: false,
                });
            }
            '!' => {}
            _ => return Err(malformed(token)),
        }
    }

    snapshot
        .entries
        .sort_by_cached_key(|entry| entry.path.to_lowercase());
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn join(parts: &[&str]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for part in parts {
            bytes.extend_from_slice(part.as_bytes());
            bytes.push(0);
        }
        bytes
    }

    const HASH: &str = "1111111111111111111111111111111111111111";

    #[test]
    fn parses_branch_headers() {
        let bytes = join(&[
            "# branch.oid abcdef",
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +3 -2",
        ]);
        let snapshot = parse_status(&bytes).expect("status");
        assert_eq!(snapshot.branch.head.as_deref(), Some("main"));
        assert_eq!(snapshot.branch.upstream.as_deref(), Some("origin/main"));
        assert_eq!(snapshot.branch.ahead, 3);
        assert_eq!(snapshot.branch.behind, 2);
        assert!(!snapshot.branch.detached);
        assert!(snapshot.entries.is_empty());
    }

    #[test]
    fn parses_unborn_and_detached_heads() {
        let unborn = parse_status(&join(&["# branch.oid (initial)", "# branch.head main"]))
            .expect("status");
        assert!(unborn.branch.unborn);
        assert!(unborn.branch.oid.is_none());

        let detached = parse_status(&join(&["# branch.oid abc", "# branch.head (detached)"]))
            .expect("status");
        assert!(detached.branch.detached);
        assert!(detached.branch.head.is_none());
    }

    #[test]
    fn parses_ordinary_entries_with_spaces_in_path() {
        let line = format!("1 .M N... 100644 100644 100644 {HASH} {HASH} dir name/file one.txt");
        let snapshot = parse_status(&join(&[&line])).expect("status");
        let entry = &snapshot.entries[0];
        assert_eq!(entry.path, "dir name/file one.txt");
        assert_eq!(entry.index, ChangeKind::Unmodified);
        assert_eq!(entry.worktree, ChangeKind::Modified);
    }

    #[test]
    fn parses_staged_and_unstaged_changes_on_same_file() {
        let line = format!("1 MM N... 100644 100644 100644 {HASH} {HASH} a.txt");
        let snapshot = parse_status(&join(&[&line])).expect("status");
        let entry = &snapshot.entries[0];
        assert_eq!(entry.index, ChangeKind::Modified);
        assert_eq!(entry.worktree, ChangeKind::Modified);
    }

    #[test]
    fn parses_rename_with_original_path() {
        let line = format!("2 R. N... 100644 100644 100644 {HASH} {HASH} R100 new name.txt");
        let snapshot = parse_status(&join(&[&line, "old name.txt"])).expect("status");
        let entry = &snapshot.entries[0];
        assert_eq!(entry.path, "new name.txt");
        assert_eq!(entry.original_path.as_deref(), Some("old name.txt"));
        assert_eq!(entry.index, ChangeKind::Renamed);
    }

    #[test]
    fn parses_unmerged_and_untracked_entries() {
        let unmerged =
            format!("u UU N... 100644 100644 100644 100644 {HASH} {HASH} {HASH} conflict.txt");
        let snapshot =
            parse_status(&join(&[&unmerged, "? new file.txt", "! ignored.log"])).expect("status");
        assert_eq!(snapshot.entries.len(), 2);
        let conflict = snapshot
            .entries
            .iter()
            .find(|entry| entry.path == "conflict.txt")
            .expect("conflict entry");
        assert!(conflict.conflicted);
        let untracked = snapshot
            .entries
            .iter()
            .find(|entry| entry.path == "new file.txt")
            .expect("untracked entry");
        assert!(untracked.untracked);
        assert_eq!(untracked.worktree, ChangeKind::Untracked);
    }

    #[test]
    fn sorts_entries_by_path_ignoring_case() {
        let snapshot = parse_status(&join(&["? b.txt", "? A.txt", "? c.txt"])).expect("status");
        let paths: Vec<&str> = snapshot.entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["A.txt", "b.txt", "c.txt"]);
    }

    #[test]
    fn rejects_malformed_entries() {
        assert!(parse_status(&join(&["1 .M broken"])).is_err());
        assert!(parse_status(&join(&["x unknown"])).is_err());
    }
}
