use serde::Serialize;

pub const TAG_FORMAT: &str = "--format=%(refname:short)%1f%(objecttype)%1f%(objectname)%1f%(*objectname)%1f%(creatordate:unix)%1f%(taggername)%1f%(contents:subject)";
const FIELD_SEPARATOR: char = '\u{1f}';

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub target_hash: String,
    pub annotated: bool,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub time: i64,
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn parse_tags(text: &str) -> Vec<Tag> {
    text.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(FIELD_SEPARATOR).collect();
            if fields.len() < 7 {
                return None;
            }
            let name = fields[0].trim();
            if name.is_empty() {
                return None;
            }
            let annotated = fields[1] == "tag";
            let peeled = fields[3].trim();
            let target = if peeled.is_empty() {
                fields[2].trim()
            } else {
                peeled
            };
            Some(Tag {
                name: name.to_string(),
                target_hash: target.to_string(),
                annotated,
                message: if annotated {
                    non_empty(fields[6])
                } else {
                    None
                },
                tagger: if annotated {
                    non_empty(fields[5])
                } else {
                    None
                },
                time: fields[4].trim().parse().unwrap_or(0),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(fields: [&str; 7]) -> String {
        fields.join("\u{1f}")
    }

    #[test]
    fn parses_lightweight_tags_using_the_object_hash() {
        let text = line([
            "v1",
            "commit",
            "aaa111",
            "",
            "1700000000",
            "",
            "commit subject",
        ]);
        let tags = parse_tags(&text);
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "v1");
        assert_eq!(tags[0].target_hash, "aaa111");
        assert!(!tags[0].annotated);
        assert_eq!(tags[0].message, None);
        assert_eq!(tags[0].tagger, None);
        assert_eq!(tags[0].time, 1_700_000_000);
    }

    #[test]
    fn parses_annotated_tags_using_the_peeled_commit() {
        let text = line([
            "v2",
            "tag",
            "tagobj",
            "commit222",
            "1700000500",
            "Ada",
            "Release 2",
        ]);
        let tags = parse_tags(&text);
        assert_eq!(tags[0].target_hash, "commit222");
        assert!(tags[0].annotated);
        assert_eq!(tags[0].message.as_deref(), Some("Release 2"));
        assert_eq!(tags[0].tagger.as_deref(), Some("Ada"));
    }

    #[test]
    fn skips_malformed_and_empty_lines() {
        let text = format!(
            "\nbroken line\n{}\n",
            line(["v3", "commit", "c3", "", "5", "", ""])
        );
        let tags = parse_tags(&text);
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "v3");
    }
}
