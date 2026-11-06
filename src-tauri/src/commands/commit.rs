use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked, git_with_input};

const FIELD_SEPARATOR: char = '\u{1f}';

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadCommit {
    pub hash: String,
    pub title: String,
    pub description: String,
    pub pushed: bool,
    pub parent_count: usize,
}

fn build_message(title: &str, description: &str) -> String {
    let body = description.trim();
    if body.is_empty() {
        format!("{}\n", title.trim())
    } else {
        format!("{}\n\n{}\n", title.trim(), body)
    }
}

pub async fn head_commit(repo: &Path) -> AppResult<Option<HeadCommit>> {
    let verify = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"]).await?;
    if !verify.success() {
        return Ok(None);
    }

    let output = git(repo, &["log", "-1", "--format=%H%x1f%P%x1f%s%x1f%b"]).await?;
    let text = output.text();
    let fields: Vec<&str> = text.splitn(4, FIELD_SEPARATOR).collect();
    if fields.len() < 4 {
        return Err(AppError::new(ErrorKind::Unknown, "unexpected log output"));
    }

    let pushed = git_unchecked(
        repo,
        &["merge-base", "--is-ancestor", "HEAD", "@{upstream}"],
    )
    .await?
    .success();

    Ok(Some(HeadCommit {
        hash: fields[0].trim().to_string(),
        title: fields[2].to_string(),
        description: fields[3].trim().to_string(),
        pushed,
        parent_count: fields[1].split_whitespace().count(),
    }))
}

pub async fn create_commit(
    repo: &Path,
    title: &str,
    description: &str,
    amend: bool,
) -> AppResult<String> {
    if title.trim().is_empty() {
        return Err(AppError::new(ErrorKind::EmptyCommitMessage, "empty title"));
    }

    let mut args = vec!["commit", "-F", "-"];
    if amend {
        args.push("--amend");
    }
    git_with_input(repo, &args, build_message(title, description).into_bytes()).await?;

    let head = git(repo, &["rev-parse", "HEAD"]).await?;
    Ok(head.trimmed())
}

pub async fn undo_last_commit(repo: &Path) -> AppResult<HeadCommit> {
    let head = head_commit(repo)
        .await?
        .ok_or_else(|| AppError::new(ErrorKind::NoCommits, "no commits"))?;

    if head.parent_count == 0 {
        git(repo, &["update-ref", "-d", "HEAD"]).await?;
    } else {
        git(repo, &["reset", "--soft", "HEAD~1"]).await?;
    }
    Ok(head)
}

#[tauri::command]
pub async fn commit_head(path: String) -> AppResult<Option<HeadCommit>> {
    head_commit(Path::new(&path)).await
}

#[tauri::command]
pub async fn commit_create(
    path: String,
    title: String,
    description: String,
    amend: bool,
) -> AppResult<String> {
    create_commit(Path::new(&path), &title, &description, amend).await
}

#[tauri::command]
pub async fn commit_undo(path: String) -> AppResult<HeadCommit> {
    undo_last_commit(Path::new(&path)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_title_and_description_with_blank_line() {
        assert_eq!(build_message(" Title ", ""), "Title\n");
        assert_eq!(
            build_message("Title", "  body text \n"),
            "Title\n\nbody text\n"
        );
    }
}
