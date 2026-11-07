use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub detached: bool,
    pub bare: bool,
    pub locked: bool,
    pub lock_reason: Option<String>,
    pub prunable: bool,
    pub prunable_reason: Option<String>,
    pub is_main: bool,
    pub is_current: bool,
}

impl Worktree {
    fn new(path: &str) -> Self {
        Self {
            path: path.to_string(),
            head: None,
            branch: None,
            detached: false,
            bare: false,
            locked: false,
            lock_reason: None,
            prunable: false,
            prunable_reason: None,
            is_main: false,
            is_current: false,
        }
    }
}

fn reason(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn parse_worktrees(text: &str) -> Vec<Worktree> {
    let separator = if text.contains('\0') { '\0' } else { '\n' };
    let mut worktrees: Vec<Worktree> = Vec::new();
    let mut current: Option<Worktree> = None;

    for field in text.split(separator) {
        if field.is_empty() {
            if let Some(done) = current.take() {
                worktrees.push(done);
            }
            continue;
        }
        let (key, value) = field.split_once(' ').unwrap_or((field, ""));
        if key == "worktree" {
            if let Some(done) = current.take() {
                worktrees.push(done);
            }
            current = Some(Worktree::new(value));
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        match key {
            "HEAD" => entry.head = reason(value),
            "branch" => {
                entry.branch = Some(
                    value
                        .strip_prefix("refs/heads/")
                        .unwrap_or(value)
                        .to_string(),
                )
            }
            "detached" => entry.detached = true,
            "bare" => entry.bare = true,
            "locked" => {
                entry.locked = true;
                entry.lock_reason = reason(value);
            }
            "prunable" => {
                entry.prunable = true;
                entry.prunable_reason = reason(value);
            }
            _ => {}
        }
    }
    if let Some(done) = current.take() {
        worktrees.push(done);
    }
    if let Some(first) = worktrees.first_mut() {
        first.is_main = true;
    }
    worktrees
}

pub fn normalize_path(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let trimmed = unified.trim_end_matches('/');
    if cfg!(windows) {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    }
}

pub fn same_path(left: &str, right: &str) -> bool {
    normalize_path(left) == normalize_path(right)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nul_separated_records() {
        let text = "worktree /repo\0HEAD aaa111\0branch refs/heads/main\0\0worktree /repo-feature\0HEAD bbb222\0branch refs/heads/feature/x\0locked in use\0\0worktree /repo-detached\0HEAD ccc333\0detached\0prunable gitdir file points to non-existent location\0\0";
        let worktrees = parse_worktrees(text);
        assert_eq!(worktrees.len(), 3);

        assert_eq!(worktrees[0].path, "/repo");
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert!(worktrees[0].is_main);
        assert!(!worktrees[0].locked);

        assert_eq!(worktrees[1].branch.as_deref(), Some("feature/x"));
        assert!(worktrees[1].locked);
        assert_eq!(worktrees[1].lock_reason.as_deref(), Some("in use"));
        assert!(!worktrees[1].is_main);

        assert!(worktrees[2].detached);
        assert_eq!(worktrees[2].branch, None);
        assert!(worktrees[2].prunable);
        assert_eq!(
            worktrees[2].prunable_reason.as_deref(),
            Some("gitdir file points to non-existent location")
        );
    }

    #[test]
    fn parses_newline_separated_records_and_bare_repositories() {
        let text =
            "worktree /bare.git\nbare\n\nworktree /linked\nHEAD abc\nbranch refs/heads/dev\n\n";
        let worktrees = parse_worktrees(text);
        assert_eq!(worktrees.len(), 2);
        assert!(worktrees[0].bare);
        assert!(worktrees[0].is_main);
        assert_eq!(worktrees[1].branch.as_deref(), Some("dev"));
    }

    #[test]
    fn keeps_paths_with_spaces_and_a_missing_final_separator() {
        let text = "worktree C:/My Projects/repo\0HEAD abc\0branch refs/heads/main\0";
        let worktrees = parse_worktrees(text);
        assert_eq!(worktrees.len(), 1);
        assert_eq!(worktrees[0].path, "C:/My Projects/repo");
    }

    #[test]
    fn locked_without_a_reason_has_no_reason_text() {
        let worktrees = parse_worktrees("worktree /a\0HEAD x\0detached\0locked\0\0");
        assert!(worktrees[0].locked);
        assert_eq!(worktrees[0].lock_reason, None);
    }

    #[test]
    fn empty_output_means_no_worktrees() {
        assert!(parse_worktrees("").is_empty());
    }

    #[test]
    fn path_comparison_ignores_separators_and_trailing_slashes() {
        assert!(same_path("C:/Repo/app/", "C:\\Repo\\app"));
        assert!(!same_path("C:/Repo/app", "C:/Repo/other"));
    }
}
