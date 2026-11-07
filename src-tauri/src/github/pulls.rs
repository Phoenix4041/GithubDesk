use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::git::parse::diff::{parse_unified_diff, FileChange, FileDiff};
use crate::git::validate::ensure_commit_hash;
use crate::github::client::{GithubClient, Page};
use crate::github::models::{
    CheckRun, CheckRunsResponse, Comment, PullRequest, RepoInfo, Review, ReviewComment,
};

pub const PAGE_SIZE: u32 = 30;
pub const FILES_PAGE_SIZE: u32 = 100;

pub fn repo_path(owner: &str, repo: &str) -> AppResult<String> {
    let valid = |part: &str| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && part.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
            })
    };
    if valid(owner) && valid(repo) {
        Ok(format!("/repos/{owner}/{repo}"))
    } else {
        Err(AppError::invalid_input(format!(
            "invalid repository: {owner}/{repo}"
        )))
    }
}

fn ensure_choice(value: &str, allowed: &[&str], what: &str) -> AppResult<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid {what}: {value}")))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullBundle {
    pub pull: PullRequest,
    pub comments: Vec<Comment>,
    pub reviews: Vec<Review>,
    pub checks: Vec<CheckRun>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct RawPullFile {
    pub filename: String,
    pub status: String,
    #[serde(default)]
    pub additions: u64,
    #[serde(default)]
    pub deletions: u64,
    #[serde(default)]
    pub changes: u64,
    #[serde(default)]
    pub patch: Option<String>,
    #[serde(default)]
    pub previous_filename: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub diff: FileDiff,
}

pub fn convert_file(raw: RawPullFile) -> PullFile {
    let mut diff = match raw.patch.as_deref() {
        Some(patch) => parse_unified_diff(&raw.filename, patch),
        None => {
            let mut empty = FileDiff::empty(&raw.filename);
            if raw.changes > 0 {
                empty.too_large = true;
            }
            empty
        }
    };
    diff.partial_staging_allowed = false;
    diff.old_path = raw.previous_filename.clone();
    diff.change = match raw.status.as_str() {
        "added" => FileChange::Added,
        "removed" => FileChange::Deleted,
        "renamed" => FileChange::Renamed,
        _ => FileChange::Modified,
    };
    PullFile {
        path: raw.filename,
        previous_path: raw.previous_filename,
        status: raw.status,
        additions: raw.additions,
        deletions: raw.deletions,
        diff,
    }
}

pub async fn get_repo(client: &GithubClient, owner: &str, repo: &str) -> AppResult<RepoInfo> {
    client.get_json(&repo_path(owner, repo)?, &[]).await
}

pub async fn list_pulls(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    state: &str,
    page: u32,
) -> AppResult<Page<PullRequest>> {
    ensure_choice(state, &["open", "closed", "all"], "state")?;
    let path = format!("{}/pulls", repo_path(owner, repo)?);
    client
        .get_page(
            &path,
            &[
                ("state", state.to_string()),
                ("sort", "updated".to_string()),
                ("direction", "desc".to_string()),
            ],
            page,
            PAGE_SIZE,
        )
        .await
}

pub async fn get_pull_bundle(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
) -> AppResult<PullBundle> {
    let base = repo_path(owner, repo)?;
    let pull: PullRequest = client
        .get_json(&format!("{base}/pulls/{number}"), &[])
        .await?;

    let comments_path = format!("{base}/issues/{number}/comments");
    let reviews_path = format!("{base}/pulls/{number}/reviews");
    let checks_path = format!("{base}/commits/{}/check-runs", pull.head.sha);
    let checks_query = [("per_page", "100".to_string())];
    let (comments, reviews, checks) = tokio::join!(
        client.get_page::<Comment>(&comments_path, &[], 1, 100),
        client.get_page::<Review>(&reviews_path, &[], 1, 100),
        client.get_json::<CheckRunsResponse>(&checks_path, &checks_query),
    );
    Ok(PullBundle {
        pull,
        comments: comments?.items,
        reviews: reviews?.items,
        checks: checks
            .map(|response| response.check_runs)
            .unwrap_or_default(),
    })
}

pub async fn list_pull_files(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    page: u32,
) -> AppResult<Page<PullFile>> {
    let path = format!("{}/pulls/{number}/files", repo_path(owner, repo)?);
    let raw: Page<RawPullFile> = client.get_page(&path, &[], page, FILES_PAGE_SIZE).await?;
    Ok(Page {
        items: raw.items.into_iter().map(convert_file).collect(),
        next_page: raw.next_page,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPull {
    pub title: String,
    pub body: String,
    pub head: String,
    pub base: String,
    pub draft: bool,
}

#[derive(Serialize)]
struct CreatePullBody<'a> {
    title: &'a str,
    body: &'a str,
    head: &'a str,
    base: &'a str,
    draft: bool,
}

pub async fn create_pull(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    request: &NewPull,
) -> AppResult<PullRequest> {
    if request.title.trim().is_empty() {
        return Err(AppError::invalid_input("the title is empty"));
    }
    if request.head.trim().is_empty() || request.base.trim().is_empty() {
        return Err(AppError::invalid_input("choose the head and base branches"));
    }
    let path = format!("{}/pulls", repo_path(owner, repo)?);
    client
        .send_json(
            Method::POST,
            &path,
            &CreatePullBody {
                title: request.title.trim(),
                body: &request.body,
                head: request.head.trim(),
                base: request.base.trim(),
                draft: request.draft,
            },
        )
        .await
}

#[derive(Serialize)]
struct CommentBody<'a> {
    body: &'a str,
}

pub async fn add_comment(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    body: &str,
) -> AppResult<Comment> {
    if body.trim().is_empty() {
        return Err(AppError::invalid_input("the comment is empty"));
    }
    let path = format!("{}/issues/{number}/comments", repo_path(owner, repo)?);
    client
        .send_json(Method::POST, &path, &CommentBody { body })
        .await
}

const MAX_REVIEW_COMMENT_PAGES: u32 = 5;

pub async fn list_review_comments(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
) -> AppResult<Vec<ReviewComment>> {
    let path = format!("{}/pulls/{number}/comments", repo_path(owner, repo)?);
    let mut comments = Vec::new();
    let mut page = 1;
    loop {
        let result: Page<ReviewComment> = client.get_page(&path, &[], page, 100).await?;
        comments.extend(result.items);
        match result.next_page {
            Some(next) if page < MAX_REVIEW_COMMENT_PAGES => page = next,
            _ => break,
        }
    }
    Ok(comments)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewReviewComment {
    pub body: String,
    pub path: String,
    pub line: u64,
    pub side: String,
    pub commit_id: String,
}

#[derive(Serialize)]
struct ReviewCommentBody<'a> {
    body: &'a str,
    commit_id: &'a str,
    path: &'a str,
    line: u64,
    side: &'a str,
}

pub async fn create_review_comment(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    request: &NewReviewComment,
) -> AppResult<ReviewComment> {
    if request.body.trim().is_empty() {
        return Err(AppError::invalid_input("the comment is empty"));
    }
    if request.path.trim().is_empty() || request.path.contains('\0') {
        return Err(AppError::invalid_input("invalid file path"));
    }
    if request.line == 0 {
        return Err(AppError::invalid_input("invalid line number"));
    }
    if !matches!(request.side.as_str(), "LEFT" | "RIGHT") {
        return Err(AppError::invalid_input("invalid diff side"));
    }
    ensure_commit_hash(&request.commit_id)?;
    let path = format!("{}/pulls/{number}/comments", repo_path(owner, repo)?);
    client
        .send_json(
            Method::POST,
            &path,
            &ReviewCommentBody {
                body: request.body.trim(),
                commit_id: &request.commit_id,
                path: &request.path,
                line: request.line,
                side: &request.side,
            },
        )
        .await
}

pub async fn reply_to_review_comment(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    comment_id: u64,
    body: &str,
) -> AppResult<ReviewComment> {
    if body.trim().is_empty() {
        return Err(AppError::invalid_input("the reply is empty"));
    }
    let path = format!(
        "{}/pulls/{number}/comments/{comment_id}/replies",
        repo_path(owner, repo)?
    );
    client
        .send_json(Method::POST, &path, &CommentBody { body: body.trim() })
        .await
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MergeResult {
    pub merged: bool,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub sha: Option<String>,
}

#[derive(Serialize)]
struct MergeBody<'a> {
    merge_method: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    commit_title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    commit_message: Option<&'a str>,
}

pub async fn merge_pull(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    method: &str,
    commit_title: Option<&str>,
    commit_message: Option<&str>,
) -> AppResult<MergeResult> {
    ensure_choice(method, &["merge", "squash", "rebase"], "merge method")?;
    let path = format!("{}/pulls/{number}/merge", repo_path(owner, repo)?);
    let title = commit_title
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let message = commit_message
        .map(str::trim)
        .filter(|value| !value.is_empty());
    client
        .send_json(
            Method::PUT,
            &path,
            &MergeBody {
                merge_method: method,
                commit_title: title,
                commit_message: message,
            },
        )
        .await
}

#[derive(Serialize)]
struct StateBody<'a> {
    state: &'a str,
}

pub async fn set_pull_state(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    state: &str,
) -> AppResult<PullRequest> {
    ensure_choice(state, &["open", "closed"], "state")?;
    let path = format!("{}/pulls/{number}", repo_path(owner, repo)?);
    client
        .send_json(Method::PATCH, &path, &StateBody { state })
        .await
}

#[derive(Serialize)]
struct ReviewBody<'a> {
    event: &'a str,
    body: &'a str,
}

pub async fn submit_review(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    event: &str,
    body: &str,
) -> AppResult<Review> {
    ensure_choice(
        event,
        &["APPROVE", "REQUEST_CHANGES", "COMMENT"],
        "review event",
    )?;
    if event != "APPROVE" && body.trim().is_empty() {
        return Err(AppError::invalid_input("this review needs a comment"));
    }
    let path = format!("{}/pulls/{number}/reviews", repo_path(owner, repo)?);
    client
        .send_json(Method::POST, &path, &ReviewBody { event, body })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_paths_reject_traversal_and_odd_characters() {
        assert_eq!(
            repo_path("octo", "hello.world").expect("path"),
            "/repos/octo/hello.world"
        );
        for (owner, repo) in [
            ("..", "r"),
            ("o", ".."),
            ("o/x", "r"),
            ("o", "r?x=1"),
            ("", "r"),
            ("o", "r r"),
        ] {
            assert!(repo_path(owner, repo).is_err(), "{owner}/{repo}");
        }
    }

    #[test]
    fn modified_files_become_diffs_without_staging() {
        let file = convert_file(RawPullFile {
            filename: "src/a.rs".into(),
            status: "modified".into(),
            additions: 1,
            deletions: 1,
            changes: 2,
            patch: Some("@@ -1,2 +1,2 @@\n keep\n-old\n+new".into()),
            previous_filename: None,
        });
        assert_eq!(file.diff.hunks.len(), 1);
        assert_eq!(file.diff.hunks[0].lines.len(), 3);
        assert!(!file.diff.partial_staging_allowed);
        assert_eq!(file.diff.change, FileChange::Modified);
    }

    #[test]
    fn added_removed_and_renamed_files_keep_their_kind() {
        let make = |status: &str, previous: Option<&str>| {
            convert_file(RawPullFile {
                filename: "new.txt".into(),
                status: status.into(),
                additions: 1,
                deletions: 0,
                changes: 1,
                patch: Some("@@ -0,0 +1 @@\n+hello".into()),
                previous_filename: previous.map(str::to_string),
            })
        };
        assert_eq!(make("added", None).diff.change, FileChange::Added);
        assert_eq!(make("removed", None).diff.change, FileChange::Deleted);
        let renamed = make("renamed", Some("old.txt"));
        assert_eq!(renamed.diff.change, FileChange::Renamed);
        assert_eq!(renamed.previous_path.as_deref(), Some("old.txt"));
        assert_eq!(renamed.diff.old_path.as_deref(), Some("old.txt"));
    }

    #[test]
    fn files_without_a_patch_are_too_large_or_empty() {
        let big = convert_file(RawPullFile {
            filename: "huge.json".into(),
            status: "modified".into(),
            additions: 5000,
            deletions: 0,
            changes: 5000,
            patch: None,
            previous_filename: None,
        });
        assert!(big.diff.too_large);

        let moved = convert_file(RawPullFile {
            filename: "b.txt".into(),
            status: "renamed".into(),
            additions: 0,
            deletions: 0,
            changes: 0,
            patch: None,
            previous_filename: Some("a.txt".into()),
        });
        assert!(!moved.diff.too_large);
        assert!(moved.diff.hunks.is_empty());
    }

    #[test]
    fn choices_are_validated_before_any_request() {
        assert!(ensure_choice("open", &["open", "closed", "all"], "state").is_ok());
        assert!(ensure_choice("merged", &["open", "closed", "all"], "state").is_err());
    }
}
