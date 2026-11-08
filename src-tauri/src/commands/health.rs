use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git::runner::{git, git_streaming, git_unchecked, git_with_input};
use crate::git::validate::ensure_relative_path;
use crate::jobs::CancelToken;
use crate::state::AppState;

const TOP_BLOBS: usize = 20;
const MAX_SPARSE_FOLDERS: usize = 500;
const SUMMARY_LINES: usize = 12;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectCounts {
    pub loose_objects: u64,
    pub loose_bytes: u64,
    pub packed_objects: u64,
    pub packs: u64,
    pub pack_bytes: u64,
    pub prunable_objects: u64,
    pub garbage_files: u64,
    pub garbage_bytes: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefCounts {
    pub loose_refs: u64,
    pub packed_refs: u64,
    pub branches: u64,
    pub unmerged_branches: u64,
    pub stashes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeReport {
    pub git_dir: String,
    pub git_dir_bytes: u64,
    pub objects: ObjectCounts,
    pub refs: RefCounts,
    pub shallow: bool,
    pub partial: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeBlob {
    pub hash: String,
    pub size: u64,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SparseState {
    pub enabled: bool,
    pub cone: bool,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceReport {
    pub before: ObjectCounts,
    pub after: ObjectCounts,
    pub git_dir_before: u64,
    pub git_dir_after: u64,
    pub summary: Vec<String>,
}

pub fn parse_count_objects(output: &str) -> ObjectCounts {
    let mut counts = ObjectCounts::default();
    for line in output.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let number: u64 = value.trim().parse().unwrap_or(0);
        match key.trim() {
            "count" => counts.loose_objects = number,
            "size" => counts.loose_bytes = number * 1024,
            "in-pack" => counts.packed_objects = number,
            "packs" => counts.packs = number,
            "size-pack" => counts.pack_bytes = number * 1024,
            "prune-packable" => counts.prunable_objects = number,
            "garbage" => counts.garbage_files = number,
            "size-garbage" => counts.garbage_bytes = number * 1024,
            _ => {}
        }
    }
    counts
}

pub fn parse_batch_check(output: &str) -> Vec<LargeBlob> {
    let mut seen = HashSet::new();
    let mut blobs: Vec<LargeBlob> = Vec::new();
    for line in output.lines() {
        let mut parts = line.splitn(4, ' ');
        let (Some(kind), Some(hash), Some(size)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if kind != "blob" {
            continue;
        }
        let Ok(size) = size.parse::<u64>() else {
            continue;
        };
        if !seen.insert(hash.to_string()) {
            continue;
        }
        blobs.push(LargeBlob {
            hash: hash.to_string(),
            size,
            path: parts.next().unwrap_or("").to_string(),
        });
    }
    blobs.sort_by(|left, right| {
        right
            .size
            .cmp(&left.size)
            .then_with(|| left.path.cmp(&right.path))
    });
    blobs.truncate(TOP_BLOBS);
    blobs
}

pub fn count_packed_refs(content: &str) -> u64 {
    content
        .lines()
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('^'))
        .count() as u64
}

pub fn summarize(output: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in output.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let key = line.split(':').next().unwrap_or(line).to_string();
        if let Some(last) = lines.last() {
            if last.split(':').next().unwrap_or(last) == key {
                lines.pop();
            }
        }
        lines.push(line.to_string());
    }
    let skip = lines.len().saturating_sub(SUMMARY_LINES);
    lines.split_off(skip)
}

fn normalize_folder(value: &str) -> AppResult<String> {
    let folder = value.trim().replace('\\', "/");
    let folder = folder.trim_matches('/').to_string();
    ensure_relative_path(&folder)?;
    if folder
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(AppError::invalid_input(format!("invalid path: {value}")));
    }
    Ok(folder)
}

pub fn normalize_folders(values: &[String]) -> AppResult<Vec<String>> {
    if values.is_empty() || values.len() > MAX_SPARSE_FOLDERS {
        return Err(AppError::invalid_input("invalid folder list"));
    }
    let mut seen = HashSet::new();
    let mut folders = Vec::new();
    for value in values {
        let folder = normalize_folder(value)?;
        if seen.insert(folder.clone()) {
            folders.push(folder);
        }
    }
    Ok(folders)
}

fn directory_size(path: &Path) -> u64 {
    let mut total = 0;
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                pending.push(entry.path());
            } else if kind.is_file() {
                total += entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            }
        }
    }
    total
}

fn count_files(path: &Path) -> u64 {
    let mut total = 0;
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => pending.push(entry.path()),
                Ok(kind) if kind.is_file() => total += 1,
                _ => {}
            }
        }
    }
    total
}

async fn measure(path: PathBuf) -> u64 {
    tokio::task::spawn_blocking(move || directory_size(&path))
        .await
        .unwrap_or(0)
}

pub async fn git_dir(repo: &Path) -> AppResult<PathBuf> {
    let output = git(
        repo,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .await?;
    Ok(PathBuf::from(output.trimmed()))
}

async fn object_counts(repo: &Path) -> AppResult<ObjectCounts> {
    let output = git(repo, &["count-objects", "-v"]).await?;
    Ok(parse_count_objects(&output.text()))
}

async fn line_count(repo: &Path, args: &[&str]) -> AppResult<u64> {
    let output = git_unchecked(repo, args).await?;
    if !output.success() {
        return Ok(0);
    }
    Ok(output
        .text()
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u64)
}

async fn config_flag(repo: &Path, key: &str) -> AppResult<bool> {
    let output = git_unchecked(repo, &["config", "--bool", key]).await?;
    Ok(output.success() && output.trimmed() == "true")
}

pub async fn size_report(repo: &Path) -> AppResult<SizeReport> {
    let directory = git_dir(repo).await?;
    let objects = object_counts(repo).await?;
    let refs_directory = directory.join("refs");
    let loose_refs = tokio::task::spawn_blocking(move || count_files(&refs_directory))
        .await
        .unwrap_or(0);
    let packed_refs = std::fs::read_to_string(directory.join("packed-refs"))
        .map(|content| count_packed_refs(&content))
        .unwrap_or(0);
    let has_head = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"])
        .await?
        .success();
    let unmerged_branches = if has_head {
        line_count(
            repo,
            &["branch", "--no-merged", "HEAD", "--format=%(refname:short)"],
        )
        .await?
    } else {
        0
    };
    let refs = RefCounts {
        loose_refs,
        packed_refs,
        branches: line_count(repo, &["for-each-ref", "--format=%(refname)", "refs/heads"]).await?,
        unmerged_branches,
        stashes: line_count(repo, &["reflog", "show", "--format=%H", "refs/stash", "--"]).await?,
    };
    let shallow = directory.join("shallow").is_file();
    let partial = !git_unchecked(repo, &["config", "--get-regexp", r"^remote\..*\.promisor$"])
        .await?
        .trimmed()
        .is_empty();
    Ok(SizeReport {
        git_dir: directory.to_string_lossy().into_owned(),
        git_dir_bytes: measure(directory).await,
        objects,
        refs,
        shallow,
        partial,
    })
}

pub async fn largest_blobs(repo: &Path, cancel: CancelToken) -> AppResult<Vec<LargeBlob>> {
    let listing = git_streaming(
        Some(repo),
        &["rev-list", "--objects", "--all"],
        cancel.clone(),
        &|_| {},
    )
    .await?;
    if listing.stdout.is_empty() {
        return Ok(Vec::new());
    }
    let mut token = cancel;
    let check = git_with_input(
        repo,
        &[
            "cat-file",
            "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)",
        ],
        listing.stdout,
    );
    let output = tokio::select! {
        biased;
        _ = token.cancelled() => return Err(AppError::cancelled()),
        output = check => output?,
    };
    let text = output.text();
    tokio::task::spawn_blocking(move || parse_batch_check(&text))
        .await
        .map_err(|error| AppError::invalid_input(error.to_string()))
}

pub async fn sparse_state(repo: &Path) -> AppResult<SparseState> {
    let enabled = config_flag(repo, "core.sparseCheckout").await?;
    if !enabled {
        return Ok(SparseState {
            enabled: false,
            cone: false,
            folders: Vec::new(),
        });
    }
    let cone = config_flag(repo, "core.sparseCheckoutCone").await?;
    let output = git_unchecked(repo, &["sparse-checkout", "list"]).await?;
    let folders = if output.success() {
        output
            .text()
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect()
    } else {
        Vec::new()
    };
    Ok(SparseState {
        enabled,
        cone,
        folders,
    })
}

pub async fn sparse_set(repo: &Path, folders: &[String]) -> AppResult<SparseState> {
    let folders = normalize_folders(folders)?;
    let mut input = folders.join("\n");
    input.push('\n');
    git_with_input(
        repo,
        &["sparse-checkout", "set", "--cone", "--stdin"],
        input.into_bytes(),
    )
    .await?;
    sparse_state(repo).await
}

pub async fn sparse_disable(repo: &Path) -> AppResult<SparseState> {
    git(repo, &["sparse-checkout", "disable"]).await?;
    sparse_state(repo).await
}

pub async fn run_maintenance(repo: &Path, cancel: CancelToken) -> AppResult<MaintenanceReport> {
    let directory = git_dir(repo).await?;
    let before = object_counts(repo).await?;
    let git_dir_before = measure(directory.clone()).await;
    let output = git_streaming(
        Some(repo),
        &["maintenance", "run", "--task=gc"],
        cancel,
        &|_| {},
    )
    .await?;
    let after = object_counts(repo).await?;
    let git_dir_after = measure(directory).await;
    let mut text = output.text();
    text.push('\n');
    text.push_str(&output.stderr);
    Ok(MaintenanceReport {
        before,
        after,
        git_dir_before,
        git_dir_after,
        summary: summarize(&text),
    })
}

#[tauri::command]
pub async fn health_size(repo_path: String) -> AppResult<SizeReport> {
    size_report(Path::new(&repo_path)).await
}

#[tauri::command]
pub async fn health_large_blobs(
    state: State<'_, AppState>,
    repo_path: String,
    job_id: String,
) -> AppResult<Vec<LargeBlob>> {
    let guard = state.jobs.register(&job_id);
    largest_blobs(Path::new(&repo_path), guard.token()).await
}

#[tauri::command]
pub async fn health_maintenance(
    state: State<'_, AppState>,
    repo_path: String,
    job_id: String,
) -> AppResult<MaintenanceReport> {
    let guard = state.jobs.register(&job_id);
    run_maintenance(Path::new(&repo_path), guard.token()).await
}

#[tauri::command]
pub async fn health_sparse_state(repo_path: String) -> AppResult<SparseState> {
    sparse_state(Path::new(&repo_path)).await
}

#[tauri::command]
pub async fn health_sparse_set(repo_path: String, folders: Vec<String>) -> AppResult<SparseState> {
    sparse_set(Path::new(&repo_path), &folders).await
}

#[tauri::command]
pub async fn health_sparse_disable(repo_path: String) -> AppResult<SparseState> {
    sparse_disable(Path::new(&repo_path)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_objects_values_become_bytes() {
        let counts = parse_count_objects(
            "count: 12\nsize: 48\nin-pack: 300\npacks: 2\nsize-pack: 1024\nprune-packable: 1\ngarbage: 0\nsize-garbage: 0\n",
        );
        assert_eq!(counts.loose_objects, 12);
        assert_eq!(counts.loose_bytes, 48 * 1024);
        assert_eq!(counts.packed_objects, 300);
        assert_eq!(counts.packs, 2);
        assert_eq!(counts.pack_bytes, 1024 * 1024);
        assert_eq!(counts.prunable_objects, 1);
    }

    #[test]
    fn batch_check_keeps_blobs_only_once_and_largest_first() {
        let output = "commit c1 250 \ntree t1 90 \nblob b1 10 small.txt\nblob b2 5000 big file.bin\nblob b1 10 copy/small.txt\nblob b3 70 \n";
        let blobs = parse_batch_check(output);
        assert_eq!(blobs.len(), 3);
        assert_eq!(blobs[0].path, "big file.bin");
        assert_eq!(blobs[0].size, 5000);
        assert_eq!(blobs[2].path, "small.txt");
        assert_eq!(blobs[1].path, "");
    }

    #[test]
    fn packed_refs_skip_the_header_and_peeled_lines() {
        let content = "# pack-refs with: peeled fully-peeled sorted\nabc refs/heads/main\nabd refs/tags/v1\n^abe\n";
        assert_eq!(count_packed_refs(content), 2);
    }

    #[test]
    fn the_summary_keeps_only_the_last_state_of_each_progress_line() {
        let output = "Enumerating objects: 1\nEnumerating objects: 9, done.\nCounting objects: 50% (1/2)\nCounting objects: 100% (2/2), done.\n\n";
        assert_eq!(
            summarize(output),
            vec![
                "Enumerating objects: 9, done.".to_string(),
                "Counting objects: 100% (2/2), done.".to_string()
            ]
        );
    }

    #[test]
    fn folders_are_normalized_and_unsafe_ones_refused() {
        let folders = normalize_folders(&[
            "src\\app/".to_string(),
            "/docs".to_string(),
            "src/app".to_string(),
        ])
        .expect("folders");
        assert_eq!(folders, vec!["src/app".to_string(), "docs".to_string()]);
        assert!(normalize_folders(&["../outside".to_string()]).is_err());
        assert!(normalize_folders(&["a//b".to_string()]).is_err());
        assert!(normalize_folders(&["".to_string()]).is_err());
        assert!(normalize_folders(&[]).is_err());
    }
}
