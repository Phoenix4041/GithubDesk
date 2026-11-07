use serde::Serialize;

pub const REFLOG_FORMAT: &str = "--format=%H%x1f%ct%x1f%gs";
const FIELD_SEPARATOR: char = '\u{1f}';

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReflogAction {
    Commit,
    CommitAmend,
    Checkout,
    Merge,
    Rebase,
    Reset,
    CherryPick,
    Revert,
    Pull,
    Clone,
    Branch,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub index: u32,
    pub hash: String,
    pub short_hash: String,
    pub time: i64,
    pub action: ReflogAction,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UndoStrategy {
    KeepChangesStaged,
    RestoreAll,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoPlan {
    pub action: ReflogAction,
    pub strategy: UndoStrategy,
    pub message: String,
    pub current_hash: String,
    pub target_hash: String,
    pub target_short_hash: String,
}

fn classify(subject: &str) -> ReflogAction {
    let lowered = subject.to_lowercase();
    if lowered.starts_with("commit (amend)") {
        ReflogAction::CommitAmend
    } else if lowered.starts_with("commit (merge)") {
        ReflogAction::Merge
    } else if lowered.starts_with("commit") {
        ReflogAction::Commit
    } else if lowered.starts_with("checkout") {
        ReflogAction::Checkout
    } else if lowered.starts_with("merge") {
        ReflogAction::Merge
    } else if lowered.starts_with("rebase") {
        ReflogAction::Rebase
    } else if lowered.starts_with("reset") {
        ReflogAction::Reset
    } else if lowered.starts_with("cherry-pick") {
        ReflogAction::CherryPick
    } else if lowered.starts_with("revert") {
        ReflogAction::Revert
    } else if lowered.starts_with("pull") {
        ReflogAction::Pull
    } else if lowered.starts_with("clone") {
        ReflogAction::Clone
    } else if lowered.starts_with("branch") {
        ReflogAction::Branch
    } else {
        ReflogAction::Other
    }
}

fn message_of(subject: &str) -> String {
    match subject.split_once(": ") {
        Some((_, message)) => message.to_string(),
        None => subject.to_string(),
    }
}

pub fn parse_reflog(text: &str) -> Vec<ReflogEntry> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .enumerate()
        .filter_map(|(position, line)| {
            let mut fields = line.splitn(3, FIELD_SEPARATOR);
            let hash = fields.next()?.trim();
            let time = fields.next()?.trim().parse().unwrap_or(0);
            let subject = fields.next()?.trim();
            if hash.is_empty() {
                return None;
            }
            Some(ReflogEntry {
                index: u32::try_from(position).ok()?,
                hash: hash.to_string(),
                short_hash: hash.chars().take(7).collect(),
                time,
                action: classify(subject),
                message: message_of(subject),
            })
        })
        .collect()
}

fn can_undo(action: ReflogAction) -> bool {
    matches!(
        action,
        ReflogAction::Commit
            | ReflogAction::CommitAmend
            | ReflogAction::Merge
            | ReflogAction::Rebase
            | ReflogAction::Reset
            | ReflogAction::CherryPick
            | ReflogAction::Revert
            | ReflogAction::Pull
    )
}

pub fn plan_undo(entries: &[ReflogEntry]) -> Option<UndoPlan> {
    let latest = entries.first()?;
    if !can_undo(latest.action) {
        return None;
    }
    let skip = if latest.action == ReflogAction::Rebase {
        entries
            .iter()
            .take_while(|entry| entry.action == ReflogAction::Rebase)
            .count()
    } else {
        1
    };
    let target = entries.get(skip)?;
    let strategy = match latest.action {
        ReflogAction::Commit | ReflogAction::CommitAmend => UndoStrategy::KeepChangesStaged,
        _ => UndoStrategy::RestoreAll,
    };
    Some(UndoPlan {
        action: latest.action,
        strategy,
        message: latest.message.clone(),
        current_hash: latest.hash.clone(),
        target_hash: target.hash.clone(),
        target_short_hash: target.short_hash.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(hash: &str, subject: &str) -> String {
        format!("{hash}\u{1f}100\u{1f}{subject}")
    }

    fn entries(subjects: &[(&str, &str)]) -> Vec<ReflogEntry> {
        let text: Vec<String> = subjects
            .iter()
            .map(|(hash, subject)| line(hash, subject))
            .collect();
        parse_reflog(&text.join("\n"))
    }

    #[test]
    fn classifies_the_usual_reflog_subjects() {
        let parsed = entries(&[
            ("aaaaaaa1", "commit: add feature"),
            ("bbbbbbb2", "commit (amend): fix typo"),
            ("ccccccc3", "commit (merge): Merge branch 'x'"),
            ("ddddddd4", "checkout: moving from main to topic"),
            ("eeeeeee5", "reset: moving to HEAD~1"),
            ("fffffff6", "rebase (finish): returning to refs/heads/main"),
            ("1111111a", "pull: Fast-forward"),
            ("2222222b", "cherry-pick: Apply fix"),
            ("3333333c", "revert: Revert \"x\""),
            ("4444444d", "merge topic: Fast-forward"),
            ("5555555e", "commit (initial): first"),
            ("6666666f", "clone: from https://example.com/r.git"),
            ("7777777a", "something odd"),
        ]);
        let actions: Vec<ReflogAction> = parsed.iter().map(|entry| entry.action).collect();
        assert_eq!(
            actions,
            vec![
                ReflogAction::Commit,
                ReflogAction::CommitAmend,
                ReflogAction::Merge,
                ReflogAction::Checkout,
                ReflogAction::Reset,
                ReflogAction::Rebase,
                ReflogAction::Pull,
                ReflogAction::CherryPick,
                ReflogAction::Revert,
                ReflogAction::Merge,
                ReflogAction::Commit,
                ReflogAction::Clone,
                ReflogAction::Other,
            ]
        );
    }

    #[test]
    fn keeps_the_text_after_the_action_as_the_message() {
        let parsed = entries(&[("aaaaaaa1", "commit: add: feature")]);
        assert_eq!(parsed[0].message, "add: feature");
        assert_eq!(parsed[0].short_hash, "aaaaaaa");
        assert_eq!(parsed[0].index, 0);
    }

    #[test]
    fn undo_goes_back_one_entry_for_simple_operations() {
        let parsed = entries(&[("new1111", "commit: second"), ("old2222", "commit: first")]);
        let plan = plan_undo(&parsed).expect("plan");
        assert_eq!(plan.target_hash, "old2222");
        assert_eq!(plan.current_hash, "new1111");
        assert_eq!(plan.action, ReflogAction::Commit);
        assert_eq!(plan.strategy, UndoStrategy::KeepChangesStaged);
    }

    #[test]
    fn undo_skips_the_whole_run_of_a_rebase() {
        let parsed = entries(&[
            ("fin1111", "rebase (finish): returning to refs/heads/main"),
            ("pic2222", "rebase (pick): second"),
            ("pic3333", "rebase (pick): first"),
            ("sta4444", "rebase (start): checkout abc"),
            ("before5", "commit: before the rebase"),
        ]);
        let plan = plan_undo(&parsed).expect("plan");
        assert_eq!(plan.target_hash, "before5");
        assert_eq!(plan.action, ReflogAction::Rebase);
        assert_eq!(plan.strategy, UndoStrategy::RestoreAll);
    }

    #[test]
    fn undo_is_not_offered_after_switching_branches_or_without_history() {
        let checkout = entries(&[
            ("aaaaaaa1", "checkout: moving from a to b"),
            ("bbbbbbb2", "commit: x"),
        ]);
        assert_eq!(plan_undo(&checkout), None);

        let single = entries(&[("aaaaaaa1", "commit (initial): first")]);
        assert_eq!(plan_undo(&single), None);
        assert_eq!(plan_undo(&[]), None);
    }
}
