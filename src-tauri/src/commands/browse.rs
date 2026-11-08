use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::commands::compare::{range_file_diff, range_files};
use crate::commands::rescue::guard_worktree;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::diff::FileDiff;
use crate::git::parse::log::CommitFile;
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::{ensure_relative_path, ensure_revision};

pub const MAX_TEXT_BYTES: u64 = 1024 * 1024;
pub const MAX_IMAGE_BYTES: u64 = 5 * 1024 * 1024;
const BINARY_SNIFF_BYTES: usize = 8000;
const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TreeEntryKind {
    File,
    Folder,
    Submodule,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub kind: TreeEntryKind,
    pub mode: String,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeListing {
    pub commit: String,
    pub folder: String,
    pub entries: Vec<TreeEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum FileSource {
    Revision { revision: String },
    Index,
    Worktree,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub exists: bool,
    pub size: u64,
    pub binary: bool,
    pub too_large: bool,
    pub text: Option<String>,
    pub image_base64: Option<String>,
}

impl FileContent {
    fn missing(path: &str) -> Self {
        Self {
            path: path.to_string(),
            exists: false,
            size: 0,
            binary: false,
            too_large: false,
            text: None,
            image_base64: None,
        }
    }
}

pub fn is_image_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
}

fn literal(path: &str) -> String {
    format!(":(literal){path}")
}

pub async fn resolve_commit(repo: &Path, revision: &str) -> AppResult<String> {
    ensure_revision(revision)?;
    let target = format!("{}^{{commit}}", revision.trim());
    let output = git_unchecked(repo, &["rev-parse", "--verify", "-q", &target]).await?;
    if output.success() {
        Ok(output.trimmed())
    } else {
        Err(AppError::invalid_input(format!(
            "revision not found: {revision}"
        )))
    }
}

fn parse_tree_entries(stdout: &[u8], folder: &str) -> Vec<TreeEntry> {
    let text = String::from_utf8_lossy(stdout);
    let mut entries: Vec<TreeEntry> = text
        .split('\0')
        .filter(|record| !record.is_empty())
        .filter_map(|record| {
            let (meta, path) = record.split_once('\t')?;
            let mut fields = meta.split_whitespace();
            let mode = fields.next()?.to_string();
            let kind = match fields.next()? {
                "blob" => TreeEntryKind::File,
                "tree" => TreeEntryKind::Folder,
                "commit" => TreeEntryKind::Submodule,
                _ => return None,
            };
            let _object = fields.next()?;
            let size = fields.next().and_then(|value| value.parse().ok());
            let name = path
                .strip_prefix(folder)
                .unwrap_or(path)
                .trim_start_matches('/')
                .to_string();
            Some(TreeEntry {
                name,
                path: path.to_string(),
                kind,
                mode,
                size,
            })
        })
        .collect();
    entries.sort_by(|left, right| {
        let rank = |entry: &TreeEntry| u8::from(entry.kind != TreeEntryKind::Folder);
        rank(left)
            .cmp(&rank(right))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    entries
}

pub async fn list_tree(
    repo: &Path,
    revision: &str,
    folder: Option<&str>,
) -> AppResult<TreeListing> {
    let commit = resolve_commit(repo, revision).await?;
    let folder = folder
        .map(|value| value.trim_matches('/'))
        .unwrap_or_default();
    let mut args = vec!["ls-tree", "-z", "-l", "--full-tree", commit.as_str()];
    let prefix;
    if !folder.is_empty() {
        ensure_relative_path(folder)?;
        prefix = format!("{folder}/");
        let probe = git_unchecked(repo, &["cat-file", "-t", &format!("{commit}:{folder}")]).await?;
        if !probe.success() || probe.trimmed() != "tree" {
            return Err(AppError::new(
                ErrorKind::FileNotInRevision,
                format!("the folder does not exist: {folder}"),
            ));
        }
        args.push("--");
        args.push(prefix.as_str());
    }
    let output = git(repo, &args).await?;
    Ok(TreeListing {
        entries: parse_tree_entries(&output.stdout, folder),
        folder: folder.to_string(),
        commit,
    })
}

fn build_content(path: &str, size: u64, bytes: Option<Vec<u8>>) -> FileContent {
    let image = is_image_path(path);
    let limit = if image {
        MAX_IMAGE_BYTES
    } else {
        MAX_TEXT_BYTES
    };
    let Some(bytes) = bytes.filter(|_| size <= limit) else {
        return FileContent {
            exists: true,
            size,
            too_large: true,
            ..FileContent::missing(path)
        };
    };
    let binary = bytes.iter().take(BINARY_SNIFF_BYTES).any(|byte| *byte == 0);
    let text = if !binary && size <= MAX_TEXT_BYTES {
        Some(String::from_utf8_lossy(&bytes).into_owned())
    } else {
        None
    };
    FileContent {
        path: path.to_string(),
        exists: true,
        size,
        binary,
        too_large: !image && text.is_none() && !binary,
        text,
        image_base64: image.then(|| STANDARD.encode(&bytes)),
    }
}

async fn blob_size(repo: &Path, object: &str) -> AppResult<u64> {
    let output = git(repo, &["cat-file", "-s", object]).await?;
    Ok(output.trimmed().parse().unwrap_or(0))
}

async fn read_blob(repo: &Path, path: &str, object: &str) -> AppResult<FileContent> {
    let size = blob_size(repo, object).await?;
    let limit = if is_image_path(path) {
        MAX_IMAGE_BYTES
    } else {
        MAX_TEXT_BYTES
    };
    let bytes = if size <= limit {
        Some(git(repo, &["cat-file", "blob", object]).await?.stdout)
    } else {
        None
    };
    Ok(build_content(path, size, bytes))
}

async fn read_from_revision(repo: &Path, revision: &str, path: &str) -> AppResult<FileContent> {
    let commit = resolve_commit(repo, revision).await?;
    let output = git(
        repo,
        &[
            "ls-tree",
            "-z",
            "--full-tree",
            &commit,
            "--",
            &literal(path),
        ],
    )
    .await?;
    let text = output.text();
    let Some(record) = text.split('\0').find(|record| !record.is_empty()) else {
        return Ok(FileContent::missing(path));
    };
    let mut fields = record.split_whitespace();
    let _mode = fields.next();
    let kind = fields.next().unwrap_or_default();
    let object = fields.next().unwrap_or_default().to_string();
    if kind != "blob" {
        return Err(AppError::invalid_input(format!("not a file: {path}")));
    }
    read_blob(repo, path, &object).await
}

async fn read_from_index(repo: &Path, path: &str) -> AppResult<FileContent> {
    let output = git(repo, &["ls-files", "-s", "-z", "--", &literal(path)]).await?;
    let text = output.text();
    let object = text
        .split('\0')
        .filter_map(|record| {
            let (meta, name) = record.split_once('\t')?;
            let mut fields = meta.split_whitespace();
            let _mode = fields.next()?;
            let object = fields.next()?;
            let stage = fields.next()?;
            (name == path && stage == "0").then(|| object.to_string())
        })
        .next();
    match object {
        Some(object) => read_blob(repo, path, &object).await,
        None => Ok(FileContent::missing(path)),
    }
}

async fn read_from_worktree(repo: &Path, path: &str) -> AppResult<FileContent> {
    let full_path = repo.join(path);
    let metadata = match tokio::fs::metadata(&full_path).await {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return Ok(FileContent::missing(path)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(FileContent::missing(path))
        }
        Err(error) => return Err(error.into()),
    };
    let size = metadata.len();
    let limit = if is_image_path(path) {
        MAX_IMAGE_BYTES
    } else {
        MAX_TEXT_BYTES
    };
    let bytes = if size <= limit {
        Some(tokio::fs::read(&full_path).await?)
    } else {
        None
    };
    Ok(build_content(path, size, bytes))
}

pub async fn read_file(repo: &Path, source: &FileSource, path: &str) -> AppResult<FileContent> {
    ensure_relative_path(path)?;
    match source {
        FileSource::Revision { revision } => read_from_revision(repo, revision, path).await,
        FileSource::Index => read_from_index(repo, path).await,
        FileSource::Worktree => read_from_worktree(repo, path).await,
    }
}

pub async fn restore_file(repo: &Path, revision: &str, path: &str) -> AppResult<()> {
    ensure_relative_path(path)?;
    let commit = resolve_commit(repo, revision).await?;
    let content = read_from_revision(repo, &commit, path).await?;
    if !content.exists {
        return Err(AppError::new(
            ErrorKind::FileNotInRevision,
            format!("the file does not exist in {revision}: {path}"),
        ));
    }
    guard_worktree(repo, "restore-file").await;
    let source = format!("--source={commit}");
    git(
        repo,
        &["restore", &source, "--worktree", "--", &literal(path)],
    )
    .await?;
    Ok(())
}

pub async fn diff_files(repo: &Path, base: &str, head: &str) -> AppResult<Vec<CommitFile>> {
    let base = resolve_commit(repo, base).await?;
    let head = resolve_commit(repo, head).await?;
    range_files(repo, &format!("{base}..{head}")).await
}

pub async fn diff_file(
    repo: &Path,
    base: &str,
    head: &str,
    path: &str,
    old_path: Option<&str>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    let base = resolve_commit(repo, base).await?;
    let head = resolve_commit(repo, head).await?;
    range_file_diff(
        repo,
        &format!("{base}..{head}"),
        path,
        old_path,
        ignore_whitespace,
    )
    .await
}

#[tauri::command]
pub async fn browse_tree(
    path: String,
    revision: String,
    folder: Option<String>,
) -> AppResult<TreeListing> {
    list_tree(Path::new(&path), &revision, folder.as_deref()).await
}

#[tauri::command]
pub async fn browse_read_file(
    path: String,
    source: FileSource,
    file_path: String,
) -> AppResult<FileContent> {
    read_file(Path::new(&path), &source, &file_path).await
}

#[tauri::command]
pub async fn browse_restore_file(
    path: String,
    revision: String,
    file_path: String,
) -> AppResult<()> {
    restore_file(Path::new(&path), &revision, &file_path).await
}

#[tauri::command]
pub async fn browse_diff_files(
    path: String,
    base: String,
    head: String,
) -> AppResult<Vec<CommitFile>> {
    diff_files(Path::new(&path), &base, &head).await
}

#[tauri::command]
pub async fn browse_diff_file(
    path: String,
    base: String,
    head: String,
    file_path: String,
    old_path: Option<String>,
    ignore_whitespace: bool,
) -> AppResult<FileDiff> {
    diff_file(
        Path::new(&path),
        &base,
        &head,
        &file_path,
        old_path.as_deref(),
        ignore_whitespace,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_paths_are_recognised_by_extension() {
        assert!(is_image_path("logo.PNG"));
        assert!(is_image_path("assets/icon.svg"));
        assert!(!is_image_path("notes.txt"));
        assert!(!is_image_path("png"));
    }

    #[test]
    fn tree_entries_keep_folders_first() {
        let raw = b"100644 blob abc     12\tsrc/b.txt\x00040000 tree def       -\tsrc/inner\x00100644 blob 123      3\tsrc/A.txt\0";
        let entries = parse_tree_entries(raw, "src");
        let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["inner", "A.txt", "b.txt"]);
        assert_eq!(entries[0].size, None);
        assert_eq!(entries[1].size, Some(3));
    }

    #[test]
    fn content_flags_binary_and_large_files() {
        let text = build_content("a.txt", 3, Some(b"abc".to_vec()));
        assert_eq!(text.text.as_deref(), Some("abc"));
        let binary = build_content("a.bin", 3, Some(vec![0, 1, 2]));
        assert!(binary.binary && binary.text.is_none());
        let large = build_content("a.txt", MAX_TEXT_BYTES + 1, None);
        assert!(large.too_large);
        let image = build_content("a.png", 3, Some(vec![0, 1, 2]));
        assert_eq!(image.image_base64.as_deref(), Some("AAEC"));
    }
}
