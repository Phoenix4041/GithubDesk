use std::collections::HashSet;

use serde::Deserialize;

use crate::git::parse::diff::{FileDiff, LineKind};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineSelection {
    pub hunk_index: usize,
    pub line_indices: Vec<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatchDirection {
    Stage,
    Unstage,
}

fn selected_lines(selections: &[LineSelection], hunk_index: usize) -> HashSet<usize> {
    selections
        .iter()
        .filter(|selection| selection.hunk_index == hunk_index)
        .flat_map(|selection| selection.line_indices.iter().copied())
        .collect()
}

pub fn build_patch(
    diff: &FileDiff,
    selections: &[LineSelection],
    direction: PatchDirection,
) -> Option<String> {
    let mut body = String::new();
    let mut delta: i64 = 0;

    for (hunk_index, hunk) in diff.hunks.iter().enumerate() {
        let selected = selected_lines(selections, hunk_index);
        if selected.is_empty() {
            continue;
        }

        let mut lines = String::new();
        let mut old_count: u32 = 0;
        let mut new_count: u32 = 0;
        let mut has_change = false;
        let mut previous_emitted = false;

        for (line_index, line) in hunk.lines.iter().enumerate() {
            let is_selected = selected.contains(&line_index);
            let prefix = match line.kind {
                LineKind::Context => Some(' '),
                LineKind::Added => {
                    if is_selected {
                        Some('+')
                    } else if direction == PatchDirection::Unstage {
                        Some(' ')
                    } else {
                        None
                    }
                }
                LineKind::Removed => {
                    if is_selected {
                        Some('-')
                    } else if direction == PatchDirection::Stage {
                        Some(' ')
                    } else {
                        None
                    }
                }
                LineKind::NoNewline => {
                    if previous_emitted {
                        lines.push_str(&line.content);
                        lines.push('\n');
                    }
                    continue;
                }
            };

            previous_emitted = prefix.is_some();
            let Some(prefix) = prefix else {
                continue;
            };

            match prefix {
                '+' => {
                    new_count += 1;
                    has_change = true;
                }
                '-' => {
                    old_count += 1;
                    has_change = true;
                }
                _ => {
                    old_count += 1;
                    new_count += 1;
                }
            }
            lines.push(prefix);
            lines.push_str(&line.content);
            lines.push('\n');
        }

        if !has_change {
            continue;
        }

        let (old_start, new_start) = match direction {
            PatchDirection::Stage => (
                i64::from(hunk.old_start),
                i64::from(hunk.old_start) + delta,
            ),
            PatchDirection::Unstage => (
                i64::from(hunk.new_start) - delta,
                i64::from(hunk.new_start),
            ),
        };
        body.push_str(&format!(
            "@@ -{old_start},{old_count} +{new_start},{new_count} @@\n"
        ));
        body.push_str(&lines);
        delta += i64::from(new_count) - i64::from(old_count);
    }

    if body.is_empty() {
        return None;
    }

    let path = &diff.path;
    Some(format!(
        "diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n{body}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::parse::diff::parse_unified_diff;

    const DIFF: &str = "@@ -1,4 +1,5 @@\n one\n-two\n+TWO\n+extra\n three\n four\n@@ -20,3 +21,3 @@\n x\n-y\n+Y\n z\n";

    fn diff() -> FileDiff {
        parse_unified_diff("a.txt", DIFF)
    }

    #[test]
    fn stages_only_selected_added_line() {
        let selections = vec![LineSelection {
            hunk_index: 0,
            line_indices: vec![3],
        }];
        let patch = build_patch(&diff(), &selections, PatchDirection::Stage).expect("patch");
        assert!(patch.starts_with("diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n"));
        assert!(patch.contains("@@ -1,4 +1,5 @@\n one\n two\n+extra\n three\n four\n"));
        assert!(!patch.contains("-two"));
        assert!(!patch.contains("+TWO"));
        assert!(!patch.contains("@@ -20"));
    }

    #[test]
    fn stages_removed_line_and_keeps_unselected_added_out() {
        let selections = vec![LineSelection {
            hunk_index: 0,
            line_indices: vec![1],
        }];
        let patch = build_patch(&diff(), &selections, PatchDirection::Stage).expect("patch");
        assert!(patch.contains("@@ -1,4 +1,3 @@\n one\n-two\n three\n four\n"));
    }

    #[test]
    fn unstage_keeps_unselected_added_lines_as_context() {
        let selections = vec![LineSelection {
            hunk_index: 0,
            line_indices: vec![3],
        }];
        let patch = build_patch(&diff(), &selections, PatchDirection::Unstage).expect("patch");
        assert!(patch.contains("@@ -1,4 +1,5 @@\n one\n TWO\n+extra\n three\n four\n"));
        assert!(!patch.contains("-two"));
    }

    #[test]
    fn adjusts_following_hunk_offsets_when_lines_are_skipped() {
        let selections = vec![
            LineSelection {
                hunk_index: 0,
                line_indices: vec![1],
            },
            LineSelection {
                hunk_index: 1,
                line_indices: vec![1, 2],
            },
        ];
        let patch = build_patch(&diff(), &selections, PatchDirection::Stage).expect("patch");
        assert!(patch.contains("@@ -1,4 +1,3 @@"));
        assert!(patch.contains("@@ -20,3 +19,3 @@"));
    }

    #[test]
    fn returns_none_without_selected_changes() {
        assert!(build_patch(&diff(), &[], PatchDirection::Stage).is_none());
        let only_context = vec![LineSelection {
            hunk_index: 0,
            line_indices: vec![0],
        }];
        assert!(build_patch(&diff(), &only_context, PatchDirection::Stage).is_none());
    }

    #[test]
    fn keeps_no_newline_marker_only_after_emitted_line() {
        let text = "@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n";
        let diff = parse_unified_diff("n.txt", text);
        let selections = vec![LineSelection {
            hunk_index: 0,
            line_indices: vec![3],
        }];
        let patch = build_patch(&diff, &selections, PatchDirection::Stage).expect("patch");
        assert!(patch.contains(" b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n"));

        let stage_removed_only = vec![LineSelection {
            hunk_index: 0,
            line_indices: vec![1],
        }];
        let patch = build_patch(&diff, &stage_removed_only, PatchDirection::Stage).expect("patch");
        assert!(patch.contains("-b\n\\ No newline at end of file\n"));
        assert!(!patch.contains("+c"));
    }
}
