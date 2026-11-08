use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OperationKind {
    Merge,
    CherryPick,
    Revert,
    Rebase,
    Am,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoOperation {
    pub kind: OperationKind,
    pub step: Option<u32>,
    pub total: Option<u32>,
    pub branch: Option<String>,
}

impl RepoOperation {
    fn simple(kind: OperationKind) -> Self {
        Self {
            kind,
            step: None,
            total: None,
            branch: None,
        }
    }
}

fn read_number(path: &Path) -> Option<u32> {
    std::fs::read_to_string(path).ok()?.trim().parse().ok()
}

fn rebase_operation(directory: &Path, step_file: &str, total_file: &str) -> RepoOperation {
    let branch = std::fs::read_to_string(directory.join("head-name"))
        .ok()
        .map(|text| text.trim().to_string())
        .map(|text| {
            text.strip_prefix("refs/heads/")
                .map_or(text.clone(), str::to_string)
        })
        .filter(|name| !name.is_empty() && name != "detached HEAD");
    RepoOperation {
        kind: OperationKind::Rebase,
        step: read_number(&directory.join(step_file)),
        total: read_number(&directory.join(total_file)),
        branch,
    }
}

fn am_operation(directory: &Path) -> RepoOperation {
    RepoOperation {
        kind: OperationKind::Am,
        step: read_number(&directory.join("next")),
        total: read_number(&directory.join("last")),
        branch: None,
    }
}

fn sequencer_kind(git_dir: &Path) -> Option<OperationKind> {
    let todo = std::fs::read_to_string(git_dir.join("sequencer").join("todo")).ok()?;
    let first = todo
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))?;
    let command = first.split_whitespace().next()?;
    match command {
        "revert" | "r" => Some(OperationKind::Revert),
        "pick" | "p" => Some(OperationKind::CherryPick),
        _ => None,
    }
}

pub fn read_operation(git_dir: &Path) -> Option<RepoOperation> {
    let rebase_merge = git_dir.join("rebase-merge");
    if rebase_merge.is_dir() {
        return Some(rebase_operation(&rebase_merge, "msgnum", "end"));
    }
    let rebase_apply = git_dir.join("rebase-apply");
    if rebase_apply.join("rebasing").exists() {
        return Some(rebase_operation(&rebase_apply, "next", "last"));
    }
    if rebase_apply.join("applying").exists() {
        return Some(am_operation(&rebase_apply));
    }
    if git_dir.join("MERGE_HEAD").exists() {
        return Some(RepoOperation::simple(OperationKind::Merge));
    }
    if git_dir.join("REVERT_HEAD").exists() {
        return Some(RepoOperation::simple(OperationKind::Revert));
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return Some(RepoOperation::simple(OperationKind::CherryPick));
    }
    sequencer_kind(git_dir).map(RepoOperation::simple)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write(directory: &Path, relative: &str, content: &str) {
        let path = directory.join(relative);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("directories");
        std::fs::write(path, content).expect("write");
    }

    #[test]
    fn clean_directory_has_no_operation() {
        let dir = TempDir::new().expect("temp");
        assert_eq!(read_operation(dir.path()), None);
    }

    #[test]
    fn detects_merge_cherry_pick_and_revert() {
        let dir = TempDir::new().expect("temp");
        write(dir.path(), "MERGE_HEAD", "abc\n");
        assert_eq!(
            read_operation(dir.path()).map(|op| op.kind),
            Some(OperationKind::Merge)
        );

        let dir = TempDir::new().expect("temp");
        write(dir.path(), "CHERRY_PICK_HEAD", "abc\n");
        assert_eq!(
            read_operation(dir.path()).map(|op| op.kind),
            Some(OperationKind::CherryPick)
        );

        let dir = TempDir::new().expect("temp");
        write(dir.path(), "REVERT_HEAD", "abc\n");
        assert_eq!(
            read_operation(dir.path()).map(|op| op.kind),
            Some(OperationKind::Revert)
        );
    }

    #[test]
    fn reads_interactive_rebase_progress() {
        let dir = TempDir::new().expect("temp");
        write(dir.path(), "rebase-merge/msgnum", "2\n");
        write(dir.path(), "rebase-merge/end", "5\n");
        write(dir.path(), "rebase-merge/head-name", "refs/heads/feature\n");
        write(dir.path(), "CHERRY_PICK_HEAD", "abc\n");

        let operation = read_operation(dir.path()).expect("operation");
        assert_eq!(operation.kind, OperationKind::Rebase);
        assert_eq!(operation.step, Some(2));
        assert_eq!(operation.total, Some(5));
        assert_eq!(operation.branch.as_deref(), Some("feature"));
    }

    #[test]
    fn detached_rebase_has_no_branch_name() {
        let dir = TempDir::new().expect("temp");
        write(dir.path(), "rebase-merge/head-name", "detached HEAD\n");
        let operation = read_operation(dir.path()).expect("operation");
        assert_eq!(operation.branch, None);
    }

    #[test]
    fn apply_directory_tells_a_mailbox_apply_from_a_rebase() {
        let dir = TempDir::new().expect("temp");
        write(dir.path(), "rebase-apply/applying", "");
        write(
            dir.path(),
            "rebase-apply/next",
            "2
",
        );
        write(
            dir.path(),
            "rebase-apply/last",
            "4
",
        );
        let applying = read_operation(dir.path()).expect("operation");
        assert_eq!(applying.kind, OperationKind::Am);
        assert_eq!(applying.step, Some(2));
        assert_eq!(applying.total, Some(4));
        assert_eq!(applying.branch, None);

        let dir = TempDir::new().expect("temp");
        write(dir.path(), "rebase-apply/rebasing", "");
        write(dir.path(), "rebase-apply/next", "1\n");
        write(dir.path(), "rebase-apply/last", "3\n");
        let operation = read_operation(dir.path()).expect("operation");
        assert_eq!(operation.kind, OperationKind::Rebase);
        assert_eq!(operation.step, Some(1));
        assert_eq!(operation.total, Some(3));
    }

    #[test]
    fn sequencer_todo_identifies_pending_picks_and_reverts() {
        let dir = TempDir::new().expect("temp");
        write(
            dir.path(),
            "sequencer/todo",
            "pick abc123 first\npick def456 second\n",
        );
        assert_eq!(
            read_operation(dir.path()).map(|op| op.kind),
            Some(OperationKind::CherryPick)
        );

        let dir = TempDir::new().expect("temp");
        write(
            dir.path(),
            "sequencer/todo",
            "# comment\nrevert abc123 first\n",
        );
        assert_eq!(
            read_operation(dir.path()).map(|op| op.kind),
            Some(OperationKind::Revert)
        );
    }
}
