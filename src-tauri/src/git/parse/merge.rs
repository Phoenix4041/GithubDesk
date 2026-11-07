pub struct MergeTreeResult {
    pub tree: Option<String>,
    pub conflicts: Vec<String>,
}

fn looks_like_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.chars().all(|character| character.is_ascii_hexdigit())
}

pub fn parse_merge_tree(text: &str) -> MergeTreeResult {
    let mut lines = text.lines();
    let tree = lines
        .next()
        .map(str::trim)
        .filter(|value| looks_like_object_id(value))
        .map(str::to_string);
    let mut conflicts: Vec<String> = Vec::new();
    for line in lines {
        let path = line.trim_end();
        if path.is_empty() {
            break;
        }
        if !conflicts.iter().any(|known| known == path) {
            conflicts.push(path.to_string());
        }
    }
    MergeTreeResult { tree, conflicts }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TREE: &str = "ceaad1a65a0d4304429ffc5d126acde626d0785c";

    #[test]
    fn a_clean_merge_has_a_tree_and_no_conflicts() {
        let result = parse_merge_tree(&format!("{TREE}\n"));
        assert_eq!(result.tree.as_deref(), Some(TREE));
        assert!(result.conflicts.is_empty());
    }

    #[test]
    fn conflicted_files_are_listed_once_and_messages_are_ignored() {
        let text = format!("{TREE}\nsrc/a.rs\nsrc/b rs.txt\nsrc/a.rs\n\nAuto-merging src/a.rs\nCONFLICT (content)\n");
        let result = parse_merge_tree(&text);
        assert_eq!(result.tree.as_deref(), Some(TREE));
        assert_eq!(
            result.conflicts,
            vec!["src/a.rs".to_string(), "src/b rs.txt".to_string()]
        );
    }

    #[test]
    fn output_that_is_not_a_tree_is_not_trusted() {
        let result = parse_merge_tree("usage: git merge-tree\n");
        assert_eq!(result.tree, None);
        assert!(result.conflicts.is_empty());
        let empty = parse_merge_tree("");
        assert_eq!(empty.tree, None);
    }
}
