use serde::{Deserialize, Serialize};

pub const MAX_DIFF_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_RAW_FILE_BYTES: usize = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES: usize = 8000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileChange {
    Modified,
    Added,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LineKind {
    Context,
    Added,
    Removed,
    NoNewline,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: LineKind,
    pub content: String,
    pub old_number: Option<u32>,
    pub new_number: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub header: String,
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub change: FileChange,
    pub binary: bool,
    pub too_large: bool,
    pub partial_staging_allowed: bool,
    pub hunks: Vec<Hunk>,
}

impl FileDiff {
    pub fn empty(path: &str) -> Self {
        Self {
            path: path.to_string(),
            old_path: None,
            change: FileChange::Modified,
            binary: false,
            too_large: false,
            partial_staging_allowed: false,
            hunks: Vec::new(),
        }
    }

    pub fn too_large(path: &str) -> Self {
        Self {
            too_large: true,
            ..Self::empty(path)
        }
    }

    fn finalized(mut self) -> Self {
        self.partial_staging_allowed = self.change == FileChange::Modified
            && !self.binary
            && !self.too_large
            && !self.hunks.is_empty();
        self
    }
}

fn parse_range(part: &str) -> Option<(u32, u32)> {
    match part.split_once(',') {
        Some((start, count)) => Some((start.parse().ok()?, count.parse().ok()?)),
        None => Some((part.parse().ok()?, 1)),
    }
}

fn parse_hunk_header(line: &str) -> Option<Hunk> {
    let rest = line.strip_prefix("@@ -")?;
    let (old_part, rest) = rest.split_once(" +")?;
    let (new_part, _) = rest.split_once(" @@")?;
    let (old_start, old_count) = parse_range(old_part)?;
    let (new_start, new_count) = parse_range(new_part)?;
    Some(Hunk {
        header: line.to_string(),
        old_start,
        old_count,
        new_start,
        new_count,
        lines: Vec::new(),
    })
}

fn apply_header_line(line: &str, diff: &mut FileDiff) {
    if line.starts_with("new file mode") {
        diff.change = FileChange::Added;
    } else if line.starts_with("deleted file mode") {
        diff.change = FileChange::Deleted;
    } else if let Some(original) = line.strip_prefix("rename from ") {
        diff.change = FileChange::Renamed;
        diff.old_path = Some(original.to_string());
    } else if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
        diff.binary = true;
    }
}

pub fn parse_unified_diff(path: &str, text: &str) -> FileDiff {
    if text.len() > MAX_DIFF_BYTES {
        return FileDiff::too_large(path);
    }

    let mut diff = FileDiff::empty(path);
    let mut lines: Vec<&str> = text.split('\n').collect();
    if lines.last() == Some(&"") {
        lines.pop();
    }

    let mut current: Option<Hunk> = None;
    let mut old_number = 0u32;
    let mut new_number = 0u32;

    for raw in lines {
        if raw.starts_with("@@@") {
            diff.hunks.clear();
            current = None;
            break;
        }

        if raw.starts_with("@@ ") {
            if let Some(hunk) = current.take() {
                diff.hunks.push(hunk);
            }
            if let Some(hunk) = parse_hunk_header(raw) {
                old_number = hunk.old_start;
                new_number = hunk.new_start;
                current = Some(hunk);
            }
            continue;
        }

        let Some(hunk) = current.as_mut() else {
            apply_header_line(raw, &mut diff);
            continue;
        };

        let first = raw.chars().next();
        if matches!(first, Some(character) if !matches!(character, ' ' | '+' | '-' | '\\')) {
            if let Some(finished) = current.take() {
                diff.hunks.push(finished);
            }
            apply_header_line(raw, &mut diff);
            continue;
        }

        let line = match first {
            Some('+') => {
                let line = DiffLine {
                    kind: LineKind::Added,
                    content: raw[1..].to_string(),
                    old_number: None,
                    new_number: Some(new_number),
                };
                new_number += 1;
                line
            }
            Some('-') => {
                let line = DiffLine {
                    kind: LineKind::Removed,
                    content: raw[1..].to_string(),
                    old_number: Some(old_number),
                    new_number: None,
                };
                old_number += 1;
                line
            }
            Some('\\') => DiffLine {
                kind: LineKind::NoNewline,
                content: raw.to_string(),
                old_number: None,
                new_number: None,
            },
            _ => {
                let content = raw.get(1..).unwrap_or("").to_string();
                let line = DiffLine {
                    kind: LineKind::Context,
                    content,
                    old_number: Some(old_number),
                    new_number: Some(new_number),
                };
                old_number += 1;
                new_number += 1;
                line
            }
        };
        hunk.lines.push(line);
    }

    if let Some(hunk) = current.take() {
        diff.hunks.push(hunk);
    }

    diff.finalized()
}

pub fn diff_from_raw_file(path: &str, bytes: &[u8]) -> FileDiff {
    let mut diff = FileDiff::empty(path);
    diff.change = FileChange::Added;

    if bytes.iter().take(BINARY_SNIFF_BYTES).any(|byte| *byte == 0) {
        diff.binary = true;
        return diff.finalized();
    }
    if bytes.len() > MAX_RAW_FILE_BYTES {
        return FileDiff::too_large(path);
    }
    if bytes.is_empty() {
        return diff.finalized();
    }

    let text = String::from_utf8_lossy(bytes);
    let ends_with_newline = text.ends_with('\n');
    let mut source_lines: Vec<&str> = text.split('\n').collect();
    if ends_with_newline {
        source_lines.pop();
    }

    let mut lines: Vec<DiffLine> = source_lines
        .iter()
        .enumerate()
        .map(|(position, content)| DiffLine {
            kind: LineKind::Added,
            content: (*content).to_string(),
            old_number: None,
            new_number: Some(position as u32 + 1),
        })
        .collect();

    if !ends_with_newline {
        lines.push(DiffLine {
            kind: LineKind::NoNewline,
            content: "\\ No newline at end of file".to_string(),
            old_number: None,
            new_number: None,
        });
    }

    let count = source_lines.len() as u32;
    diff.hunks.push(Hunk {
        header: format!("@@ -0,0 +1,{count} @@"),
        old_start: 0,
        old_count: 0,
        new_start: 1,
        new_count: count,
        lines,
    });
    diff.finalized()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MODIFIED: &str = "diff --git a/a.txt b/a.txt\nindex 111..222 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1,4 +1,5 @@ heading\n one\n-two\n+TWO\n+extra\n three\n four\n";

    #[test]
    fn parses_modified_file_with_numbers() {
        let diff = parse_unified_diff("a.txt", MODIFIED);
        assert_eq!(diff.change, FileChange::Modified);
        assert_eq!(diff.hunks.len(), 1);
        let hunk = &diff.hunks[0];
        assert_eq!((hunk.old_start, hunk.old_count), (1, 4));
        assert_eq!((hunk.new_start, hunk.new_count), (1, 5));
        assert_eq!(hunk.lines.len(), 6);
        assert_eq!(hunk.lines[1].kind, LineKind::Removed);
        assert_eq!(hunk.lines[1].old_number, Some(2));
        assert_eq!(hunk.lines[2].kind, LineKind::Added);
        assert_eq!(hunk.lines[2].new_number, Some(2));
        assert_eq!(hunk.lines[3].new_number, Some(3));
        assert_eq!(hunk.lines[4].old_number, Some(3));
        assert_eq!(hunk.lines[4].new_number, Some(4));
        assert!(diff.partial_staging_allowed);
    }

    #[test]
    fn parses_added_and_deleted_files() {
        let added = "diff --git a/n.txt b/n.txt\nnew file mode 100644\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1,2 @@\n+a\n+b\n";
        let diff = parse_unified_diff("n.txt", added);
        assert_eq!(diff.change, FileChange::Added);
        assert!(!diff.partial_staging_allowed);

        let deleted = "diff --git a/d.txt b/d.txt\ndeleted file mode 100644\n--- a/d.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n";
        let diff = parse_unified_diff("d.txt", deleted);
        assert_eq!(diff.change, FileChange::Deleted);
        assert_eq!(diff.hunks[0].old_count, 1);
    }

    #[test]
    fn parses_rename_and_binary() {
        let renamed = "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n";
        let diff = parse_unified_diff("new.txt", renamed);
        assert_eq!(diff.change, FileChange::Renamed);
        assert_eq!(diff.old_path.as_deref(), Some("old.txt"));

        let binary = "diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n";
        let diff = parse_unified_diff("i.png", binary);
        assert!(diff.binary);
        assert!(diff.hunks.is_empty());
    }

    #[test]
    fn keeps_carriage_returns_and_no_newline_marker() {
        let text = "@@ -1 +1 @@\n-old\r\n\\ No newline at end of file\n+new\r\n";
        let diff = parse_unified_diff("w.txt", text);
        let lines = &diff.hunks[0].lines;
        assert_eq!(lines[0].content, "old\r");
        assert_eq!(lines[1].kind, LineKind::NoNewline);
        assert_eq!(lines[2].content, "new\r");
    }

    #[test]
    fn parses_multiple_hunks() {
        let text = "@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -10,2 +10,2 @@\n x\n-y\n+Y\n";
        let diff = parse_unified_diff("m.txt", text);
        assert_eq!(diff.hunks.len(), 2);
        assert_eq!(diff.hunks[1].old_start, 10);
        assert_eq!(diff.hunks[1].lines[1].old_number, Some(11));
    }

    #[test]
    fn ignores_combined_conflict_diffs() {
        let text = "diff --cc c.txt\n@@@ -1,3 -1,3 +1,7 @@@\n++<<<<<<< HEAD\n";
        let diff = parse_unified_diff("c.txt", text);
        assert!(diff.hunks.is_empty());
        assert!(!diff.partial_staging_allowed);
    }

    #[test]
    fn flags_oversized_diff() {
        let text = "x".repeat(MAX_DIFF_BYTES + 1);
        let diff = parse_unified_diff("big.txt", &text);
        assert!(diff.too_large);
    }

    #[test]
    fn builds_diff_from_raw_text_file() {
        let diff = diff_from_raw_file("u.txt", b"one\ntwo");
        assert_eq!(diff.change, FileChange::Added);
        let lines = &diff.hunks[0].lines;
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[1].new_number, Some(2));
        assert_eq!(lines[2].kind, LineKind::NoNewline);
        assert_eq!(diff.hunks[0].header, "@@ -0,0 +1,2 @@");
    }

    #[test]
    fn detects_binary_raw_files() {
        let diff = diff_from_raw_file("b.bin", &[0u8, 1, 2, 3]);
        assert!(diff.binary);
        assert!(diff.hunks.is_empty());
    }
}
