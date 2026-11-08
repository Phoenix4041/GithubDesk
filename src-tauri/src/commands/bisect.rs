use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::operation::current_operation;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked};
use crate::git::validate::{ensure_commit_hash, ensure_revision};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BisectVerdict {
    Good,
    Bad,
    Skip,
}

impl BisectVerdict {
    fn word(self) -> &'static str {
        match self {
            BisectVerdict::Good => "good",
            BisectVerdict::Bad => "bad",
            BisectVerdict::Skip => "skip",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BisectStep {
    pub verdict: BisectVerdict,
    pub hash: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BisectCulprit {
    pub hash: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BisectState {
    pub active: bool,
    pub steps: Vec<BisectStep>,
    pub current_hash: Option<String>,
    pub current_title: Option<String>,
    pub remaining: Option<u32>,
    pub estimated_steps: Option<u32>,
    pub culprit: Option<BisectCulprit>,
    pub start_ref: Option<String>,
}

impl BisectState {
    fn inactive() -> Self {
        Self {
            active: false,
            steps: Vec::new(),
            current_hash: None,
            current_title: None,
            remaining: None,
            estimated_steps: None,
            culprit: None,
            start_ref: None,
        }
    }
}

fn is_hash(value: &str) -> bool {
    (4..=64).contains(&value.len()) && value.chars().all(|character| character.is_ascii_hexdigit())
}

pub fn parse_bisect_log(log: &str) -> (Vec<BisectStep>, Option<BisectCulprit>) {
    let mut steps = Vec::new();
    let mut culprit = None;
    for line in log.lines() {
        let Some(rest) = line.strip_prefix("# ") else {
            continue;
        };
        let Some((label, tail)) = rest.split_once(": [") else {
            continue;
        };
        let Some((hash, title)) = tail.split_once(']') else {
            continue;
        };
        if !is_hash(hash) {
            continue;
        }
        let title = title.trim().to_string();
        let verdict = match label {
            "bad" => BisectVerdict::Bad,
            "good" => BisectVerdict::Good,
            "skip" => BisectVerdict::Skip,
            first if first.starts_with("first ") && first.ends_with(" commit") => {
                culprit = Some(BisectCulprit {
                    hash: hash.to_string(),
                    title,
                });
                continue;
            }
            _ => continue,
        };
        steps.push(BisectStep {
            verdict,
            hash: hash.to_string(),
            title,
        });
    }
    (steps, culprit)
}

pub fn parse_bisect_vars(output: &str) -> (Option<u32>, Option<u32>) {
    let mut remaining = None;
    let mut steps = None;
    for line in output.lines() {
        if let Some(value) = line.strip_prefix("bisect_nr=") {
            remaining = value.trim().parse().ok();
        } else if let Some(value) = line.strip_prefix("bisect_steps=") {
            steps = value.trim().parse().ok();
        }
    }
    (remaining, steps)
}

async fn git_directory(repo: &Path) -> AppResult<PathBuf> {
    let output = git(repo, &["rev-parse", "--absolute-git-dir"]).await?;
    Ok(PathBuf::from(output.trimmed()))
}

async fn read_optional(path: &Path) -> AppResult<Option<String>> {
    match tokio::fs::read_to_string(path).await {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

async fn estimate(repo: &Path, steps: &[BisectStep]) -> (Option<u32>, Option<u32>) {
    let Some(bad) = steps
        .iter()
        .rev()
        .find(|step| step.verdict == BisectVerdict::Bad)
    else {
        return (None, None);
    };
    let goods: Vec<String> = steps
        .iter()
        .filter(|step| step.verdict == BisectVerdict::Good)
        .map(|step| format!("^{}", step.hash))
        .collect();
    if goods.is_empty() {
        return (None, None);
    }
    let mut args: Vec<&str> = vec!["rev-list", "--bisect-vars", bad.hash.as_str()];
    args.extend(goods.iter().map(String::as_str));
    args.push("--");
    match git_unchecked(repo, &args).await {
        Ok(output) if output.success() => parse_bisect_vars(&output.text()),
        _ => (None, None),
    }
}

pub async fn bisect_state(repo: &Path) -> AppResult<BisectState> {
    let directory = git_directory(repo).await?;
    let Some(log) = read_optional(&directory.join("BISECT_LOG")).await? else {
        return Ok(BisectState::inactive());
    };
    let (steps, culprit) = parse_bisect_log(&log);
    let start_ref = read_optional(&directory.join("BISECT_START"))
        .await?
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());

    let head = git_unchecked(repo, &["rev-parse", "--verify", "HEAD"]).await?;
    let (current_hash, current_title) = if head.success() {
        let title = git_unchecked(repo, &["log", "-1", "--format=%s", "HEAD"]).await?;
        (Some(head.trimmed()), Some(title.trimmed()))
    } else {
        (None, None)
    };
    let (remaining, estimated_steps) = if culprit.is_some() {
        (None, None)
    } else {
        estimate(repo, &steps).await
    };

    Ok(BisectState {
        active: true,
        steps,
        current_hash,
        current_title,
        remaining,
        estimated_steps,
        culprit,
        start_ref,
    })
}

async fn resolve_commit(repo: &Path, revision: &str) -> AppResult<String> {
    ensure_revision(revision)?;
    let target = format!("{}^{{commit}}", revision.trim());
    let output = git_unchecked(repo, &["rev-parse", "--verify", &target]).await?;
    if output.success() {
        Ok(output.trimmed())
    } else {
        Err(AppError::invalid_input(format!(
            "unknown revision: {revision}"
        )))
    }
}

pub async fn start_bisect(repo: &Path, bad: &str, good: &str) -> AppResult<BisectState> {
    if bisect_state(repo).await?.active {
        return Err(AppError::new(
            ErrorKind::OperationInProgress,
            "a bisect is already running",
        ));
    }
    if current_operation(repo).await?.is_some() {
        return Err(AppError::new(
            ErrorKind::OperationInProgress,
            "another operation is in progress",
        ));
    }
    let dirty = git(repo, &["status", "--porcelain", "--untracked-files=no"]).await?;
    if !dirty.trimmed().is_empty() {
        return Err(AppError::new(
            ErrorKind::LocalChangesWouldBeOverwritten,
            "bisect needs a clean working tree",
        ));
    }
    let bad_hash = resolve_commit(repo, bad).await?;
    let good_hash = resolve_commit(repo, good).await?;
    if bad_hash == good_hash {
        return Err(AppError::invalid_input(
            "the good and the bad commit are the same",
        ));
    }
    let ancestor = git_unchecked(
        repo,
        &["merge-base", "--is-ancestor", &good_hash, &bad_hash],
    )
    .await?;
    if !ancestor.success() {
        return Err(AppError::invalid_input(
            "the good commit must come before the bad commit",
        ));
    }
    git(repo, &["bisect", "start", &bad_hash, &good_hash, "--"]).await?;
    bisect_state(repo).await
}

pub async fn mark_bisect(
    repo: &Path,
    verdict: BisectVerdict,
    revision: Option<&str>,
) -> AppResult<BisectState> {
    if !bisect_state(repo).await?.active {
        return Err(AppError::new(
            ErrorKind::NoOperationInProgress,
            "no bisect in progress",
        ));
    }
    let mut args = vec!["bisect", verdict.word()];
    if let Some(hash) = revision {
        ensure_commit_hash(hash)?;
        args.push(hash);
    }
    git(repo, &args).await?;
    bisect_state(repo).await
}

pub async fn finish_bisect(repo: &Path) -> AppResult<()> {
    if !bisect_state(repo).await?.active {
        return Err(AppError::new(
            ErrorKind::NoOperationInProgress,
            "no bisect in progress",
        ));
    }
    git(repo, &["bisect", "reset"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn bisect_state_get(path: String) -> AppResult<BisectState> {
    bisect_state(Path::new(&path)).await
}

#[tauri::command]
pub async fn bisect_start(path: String, bad: String, good: String) -> AppResult<BisectState> {
    start_bisect(Path::new(&path), &bad, &good).await
}

#[tauri::command]
pub async fn bisect_mark(
    path: String,
    verdict: BisectVerdict,
    revision: Option<String>,
) -> AppResult<BisectState> {
    mark_bisect(Path::new(&path), verdict, revision.as_deref()).await
}

#[tauri::command]
pub async fn bisect_finish(path: String) -> AppResult<()> {
    finish_bisect(Path::new(&path)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_log_gives_the_marks_and_the_culprit() {
        let log = "git bisect start\n# status: waiting for both good and bad commits\n\
# bad: [aaaa1111] Break the build\ngit bisect bad aaaa1111\n\
# good: [bbbb2222] Works fine\ngit bisect good bbbb2222\n\
# skip: [cccc3333] Cannot test\ngit bisect skip cccc3333\n\
# first bad commit: [dddd4444] The culprit\n";
        let (steps, culprit) = parse_bisect_log(log);
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0].verdict, BisectVerdict::Bad);
        assert_eq!(steps[0].title, "Break the build");
        assert_eq!(steps[1].verdict, BisectVerdict::Good);
        assert_eq!(steps[2].verdict, BisectVerdict::Skip);
        assert_eq!(
            culprit,
            Some(BisectCulprit {
                hash: "dddd4444".to_string(),
                title: "The culprit".to_string()
            })
        );
    }

    #[test]
    fn the_culprit_line_may_quote_the_term() {
        let (steps, culprit) = parse_bisect_log(
            "# first 'bad' commit: [eeee5555] Quoted term
",
        );
        assert!(steps.is_empty());
        assert_eq!(
            culprit,
            Some(BisectCulprit {
                hash: "eeee5555".to_string(),
                title: "Quoted term".to_string()
            })
        );
    }

    #[test]
    fn the_log_ignores_lines_it_does_not_understand() {
        let (steps, culprit) = parse_bisect_log("# status: waiting\n# bad: [zzzz] nope\nnoise\n");
        assert!(steps.is_empty());
        assert_eq!(culprit, None);
    }

    #[test]
    fn rev_list_variables_give_the_remaining_work() {
        let output = "bisect_rev='abc'\nbisect_nr=7\nbisect_good=3\nbisect_bad=3\nbisect_all=16\nbisect_steps=3\n";
        assert_eq!(parse_bisect_vars(output), (Some(7), Some(3)));
        assert_eq!(parse_bisect_vars(""), (None, None));
    }
}
