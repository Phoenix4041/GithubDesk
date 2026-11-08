use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::ensure_relative_path;

const PROTECTED_BRANCHES: [&str; 6] = ["main", "master", "develop", "development", "trunk", "dev"];
const MAX_REQUEST_ITEMS: usize = 5000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupFile {
    pub path: String,
    pub directory: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupBranch {
    pub name: String,
    pub hash: String,
    pub unique_commits: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPreview {
    pub untracked: Vec<CleanupFile>,
    pub ignored: Vec<CleanupFile>,
    pub merged_branches: Vec<CleanupBranch>,
    pub gone_branches: Vec<CleanupBranch>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaleRemoteBranch {
    pub remote: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRequest {
    pub untracked: Vec<String>,
    pub ignored: Vec<String>,
    pub merged_branches: Vec<String>,
    pub gone_branches: Vec<String>,
    pub prune_remotes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedBranch {
    pub name: String,
    pub hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupFailure {
    pub item: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupReport {
    pub removed_files: u32,
    pub deleted_branches: Vec<DeletedBranch>,
    pub pruned_branches: u32,
    pub failures: Vec<CleanupFailure>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LocalBranch {
    name: String,
    hash: String,
    gone: bool,
    in_use: bool,
}

pub fn parse_status_entries(output: &str) -> (Vec<CleanupFile>, Vec<CleanupFile>) {
    let mut untracked = Vec::new();
    let mut ignored = Vec::new();
    for entry in output.split('\0') {
        let (Some(marker), Some(path)) = (entry.get(..3), entry.get(3..)) else {
            continue;
        };
        let directory = path.ends_with('/');
        let path = path.trim_end_matches('/');
        if path.is_empty() {
            continue;
        }
        let file = CleanupFile {
            path: path.to_string(),
            directory,
        };
        match marker {
            "?? " => untracked.push(file),
            "!! " => ignored.push(file),
            _ => {}
        }
    }
    (untracked, ignored)
}

fn parse_branches(output: &str) -> Vec<LocalBranch> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\t');
            let name = fields.next()?.trim();
            let hash = fields.next()?.trim();
            let track = fields.next().unwrap_or_default();
            let worktree = fields.next().unwrap_or_default().trim();
            let current = fields.next().unwrap_or_default().trim() == "*";
            if name.is_empty() || hash.is_empty() {
                return None;
            }
            Some(LocalBranch {
                name: name.to_string(),
                hash: hash.to_string(),
                gone: track.contains("gone"),
                in_use: current || !worktree.is_empty(),
            })
        })
        .collect()
}

async fn count_unique_commits(repo: &Path, branch: &str) -> u32 {
    let reference = format!("refs/heads/{branch}");
    let exclude = format!("--exclude={branch}");
    let output = git_unchecked(
        repo,
        &[
            "rev-list",
            "--count",
            &reference,
            "--not",
            &exclude,
            "--branches",
            "--remotes",
        ],
    )
    .await;
    match output {
        Ok(result) if result.success() => result.trimmed().parse().unwrap_or(0),
        _ => 0,
    }
}

async fn default_branch_name(repo: &Path) -> Option<String> {
    let output = git_unchecked(
        repo,
        &["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"],
    )
    .await
    .ok()?;
    if !output.success() {
        return None;
    }
    output.trimmed().strip_prefix("origin/").map(str::to_string)
}

pub async fn preview_cleanup(repo: &Path) -> AppResult<CleanupPreview> {
    let status = git(
        repo,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=normal",
            "--ignored=traditional",
        ],
    )
    .await?;
    let (untracked, ignored) = parse_status_entries(&status.text());

    let listing = git(
        repo,
        &[
            "for-each-ref",
            "--format=%(refname:short)%09%(objectname)%09%(upstream:track)%09%(worktreepath)%09%(HEAD)",
            "refs/heads",
        ],
    )
    .await?;
    let branches = parse_branches(&listing.text());

    let head = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"]).await?;
    let head_hash = head.success().then(|| head.trimmed());
    let merged_listing = git_unchecked(
        repo,
        &[
            "for-each-ref",
            "--merged=HEAD",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )
    .await?;
    let merged: HashSet<String> = if merged_listing.success() {
        merged_listing
            .text()
            .lines()
            .map(|line| line.trim().to_string())
            .collect()
    } else {
        HashSet::new()
    };
    let default_branch = default_branch_name(repo).await;
    let protected =
        |name: &str| PROTECTED_BRANCHES.contains(&name) || default_branch.as_deref() == Some(name);

    let mut merged_branches = Vec::new();
    let mut gone_branches = Vec::new();
    for branch in branches {
        if branch.in_use || protected(&branch.name) {
            continue;
        }
        if merged.contains(&branch.name) {
            if head_hash.as_deref() == Some(branch.hash.as_str()) {
                continue;
            }
            merged_branches.push(CleanupBranch {
                name: branch.name,
                hash: branch.hash,
                unique_commits: 0,
            });
        } else if branch.gone {
            let unique_commits = count_unique_commits(repo, &branch.name).await;
            gone_branches.push(CleanupBranch {
                name: branch.name,
                hash: branch.hash,
                unique_commits,
            });
        }
    }

    Ok(CleanupPreview {
        untracked,
        ignored,
        merged_branches,
        gone_branches,
    })
}

async fn remote_names(repo: &Path) -> AppResult<Vec<String>> {
    let output = git(repo, &["remote"]).await?;
    Ok(output
        .text()
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect())
}

pub fn parse_prune_preview(remote: &str, output: &str) -> Vec<StaleRemoteBranch> {
    let prefix = format!("{remote}/");
    output
        .lines()
        .filter_map(|line| {
            let (_, reference) = line.split_once("[would prune]")?;
            let name = reference.trim().strip_prefix(prefix.as_str())?;
            Some(StaleRemoteBranch {
                remote: remote.to_string(),
                name: name.to_string(),
            })
        })
        .collect()
}

pub async fn stale_remote_branches(repo: &Path) -> AppResult<Vec<StaleRemoteBranch>> {
    let mut stale = Vec::new();
    for remote in remote_names(repo).await? {
        let output = git(repo, &["remote", "prune", &remote, "--dry-run"]).await?;
        let text = format!("{}\n{}", output.text(), output.stderr);
        stale.extend(parse_prune_preview(&remote, &text));
    }
    Ok(stale)
}

fn ensure_listed(requested: &[String], allowed: &HashSet<&str>, what: &str) -> AppResult<()> {
    for item in requested {
        if !allowed.contains(item.as_str()) {
            return Err(AppError::invalid_input(format!(
                "{what} is not part of the cleanup preview: {item}"
            )));
        }
    }
    Ok(())
}

async fn clean_paths(repo: &Path, paths: &[String], ignored: bool) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let specs: Vec<String> = paths
        .iter()
        .map(|path| format!(":(literal){path}"))
        .collect();
    let mut args: Vec<&str> = vec!["clean", "-f", "-d"];
    if ignored {
        args.push("-X");
    }
    args.push("--");
    args.extend(specs.iter().map(String::as_str));
    git(repo, &args).await?;
    Ok(())
}

pub async fn run_cleanup(repo: &Path, request: &CleanupRequest) -> AppResult<CleanupReport> {
    let total = request.untracked.len()
        + request.ignored.len()
        + request.merged_branches.len()
        + request.gone_branches.len()
        + request.prune_remotes.len();
    if total == 0 {
        return Err(AppError::invalid_input("nothing selected to clean"));
    }
    if total > MAX_REQUEST_ITEMS {
        return Err(AppError::invalid_input("too many items selected"));
    }
    for path in request.untracked.iter().chain(request.ignored.iter()) {
        ensure_relative_path(path)?;
    }

    let preview = preview_cleanup(repo).await?;
    let untracked: HashSet<&str> = preview.untracked.iter().map(|f| f.path.as_str()).collect();
    let ignored: HashSet<&str> = preview.ignored.iter().map(|f| f.path.as_str()).collect();
    let merged: HashSet<&str> = preview
        .merged_branches
        .iter()
        .map(|b| b.name.as_str())
        .collect();
    let gone: HashSet<&str> = preview
        .gone_branches
        .iter()
        .map(|b| b.name.as_str())
        .collect();
    ensure_listed(&request.untracked, &untracked, "file")?;
    ensure_listed(&request.ignored, &ignored, "ignored file")?;
    ensure_listed(&request.merged_branches, &merged, "branch")?;
    ensure_listed(&request.gone_branches, &gone, "branch")?;
    let remotes = remote_names(repo).await?;
    let known_remotes: HashSet<&str> = remotes.iter().map(String::as_str).collect();
    ensure_listed(&request.prune_remotes, &known_remotes, "remote")?;

    let mut failures = Vec::new();

    if let Err(error) = clean_paths(repo, &request.untracked, false).await {
        failures.push(CleanupFailure {
            item: "untracked files".to_string(),
            detail: error.detail,
        });
    }
    if let Err(error) = clean_paths(repo, &request.ignored, true).await {
        failures.push(CleanupFailure {
            item: "ignored files".to_string(),
            detail: error.detail,
        });
    }

    let mut deleted_branches = Vec::new();
    let branch_groups: [(&[String], &str, &[CleanupBranch]); 2] = [
        (&request.merged_branches, "-d", &preview.merged_branches),
        (&request.gone_branches, "-D", &preview.gone_branches),
    ];
    for (names, flag, known) in branch_groups {
        for name in names {
            match git(repo, &["branch", flag, "--", name]).await {
                Ok(_) => {
                    let hash = known
                        .iter()
                        .find(|branch| &branch.name == name)
                        .map(|branch| branch.hash.clone())
                        .unwrap_or_default();
                    deleted_branches.push(DeletedBranch {
                        name: name.clone(),
                        hash,
                    });
                }
                Err(error) => failures.push(CleanupFailure {
                    item: name.clone(),
                    detail: error.detail,
                }),
            }
        }
    }

    let mut pruned_branches = 0;
    for remote in &request.prune_remotes {
        match git(repo, &["remote", "prune", remote]).await {
            Ok(output) => {
                let text = format!("{}\n{}", output.text(), output.stderr);
                pruned_branches += text.matches("[pruned]").count() as u32;
            }
            Err(error) => failures.push(CleanupFailure {
                item: remote.clone(),
                detail: error.detail,
            }),
        }
    }

    let after = preview_cleanup(repo).await?;
    let remaining: HashSet<&str> = after
        .untracked
        .iter()
        .chain(after.ignored.iter())
        .map(|file| file.path.as_str())
        .collect();
    let removed_files = request
        .untracked
        .iter()
        .chain(request.ignored.iter())
        .filter(|path| !remaining.contains(path.as_str()))
        .count() as u32;

    Ok(CleanupReport {
        removed_files,
        deleted_branches,
        pruned_branches,
        failures,
    })
}

#[tauri::command]
pub async fn cleanup_preview_get(path: String) -> AppResult<CleanupPreview> {
    preview_cleanup(Path::new(&path)).await
}

#[tauri::command]
pub async fn cleanup_stale_remote_get(path: String) -> AppResult<Vec<StaleRemoteBranch>> {
    stale_remote_branches(Path::new(&path)).await
}

#[tauri::command]
pub async fn cleanup_run(path: String, request: CleanupRequest) -> AppResult<CleanupReport> {
    run_cleanup(Path::new(&path), &request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_entries_split_untracked_from_ignored() {
        let output =
            "?? notes.txt\0?? scratch/\0!! target/\0!! app.log\0 M tracked.rs\0R  new.rs\0old.rs\0";
        let (untracked, ignored) = parse_status_entries(output);
        assert_eq!(
            untracked,
            vec![
                CleanupFile {
                    path: "notes.txt".to_string(),
                    directory: false
                },
                CleanupFile {
                    path: "scratch".to_string(),
                    directory: true
                },
            ]
        );
        assert_eq!(ignored.len(), 2);
        assert_eq!(ignored[0].path, "target");
        assert!(ignored[0].directory);
        assert!(!ignored[1].directory);
    }

    #[test]
    fn status_entries_survive_non_ascii_names() {
        let (untracked, _) = parse_status_entries("?? ñandú/árbol.txt\0ñandú\0");
        assert_eq!(untracked.len(), 1);
        assert_eq!(untracked[0].path, "ñandú/árbol.txt");
    }

    #[test]
    fn branch_listing_marks_gone_and_busy_branches() {
        let output = "main\tabc\t\t\t*\nfeature\tdef\t[gone]\t\t\nwork\t123\t\tC:/other\t\n";
        let branches = parse_branches(output);
        assert_eq!(branches.len(), 3);
        assert!(branches[0].in_use);
        assert!(branches[1].gone);
        assert!(!branches[1].in_use);
        assert!(branches[2].in_use);
    }

    #[test]
    fn prune_preview_lists_the_branches_that_would_go() {
        let output = "Pruning origin\nURL: x\n * [would prune] origin/old-feature\n * [would prune] origin/fix/login\n";
        let stale = parse_prune_preview("origin", output);
        assert_eq!(stale.len(), 2);
        assert_eq!(stale[0].name, "old-feature");
        assert_eq!(stale[1].name, "fix/login");
    }
}
