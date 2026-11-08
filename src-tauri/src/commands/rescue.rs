use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked, git_with_env, git_with_input_unchecked};
use crate::git::validate::{ensure_commit_hash, ensure_valid_branch_name};

pub const RESCUE_NAMESPACE: &str = "refs/githubdesk/rescue/";
pub const MAX_SNAPSHOTS: usize = 50;
pub const MAX_AGE_DAYS: i64 = 30;
const MAX_PATCH_BYTES: usize = 300_000;
const COMMIT_KINDS: [&str; 2] = ["branch-delete", "stash-drop"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RescueKind {
    Snapshot,
    Commit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RescueEntry {
    pub id: String,
    pub reason: String,
    pub label: Option<String>,
    pub kind: RescueKind,
    pub hash: String,
    pub created_at: i64,
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RescueFile {
    pub path: String,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RescueDetail {
    pub entry: RescueEntry,
    pub files: Vec<RescueFile>,
    pub patch: String,
    pub truncated: bool,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(0))
        .unwrap_or(0)
}

fn sanitize(text: &str) -> String {
    let cleaned: String = text
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    cleaned.trim_matches('-').to_string()
}

fn sanitize_label(text: &str) -> String {
    text.split('/')
        .map(|part| {
            part.chars()
                .map(|character| {
                    if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                        character
                    } else {
                        '-'
                    }
                })
                .collect::<String>()
                .trim_matches('-')
                .to_string()
        })
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn ensure_rescue_id(id: &str) -> AppResult<()> {
    let valid = !id.is_empty()
        && id.len() <= 200
        && id
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_digit())
        && id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '/')
        })
        && !id.contains("//")
        && !id.ends_with('/');
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input("invalid rescue entry"))
    }
}

fn parse_id(id: &str) -> Option<(i64, String, Option<String>)> {
    let (head, label) = match id.split_once('/') {
        Some((head, label)) => (head, Some(label.to_string())),
        None => (id, None),
    };
    let (millis, reason) = head.split_once('-')?;
    Some((millis.parse().ok()?, reason.to_string(), label))
}

fn kind_of(reason: &str) -> RescueKind {
    if COMMIT_KINDS.contains(&reason) {
        RescueKind::Commit
    } else {
        RescueKind::Snapshot
    }
}

async fn git_dir(repo: &Path) -> AppResult<PathBuf> {
    let output = git(repo, &["rev-parse", "--absolute-git-dir"]).await?;
    Ok(PathBuf::from(output.trimmed()))
}

async fn current_branch(repo: &Path) -> String {
    match git_unchecked(repo, &["symbolic-ref", "--short", "-q", "HEAD"]).await {
        Ok(output) if output.success() => output.trimmed(),
        _ => "(detached)".to_string(),
    }
}

fn identity_env() -> [(&'static str, &'static str); 4] {
    [
        ("GIT_AUTHOR_NAME", "GithubDesk"),
        ("GIT_AUTHOR_EMAIL", "rescue@githubdesk.local"),
        ("GIT_COMMITTER_NAME", "GithubDesk"),
        ("GIT_COMMITTER_EMAIL", "rescue@githubdesk.local"),
    ]
}

async fn unique_ref(repo: &Path, reason: &str, label: Option<&str>) -> AppResult<(String, String)> {
    let mut millis = now_millis();
    loop {
        let mut id = format!("{millis}-{reason}");
        if let Some(label) = label.filter(|label| !label.is_empty()) {
            id.push('/');
            id.push_str(label);
        }
        let reference = format!("{RESCUE_NAMESPACE}{id}");
        let probe = git_unchecked(repo, &["rev-parse", "--verify", "-q", &reference]).await?;
        let nested = git_unchecked(
            repo,
            &[
                "for-each-ref",
                "--count=1",
                "--format=%(refname)",
                &format!("{reference}/"),
            ],
        )
        .await?;
        if !probe.success() && nested.trimmed().is_empty() {
            return Ok((id, reference));
        }
        millis += 1;
    }
}

pub async fn snapshot_worktree(repo: &Path, reason: &str) -> AppResult<Option<String>> {
    let head = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"]).await?;
    if !head.success() {
        return Ok(None);
    }
    let head_hash = head.trimmed();
    let directory = git_dir(repo).await?;
    let temporary = directory.join(format!("githubdesk-rescue-{}.index", now_millis()));
    let real_index = git(repo, &["rev-parse", "--git-path", "index"])
        .await?
        .trimmed();
    let real_index_path = if Path::new(&real_index).is_absolute() {
        PathBuf::from(&real_index)
    } else {
        repo.join(&real_index)
    };
    let temporary_text = temporary.to_string_lossy().into_owned();
    let env = [("GIT_INDEX_FILE", temporary_text.as_str())];

    let outcome = async {
        if real_index_path.exists() {
            tokio::fs::copy(&real_index_path, &temporary).await?;
        } else {
            git_with_env(repo, &["read-tree", "HEAD"], &env).await?;
        }
        git_with_env(repo, &["add", "-A", "--", "."], &env).await?;
        let tree = git_with_env(repo, &["write-tree"], &env).await?.trimmed();
        Ok::<String, AppError>(tree)
    }
    .await;
    let _ = tokio::fs::remove_file(&temporary).await;
    let tree = outcome?;

    let head_tree = git(repo, &["rev-parse", "HEAD^{tree}"]).await?.trimmed();
    if tree == head_tree {
        return Ok(None);
    }
    let branch = current_branch(repo).await;
    let message = format!("rescue: {reason}\n\nbranch: {branch}\n");
    let commit = git_with_env(
        repo,
        &["commit-tree", &tree, "-p", &head_hash, "-m", &message],
        &identity_env(),
    )
    .await?
    .trimmed();
    let reason_clean = sanitize(reason);
    let (id, reference) = unique_ref(repo, &reason_clean, None).await?;
    git(repo, &["update-ref", &reference, &commit]).await?;
    let _ = prune(repo).await;
    Ok(Some(id))
}

pub async fn save_commit(
    repo: &Path,
    hash: &str,
    reason: &str,
    label: &str,
) -> AppResult<Option<String>> {
    ensure_commit_hash(hash)?;
    let resolved = git_unchecked(
        repo,
        &["rev-parse", "--verify", "-q", &format!("{hash}^{{commit}}")],
    )
    .await?;
    if !resolved.success() {
        return Ok(None);
    }
    let reason_clean = sanitize(reason);
    let label_clean = sanitize_label(label);
    let (id, reference) = unique_ref(repo, &reason_clean, Some(&label_clean)).await?;
    git(repo, &["update-ref", &reference, &resolved.trimmed()]).await?;
    let _ = prune(repo).await;
    Ok(Some(id))
}

async fn numstat(repo: &Path, parent: &str, commit: &str) -> (u32, u32, u32, Vec<RescueFile>) {
    let output = git_unchecked(
        repo,
        &["diff", "--numstat", "-z", "--no-renames", parent, commit],
    )
    .await;
    let Ok(output) = output else {
        return (0, 0, 0, Vec::new());
    };
    if !output.success() {
        return (0, 0, 0, Vec::new());
    }
    let mut files = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;
    for record in output
        .text()
        .split('\0')
        .filter(|record| !record.is_empty())
    {
        let mut parts = record.splitn(3, '\t');
        let (Some(added), Some(removed), Some(path)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let added_number = added.parse::<u32>().ok();
        let removed_number = removed.parse::<u32>().ok();
        additions += added_number.unwrap_or(0);
        deletions += removed_number.unwrap_or(0);
        files.push(RescueFile {
            path: path.to_string(),
            additions: added_number,
            deletions: removed_number,
        });
    }
    let count = u32::try_from(files.len()).unwrap_or(u32::MAX);
    (count, additions, deletions, files)
}

async fn entry_for(
    repo: &Path,
    id: &str,
    hash: &str,
    parent: &str,
) -> Option<(RescueEntry, Vec<RescueFile>)> {
    let (created_at, reason, label) = parse_id(id)?;
    let (files, additions, deletions, list) = if parent.is_empty() {
        (0, 0, 0, Vec::new())
    } else {
        numstat(repo, parent, hash).await
    };
    Some((
        RescueEntry {
            id: id.to_string(),
            kind: kind_of(&reason),
            reason,
            label,
            hash: hash.to_string(),
            created_at: created_at / 1000,
            files,
            additions,
            deletions,
        },
        list,
    ))
}

pub async fn list_entries(repo: &Path) -> AppResult<Vec<RescueEntry>> {
    let output = git_unchecked(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(objectname)%1f%(parent)",
            RESCUE_NAMESPACE,
        ],
    )
    .await?;
    if !output.success() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for line in output.text().lines() {
        let mut fields = line.split('\u{1f}');
        let (Some(reference), Some(hash), parent) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let Some(id) = reference.strip_prefix(RESCUE_NAMESPACE) else {
            continue;
        };
        let parent = parent
            .unwrap_or_default()
            .split_whitespace()
            .next()
            .unwrap_or_default();
        if let Some((entry, _)) = entry_for(repo, id, hash, parent).await {
            entries.push(entry);
        }
    }
    entries.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then(right.id.cmp(&left.id))
    });
    Ok(entries)
}

async fn find_entry(repo: &Path, id: &str) -> AppResult<(RescueEntry, String)> {
    ensure_rescue_id(id)?;
    let reference = format!("{RESCUE_NAMESPACE}{id}");
    let output = git_unchecked(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(objectname)%1f%(parent)",
            &reference,
        ],
    )
    .await?;
    let text = output.text();
    let exact = text
        .lines()
        .find(|line| line.split('\u{1f}').next() == Some(reference.as_str()))
        .unwrap_or_default();
    let mut fields = exact.split('\u{1f}').skip(1);
    let hash = fields.next().unwrap_or_default();
    if hash.is_empty() {
        return Err(AppError::invalid_input("the rescue entry does not exist"));
    }
    let parent = fields
        .next()
        .unwrap_or_default()
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();
    let (entry, _) = entry_for(repo, id, hash, &parent)
        .await
        .ok_or_else(|| AppError::invalid_input("the rescue entry is not valid"))?;
    Ok((entry, parent))
}

pub async fn preview(repo: &Path, id: &str) -> AppResult<RescueDetail> {
    let (entry, parent) = find_entry(repo, id).await?;
    if parent.is_empty() {
        return Ok(RescueDetail {
            entry,
            files: Vec::new(),
            patch: String::new(),
            truncated: false,
        });
    }
    let (_, _, _, files) = numstat(repo, &parent, &entry.hash).await;
    let output = git(
        repo,
        &["diff", "--no-color", "--no-renames", &parent, &entry.hash],
    )
    .await?;
    let mut patch = output.text();
    let truncated = patch.len() > MAX_PATCH_BYTES;
    if truncated {
        let mut cut = MAX_PATCH_BYTES;
        while !patch.is_char_boundary(cut) {
            cut -= 1;
        }
        patch.truncate(cut);
    }
    Ok(RescueDetail {
        entry,
        files,
        patch,
        truncated,
    })
}

pub async fn restore(repo: &Path, id: &str) -> AppResult<()> {
    let (entry, parent) = find_entry(repo, id).await?;
    if entry.kind != RescueKind::Snapshot || parent.is_empty() {
        return Err(AppError::invalid_input(
            "only saved working changes can be applied; create a branch instead",
        ));
    }
    let patch = git(
        repo,
        &[
            "diff",
            "--binary",
            "--full-index",
            "--no-renames",
            &parent,
            &entry.hash,
        ],
    )
    .await?
    .stdout;
    let _ = snapshot_worktree(repo, "before-restore").await;

    let plain =
        git_with_input_unchecked(repo, &["apply", "--whitespace=nowarn", "-"], patch.clone())
            .await?;
    if plain.success() {
        return Ok(());
    }
    let merged = git_with_input_unchecked(
        repo,
        &["apply", "--3way", "--whitespace=nowarn", "-"],
        patch,
    )
    .await?;
    if merged.success() {
        return Ok(());
    }
    Err(AppError::new(
        ErrorKind::PatchNotApplicable,
        merged.stderr.trim().to_string(),
    ))
}

pub async fn branch_from(repo: &Path, id: &str, name: &str) -> AppResult<()> {
    let (entry, _) = find_entry(repo, id).await?;
    ensure_valid_branch_name(repo, name).await?;
    git(repo, &["branch", name.trim(), &entry.hash]).await?;
    Ok(())
}

pub async fn delete_entry(repo: &Path, id: &str) -> AppResult<()> {
    ensure_rescue_id(id)?;
    let reference = format!("{RESCUE_NAMESPACE}{id}");
    git(repo, &["update-ref", "-d", &reference]).await?;
    Ok(())
}

pub async fn prune(repo: &Path) -> AppResult<u32> {
    let entries = list_entries(repo).await?;
    let cutoff = now_millis() / 1000 - MAX_AGE_DAYS * 24 * 60 * 60;
    let mut removed = 0;
    for (position, entry) in entries.iter().enumerate() {
        if position >= MAX_SNAPSHOTS || entry.created_at < cutoff {
            delete_entry(repo, &entry.id).await?;
            removed += 1;
        }
    }
    Ok(removed)
}

pub async fn guard_worktree(repo: &Path, reason: &str) {
    let _ = snapshot_worktree(repo, reason).await;
}

pub async fn guard_branch(repo: &Path, name: &str) {
    let reference = format!("refs/heads/{}", name.trim());
    let Ok(output) = git_unchecked(repo, &["rev-parse", "--verify", "-q", &reference]).await else {
        return;
    };
    if output.success() {
        let _ = save_commit(repo, &output.trimmed(), "branch-delete", name).await;
    }
}

pub async fn guard_stash(repo: &Path, hash: &str) {
    let _ = save_commit(repo, hash, "stash-drop", "").await;
}

#[tauri::command]
pub async fn rescue_list(path: String) -> AppResult<Vec<RescueEntry>> {
    list_entries(Path::new(&path)).await
}

#[tauri::command]
pub async fn rescue_preview(path: String, id: String) -> AppResult<RescueDetail> {
    preview(Path::new(&path), &id).await
}

#[tauri::command]
pub async fn rescue_restore(path: String, id: String) -> AppResult<()> {
    restore(Path::new(&path), &id).await
}

#[tauri::command]
pub async fn rescue_branch(path: String, id: String, name: String) -> AppResult<()> {
    branch_from(Path::new(&path), &id, &name).await
}

#[tauri::command]
pub async fn rescue_delete(path: String, id: String) -> AppResult<()> {
    delete_entry(Path::new(&path), &id).await
}

#[tauri::command]
pub async fn rescue_snapshot(path: String, reason: String) -> AppResult<Option<String>> {
    snapshot_worktree(Path::new(&path), &reason).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_read_back_into_time_reason_and_label() {
        assert_eq!(
            parse_id("1700000000000-discard"),
            Some((1_700_000_000_000, "discard".to_string(), None))
        );
        assert_eq!(
            parse_id("1700000000000-branch-delete/feature/x"),
            Some((
                1_700_000_000_000,
                "branch-delete".to_string(),
                Some("feature/x".to_string())
            ))
        );
        assert_eq!(parse_id("abc"), None);
    }

    #[test]
    fn unsafe_ids_are_refused() {
        assert!(ensure_rescue_id("1700000000000-discard").is_ok());
        assert!(ensure_rescue_id("../x").is_err());
        assert!(ensure_rescue_id("1-a b").is_err());
        assert!(ensure_rescue_id("1-a//b").is_err());
        assert!(ensure_rescue_id("").is_err());
        assert!(ensure_rescue_id("1-a/").is_err());
    }

    #[test]
    fn labels_and_reasons_keep_only_safe_characters() {
        assert_eq!(sanitize("Reset Hard!"), "reset-hard");
        assert_eq!(sanitize_label("feature/new idea"), "feature/new-idea");
        assert_eq!(sanitize_label("//"), "");
    }

    #[test]
    fn only_branch_and_stash_saves_are_commit_kinds() {
        assert_eq!(kind_of("branch-delete"), RescueKind::Commit);
        assert_eq!(kind_of("stash-drop"), RescueKind::Commit);
        assert_eq!(kind_of("discard"), RescueKind::Snapshot);
    }
}
