use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreMatch {
    pub path: String,
    pub ignored: bool,
    pub source: Option<String>,
    pub line: Option<u32>,
    pub pattern: Option<String>,
}

pub fn parse_check_ignore(text: &str) -> Vec<IgnoreMatch> {
    let fields: Vec<&str> = text.split('\0').collect();
    let mut matches = Vec::new();
    for chunk in fields.chunks(4) {
        let [source, line, pattern, path] = chunk else {
            continue;
        };
        if path.is_empty() {
            continue;
        }
        let ignored = !source.is_empty() || !pattern.is_empty();
        matches.push(IgnoreMatch {
            path: (*path).to_string(),
            ignored,
            source: non_empty(source),
            line: line.parse().ok(),
            pattern: non_empty(pattern),
        });
    }
    matches
}

fn non_empty(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub fn parse_nul_paths(text: &str) -> Vec<String> {
    text.split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect()
}

pub fn append_missing_lines(existing: &str, lines: &[String]) -> (String, usize) {
    let present: std::collections::HashSet<&str> = existing.lines().map(str::trim).collect();
    let mut additions: Vec<&str> = Vec::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() || present.contains(trimmed) || additions.contains(&trimmed) {
            continue;
        }
        additions.push(trimmed);
    }
    if additions.is_empty() {
        return (existing.to_string(), 0);
    }
    let mut result = existing.to_string();
    if !result.is_empty() && !result.ends_with('\n') {
        result.push('\n');
    }
    for line in &additions {
        result.push_str(line);
        result.push('\n');
    }
    (result, additions.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_matching_and_non_matching_entries() {
        let text = ".gitignore\u{0}3\u{0}*.log\u{0}debug.log\u{0}\u{0}\u{0}\u{0}src/main.rs\u{0}";
        let matches = parse_check_ignore(text);
        assert_eq!(matches.len(), 2);
        assert!(matches[0].ignored);
        assert_eq!(matches[0].source.as_deref(), Some(".gitignore"));
        assert_eq!(matches[0].line, Some(3));
        assert_eq!(matches[0].pattern.as_deref(), Some("*.log"));
        assert_eq!(matches[0].path, "debug.log");
        assert!(!matches[1].ignored);
        assert_eq!(matches[1].source, None);
        assert_eq!(matches[1].line, None);
        assert_eq!(matches[1].path, "src/main.rs");
    }

    #[test]
    fn negated_rules_still_report_their_source() {
        let text = ".gitignore\u{0}5\u{0}!keep.log\u{0}keep.log\u{0}";
        let matches = parse_check_ignore(text);
        assert_eq!(matches[0].pattern.as_deref(), Some("!keep.log"));
        assert!(matches[0].ignored);
    }

    #[test]
    fn empty_output_has_no_matches() {
        assert!(parse_check_ignore("").is_empty());
    }

    #[test]
    fn splits_nul_separated_paths() {
        assert_eq!(
            parse_nul_paths("a.txt\u{0}dir/b c.txt\u{0}"),
            vec!["a.txt".to_string(), "dir/b c.txt".to_string()]
        );
        assert!(parse_nul_paths("").is_empty());
    }

    #[test]
    fn appends_only_the_missing_lines() {
        let (text, count) = append_missing_lines(
            "node_modules/\n*.log",
            &[
                "*.log".to_string(),
                "dist/".to_string(),
                "dist/".to_string(),
                "  ".to_string(),
            ],
        );
        assert_eq!(count, 1);
        assert_eq!(text, "node_modules/\n*.log\ndist/\n");
    }

    #[test]
    fn appending_to_an_empty_file_does_not_add_a_leading_blank_line() {
        let (text, count) = append_missing_lines("", &["/build".to_string()]);
        assert_eq!(count, 1);
        assert_eq!(text, "/build\n");
        let (same, none) = append_missing_lines("/build\n", &["/build".to_string()]);
        assert_eq!(none, 0);
        assert_eq!(same, "/build\n");
    }
}
