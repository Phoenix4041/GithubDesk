use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use serde::Serialize;

use crate::commands::rescue::guard_worktree;
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::{git, git_unchecked, git_with_env, git_with_input};

const MAX_CANDIDATES: u32 = 100;
const UNSUPPORTED_MARKERS: [&str; 7] = [
    "new file mode",
    "deleted file mode",
    "old mode",
    "rename from",
    "similarity index",
    "Binary files",
    "GIT binary patch",
];

#[derive(Debug, Clone, PartialEq, Eq)]
struct Hunk {
    old_start: u32,
    old_len: u32,
    header: String,
    text: String,
    added: u32,
    removed: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FilePatch {
    path: String,
    header: String,
    hunks: Vec<Hunk>,
    supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsorbTarget {
    pub hash: String,
    pub short_hash: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsorbItem {
    pub path: String,
    pub hunk: String,
    pub added: u32,
    pub removed: u32,
    pub target: AbsorbTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
    OnlyAdditions,
    ManyCommits,
    Published,
    Unsupported,
    NotFound,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsorbSkipped {
    pub path: String,
    pub hunk: Option<String>,
    pub reason: SkipReason,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsorbPlan {
    pub assignments: Vec<AbsorbItem>,
    pub skipped: Vec<AbsorbSkipped>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsorbReport {
    pub fixups: u32,
    pub squashed: bool,
}

fn parse_range(text: &str) -> (u32, u32) {
    let body = text.trim_start_matches(['-', '+']);
    match body.split_once(',') {
        Some((start, length)) => (start.parse().unwrap_or(0), length.parse().unwrap_or(1)),
        None => (body.parse().unwrap_or(0), 1),
    }
}

fn parse_hunk_header(line: &str) -> Option<(u32, u32)> {
    let rest = line.strip_prefix("@@ ")?;
    let old = rest.split_whitespace().next()?;
    Some(parse_range(old))
}

fn parse_diff(diff: &str) -> Vec<FilePatch> {
    let mut files: Vec<FilePatch> = Vec::new();
    let mut in_hunk = false;
    for line in diff.split_inclusive('\n') {
        if line.starts_with("diff --git ") {
            let path = line
                .trim_end()
                .rsplit(" b/")
                .next()
                .unwrap_or_default()
                .to_string();
            files.push(FilePatch {
                path,
                header: line.to_string(),
                hunks: Vec::new(),
                supported: true,
            });
            in_hunk = false;
            continue;
        }
        let Some(file) = files.last_mut() else {
            continue;
        };
        if line.starts_with("@@ ") {
            let (old_start, old_len) = parse_hunk_header(line).unwrap_or((0, 0));
            file.hunks.push(Hunk {
                old_start,
                old_len,
                header: line.trim_end().to_string(),
                text: line.to_string(),
                added: 0,
                removed: 0,
            });
            in_hunk = true;
            continue;
        }
        if in_hunk {
            if let Some(hunk) = file.hunks.last_mut() {
                hunk.text.push_str(line);
                if line.starts_with('+') {
                    hunk.added += 1;
                } else if line.starts_with('-') {
                    hunk.removed += 1;
                }
            }
        } else {
            file.header.push_str(line);
            if UNSUPPORTED_MARKERS
                .iter()
                .any(|marker| line.starts_with(marker))
            {
                file.supported = false;
            }
        }
    }
    files
}

fn blame_hashes(output: &str) -> HashSet<String> {
    output
        .lines()
        .filter_map(|line| {
            let first = line.split(' ').next()?;
            (first.len() == 40 && first.chars().all(|character| character.is_ascii_hexdigit()))
                .then(|| first.to_string())
        })
        .collect()
}

async fn candidate_commits(repo: &Path) -> AppResult<HashSet<String>> {
    let count = format!("--max-count={MAX_CANDIDATES}");
    let output = git_unchecked(
        repo,
        &[
            "rev-list",
            "--no-merges",
            &count,
            "HEAD",
            "--not",
            "--remotes",
        ],
    )
    .await?;
    if !output.success() {
        return Ok(HashSet::new());
    }
    Ok(output.text().lines().map(str::to_string).collect())
}

async fn describe_commit(repo: &Path, hash: &str) -> AppResult<AbsorbTarget> {
    let output = git(repo, &["show", "-s", "--format=%h%x1f%s", hash]).await?;
    let text = output.trimmed();
    let (short, title) = text.split_once('\u{1f}').unwrap_or((hash, ""));
    Ok(AbsorbTarget {
        hash: hash.to_string(),
        short_hash: short.to_string(),
        title: title.to_string(),
    })
}

struct Analysis {
    plan: AbsorbPlan,
    groups: BTreeMap<String, Vec<(usize, usize)>>,
    files: Vec<FilePatch>,
}

async fn analyse(repo: &Path) -> AppResult<Analysis> {
    let diff = git(
        repo,
        &[
            "diff",
            "--cached",
            "--no-color",
            "--no-renames",
            "-U0",
            "--text",
        ],
    )
    .await?
    .text();
    let files = parse_diff(&diff);
    let candidates = candidate_commits(repo).await?;
    let mut plan = AbsorbPlan {
        assignments: Vec::new(),
        skipped: Vec::new(),
    };
    let mut groups: BTreeMap<String, Vec<(usize, usize)>> = BTreeMap::new();
    let mut described: BTreeMap<String, AbsorbTarget> = BTreeMap::new();

    for (file_index, file) in files.iter().enumerate() {
        for (hunk_index, hunk) in file.hunks.iter().enumerate() {
            let skip = |reason| AbsorbSkipped {
                path: file.path.clone(),
                hunk: Some(hunk.header.clone()),
                reason,
            };
            if !file.supported {
                plan.skipped.push(skip(SkipReason::Unsupported));
                continue;
            }
            if hunk.old_len == 0 {
                plan.skipped.push(skip(SkipReason::OnlyAdditions));
                continue;
            }
            let range = format!("{},{}", hunk.old_start, hunk.old_start + hunk.old_len - 1);
            let blame = git_unchecked(
                repo,
                &[
                    "blame",
                    "--porcelain",
                    "-L",
                    &range,
                    "HEAD",
                    "--",
                    &file.path,
                ],
            )
            .await?;
            if !blame.success() {
                plan.skipped.push(skip(SkipReason::NotFound));
                continue;
            }
            let hashes = blame_hashes(&blame.text());
            if hashes.len() != 1 {
                plan.skipped.push(skip(SkipReason::ManyCommits));
                continue;
            }
            let hash = hashes.into_iter().next().unwrap_or_default();
            if !candidates.contains(&hash) {
                plan.skipped.push(skip(SkipReason::Published));
                continue;
            }
            if !described.contains_key(&hash) {
                described.insert(hash.clone(), describe_commit(repo, &hash).await?);
            }
            let target = described.get(&hash).cloned().ok_or_else(|| {
                AppError::new(
                    ErrorKind::Unknown,
                    "the target commit could not be described",
                )
            })?;
            plan.assignments.push(AbsorbItem {
                path: file.path.clone(),
                hunk: hunk.header.clone(),
                added: hunk.added,
                removed: hunk.removed,
                target,
            });
            groups
                .entry(hash)
                .or_default()
                .push((file_index, hunk_index));
        }
    }
    Ok(Analysis {
        plan,
        groups,
        files,
    })
}

pub async fn absorb_plan(repo: &Path) -> AppResult<AbsorbPlan> {
    Ok(analyse(repo).await?.plan)
}

fn build_patch(files: &[FilePatch], picks: &[(usize, usize)]) -> String {
    let mut patch = String::new();
    let mut by_file: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for (file, hunk) in picks {
        by_file.entry(*file).or_default().push(*hunk);
    }
    for (file_index, hunks) in by_file {
        let file = &files[file_index];
        patch.push_str(&file.header);
        for hunk_index in hunks {
            patch.push_str(&file.hunks[hunk_index].text);
        }
    }
    patch
}

async fn commits_oldest_first(repo: &Path, targets: &[String]) -> AppResult<Vec<String>> {
    let output = git(repo, &["rev-list", "--reverse", "--no-merges", "HEAD"]).await?;
    let wanted: HashSet<&String> = targets.iter().collect();
    Ok(output
        .text()
        .lines()
        .filter(|line| wanted.contains(&line.to_string()))
        .map(str::to_string)
        .collect())
}

pub async fn absorb_apply(repo: &Path, squash: bool) -> AppResult<AbsorbReport> {
    let analysis = analyse(repo).await?;
    if analysis.groups.is_empty() {
        return Err(AppError::invalid_input("nothing staged can be absorbed"));
    }
    guard_worktree(repo, "absorb").await;
    git(repo, &["reset", "-q"]).await?;
    let mut fixups = 0;
    let order =
        commits_oldest_first(repo, &analysis.groups.keys().cloned().collect::<Vec<_>>()).await?;
    for hash in &order {
        let picks = &analysis.groups[hash];
        let patch = build_patch(&analysis.files, picks);
        git_with_input(
            repo,
            &[
                "apply",
                "--cached",
                "--unidiff-zero",
                "--whitespace=nowarn",
                "-",
            ],
            patch.into_bytes(),
        )
        .await?;
        git(
            repo,
            &["commit", "-q", "--no-verify", &format!("--fixup={hash}")],
        )
        .await?;
        fixups += 1;
    }

    let leftover: Vec<(usize, usize)> = analysis
        .files
        .iter()
        .enumerate()
        .flat_map(|(file_index, file)| (0..file.hunks.len()).map(move |hunk| (file_index, hunk)))
        .filter(|pick| !analysis.groups.values().any(|group| group.contains(pick)))
        .collect();
    if !leftover.is_empty() {
        let patch = build_patch(&analysis.files, &leftover);
        let _ = git_with_input(
            repo,
            &[
                "apply",
                "--cached",
                "--unidiff-zero",
                "--whitespace=nowarn",
                "-",
            ],
            patch.into_bytes(),
        )
        .await;
    }

    if squash {
        let oldest = order
            .first()
            .cloned()
            .ok_or_else(|| AppError::new(ErrorKind::Unknown, "no fixup target"))?;
        let parent_ref = format!("{oldest}^");
        let has_parent = git_unchecked(repo, &["rev-parse", "--verify", "-q", &parent_ref])
            .await?
            .success();
        let env = [("GIT_SEQUENCE_EDITOR", "true"), ("GIT_EDITOR", "true")];
        let mut args = vec!["rebase", "-i", "--autosquash", "--autostash"];
        if has_parent {
            args.push(&parent_ref);
        } else {
            args.push("--root");
        }
        git_with_env(repo, &args, &env).await?;
    }
    Ok(AbsorbReport {
        fixups,
        squashed: squash,
    })
}

#[tauri::command]
pub async fn absorb_preview(path: String) -> AppResult<AbsorbPlan> {
    absorb_plan(Path::new(&path)).await
}

#[tauri::command]
pub async fn absorb_run(path: String, squash: bool) -> AppResult<AbsorbReport> {
    absorb_apply(Path::new(&path), squash).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIFF: &str = "diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -2 +2 @@\n-two\n+TWO\n@@ -5,0 +6 @@\n+extra\ndiff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0..3\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+x\n";

    #[test]
    fn a_diff_is_split_into_files_and_hunks_with_their_old_ranges() {
        let files = parse_diff(DIFF);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "a.txt");
        assert!(files[0].supported);
        assert_eq!(files[0].hunks.len(), 2);
        assert_eq!(
            (files[0].hunks[0].old_start, files[0].hunks[0].old_len),
            (2, 1)
        );
        assert_eq!(
            (files[0].hunks[1].old_start, files[0].hunks[1].old_len),
            (5, 0)
        );
        assert_eq!((files[0].hunks[0].added, files[0].hunks[0].removed), (1, 1));
        assert!(!files[1].supported);
    }

    #[test]
    fn a_patch_keeps_the_file_header_and_only_the_picked_hunks() {
        let files = parse_diff(DIFF);
        let patch = build_patch(&files, &[(0, 1)]);
        assert!(patch.starts_with("diff --git a/a.txt b/a.txt"));
        assert!(patch.contains("+extra"));
        assert!(!patch.contains("+TWO"));
    }

    #[test]
    fn blame_output_gives_the_distinct_commits() {
        let output = format!(
            "{} 1 1 1\nauthor x\n\tline\n{} 2 2 1\nauthor y\n\tline\n{} 3 3\n\tline\n",
            "a".repeat(40),
            "b".repeat(40),
            "a".repeat(40)
        );
        assert_eq!(blame_hashes(&output).len(), 2);
    }
}
