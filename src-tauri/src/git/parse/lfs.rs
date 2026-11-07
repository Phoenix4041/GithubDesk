use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LfsPattern {
    pub pattern: String,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LfsFile {
    pub oid: String,
    pub present: bool,
    pub path: String,
    pub size: Option<String>,
}

pub fn parse_lfs_version(text: &str) -> Option<String> {
    let first = text.lines().next()?;
    let rest = first.strip_prefix("git-lfs/")?;
    let version = rest.split_whitespace().next()?;
    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

pub fn parse_lfs_track(text: &str) -> Vec<LfsPattern> {
    let mut patterns = Vec::new();
    let mut listing = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Listing tracked patterns") {
            listing = true;
            continue;
        }
        if trimmed.starts_with("Listing excluded patterns") {
            listing = false;
            continue;
        }
        if !listing || trimmed.is_empty() {
            continue;
        }
        let Some(open) = trimmed.rfind(" (") else {
            continue;
        };
        if !trimmed.ends_with(')') {
            continue;
        }
        let pattern = trimmed[..open].trim();
        let source = &trimmed[open + 2..trimmed.len() - 1];
        if !pattern.is_empty() {
            patterns.push(LfsPattern {
                pattern: pattern.to_string(),
                source: source.to_string(),
            });
        }
    }
    patterns
}

pub fn parse_lfs_files(text: &str) -> Vec<LfsFile> {
    text.lines().filter_map(parse_lfs_file_line).collect()
}

fn parse_lfs_file_line(line: &str) -> Option<LfsFile> {
    let (oid, rest) = line.split_once(' ')?;
    if oid.len() < 8 || !oid.chars().all(|character| character.is_ascii_hexdigit()) {
        return None;
    }
    let (marker, remainder) = rest.split_once(' ')?;
    let present = match marker {
        "*" => true,
        "-" => false,
        _ => return None,
    };
    let remainder = remainder.trim_end();
    let (path, size) = match remainder.rfind(" (") {
        Some(index) if remainder.ends_with(')') => (
            &remainder[..index],
            Some(remainder[index + 2..remainder.len() - 1].to_string()),
        ),
        _ => (remainder, None),
    };
    if path.is_empty() {
        return None;
    }
    Some(LfsFile {
        oid: oid.to_string(),
        present,
        path: path.to_string(),
        size,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_version_number() {
        assert_eq!(
            parse_lfs_version("git-lfs/3.8.0 (GitHub; windows amd64; go 1.27.0; git aece9221)\n")
                .as_deref(),
            Some("3.8.0")
        );
        assert_eq!(parse_lfs_version("git: 'lfs' is not a git command"), None);
        assert_eq!(parse_lfs_version(""), None);
    }

    #[test]
    fn lists_tracked_patterns_with_their_source_files() {
        let text = "Listing tracked patterns\n    *.bin (.gitattributes)\n    assets/** (.gitattributes)\n    media/*.mov (sub dir/.gitattributes)\nListing excluded patterns\n    *.tmp (.gitattributes)\n";
        let patterns = parse_lfs_track(text);
        assert_eq!(patterns.len(), 3);
        assert_eq!(patterns[0].pattern, "*.bin");
        assert_eq!(patterns[0].source, ".gitattributes");
        assert_eq!(patterns[2].pattern, "media/*.mov");
        assert_eq!(patterns[2].source, "sub dir/.gitattributes");
    }

    #[test]
    fn an_empty_listing_has_no_patterns() {
        assert!(
            parse_lfs_track("Listing tracked patterns\nListing excluded patterns\n").is_empty()
        );
        assert!(parse_lfs_track("").is_empty());
    }

    #[test]
    fn lists_files_with_presence_and_size() {
        let oid_a = "4596f62f8147b12065ca3ef00922160528b335396b2d2d43c86ee9ddf9e83b6d";
        let oid_b = "5d8abcbcf05a8c6f2e3b17317de6c31cc629e372a07a3fc271e6b128948218e3";
        let text =
            format!("{oid_a} * assets/x.dat (500 B)\n{oid_b} - my folder/big file.bin (20 KB)\n");
        let files = parse_lfs_files(&text);
        assert_eq!(files.len(), 2);
        assert!(files[0].present);
        assert_eq!(files[0].path, "assets/x.dat");
        assert_eq!(files[0].size.as_deref(), Some("500 B"));
        assert!(!files[1].present);
        assert_eq!(files[1].path, "my folder/big file.bin");
        assert_eq!(files[1].oid, oid_b);
    }

    #[test]
    fn files_without_size_and_bad_lines_are_handled() {
        let files = parse_lfs_files("4596f62f81 * plain.bin\nnot a line\n\nzzzz * x\n");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "plain.bin");
        assert_eq!(files[0].size, None);
    }
}
