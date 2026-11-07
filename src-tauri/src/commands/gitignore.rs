use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::git::parse::ignore::{
    append_missing_lines, parse_check_ignore, parse_nul_paths, IgnoreMatch,
};
use crate::git::runner::{git, git_with_input_unchecked};
use crate::git::validate::ensure_relative_path;

const IGNORE_FILE: &str = ".gitignore";
const MAX_IGNORE_BYTES: u64 = 2_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreFile {
    pub content: String,
    pub exists: bool,
}

pub fn read_ignore_file(repo: &Path) -> AppResult<IgnoreFile> {
    let path = repo.join(IGNORE_FILE);
    if !path.is_file() {
        return Ok(IgnoreFile {
            content: String::new(),
            exists: false,
        });
    }
    let size = std::fs::metadata(&path)?.len();
    if size > MAX_IGNORE_BYTES {
        return Err(AppError::invalid_input("the .gitignore file is too large"));
    }
    let bytes = std::fs::read(&path)?;
    Ok(IgnoreFile {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        exists: true,
    })
}

pub fn write_ignore_file(repo: &Path, content: &str) -> AppResult<()> {
    if content.len() as u64 > MAX_IGNORE_BYTES || content.contains('\0') {
        return Err(AppError::invalid_input("invalid .gitignore content"));
    }
    std::fs::write(repo.join(IGNORE_FILE), content)?;
    Ok(())
}

pub fn append_ignore_lines(repo: &Path, lines: &[String]) -> AppResult<usize> {
    if lines
        .iter()
        .any(|line| line.contains('\0') || line.contains('\n') || line.contains('\r'))
    {
        return Err(AppError::invalid_input("invalid ignore pattern"));
    }
    let current = read_ignore_file(repo)?;
    let (updated, added) = append_missing_lines(&current.content, lines);
    if added > 0 {
        write_ignore_file(repo, &updated)?;
    }
    Ok(added)
}

pub async fn check_ignored(repo: &Path, paths: &[String]) -> AppResult<Vec<IgnoreMatch>> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    for path in paths {
        ensure_relative_path(path.trim_end_matches('/'))?;
    }
    let mut input: Vec<u8> = Vec::new();
    for path in paths {
        input.extend_from_slice(path.as_bytes());
        input.push(0);
    }
    let output = git_with_input_unchecked(
        repo,
        &["check-ignore", "-v", "-n", "-z", "--no-index", "--stdin"],
        input,
    )
    .await?;
    if output.exit_code > 1 {
        return Err(AppError::from_git_failure(
            &String::from_utf8_lossy(&output.stdout),
            &output.stderr,
        ));
    }
    Ok(parse_check_ignore(&output.text()))
}

pub async fn tracked_but_ignored(repo: &Path) -> AppResult<Vec<String>> {
    let output = git(repo, &["ls-files", "-c", "-i", "--exclude-standard", "-z"]).await?;
    Ok(parse_nul_paths(&output.text()))
}

pub async fn untrack_paths(repo: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    for path in paths {
        ensure_relative_path(path)?;
    }
    let mut args: Vec<&str> = vec!["rm", "--cached", "--ignore-unmatch", "-r", "-q", "--"];
    args.extend(paths.iter().map(String::as_str));
    git(repo, &args).await?;
    Ok(())
}

#[tauri::command]
pub async fn gitignore_read(path: String) -> AppResult<IgnoreFile> {
    read_ignore_file(Path::new(&path))
}

#[tauri::command]
pub async fn gitignore_write(path: String, content: String) -> AppResult<()> {
    write_ignore_file(Path::new(&path), &content)
}

#[tauri::command]
pub async fn gitignore_append(path: String, lines: Vec<String>) -> AppResult<usize> {
    append_ignore_lines(Path::new(&path), &lines)
}

#[tauri::command]
pub async fn gitignore_check(path: String, paths: Vec<String>) -> AppResult<Vec<IgnoreMatch>> {
    check_ignored(Path::new(&path), &paths).await
}

#[tauri::command]
pub async fn gitignore_tracked(path: String) -> AppResult<Vec<String>> {
    tracked_but_ignored(Path::new(&path)).await
}

#[tauri::command]
pub async fn gitignore_untrack(path: String, paths: Vec<String>) -> AppResult<()> {
    untrack_paths(Path::new(&path), &paths).await
}
