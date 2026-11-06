use serde::Serialize;

pub const BRANCH_FORMAT: &str = "--format=%(refname)%00%(HEAD)%00%(objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(committerdate:unix)";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub full_name: String,
    pub is_remote: bool,
    pub remote: Option<String>,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub upstream_gone: bool,
    pub tip_hash: String,
    pub tip_time: i64,
}

fn parse_track(track: &str) -> (u32, u32, bool) {
    let mut ahead = 0;
    let mut behind = 0;
    let mut gone = false;
    for part in track.split(',').map(str::trim) {
        if part == "gone" {
            gone = true;
        } else if let Some(number) = part.strip_prefix("ahead ") {
            ahead = number.parse().unwrap_or(0);
        } else if let Some(number) = part.strip_prefix("behind ") {
            behind = number.parse().unwrap_or(0);
        }
    }
    (ahead, behind, gone)
}

pub fn parse_branches(text: &str) -> Vec<Branch> {
    let mut branches = Vec::new();

    for line in text.lines().filter(|line| !line.is_empty()) {
        let fields: Vec<&str> = line.split('\0').collect();
        if fields.len() < 6 {
            continue;
        }
        let full_name = fields[0];
        let (name, is_remote, remote) = if let Some(local) = full_name.strip_prefix("refs/heads/") {
            (local.to_string(), false, None)
        } else if let Some(remote_ref) = full_name.strip_prefix("refs/remotes/") {
            if remote_ref.ends_with("/HEAD") {
                continue;
            }
            let remote_name = remote_ref.split('/').next().map(str::to_string);
            (remote_ref.to_string(), true, remote_name)
        } else {
            continue;
        };

        let (ahead, behind, upstream_gone) = parse_track(fields[4]);
        let upstream = Some(fields[3]).filter(|value| !value.is_empty()).map(str::to_string);

        branches.push(Branch {
            name,
            full_name: full_name.to_string(),
            is_remote,
            remote,
            is_current: fields[1] == "*",
            upstream,
            ahead,
            behind,
            upstream_gone,
            tip_hash: fields[2].to_string(),
            tip_time: fields[5].parse().unwrap_or(0),
        });
    }

    branches.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| left.is_remote.cmp(&right.is_remote))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    branches
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(fields: &[&str]) -> String {
        format!("{}\n", fields.join("\0"))
    }

    #[test]
    fn parses_local_and_remote_branches() {
        let text = [
            line(&["refs/heads/feature/x", " ", "aaa", "origin/feature/x", "ahead 2, behind 1", "1700000000"]),
            line(&["refs/heads/main", "*", "bbb", "origin/main", "", "1700000100"]),
            line(&["refs/remotes/origin/main", " ", "bbb", "", "", "1700000100"]),
            line(&["refs/remotes/origin/HEAD", " ", "bbb", "", "", "1700000100"]),
            line(&["refs/heads/old", " ", "ccc", "origin/old", "gone", "1600000000"]),
        ]
        .concat();
        let branches = parse_branches(&text);
        assert_eq!(branches.len(), 4);
        assert_eq!(branches[0].name, "main");
        assert!(branches[0].is_current);
        assert_eq!(branches[1].name, "feature/x");
        assert_eq!((branches[1].ahead, branches[1].behind), (2, 1));
        assert_eq!(branches[2].name, "old");
        assert!(branches[2].upstream_gone);
        let remote = &branches[3];
        assert!(remote.is_remote);
        assert_eq!(remote.name, "origin/main");
        assert_eq!(remote.remote.as_deref(), Some("origin"));
        assert!(remote.upstream.is_none());
    }

    #[test]
    fn parses_track_variants() {
        assert_eq!(parse_track(""), (0, 0, false));
        assert_eq!(parse_track("ahead 4"), (4, 0, false));
        assert_eq!(parse_track("behind 5"), (0, 5, false));
        assert_eq!(parse_track("gone"), (0, 0, true));
    }

    #[test]
    fn ignores_unknown_refs_and_short_lines() {
        let text = format!("{}short\0line\n", line(&["refs/tags/v1", " ", "a", "", "", "1"]));
        assert!(parse_branches(&text).is_empty());
    }
}
