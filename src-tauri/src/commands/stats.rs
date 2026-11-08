use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git::runner::{git_streaming, git_unchecked};
use crate::git::validate::ensure_relative_path;
use crate::jobs::CancelToken;
use crate::state::AppState;

pub const DEFAULT_COMMIT_LIMIT: u32 = 20_000;
const MAX_COMMIT_LIMIT: u32 = 200_000;
const ACTIVITY_SECONDS: i64 = 366 * 24 * 60 * 60;
const TOP_FILES: usize = 50;
const TOP_FOLDERS: usize = 30;
const TOP_BUS_FACTOR: usize = 20;
const TOP_CONTRIBUTORS: usize = 500;
const BUS_FACTOR_MIN_COMMITS: u32 = 5;
pub const DEFAULT_TODO_LIMIT: usize = 500;
const MAX_TODO_LIMIT: usize = 5_000;
const MAX_TODO_TEXT: usize = 240;
const TODO_KEYWORDS: [&str; 4] = ["TODO", "FIXME", "HACK", "XXX"];
const TODO_PATTERN: &str = "(^|[^A-Za-z0-9_])(TODO|FIXME|HACK|XXX)([^A-Za-z0-9_]|$)";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogCommit {
    pub name: String,
    pub email: String,
    pub time: i64,
    pub day: String,
    pub files: Vec<FileChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayActivity {
    pub date: String,
    pub commits: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contributor {
    pub name: String,
    pub email: String,
    pub commits: u32,
    pub additions: u64,
    pub deletions: u64,
    pub first_commit: i64,
    pub last_commit: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChurn {
    pub path: String,
    pub commits: u32,
    pub additions: u64,
    pub deletions: u64,
    pub authors: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderActivity {
    pub path: String,
    pub commits: u32,
    pub lines: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoleOwnerFile {
    pub path: String,
    pub commits: u32,
    pub size: u64,
    pub author: String,
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStats {
    pub commits: u32,
    pub limit: u32,
    pub truncated: bool,
    pub activity: Vec<DayActivity>,
    pub contributors: Vec<Contributor>,
    pub files: Vec<FileChurn>,
    pub folders: Vec<FolderActivity>,
    pub bus_factor: Vec<SoleOwnerFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub path: String,
    pub line: u32,
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoReport {
    pub items: Vec<TodoItem>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineAuthor {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub committed: bool,
}

fn unquote(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].to_string()
    } else {
        trimmed.to_string()
    }
}

fn parse_numstat(line: &str) -> Option<FileChange> {
    let mut parts = line.splitn(3, '\t');
    let additions = parts.next()?;
    let deletions = parts.next()?;
    let path = parts.next()?;
    if path.trim().is_empty() {
        return None;
    }
    Some(FileChange {
        path: unquote(path),
        additions: additions.parse().unwrap_or(0),
        deletions: deletions.parse().unwrap_or(0),
    })
}

pub fn parse_log(output: &str) -> Vec<LogCommit> {
    let mut commits = Vec::new();
    for record in output.split('\u{1e}') {
        let mut lines = record.lines();
        let Some(header) = lines.next() else {
            continue;
        };
        let fields: Vec<&str> = header.split('\u{1f}').collect();
        if fields.len() < 5 {
            continue;
        }
        let Ok(time) = fields[3].trim().parse::<i64>() else {
            continue;
        };
        commits.push(LogCommit {
            name: fields[1].to_string(),
            email: fields[2].trim().to_lowercase(),
            time,
            day: fields[4].trim().to_string(),
            files: lines.filter_map(parse_numstat).collect(),
        });
    }
    commits
}

pub fn parse_tree_sizes(output: &str) -> HashMap<String, u64> {
    let mut sizes = HashMap::new();
    for entry in output.split('\0') {
        let Some((meta, path)) = entry.split_once('\t') else {
            continue;
        };
        let mut parts = meta.split_whitespace();
        let kind = parts.nth(1);
        let size = parts.nth(1);
        if kind != Some("blob") {
            continue;
        }
        if let Some(size) = size.and_then(|value| value.parse::<u64>().ok()) {
            sizes.insert(path.to_string(), size);
        }
    }
    sizes
}

fn folder_of(path: &str) -> String {
    match path.rsplit_once('/') {
        Some((folder, _)) => folder.to_string(),
        None => String::new(),
    }
}

#[derive(Default)]
struct FileTally {
    commits: u32,
    additions: u64,
    deletions: u64,
    authors: HashSet<String>,
}

pub fn aggregate(
    commits: &[LogCommit],
    now: i64,
    sizes: &HashMap<String, u64>,
    limit: u32,
    truncated: bool,
) -> RepoStats {
    let since = now - ACTIVITY_SECONDS;
    let mut days: HashMap<String, u32> = HashMap::new();
    let mut people: HashMap<String, Contributor> = HashMap::new();
    let mut files: HashMap<String, FileTally> = HashMap::new();
    let mut folders: HashMap<String, (u32, u64)> = HashMap::new();
    let mut names: HashMap<String, String> = HashMap::new();

    for commit in commits {
        if commit.time >= since && !commit.day.is_empty() {
            *days.entry(commit.day.clone()).or_default() += 1;
        }
        let added: u64 = commit
            .files
            .iter()
            .map(|file| u64::from(file.additions))
            .sum();
        let removed: u64 = commit
            .files
            .iter()
            .map(|file| u64::from(file.deletions))
            .sum();
        let person = people
            .entry(commit.email.clone())
            .or_insert_with(|| Contributor {
                name: commit.name.clone(),
                email: commit.email.clone(),
                commits: 0,
                additions: 0,
                deletions: 0,
                first_commit: commit.time,
                last_commit: commit.time,
            });
        person.commits += 1;
        person.additions += added;
        person.deletions += removed;
        if commit.time < person.first_commit {
            person.first_commit = commit.time;
        }
        if commit.time > person.last_commit {
            person.last_commit = commit.time;
            person.name = commit.name.clone();
        }
        names
            .entry(commit.email.clone())
            .or_insert_with(|| commit.name.clone());

        let mut touched_folders: HashSet<String> = HashSet::new();
        for file in &commit.files {
            let tally = files.entry(file.path.clone()).or_default();
            tally.commits += 1;
            tally.additions += u64::from(file.additions);
            tally.deletions += u64::from(file.deletions);
            tally.authors.insert(commit.email.clone());
            let folder = folder_of(&file.path);
            let entry = folders.entry(folder.clone()).or_default();
            entry.1 += u64::from(file.additions) + u64::from(file.deletions);
            if touched_folders.insert(folder) {
                entry.0 += 1;
            }
        }
    }

    let mut activity: Vec<DayActivity> = days
        .into_iter()
        .map(|(date, commits)| DayActivity { date, commits })
        .collect();
    activity.sort_by(|left, right| left.date.cmp(&right.date));

    let mut contributors: Vec<Contributor> = people.into_values().collect();
    contributors.sort_by(|left, right| {
        right
            .commits
            .cmp(&left.commits)
            .then_with(|| left.email.cmp(&right.email))
    });
    contributors.truncate(TOP_CONTRIBUTORS);

    let mut bus_factor: Vec<SoleOwnerFile> = files
        .iter()
        .filter(|(_, tally)| tally.commits >= BUS_FACTOR_MIN_COMMITS && tally.authors.len() == 1)
        .filter_map(|(path, tally)| {
            let size = *sizes.get(path)?;
            let email = tally.authors.iter().next()?.clone();
            Some(SoleOwnerFile {
                path: path.clone(),
                commits: tally.commits,
                size,
                author: names.get(&email).cloned().unwrap_or_default(),
                email,
            })
        })
        .collect();
    bus_factor.sort_by(|left, right| {
        right
            .size
            .cmp(&left.size)
            .then_with(|| right.commits.cmp(&left.commits))
            .then_with(|| left.path.cmp(&right.path))
    });
    bus_factor.truncate(TOP_BUS_FACTOR);

    let mut churn: Vec<FileChurn> = files
        .into_iter()
        .map(|(path, tally)| FileChurn {
            path,
            commits: tally.commits,
            additions: tally.additions,
            deletions: tally.deletions,
            authors: u32::try_from(tally.authors.len()).unwrap_or(u32::MAX),
        })
        .collect();
    churn.sort_by(|left, right| {
        right
            .commits
            .cmp(&left.commits)
            .then_with(|| {
                (right.additions + right.deletions).cmp(&(left.additions + left.deletions))
            })
            .then_with(|| left.path.cmp(&right.path))
    });
    churn.truncate(TOP_FILES);

    let mut folder_rows: Vec<FolderActivity> = folders
        .into_iter()
        .map(|(path, (commits, lines))| FolderActivity {
            path,
            commits,
            lines,
        })
        .collect();
    folder_rows.sort_by(|left, right| {
        right
            .commits
            .cmp(&left.commits)
            .then_with(|| right.lines.cmp(&left.lines))
            .then_with(|| left.path.cmp(&right.path))
    });
    folder_rows.truncate(TOP_FOLDERS);

    RepoStats {
        commits: u32::try_from(commits.len()).unwrap_or(u32::MAX),
        limit,
        truncated,
        activity,
        contributors,
        files: churn,
        folders: folder_rows,
        bus_factor,
    }
}

fn keyword_in(text: &str) -> Option<&'static str> {
    let bytes = text.as_bytes();
    let mut best: Option<(usize, &'static str)> = None;
    for keyword in TODO_KEYWORDS {
        let mut start = 0;
        while let Some(found) = text[start..].find(keyword) {
            let index = start + found;
            let end = index + keyword.len();
            let before = index == 0 || !is_word(bytes[index - 1]);
            let after = end >= bytes.len() || !is_word(bytes[end]);
            if before && after {
                if best.is_none_or(|(position, _)| index < position) {
                    best = Some((index, keyword));
                }
                break;
            }
            start = end;
        }
    }
    best.map(|(_, keyword)| keyword)
}

fn is_word(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn shorten(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_TODO_TEXT {
        return trimmed.to_string();
    }
    let mut short: String = trimmed.chars().take(MAX_TODO_TEXT).collect();
    short.push('\u{2026}');
    short
}

pub fn parse_grep(output: &str, limit: usize) -> TodoReport {
    let mut items = Vec::new();
    let mut truncated = false;
    for line in output.lines() {
        let mut parts = line.splitn(3, '\0');
        let (Some(path), Some(number), Some(text)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let Ok(number) = number.parse::<u32>() else {
            continue;
        };
        let Some(kind) = keyword_in(text) else {
            continue;
        };
        if items.len() >= limit {
            truncated = true;
            break;
        }
        items.push(TodoItem {
            path: path.to_string(),
            line: number,
            kind: kind.to_string(),
            text: shorten(text),
        });
    }
    TodoReport { items, truncated }
}

pub fn parse_blame_line(output: &str) -> Option<LineAuthor> {
    let mut lines = output.lines();
    let hash = lines.next()?.split_whitespace().next()?.to_string();
    let mut author = String::new();
    let mut email = String::new();
    let mut time = 0;
    for line in lines {
        if let Some(value) = line.strip_prefix("author-mail ") {
            email = value
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>')
                .to_string();
        } else if let Some(value) = line.strip_prefix("author-time ") {
            time = value.trim().parse().unwrap_or(0);
        } else if let Some(value) = line.strip_prefix("author ") {
            author = value.to_string();
        } else if line.starts_with('\t') {
            break;
        }
    }
    let committed = !hash.chars().all(|character| character == '0');
    Some(LineAuthor {
        hash,
        author,
        email,
        time,
        committed,
    })
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

async fn has_head(repo: &Path) -> AppResult<bool> {
    Ok(
        git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"])
            .await?
            .success(),
    )
}

pub async fn collect_stats(repo: &Path, limit: u32, cancel: CancelToken) -> AppResult<RepoStats> {
    if limit == 0 || limit > MAX_COMMIT_LIMIT {
        return Err(AppError::invalid_input("invalid commit limit"));
    }
    if !has_head(repo).await? {
        return Ok(aggregate(&[], now_seconds(), &HashMap::new(), limit, false));
    }
    let count = format!("-n{}", u64::from(limit) + 1);
    let log = git_streaming(
        Some(repo),
        &[
            "log",
            &count,
            "--no-merges",
            "--no-renames",
            "--numstat",
            "--date=format-local:%Y-%m-%d",
            "--format=%x1e%H%x1f%an%x1f%ae%x1f%at%x1f%ad",
            "HEAD",
        ],
        cancel.clone(),
        &|_| {},
    )
    .await?;
    let tree = git_streaming(
        Some(repo),
        &["ls-tree", "-r", "-l", "-z", "HEAD"],
        cancel.clone(),
        &|_| {},
    )
    .await?;
    if cancel.is_cancelled() {
        return Err(AppError::cancelled());
    }
    let text = log.text();
    let tree_text = tree.text();
    let now = now_seconds();
    tokio::task::spawn_blocking(move || {
        let mut commits = parse_log(&text);
        let truncated = commits.len() > limit as usize;
        commits.truncate(limit as usize);
        let sizes = parse_tree_sizes(&tree_text);
        aggregate(&commits, now, &sizes, limit, truncated)
    })
    .await
    .map_err(|error| AppError::invalid_input(error.to_string()))
}

pub async fn find_todos(repo: &Path, limit: usize) -> AppResult<TodoReport> {
    if limit == 0 || limit > MAX_TODO_LIMIT {
        return Err(AppError::invalid_input("invalid result limit"));
    }
    let output = git_unchecked(
        repo,
        &[
            "grep",
            "-n",
            "-I",
            "-z",
            "--no-color",
            "-E",
            "-e",
            TODO_PATTERN,
        ],
    )
    .await?;
    match output.exit_code {
        0 => Ok(parse_grep(&output.text(), limit)),
        1 => Ok(TodoReport {
            items: Vec::new(),
            truncated: false,
        }),
        _ => Err(AppError::from_git_failure(&output.text(), &output.stderr)),
    }
}

pub async fn line_author(repo: &Path, path: &str, line: u32) -> AppResult<LineAuthor> {
    ensure_relative_path(path)?;
    if line == 0 {
        return Err(AppError::invalid_input("invalid line"));
    }
    let range = format!("{line},{line}");
    let output = git_unchecked(repo, &["blame", "--porcelain", "-L", &range, "--", path]).await?;
    if !output.success() {
        return Err(AppError::from_git_failure(&output.text(), &output.stderr));
    }
    parse_blame_line(&output.text())
        .ok_or_else(|| AppError::invalid_input("unexpected blame output"))
}

#[tauri::command]
pub async fn stats_collect(
    state: State<'_, AppState>,
    repo_path: String,
    job_id: String,
    limit: Option<u32>,
) -> AppResult<RepoStats> {
    let guard = state.jobs.register(&job_id);
    collect_stats(
        Path::new(&repo_path),
        limit.unwrap_or(DEFAULT_COMMIT_LIMIT),
        guard.token(),
    )
    .await
}

#[tauri::command]
pub async fn stats_todos(repo_path: String, limit: Option<usize>) -> AppResult<TodoReport> {
    find_todos(Path::new(&repo_path), limit.unwrap_or(DEFAULT_TODO_LIMIT)).await
}

#[tauri::command]
pub async fn stats_line_author(
    repo_path: String,
    path: String,
    line: u32,
) -> AppResult<LineAuthor> {
    line_author(Path::new(&repo_path), &path, line).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOG: &str = "\u{1e}aaa\u{1f}Ana\u{1f}Ana@Example.com\u{1f}1700000000\u{1f}2023-11-14\n\n3\t1\tsrc/main.rs\n-\t-\tassets/logo.png\n\u{1e}bbb\u{1f}Beto\u{1f}beto@example.com\u{1f}1690000000\u{1f}2023-07-22\n\n10\t0\tREADME.md\n";

    #[test]
    fn the_log_is_split_by_record_and_field_separators() {
        let commits = parse_log(LOG);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].email, "ana@example.com");
        assert_eq!(commits[0].day, "2023-11-14");
        assert_eq!(commits[0].files.len(), 2);
        assert_eq!(commits[0].files[1].additions, 0);
        assert_eq!(commits[1].files[0].path, "README.md");
    }

    #[test]
    fn names_with_tabs_or_spaces_survive_the_separators() {
        let commits = parse_log("\u{1e}c\u{1f}Ana  Maria\u{1f}a@x\u{1f}5\u{1f}1970-01-01\n");
        assert_eq!(commits[0].name, "Ana  Maria");
        assert!(commits[0].files.is_empty());
    }

    fn commit(email: &str, time: i64, day: &str, files: &[(&str, u32, u32)]) -> LogCommit {
        LogCommit {
            name: email.to_uppercase(),
            email: email.to_string(),
            time,
            day: day.to_string(),
            files: files
                .iter()
                .map(|(path, additions, deletions)| FileChange {
                    path: (*path).to_string(),
                    additions: *additions,
                    deletions: *deletions,
                })
                .collect(),
        }
    }

    #[test]
    fn aggregation_groups_people_files_folders_and_recent_days() {
        let now = 1_000_000_000;
        let old = now - ACTIVITY_SECONDS - 10;
        let commits = vec![
            commit(
                "a@x",
                now - 10,
                "2001-09-09",
                &[("src/a.rs", 5, 1), ("src/b.rs", 2, 0)],
            ),
            commit("b@x", now - 20, "2001-09-09", &[("src/a.rs", 1, 1)]),
            commit("a@x", old, "2000-01-01", &[("docs/x.md", 4, 0)]),
        ];
        let stats = aggregate(&commits, now, &HashMap::new(), 100, false);
        assert_eq!(
            stats.activity,
            vec![DayActivity {
                date: "2001-09-09".into(),
                commits: 2
            }]
        );
        let ana = &stats.contributors[0];
        assert_eq!((ana.email.as_str(), ana.commits), ("a@x", 2));
        assert_eq!((ana.additions, ana.deletions), (11, 1));
        assert_eq!((ana.first_commit, ana.last_commit), (old, now - 10));
        assert_eq!(stats.files[0].path, "src/a.rs");
        assert_eq!((stats.files[0].commits, stats.files[0].authors), (2, 2));
        assert_eq!(stats.folders[0].path, "src");
        assert_eq!(stats.folders[0].commits, 2);
    }

    #[test]
    fn only_existing_files_with_one_author_and_enough_commits_count_for_the_bus_factor() {
        let mut commits = Vec::new();
        for index in 0..5 {
            commits.push(commit(
                "a@x",
                index,
                "",
                &[("solo.rs", 1, 0), ("gone.rs", 1, 0)],
            ));
            commits.push(commit(
                if index == 0 { "b@x" } else { "a@x" },
                index,
                "",
                &[("shared.rs", 1, 0)],
            ));
        }
        commits.push(commit("a@x", 9, "", &[("few.rs", 1, 0)]));
        let sizes = HashMap::from([
            ("solo.rs".to_string(), 900),
            ("shared.rs".to_string(), 50),
            ("few.rs".to_string(), 10),
        ]);
        let stats = aggregate(&commits, 0, &sizes, 100, false);
        assert_eq!(stats.bus_factor.len(), 1);
        assert_eq!(stats.bus_factor[0].path, "solo.rs");
        assert_eq!(stats.bus_factor[0].size, 900);
        assert_eq!(stats.bus_factor[0].email, "a@x");
    }

    #[test]
    fn tree_sizes_skip_submodules_and_keep_spaces_in_names() {
        let output = "100644 blob abc     120\tsrc/a b.rs|160000 commit def       -\tvendor|"
            .replace('|', "\0");
        let output = output.as_str();
        let sizes = parse_tree_sizes(output);
        assert_eq!(sizes.get("src/a b.rs"), Some(&120));
        assert!(!sizes.contains_key("vendor"));
    }

    #[test]
    fn grep_results_keep_colons_in_paths_and_pick_the_keyword() {
        let output = "a:b.rs|12|    // FIXME: later TODO\nsrc/x.rs|3|let todo_list = 1; // XXX\nsrc/y.rs|4|TODOS here\n"
            .replace('|', "\0");
        let report = parse_grep(&output, 10);
        assert_eq!(report.items.len(), 2);
        assert_eq!(report.items[0].path, "a:b.rs");
        assert_eq!(report.items[0].line, 12);
        assert_eq!(report.items[0].kind, "FIXME");
        assert_eq!(report.items[0].text, "// FIXME: later TODO");
        assert_eq!(report.items[1].kind, "XXX");
        assert!(!report.truncated);
    }

    #[test]
    fn grep_results_stop_at_the_limit() {
        let output = "a|1|TODO\na|2|TODO\na|3|TODO\n".replace('|', "\0");
        let report = parse_grep(&output, 2);
        assert_eq!(report.items.len(), 2);
        assert!(report.truncated);
    }

    #[test]
    fn blame_porcelain_gives_author_and_time() {
        let output = "abc123 4 4 1\nauthor Ana\nauthor-mail <ana@x>\nauthor-time 1700000000\nauthor-tz +0000\nsummary s\nfilename f\n\t// TODO\n";
        let author = parse_blame_line(output).expect("author");
        assert_eq!(author.author, "Ana");
        assert_eq!(author.email, "ana@x");
        assert_eq!(author.time, 1_700_000_000);
        assert!(author.committed);
        let pending = parse_blame_line(
            "0000000000000000000000000000000000000000 1 1 1\nauthor Not Committed Yet\n",
        )
        .expect("pending");
        assert!(!pending.committed);
    }
}
