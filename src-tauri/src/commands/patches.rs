use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked, git_with_input_unchecked};
use crate::git::validate::ensure_commit_hash;

const MAX_PATCH_BYTES: u64 = 20 * 1024 * 1024;
const HEADER_BYTES: usize = 64 * 1024;
const MAX_PATCH_FILES: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PatchApplyMode {
    Commit,
    WorkingTree,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchFileChange {
    pub path: String,
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPreview {
    pub file: String,
    pub mailbox: bool,
    pub subject: Option<String>,
    pub author: Option<String>,
    pub changes: Vec<PatchFileChange>,
    pub applies_cleanly: bool,
    pub problem: Option<String>,
}

fn into_patch_error(error: AppError) -> AppError {
    if error.kind == ErrorKind::PatchRejected {
        AppError::new(ErrorKind::PatchNotApplicable, error.detail)
    } else {
        error
    }
}

async fn existing_directory(value: &str) -> AppResult<String> {
    let path = Path::new(value.trim());
    if !path.is_absolute() {
        return Err(AppError::invalid_input("the folder path must be absolute"));
    }
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|_| AppError::invalid_input("the folder does not exist"))?;
    if !metadata.is_dir() {
        return Err(AppError::invalid_input("the chosen path is not a folder"));
    }
    Ok(path.to_string_lossy().into_owned())
}

async fn existing_patch_file(value: &str) -> AppResult<String> {
    let path = Path::new(value.trim());
    if !path.is_absolute() {
        return Err(AppError::invalid_input("the patch path must be absolute"));
    }
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|_| AppError::invalid_input("the patch file does not exist"))?;
    if !metadata.is_file() {
        return Err(AppError::invalid_input("the chosen path is not a file"));
    }
    if metadata.len() > MAX_PATCH_BYTES {
        return Err(AppError::invalid_input("the patch file is too large"));
    }
    Ok(path.to_string_lossy().into_owned())
}

async fn existing_patch_files(values: &[String]) -> AppResult<Vec<String>> {
    if values.is_empty() {
        return Err(AppError::invalid_input("no patch files selected"));
    }
    if values.len() > MAX_PATCH_FILES {
        return Err(AppError::invalid_input("too many patch files"));
    }
    let mut files = Vec::with_capacity(values.len());
    for value in values {
        files.push(existing_patch_file(value).await?);
    }
    Ok(files)
}

pub async fn export_patches(
    repo: &Path,
    hashes: &[String],
    directory: &str,
) -> AppResult<Vec<String>> {
    if hashes.is_empty() {
        return Err(AppError::invalid_input("no commits selected"));
    }
    if hashes.len() > MAX_PATCH_FILES {
        return Err(AppError::invalid_input("too many commits selected"));
    }
    for hash in hashes {
        ensure_commit_hash(hash)?;
    }
    let target = existing_directory(directory).await?;

    let mut merge_probe = vec!["rev-list", "--no-walk", "--min-parents=2"];
    merge_probe.extend(hashes.iter().map(String::as_str));
    if !git(repo, &merge_probe).await?.trimmed().is_empty() {
        return Err(AppError::invalid_input(
            "merge commits cannot be exported as patches",
        ));
    }

    let mut files = Vec::with_capacity(hashes.len());
    for (index, hash) in hashes.iter().enumerate() {
        let start = (index + 1).to_string();
        let output = git(
            repo,
            &[
                "format-patch",
                "--start-number",
                &start,
                "-1",
                "-o",
                &target,
                hash,
            ],
        )
        .await?;
        files.extend(
            output
                .text()
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string),
        );
    }
    Ok(files)
}

pub fn looks_like_mailbox(head: &str) -> bool {
    let mut lines = head.lines();
    let first = lines.next().unwrap_or_default();
    if !first.starts_with("From ") {
        return false;
    }
    head.lines()
        .take(40)
        .any(|line| line.starts_with("Subject:"))
}

pub fn parse_mailinfo(text: &str) -> (Option<String>, Option<String>) {
    let mut author = None;
    let mut email = None;
    let mut subject = None;
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("Author: ") {
            author = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Email: ") {
            email = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Subject: ") {
            subject = Some(value.trim().to_string());
        }
    }
    let author = match (author.filter(|name| !name.is_empty()), email) {
        (Some(name), Some(address)) if !address.is_empty() => Some(format!("{name} <{address}>")),
        (Some(name), _) => Some(name),
        (None, Some(address)) if !address.is_empty() => Some(address),
        _ => None,
    };
    (author, subject.filter(|text| !text.is_empty()))
}

pub fn parse_numstat(output: &str) -> Vec<PatchFileChange> {
    output
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .filter_map(|entry| {
            let mut parts = entry.splitn(3, '\t');
            let insertions = parts.next()?;
            let deletions = parts.next()?;
            let path = parts.next()?;
            Some(PatchFileChange {
                path: path.to_string(),
                insertions: insertions.parse().ok(),
                deletions: deletions.parse().ok(),
            })
        })
        .collect()
}

async fn read_head(file: &str) -> AppResult<Vec<u8>> {
    use tokio::io::AsyncReadExt;
    let handle = tokio::fs::File::open(file).await?;
    let mut buffer = Vec::new();
    handle
        .take(HEADER_BYTES as u64)
        .read_to_end(&mut buffer)
        .await?;
    Ok(buffer)
}

async fn preview_file(repo: &Path, file: String) -> AppResult<PatchPreview> {
    let head = read_head(&file).await?;
    let mailbox = looks_like_mailbox(&String::from_utf8_lossy(&head));
    let (author, subject) = if mailbox {
        let output =
            git_with_input_unchecked(repo, &["mailinfo", "/dev/null", "/dev/null"], head).await?;
        if output.success() {
            parse_mailinfo(&output.text())
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let numstat = git(repo, &["apply", "--numstat", "-z", "--", &file])
        .await
        .map_err(into_patch_error)?;
    let check = git_unchecked(repo, &["apply", "--check", "--", &file]).await?;
    let problem = if check.success() {
        None
    } else {
        check
            .stderr
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(str::to_string)
    };

    Ok(PatchPreview {
        file,
        mailbox,
        subject,
        author,
        changes: parse_numstat(&numstat.text()),
        applies_cleanly: check.success(),
        problem,
    })
}

pub async fn preview_patches(repo: &Path, files: &[String]) -> AppResult<Vec<PatchPreview>> {
    let files = existing_patch_files(files).await?;
    let mut previews = Vec::with_capacity(files.len());
    for file in files {
        previews.push(preview_file(repo, file).await?);
    }
    Ok(previews)
}

pub async fn apply_patches(repo: &Path, files: &[String], mode: PatchApplyMode) -> AppResult<()> {
    let files = existing_patch_files(files).await?;
    match mode {
        PatchApplyMode::Commit => {
            for file in &files {
                let head = read_head(file).await?;
                if !looks_like_mailbox(&String::from_utf8_lossy(&head)) {
                    return Err(AppError::invalid_input(
                        "creating commits needs patches exported with commit information",
                    ));
                }
            }
            let mut args = vec!["am", "--3way", "--"];
            args.extend(files.iter().map(String::as_str));
            git(repo, &args).await.map_err(into_patch_error)?;
        }
        PatchApplyMode::WorkingTree => {
            let mut args = vec!["apply", "--3way", "--"];
            args.extend(files.iter().map(String::as_str));
            git(repo, &args).await.map_err(into_patch_error)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn patch_export(
    path: String,
    hashes: Vec<String>,
    directory: String,
) -> AppResult<Vec<String>> {
    export_patches(Path::new(&path), &hashes, &directory).await
}

#[tauri::command]
pub async fn patch_preview(path: String, files: Vec<String>) -> AppResult<Vec<PatchPreview>> {
    preview_patches(Path::new(&path), &files).await
}

#[tauri::command]
pub async fn patch_apply(path: String, files: Vec<String>, mode: PatchApplyMode) -> AppResult<()> {
    apply_patches(Path::new(&path), &files, mode).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_mailbox_patches_and_plain_diffs() {
        let mailbox = format!(
            "From {} Mon Sep 17 00:00:00 2001\nFrom: A <a@b.c>\nSubject: [PATCH] hello\n\n---\n",
            "a".repeat(40)
        );
        assert!(looks_like_mailbox(&mailbox));
        assert!(!looks_like_mailbox(
            "diff --git a/x b/x\n--- a/x\n+++ b/x\n"
        ));
        assert!(!looks_like_mailbox("From the desk of nobody\nhello\n"));
    }

    #[test]
    fn mailinfo_output_becomes_author_and_subject() {
        let text =
            "Author: Ana Pérez\nEmail: ana@example.com\nSubject: Arreglar el login\nDate: x\n";
        let (author, subject) = parse_mailinfo(text);
        assert_eq!(author.as_deref(), Some("Ana Pérez <ana@example.com>"));
        assert_eq!(subject.as_deref(), Some("Arreglar el login"));
        assert_eq!(parse_mailinfo(""), (None, None));
    }

    #[test]
    fn numstat_lines_keep_binary_files_without_counts() {
        let output = "3\t1\tsrc/a.rs\0-\t-\timage.png\0";
        let changes = parse_numstat(output);
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0].path, "src/a.rs");
        assert_eq!(changes[0].insertions, Some(3));
        assert_eq!(changes[0].deletions, Some(1));
        assert_eq!(changes[1].path, "image.png");
        assert_eq!(changes[1].insertions, None);
    }
}
