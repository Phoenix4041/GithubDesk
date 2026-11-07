use serde::Deserialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RebaseAction {
    Pick,
    Reword,
    Edit,
    Squash,
    Fixup,
    Drop,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStep {
    pub hash: String,
    pub action: RebaseAction,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TodoScript {
    pub todo: String,
    pub messages: Vec<String>,
}

struct Group {
    message: Option<String>,
    rewords: bool,
    has_members: bool,
}

fn flush(
    group: Option<Group>,
    lines: &mut Vec<String>,
    messages: &mut Vec<String>,
    path_for: &dyn Fn(usize) -> String,
) {
    let Some(group) = group else {
        return;
    };
    let Some(text) = group.message else {
        return;
    };
    if group.rewords || group.has_members {
        let index = messages.len();
        messages.push(text);
        lines.push(format!(
            "exec git commit --amend -F \"{}\"",
            path_for(index)
        ));
    }
}

fn clean_message(message: &Option<String>) -> Option<String> {
    message
        .as_deref()
        .map(|text| text.trim_end().replace("\r\n", "\n"))
        .filter(|text| !text.trim().is_empty())
}

pub fn build_todo(
    steps: &[RebaseStep],
    path_for: &dyn Fn(usize) -> String,
) -> AppResult<TodoScript> {
    if steps.is_empty() {
        return Err(AppError::invalid_input("the rebase has no commits"));
    }
    let mut lines: Vec<String> = Vec::new();
    let mut messages: Vec<String> = Vec::new();
    let mut group: Option<Group> = None;

    for step in steps {
        match step.action {
            RebaseAction::Drop => {
                lines.push(format!("drop {}", step.hash));
            }
            RebaseAction::Pick | RebaseAction::Reword | RebaseAction::Edit => {
                flush(group.take(), &mut lines, &mut messages, path_for);
                let rewords = step.action == RebaseAction::Reword;
                let message = clean_message(&step.message);
                if rewords && message.is_none() {
                    return Err(AppError::invalid_input("a reworded commit needs a message"));
                }
                let verb = if step.action == RebaseAction::Edit {
                    "edit"
                } else {
                    "pick"
                };
                lines.push(format!("{verb} {}", step.hash));
                group = Some(Group {
                    message,
                    rewords,
                    has_members: false,
                });
            }
            RebaseAction::Squash | RebaseAction::Fixup => {
                let Some(current) = group.as_mut() else {
                    return Err(AppError::invalid_input(
                        "the first kept commit cannot be squashed into a previous one",
                    ));
                };
                current.has_members = true;
                let verb = if current.message.is_some() || step.action == RebaseAction::Fixup {
                    "fixup"
                } else {
                    "squash"
                };
                lines.push(format!("{verb} {}", step.hash));
            }
        }
    }
    flush(group.take(), &mut lines, &mut messages, path_for);

    let mut todo = lines.join("\n");
    todo.push('\n');
    Ok(TodoScript { todo, messages })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(hash: &str, action: RebaseAction, message: Option<&str>) -> RebaseStep {
        RebaseStep {
            hash: hash.to_string(),
            action,
            message: message.map(str::to_string),
        }
    }

    fn path(index: usize) -> String {
        format!("msg-{index}.txt")
    }

    #[test]
    fn plain_picks_and_drops_keep_their_order() {
        let script = build_todo(
            &[
                step("b", RebaseAction::Pick, None),
                step("a", RebaseAction::Drop, None),
                step("c", RebaseAction::Pick, None),
            ],
            &path,
        )
        .expect("todo");
        assert_eq!(script.todo, "pick b\ndrop a\npick c\n");
        assert!(script.messages.is_empty());
    }

    #[test]
    fn reword_picks_then_amends_with_the_new_message() {
        let script = build_todo(
            &[step("a", RebaseAction::Reword, Some("New title\n\nBody\n"))],
            &path,
        )
        .expect("todo");
        assert_eq!(
            script.todo,
            "pick a\nexec git commit --amend -F \"msg-0.txt\"\n"
        );
        assert_eq!(script.messages, vec!["New title\n\nBody".to_string()]);
    }

    #[test]
    fn reword_without_a_message_is_rejected() {
        assert!(build_todo(&[step("a", RebaseAction::Reword, Some("  "))], &path).is_err());
        assert!(build_todo(&[step("a", RebaseAction::Reword, None)], &path).is_err());
    }

    #[test]
    fn squash_without_a_message_lets_git_combine_them() {
        let script = build_todo(
            &[
                step("a", RebaseAction::Pick, None),
                step("b", RebaseAction::Squash, None),
                step("c", RebaseAction::Fixup, None),
            ],
            &path,
        )
        .expect("todo");
        assert_eq!(script.todo, "pick a\nsquash b\nfixup c\n");
        assert!(script.messages.is_empty());
    }

    #[test]
    fn squash_with_a_final_message_uses_fixup_and_one_amend() {
        let script = build_todo(
            &[
                step("a", RebaseAction::Pick, Some("Combined work")),
                step("b", RebaseAction::Squash, None),
                step("c", RebaseAction::Squash, None),
                step("d", RebaseAction::Pick, None),
            ],
            &path,
        )
        .expect("todo");
        assert_eq!(
            script.todo,
            "pick a\nfixup b\nfixup c\nexec git commit --amend -F \"msg-0.txt\"\npick d\n"
        );
        assert_eq!(script.messages, vec!["Combined work".to_string()]);
    }

    #[test]
    fn a_message_on_a_lone_pick_is_ignored() {
        let script =
            build_todo(&[step("a", RebaseAction::Pick, Some("ignored"))], &path).expect("todo");
        assert_eq!(script.todo, "pick a\n");
        assert!(script.messages.is_empty());
    }

    #[test]
    fn edit_stops_and_keeps_the_amend_after_its_group() {
        let script = build_todo(
            &[
                step("a", RebaseAction::Edit, Some("Edited title")),
                step("b", RebaseAction::Fixup, None),
            ],
            &path,
        )
        .expect("todo");
        assert_eq!(
            script.todo,
            "edit a\nfixup b\nexec git commit --amend -F \"msg-0.txt\"\n"
        );
    }

    #[test]
    fn squash_cannot_start_the_list_or_follow_only_drops() {
        assert!(build_todo(&[step("a", RebaseAction::Squash, None)], &path).is_err());
        assert!(build_todo(
            &[
                step("a", RebaseAction::Drop, None),
                step("b", RebaseAction::Fixup, None)
            ],
            &path
        )
        .is_err());
    }

    #[test]
    fn empty_plans_are_rejected() {
        assert!(build_todo(&[], &path).is_err());
    }

    #[test]
    fn several_groups_get_separate_message_files() {
        let script = build_todo(
            &[
                step("a", RebaseAction::Reword, Some("First")),
                step("b", RebaseAction::Reword, Some("Second")),
            ],
            &path,
        )
        .expect("todo");
        assert_eq!(script.messages.len(), 2);
        assert!(script.todo.contains("msg-0.txt"));
        assert!(script.todo.contains("msg-1.txt"));
    }
}
