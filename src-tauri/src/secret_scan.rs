use serde::Serialize;

pub const IGNORE_MARKER: &str = "secretscan:ignore";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretFinding {
    pub file: String,
    pub line: u32,
    pub rule: String,
}

struct Rule {
    id: &'static str,
    matches: fn(&str) -> bool,
}

const RULES: &[Rule] = &[
    Rule {
        id: "github-token",
        matches: has_github_token,
    },
    Rule {
        id: "aws-access-key",
        matches: has_aws_access_key,
    },
    Rule {
        id: "private-key",
        matches: has_private_key,
    },
    Rule {
        id: "slack-token",
        matches: has_slack_token,
    },
    Rule {
        id: "stripe-key",
        matches: has_stripe_key,
    },
    Rule {
        id: "secret-assignment",
        matches: has_secret_assignment,
    },
];

const ENV_RULE: &str = "env-file";
const ENV_TEMPLATE_SUFFIXES: &[&str] = &[".example", ".sample", ".template", ".dist"];
const SECRET_KEY_WORDS: &[&str] = &[
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "api-key",
    "access_token",
    "auth_token",
    "private_key",
];
const PLACEHOLDER_WORDS: &[&str] = &[
    "changeme",
    "change_me",
    "example",
    "placeholder",
    "your",
    "xxxx",
    "****",
    "dummy",
    "sample",
    "redacted",
    "password",
    "secret",
    "null",
    "none",
    "undefined",
    "true",
    "false",
];
const MIN_VALUE_LENGTH: usize = 8;

fn run_length(text: &str, accepts: impl Fn(char) -> bool) -> usize {
    text.chars().take_while(|c| accepts(*c)).count()
}

fn after_each<'a>(line: &'a str, prefix: &'a str) -> impl Iterator<Item = &'a str> {
    line.match_indices(prefix)
        .map(move |(index, _)| &line[index + prefix.len()..])
}

fn has_github_token(line: &str) -> bool {
    let classic = ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"].iter().any(|prefix| {
        after_each(line, prefix).any(|rest| run_length(rest, |c| c.is_ascii_alphanumeric()) >= 36)
    });
    classic
        || after_each(line, "github_pat_")
            .any(|rest| run_length(rest, |c| c.is_ascii_alphanumeric() || c == '_') >= 22)
}

fn has_aws_access_key(line: &str) -> bool {
    ["AKIA", "ASIA"].iter().any(|prefix| {
        after_each(line, prefix)
            .any(|rest| run_length(rest, |c| c.is_ascii_uppercase() || c.is_ascii_digit()) >= 16)
    })
}

fn has_private_key(line: &str) -> bool {
    line.contains("-----BEGIN ") && line.contains("PRIVATE KEY-----")
}

fn has_slack_token(line: &str) -> bool {
    ["xoxb-", "xoxa-", "xoxp-", "xoxr-", "xoxs-"].iter().any(|prefix| {
        after_each(line, prefix)
            .any(|rest| run_length(rest, |c| c.is_ascii_alphanumeric() || c == '-') >= 10)
    })
}

fn has_stripe_key(line: &str) -> bool {
    ["sk_live_", "rk_live_"].iter().any(|prefix| {
        after_each(line, prefix).any(|rest| run_length(rest, |c| c.is_ascii_alphanumeric()) >= 16)
    })
}

fn is_placeholder(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    value.starts_with(['$', '<', '{', '%', '['])
        || value.contains("process.env")
        || value.contains("env::var")
        || PLACEHOLDER_WORDS.iter().any(|word| lower.contains(word))
}

fn has_secret_assignment(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    SECRET_KEY_WORDS.iter().any(|word| {
        lower.match_indices(word).any(|(index, _)| {
            let tail = &line[index + word.len()..];
            let tail = tail.trim_start_matches(|c: char| c.is_ascii_alphanumeric() || c == '_' || c == '-');
            let tail = tail.trim_start_matches(['"', '\'', '`']).trim_start();
            let Some(tail) = tail.strip_prefix([':', '=']) else {
                return false;
            };
            let tail = tail.trim_start_matches(['=', '>']).trim_start();
            let quoted = tail.starts_with(['"', '\'', '`']);
            let value: String = tail
                .trim_start_matches(['"', '\'', '`'])
                .chars()
                .take_while(|c| !c.is_whitespace() && !matches!(c, '"' | '\'' | '`' | ',' | ';'))
                .collect();
            if value.chars().count() < MIN_VALUE_LENGTH || is_placeholder(&value) {
                return false;
            }
            quoted || value.chars().any(|c| c.is_ascii_digit())
        })
    })
}

pub fn scan_line(line: &str) -> Option<&'static str> {
    if line.contains(IGNORE_MARKER) {
        return None;
    }
    RULES
        .iter()
        .find(|rule| (rule.matches)(line))
        .map(|rule| rule.id)
}

pub fn is_env_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    let is_env = name == ".env" || name.starts_with(".env.");
    is_env && !ENV_TEMPLATE_SUFFIXES.iter().any(|suffix| name.ends_with(suffix))
}

fn parse_new_start(header: &str) -> Option<u32> {
    let plus = header.split_whitespace().find(|part| part.starts_with('+'))?;
    plus.trim_start_matches('+').split(',').next()?.parse().ok()
}

pub fn scan_diff(diff: &str) -> Vec<SecretFinding> {
    let mut findings = Vec::new();
    let mut file = String::new();
    let mut line_number: u32 = 0;
    for line in diff.lines() {
        if let Some(path) = line.strip_prefix("+++ ") {
            let path = path.trim().trim_matches('"');
            file = path.strip_prefix("b/").unwrap_or(path).to_string();
            continue;
        }
        if line.starts_with("--- ") {
            continue;
        }
        if line.starts_with("@@") {
            line_number = parse_new_start(line).unwrap_or(1);
            continue;
        }
        if file.is_empty() {
            continue;
        }
        if let Some(added) = line.strip_prefix('+') {
            if let Some(rule) = scan_line(added) {
                findings.push(SecretFinding {
                    file: file.clone(),
                    line: line_number,
                    rule: rule.to_string(),
                });
            }
            line_number += 1;
        }
    }
    findings
}

pub fn scan_env_paths(paths: &[String]) -> Vec<SecretFinding> {
    paths
        .iter()
        .filter(|path| is_env_file(path))
        .map(|path| SecretFinding {
            file: path.clone(),
            line: 0,
            rule: ENV_RULE.to_string(),
        })
        .collect()
}

pub fn ignore_pattern(path: &str) -> String {
    format!("/{}", path.replace('\\', "/").trim_start_matches('/'))
}
