use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked, git_with_input};
use crate::git::validate::ensure_relative_path;

const BINARY_SNIFF_BYTES: usize = 8000;
const MAX_CONFLICT_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictKind {
    BothModified,
    BothAdded,
    DeletedByUs,
    DeletedByThem,
    BothDeleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictSide {
    Ours,
    Theirs,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub kind: ConflictKind,
    pub binary: bool,
    pub too_large: bool,
    pub line_ending: LineEnding,
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
    pub working: Option<String>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct Stages {
    base: bool,
    ours: bool,
    theirs: bool,
}

fn parse_stages(listing: &[u8]) -> Stages {
    let mut stages = Stages::default();
    for entry in String::from_utf8_lossy(listing)
        .split('\0')
        .filter(|entry| !entry.is_empty())
    {
        let Some((meta, _)) = entry.split_once('\t') else {
            continue;
        };
        match meta.split_whitespace().nth(2) {
            Some("1") => stages.base = true,
            Some("2") => stages.ours = true,
            Some("3") => stages.theirs = true,
            _ => {}
        }
    }
    stages
}

fn classify(stages: Stages) -> ConflictKind {
    match (stages.base, stages.ours, stages.theirs) {
        (_, true, true) if !stages.base => ConflictKind::BothAdded,
        (_, true, true) => ConflictKind::BothModified,
        (_, false, true) => ConflictKind::DeletedByUs,
        (_, true, false) => ConflictKind::DeletedByThem,
        (_, false, false) => ConflictKind::BothDeleted,
    }
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_BYTES).any(|byte| *byte == 0)
}

fn detect_line_ending(text: &str) -> LineEnding {
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count().saturating_sub(crlf);
    if crlf > lf {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    }
}

async fn stage_content(repo: &Path, stage: u8, path: &str) -> AppResult<Option<Vec<u8>>> {
    let object = format!(":{stage}:{path}");
    let output = git_unchecked(repo, &["show", &object]).await?;
    Ok(if output.success() {
        Some(output.stdout)
    } else {
        None
    })
}

pub async fn read_conflict(repo: &Path, path: &str) -> AppResult<ConflictFile> {
    ensure_relative_path(path)?;
    let listing = git(repo, &["ls-files", "-u", "-z", "--", path]).await?;
    let stages = parse_stages(&listing.stdout);
    if !(stages.base || stages.ours || stages.theirs) {
        return Err(AppError::new(
            ErrorKind::InvalidInput,
            "the file has no conflict to resolve",
        ));
    }
    let kind = classify(stages);

    let base = if stages.base {
        stage_content(repo, 1, path).await?
    } else {
        None
    };
    let ours = if stages.ours {
        stage_content(repo, 2, path).await?
    } else {
        None
    };
    let theirs = if stages.theirs {
        stage_content(repo, 3, path).await?
    } else {
        None
    };
    let working_bytes = match tokio::fs::read(repo.join(path)).await {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };

    let all: Vec<&Vec<u8>> = [&base, &ours, &theirs, &working_bytes]
        .into_iter()
        .flatten()
        .collect();
    let too_large = all.iter().any(|bytes| bytes.len() > MAX_CONFLICT_BYTES);
    let binary = all.iter().any(|bytes| looks_binary(bytes))
        || all
            .iter()
            .any(|bytes| std::str::from_utf8(bytes.as_slice()).is_err());

    let (base, ours, theirs, working) = if binary || too_large {
        (None, None, None, None)
    } else {
        let to_text = |bytes: Option<Vec<u8>>| {
            bytes.map(|value| String::from_utf8_lossy(&value).replace("\r\n", "\n"))
        };
        (
            to_text(base),
            to_text(ours),
            to_text(theirs),
            working_bytes
                .as_ref()
                .map(|bytes| String::from_utf8_lossy(bytes).replace("\r\n", "\n")),
        )
    };

    let line_ending = working_bytes
        .as_ref()
        .filter(|_| !binary && !too_large)
        .map(|bytes| detect_line_ending(&String::from_utf8_lossy(bytes)))
        .unwrap_or(LineEnding::Lf);

    Ok(ConflictFile {
        path: path.to_string(),
        kind,
        binary,
        too_large,
        line_ending,
        base,
        ours,
        theirs,
        working,
    })
}

pub async fn resolve_with_content(
    repo: &Path,
    path: &str,
    content: &str,
    line_ending: LineEnding,
) -> AppResult<()> {
    ensure_relative_path(path)?;
    let text = match line_ending {
        LineEnding::Lf => content.to_string(),
        LineEnding::Crlf => content.replace("\r\n", "\n").replace('\n', "\r\n"),
    };
    let full_path = repo.join(path);
    if let Some(parent) = full_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&full_path, text.as_bytes()).await?;
    stage_literal(repo, path).await
}

async fn stage_literal(repo: &Path, path: &str) -> AppResult<()> {
    let mut input = path.as_bytes().to_vec();
    input.push(0);
    git_with_input(
        repo,
        &[
            "--literal-pathspecs",
            "add",
            "--pathspec-from-file=-",
            "--pathspec-file-nul",
        ],
        input,
    )
    .await?;
    Ok(())
}

pub async fn resolve_with_side(repo: &Path, path: &str, side: ConflictSide) -> AppResult<()> {
    ensure_relative_path(path)?;
    let listing = git(repo, &["ls-files", "-u", "-z", "--", path]).await?;
    let stages = parse_stages(&listing.stdout);
    let (has_side, flag) = match side {
        ConflictSide::Ours => (stages.ours, "--ours"),
        ConflictSide::Theirs => (stages.theirs, "--theirs"),
    };
    if has_side {
        git(repo, &["checkout", flag, "--", path]).await?;
        stage_literal(repo, path).await
    } else {
        git(repo, &["rm", "--quiet", "--", path]).await?;
        Ok(())
    }
}

#[tauri::command]
pub async fn conflict_get(path: String, file_path: String) -> AppResult<ConflictFile> {
    read_conflict(Path::new(&path), &file_path).await
}

#[tauri::command]
pub async fn conflict_resolve(
    path: String,
    file_path: String,
    content: String,
    line_ending: LineEnding,
) -> AppResult<()> {
    resolve_with_content(Path::new(&path), &file_path, &content, line_ending).await
}

#[tauri::command]
pub async fn conflict_choose_side(
    path: String,
    file_path: String,
    side: ConflictSide,
) -> AppResult<()> {
    resolve_with_side(Path::new(&path), &file_path, side).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_stages_present_in_the_index() {
        let listing = b"100644 aaa 1\tf.txt\x00100644 bbb 2\tf.txt\x00100644 ccc 3\tf.txt\x00";
        let stages = parse_stages(listing);
        assert!(stages.base && stages.ours && stages.theirs);
        assert_eq!(classify(stages), ConflictKind::BothModified);
    }

    #[test]
    fn classifies_add_and_delete_conflicts() {
        let both_added = Stages {
            base: false,
            ours: true,
            theirs: true,
        };
        assert_eq!(classify(both_added), ConflictKind::BothAdded);
        let by_us = Stages {
            base: true,
            ours: false,
            theirs: true,
        };
        assert_eq!(classify(by_us), ConflictKind::DeletedByUs);
        let by_them = Stages {
            base: true,
            ours: true,
            theirs: false,
        };
        assert_eq!(classify(by_them), ConflictKind::DeletedByThem);
    }

    #[test]
    fn detects_binary_content_and_line_endings() {
        assert!(looks_binary(b"abc\0def"));
        assert!(!looks_binary(b"plain text"));
        assert_eq!(detect_line_ending("a\r\nb\r\nc\n"), LineEnding::Crlf);
        assert_eq!(detect_line_ending("a\nb\r\nc\n"), LineEnding::Lf);
        assert_eq!(detect_line_ending("one line"), LineEnding::Lf);
    }
}
