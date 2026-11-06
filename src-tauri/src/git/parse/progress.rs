use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: String,
    pub percent: u8,
    pub detail: String,
}

pub fn parse_progress_line(line: &str) -> Option<Progress> {
    let trimmed = line.trim();
    let content = trimmed
        .strip_prefix("remote:")
        .map(str::trim)
        .unwrap_or(trimmed);
    let (label, rest) = content.split_once(':')?;
    let percent_end = rest.find('%')?;
    let digits: String = rest[..percent_end]
        .chars()
        .rev()
        .take_while(char::is_ascii_digit)
        .collect::<Vec<char>>()
        .into_iter()
        .rev()
        .collect();
    let percent: u8 = digits.parse().ok().filter(|value| *value <= 100)?;
    let phase = slugify(label);
    if phase.is_empty() {
        return None;
    }
    Some(Progress {
        phase,
        percent,
        detail: rest[percent_end + 1..].trim().to_string(),
    })
}

fn slugify(label: &str) -> String {
    label
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_receiving_objects() {
        let progress =
            parse_progress_line("Receiving objects:  45% (450/1000), 1.20 MiB | 2.30 MiB/s")
                .expect("progress");
        assert_eq!(progress.phase, "receiving-objects");
        assert_eq!(progress.percent, 45);
        assert_eq!(progress.detail, "(450/1000), 1.20 MiB | 2.30 MiB/s");
    }

    #[test]
    fn parses_remote_prefixed_line() {
        let progress = parse_progress_line("remote: Compressing objects: 100% (50/50), done.")
            .expect("progress");
        assert_eq!(progress.phase, "compressing-objects");
        assert_eq!(progress.percent, 100);
    }

    #[test]
    fn ignores_lines_without_percentage() {
        assert!(parse_progress_line("Cloning into 'repo'...").is_none());
        assert!(parse_progress_line("remote: Enumerating objects: 5, done.").is_none());
        assert!(parse_progress_line("").is_none());
    }

    #[test]
    fn rejects_out_of_range_percentage() {
        assert!(parse_progress_line("Receiving objects: 450% (1/2)").is_none());
    }
}
