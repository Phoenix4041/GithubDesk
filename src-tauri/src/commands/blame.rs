use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::blame::{parse_blame, BlameCommit, BlameLine};
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::{ensure_commit_hash, ensure_relative_path};

const MAX_BLAME_BYTES: u64 = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES: usize = 8000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameResult {
    pub path: String,
    pub commits: Vec<BlameCommit>,
    pub lines: Vec<BlameLine>,
    pub binary: bool,
    pub too_large: bool,
    pub truncated: bool,
}

impl BlameResult {
    fn without_lines(path: &str, binary: bool, too_large: bool) -> Self {
        Self {
            path: path.to_string(),
            commits: Vec::new(),
            lines: Vec::new(),
            binary,
            too_large,
            truncated: false,
        }
    }
}

async fn inspect_worktree_file(repo: &Path, path: &str) -> AppResult<Option<(u64, bool)>> {
    let full_path = repo.join(path);
    let metadata = match tokio::fs::metadata(&full_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if metadata.len() > MAX_BLAME_BYTES {
        return Ok(Some((metadata.len(), false)));
    }
    let bytes = tokio::fs::read(&full_path).await?;
    let binary = bytes.iter().take(BINARY_SNIFF_BYTES).any(|byte| *byte == 0);
    Ok(Some((metadata.len(), binary)))
}

async fn inspect_revision_file(repo: &Path, revision: &str, path: &str) -> AppResult<(u64, bool)> {
    let object = format!("{revision}:{path}");
    let size = git(repo, &["cat-file", "-s", &object]).await?;
    let length: u64 = size.trimmed().parse().unwrap_or(0);
    if length > MAX_BLAME_BYTES {
        return Ok((length, false));
    }
    let content = git_unchecked(repo, &["show", &object]).await?;
    let binary = content
        .stdout
        .iter()
        .take(BINARY_SNIFF_BYTES)
        .any(|byte| *byte == 0);
    Ok((length, binary))
}

pub async fn blame_file(
    repo: &Path,
    path: &str,
    revision: Option<&str>,
    ignore_whitespace: bool,
) -> AppResult<BlameResult> {
    ensure_relative_path(path)?;
    if let Some(hash) = revision {
        ensure_commit_hash(hash)?;
    }

    let (size, binary) = match revision {
        Some(hash) => inspect_revision_file(repo, hash, path).await?,
        None => inspect_worktree_file(repo, path).await?.ok_or_else(|| {
            AppError::new(ErrorKind::FileNotInRevision, "the file does not exist")
        })?,
    };
    if binary {
        return Ok(BlameResult::without_lines(path, true, false));
    }
    if size > MAX_BLAME_BYTES {
        return Ok(BlameResult::without_lines(path, false, true));
    }

    let mut args = vec!["blame", "--line-porcelain"];
    if ignore_whitespace {
        args.push("-w");
    }
    if let Some(hash) = revision {
        args.push(hash);
    }
    args.extend(["--", path]);
    let output = git(repo, &args).await?;
    let parsed = parse_blame(&output.text());
    Ok(BlameResult {
        path: path.to_string(),
        commits: parsed.commits,
        lines: parsed.lines,
        binary: false,
        too_large: false,
        truncated: parsed.truncated,
    })
}

#[tauri::command]
pub async fn blame_get(
    path: String,
    file_path: String,
    revision: Option<String>,
    ignore_whitespace: bool,
) -> AppResult<BlameResult> {
    blame_file(
        Path::new(&path),
        &file_path,
        revision.as_deref(),
        ignore_whitespace,
    )
    .await
}
