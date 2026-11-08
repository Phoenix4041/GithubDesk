use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;
use crate::git::runner::git_unchecked;
use crate::git::validate::ensure_revision;

const MAX_BATCH: usize = 50;
const MAX_FILES: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prediction {
    pub source: String,
    pub supported: bool,
    pub conflicts: bool,
    pub files: Vec<String>,
}

fn unsupported(source: &str) -> Prediction {
    Prediction {
        source: source.to_string(),
        supported: false,
        conflicts: false,
        files: Vec::new(),
    }
}

pub fn parse_merge_tree(output: &str) -> Vec<String> {
    let mut lines = output.lines();
    lines.next();
    lines
        .take_while(|line| !line.is_empty())
        .take(MAX_FILES)
        .map(str::to_string)
        .collect()
}

async fn run_merge_tree(repo: &Path, source: &str, args: &[&str]) -> AppResult<Prediction> {
    let output = git_unchecked(repo, args).await?;
    match output.exit_code {
        0 => Ok(Prediction {
            source: source.to_string(),
            supported: true,
            conflicts: false,
            files: Vec::new(),
        }),
        1 if output.text().trim().is_empty() => Ok(unsupported(source)),
        1 => {
            let mut files = parse_merge_tree(&output.text());
            files.sort();
            files.dedup();
            Ok(Prediction {
                source: source.to_string(),
                supported: true,
                conflicts: true,
                files,
            })
        }
        _ => Ok(unsupported(source)),
    }
}

pub async fn predict_merge(repo: &Path, source: &str) -> AppResult<Prediction> {
    ensure_revision(source)?;
    run_merge_tree(
        repo,
        source,
        &[
            "merge-tree",
            "--write-tree",
            "--name-only",
            "--no-messages",
            "HEAD",
            source,
        ],
    )
    .await
}

pub async fn predict_cherry_pick(repo: &Path, commit: &str) -> AppResult<Prediction> {
    ensure_revision(commit)?;
    let parent = format!("{commit}^");
    let merge_base = format!("--merge-base={parent}");
    run_merge_tree(
        repo,
        commit,
        &[
            "merge-tree",
            "--write-tree",
            "--name-only",
            "--no-messages",
            &merge_base,
            "HEAD",
            commit,
        ],
    )
    .await
}

pub async fn predict_many(repo: &Path, sources: &[String]) -> AppResult<Vec<Prediction>> {
    let mut results = Vec::new();
    for source in sources.iter().take(MAX_BATCH) {
        results.push(predict_merge(repo, source).await?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn predict_merge_conflicts(path: String, source: String) -> AppResult<Prediction> {
    predict_merge(Path::new(&path), &source).await
}

#[tauri::command]
pub async fn predict_cherry_pick_conflicts(path: String, commit: String) -> AppResult<Prediction> {
    predict_cherry_pick(Path::new(&path), &commit).await
}

#[tauri::command]
pub async fn predict_branches_conflicts(
    path: String,
    sources: Vec<String>,
) -> AppResult<Vec<Prediction>> {
    predict_many(Path::new(&path), &sources).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_file_names_come_after_the_tree_line_and_stop_at_the_blank_line() {
        let output = "0123abc\nsrc/a.rs\nsrc/b.rs\n\nAuto-merging src/a.rs\n";
        assert_eq!(parse_merge_tree(output), vec!["src/a.rs", "src/b.rs"]);
        assert!(parse_merge_tree("0123abc\n").is_empty());
    }
}
