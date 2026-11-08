use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

use crate::commands::rescue::guard_worktree;
use crate::error::{AppError, AppResult};
use crate::git::runner::{git, git_unchecked, git_with_env};
use crate::git::validate::ensure_valid_branch_name;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StackNode {
    pub name: String,
    pub parent: Option<String>,
    pub depth: u32,
    pub ahead: u32,
    pub needs_restack: bool,
    pub is_current: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StackReport {
    pub restacked: Vec<String>,
}

fn parent_key(branch: &str) -> String {
    format!("branch.{branch}.githubdeskparent")
}

fn base_key(branch: &str) -> String {
    format!("branch.{branch}.githubdeskbase")
}

async fn config_value(repo: &Path, key: &str) -> Option<String> {
    match git_unchecked(repo, &["config", "--local", "--get", key]).await {
        Ok(output) if output.success() => {
            let value = output.trimmed();
            (!value.is_empty()).then_some(value)
        }
        _ => None,
    }
}

async fn local_branches(repo: &Path) -> AppResult<Vec<String>> {
    let output = git(
        repo,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    )
    .await?;
    Ok(output.text().lines().map(str::to_string).collect())
}

async fn current_branch(repo: &Path) -> Option<String> {
    match git_unchecked(repo, &["symbolic-ref", "--short", "-q", "HEAD"]).await {
        Ok(output) if output.success() => Some(output.trimmed()),
        _ => None,
    }
}

async fn is_ancestor(repo: &Path, ancestor: &str, descendant: &str) -> bool {
    matches!(
        git_unchecked(repo, &["merge-base", "--is-ancestor", ancestor, descendant]).await,
        Ok(output) if output.success()
    )
}

async fn rev(repo: &Path, name: &str) -> AppResult<String> {
    Ok(git(
        repo,
        &["rev-parse", "--verify", &format!("refs/heads/{name}")],
    )
    .await?
    .trimmed())
}

pub async fn stack_nodes(repo: &Path) -> AppResult<Vec<StackNode>> {
    let branches = local_branches(repo).await?;
    let current = current_branch(repo).await;
    let mut parents: HashMap<String, String> = HashMap::new();
    for branch in &branches {
        if let Some(parent) = config_value(repo, &parent_key(branch)).await {
            if branches.contains(&parent) {
                parents.insert(branch.clone(), parent);
            }
        }
    }
    let mut ordered: Vec<(String, u32)> = Vec::new();
    let mut roots: Vec<String> = parents
        .values()
        .filter(|parent| !parents.contains_key(*parent))
        .cloned()
        .collect();
    roots.sort();
    roots.dedup();
    let mut stack: Vec<(String, u32)> = roots.into_iter().rev().map(|root| (root, 0)).collect();
    while let Some((name, depth)) = stack.pop() {
        ordered.push((name.clone(), depth));
        let mut children: Vec<&String> = parents
            .iter()
            .filter(|(_, parent)| **parent == name)
            .map(|(child, _)| child)
            .collect();
        children.sort();
        for child in children.into_iter().rev() {
            stack.push((child.clone(), depth + 1));
        }
    }

    let mut nodes = Vec::new();
    for (name, depth) in ordered {
        let parent = parents.get(&name).cloned();
        let (ahead, needs_restack) = match &parent {
            Some(parent_name) => {
                let count = git_unchecked(
                    repo,
                    &["rev-list", "--count", &format!("{parent_name}..{name}")],
                )
                .await?
                .trimmed()
                .parse::<u32>()
                .unwrap_or(0);
                let stale = !is_ancestor(repo, parent_name, &name).await;
                (count, stale)
            }
            None => (0, false),
        };
        nodes.push(StackNode {
            is_current: current.as_deref() == Some(name.as_str()),
            name,
            parent,
            depth,
            ahead,
            needs_restack,
        });
    }
    Ok(nodes)
}

pub async fn set_parent(repo: &Path, branch: &str, parent: Option<&str>) -> AppResult<()> {
    ensure_valid_branch_name(repo, branch).await?;
    let branches = local_branches(repo).await?;
    if !branches.iter().any(|name| name == branch) {
        return Err(AppError::invalid_input("the branch does not exist"));
    }
    let Some(parent) = parent else {
        for key in [parent_key(branch), base_key(branch)] {
            let _ = git_unchecked(repo, &["config", "--local", "--unset-all", &key]).await;
        }
        return Ok(());
    };
    ensure_valid_branch_name(repo, parent).await?;
    if parent == branch || !branches.iter().any(|name| name == parent) {
        return Err(AppError::invalid_input("the parent branch is not valid"));
    }
    let mut cursor = Some(parent.to_string());
    while let Some(name) = cursor {
        if name == branch {
            return Err(AppError::invalid_input("a branch cannot sit above itself"));
        }
        cursor = config_value(repo, &parent_key(&name)).await;
    }
    let base = git(repo, &["merge-base", parent, branch]).await?.trimmed();
    git(repo, &["config", "--local", &parent_key(branch), parent]).await?;
    git(repo, &["config", "--local", &base_key(branch), &base]).await?;
    Ok(())
}

pub async fn restack(repo: &Path) -> AppResult<StackReport> {
    let nodes = stack_nodes(repo).await?;
    let original = current_branch(repo).await;
    let mut restacked = Vec::new();
    guard_worktree(repo, "restack").await;
    let env = [("GIT_EDITOR", "true")];
    for node in nodes.iter().filter(|node| node.parent.is_some()) {
        let Some(parent) = node.parent.as_deref() else {
            continue;
        };
        if !is_ancestor(repo, parent, &node.name).await {
            let base = match config_value(repo, &base_key(&node.name)).await {
                Some(base) => base,
                None => git(repo, &["merge-base", parent, &node.name])
                    .await?
                    .trimmed(),
            };
            git_with_env(
                repo,
                &["rebase", "--autostash", "--onto", parent, &base, &node.name],
                &env,
            )
            .await?;
            restacked.push(node.name.clone());
        }
        let tip = rev(repo, parent).await?;
        git(repo, &["config", "--local", &base_key(&node.name), &tip]).await?;
    }
    if let Some(name) = original {
        if current_branch(repo).await.as_deref() != Some(name.as_str()) {
            git(repo, &["switch", "-q", &name]).await?;
        }
    }
    Ok(StackReport { restacked })
}

#[tauri::command]
pub async fn stack_list(path: String) -> AppResult<Vec<StackNode>> {
    stack_nodes(Path::new(&path)).await
}

#[tauri::command]
pub async fn stack_set_parent(
    path: String,
    branch: String,
    parent: Option<String>,
) -> AppResult<()> {
    set_parent(Path::new(&path), &branch, parent.as_deref()).await
}

#[tauri::command]
pub async fn stack_restack(path: String) -> AppResult<StackReport> {
    restack(Path::new(&path)).await
}
