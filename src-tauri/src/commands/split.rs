use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::commands::rescue::guard_worktree;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked, git_with_env};
use crate::git::validate::{ensure_commit_hash, ensure_relative_path};

fn invalid(text: &str) -> AppError {
    AppError::invalid_input(text)
}

async fn changed_files(repo: &Path, hash: &str) -> AppResult<Vec<String>> {
    let output = git(
        repo,
        &[
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            "-z",
            "--root",
            "--no-renames",
            hash,
        ],
    )
    .await?;
    Ok(output
        .text()
        .split('\0')
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect())
}

async fn ensure_splittable(repo: &Path, hash: &str) -> AppResult<()> {
    let in_history = git_unchecked(repo, &["merge-base", "--is-ancestor", hash, "HEAD"]).await?;
    if !in_history.success() {
        return Err(invalid("the commit is not part of the current branch"));
    }
    let parents = git(repo, &["rev-list", "--parents", "-n", "1", hash]).await?;
    if parents.trimmed().split_whitespace().count() > 2 {
        return Err(invalid("merge commits cannot be split"));
    }
    let published = git(
        repo,
        &["rev-list", "--max-count=1", hash, "--not", "--remotes"],
    )
    .await?;
    if published.trimmed().is_empty() {
        return Err(AppError::new(
            ErrorKind::InvalidInput,
            "the commit is already published",
        ));
    }
    let between = git(
        repo,
        &["rev-list", "--merges", "--count", &format!("{hash}..HEAD")],
    )
    .await?;
    if between.trimmed() != "0" {
        return Err(invalid("there are merge commits after this one"));
    }
    Ok(())
}

pub async fn split_files(repo: &Path, hash: &str) -> AppResult<Vec<String>> {
    ensure_commit_hash(hash)?;
    ensure_splittable(repo, hash).await?;
    changed_files(repo, hash).await
}

fn temporary_index(directory: &Path) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    directory.join(format!("githubdesk-split-{stamp}.index"))
}

pub async fn split_commit(
    repo: &Path,
    hash: &str,
    first_paths: &[String],
    first_message: &str,
    second_message: &str,
) -> AppResult<()> {
    ensure_commit_hash(hash)?;
    for path in first_paths {
        ensure_relative_path(path)?;
    }
    if first_message.trim().is_empty() || second_message.trim().is_empty() {
        return Err(AppError::new(
            ErrorKind::EmptyCommitMessage,
            "empty message",
        ));
    }
    ensure_splittable(repo, hash).await?;
    let files = changed_files(repo, hash).await?;
    let chosen: HashSet<&String> = first_paths.iter().collect();
    if chosen.is_empty()
        || chosen.len() >= files.len()
        || !chosen.iter().all(|path| files.contains(*path))
    {
        return Err(invalid(
            "choose some, but not all, of the files changed by the commit",
        ));
    }

    let head = git(repo, &["rev-parse", "--verify", "HEAD"])
        .await?
        .trimmed();
    guard_worktree(repo, "split").await;

    let parent_probe =
        git_unchecked(repo, &["rev-parse", "--verify", "-q", &format!("{hash}^")]).await?;
    let parent = parent_probe.success().then(|| parent_probe.trimmed());
    let git_dir = PathBuf::from(
        git(repo, &["rev-parse", "--absolute-git-dir"])
            .await?
            .trimmed(),
    );
    let index = temporary_index(&git_dir);
    let index_text = index.to_string_lossy().into_owned();
    let env = [("GIT_INDEX_FILE", index_text.as_str())];

    let built = async {
        match &parent {
            Some(parent) => git_with_env(repo, &["read-tree", parent], &env).await?,
            None => git_with_env(repo, &["read-tree", "--empty"], &env).await?,
        };
        for path in first_paths {
            let listing = git(repo, &["ls-tree", "-r", "-z", hash, "--", path]).await?;
            let text = listing.text();
            match text.split('\0').find(|entry| !entry.is_empty()) {
                Some(entry) => {
                    let (meta, _) = entry
                        .split_once('\t')
                        .ok_or_else(|| invalid("unreadable tree entry"))?;
                    let fields: Vec<&str> = meta.split(' ').collect();
                    if fields.len() < 3 {
                        return Err(invalid("unreadable tree entry"));
                    }
                    let cacheinfo = format!("{},{},{}", fields[0], fields[2], path);
                    git_with_env(
                        repo,
                        &["update-index", "--add", "--cacheinfo", &cacheinfo],
                        &env,
                    )
                    .await?;
                }
                None => {
                    git_with_env(repo, &["update-index", "--force-remove", "--", path], &env)
                        .await?;
                }
            }
        }
        Ok::<String, AppError>(git_with_env(repo, &["write-tree"], &env).await?.trimmed())
    }
    .await;
    let _ = tokio::fs::remove_file(&index).await;
    let first_tree = built?;

    let author = git(repo, &["show", "-s", "--format=%an%x1f%ae%x1f%aI", hash])
        .await?
        .trimmed();
    let mut author_parts = author.split('\u{1f}');
    let name = author_parts.next().unwrap_or("GithubDesk").to_string();
    let email = author_parts
        .next()
        .unwrap_or("rescue@githubdesk.local")
        .to_string();
    let date = author_parts.next().unwrap_or_default().to_string();
    let commit_env = [
        ("GIT_AUTHOR_NAME", name.as_str()),
        ("GIT_AUTHOR_EMAIL", email.as_str()),
        ("GIT_AUTHOR_DATE", date.as_str()),
    ];
    let second_tree = git(repo, &["rev-parse", &format!("{hash}^{{tree}}")])
        .await?
        .trimmed();

    let mut first_args = vec![
        "commit-tree",
        first_tree.as_str(),
        "-m",
        first_message.trim(),
    ];
    let parent_text = parent.clone().unwrap_or_default();
    if parent.is_some() {
        first_args.extend(["-p", parent_text.as_str()]);
    }
    let first = git_with_env(repo, &first_args, &commit_env)
        .await?
        .trimmed();
    let second = git_with_env(
        repo,
        &[
            "commit-tree",
            &second_tree,
            "-p",
            &first,
            "-m",
            second_message.trim(),
        ],
        &commit_env,
    )
    .await?
    .trimmed();

    if hash == head {
        git(
            repo,
            &["update-ref", "-m", "split commit", "HEAD", &second, &head],
        )
        .await?;
        return Ok(());
    }
    let env = [("GIT_EDITOR", "true")];
    git_with_env(
        repo,
        &["rebase", "--autostash", "--onto", &second, hash],
        &env,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn split_commit_files(path: String, hash: String) -> AppResult<Vec<String>> {
    split_files(Path::new(&path), &hash).await
}

#[tauri::command]
pub async fn split_commit_run(
    path: String,
    hash: String,
    first_paths: Vec<String>,
    first_message: String,
    second_message: String,
) -> AppResult<()> {
    split_commit(
        Path::new(&path),
        &hash,
        &first_paths,
        &first_message,
        &second_message,
    )
    .await
}
