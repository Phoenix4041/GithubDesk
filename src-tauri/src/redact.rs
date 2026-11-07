const REDACTED: &str = "[redacted]";
const TOKEN_PREFIXES: [&str; 6] = ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"];
const MIN_TOKEN_BODY: usize = 16;
const SECRET_PARAMETERS: [&str; 6] = [
    "access_token",
    "client_secret",
    "password",
    "passwd",
    "secret",
    "token",
];

fn is_token_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

fn run_length(text: &str, accepts: impl Fn(char) -> bool) -> usize {
    text.chars()
        .take_while(|character| accepts(*character))
        .map(char::len_utf8)
        .sum()
}

fn redact_prefixed_tokens(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    loop {
        let next = TOKEN_PREFIXES
            .iter()
            .filter_map(|prefix| rest.find(prefix).map(|index| (index, *prefix)))
            .min_by_key(|(index, _)| *index);
        let Some((index, prefix)) = next else {
            output.push_str(rest);
            return output;
        };
        output.push_str(&rest[..index]);
        let after = &rest[index + prefix.len()..];
        let length = run_length(after, is_token_character);
        if length >= MIN_TOKEN_BODY {
            output.push_str(REDACTED);
        } else {
            output.push_str(prefix);
            output.push_str(&after[..length]);
        }
        rest = &after[length..];
    }
}

fn redact_after_keyword(
    text: &str,
    keyword: &str,
    accepts: impl Fn(char) -> bool + Copy,
) -> String {
    let lowered = text.to_ascii_lowercase();
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    while let Some(found) = lowered[cursor..].find(keyword) {
        let value_start = cursor + found + keyword.len();
        output.push_str(&text[cursor..value_start]);
        let length = run_length(&text[value_start..], accepts);
        if length > 0 {
            output.push_str(REDACTED);
        }
        cursor = value_start + length;
    }
    output.push_str(&text[cursor..]);
    output
}

fn redact_header_values(text: &str) -> String {
    let lowered = text.to_ascii_lowercase();
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    while let Some(found) = lowered[cursor..].find("authorization:") {
        let value_start = cursor + found + "authorization:".len();
        output.push_str(&text[cursor..value_start]);
        let length = run_length(&text[value_start..], |character| {
            character != '\n' && character != '\r'
        });
        if length > 0 {
            output.push(' ');
            output.push_str(REDACTED);
        }
        cursor = value_start + length;
    }
    output.push_str(&text[cursor..]);
    output
}

fn redact_url_credentials(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(index) = rest.find("://") {
        let authority_start = index + 3;
        output.push_str(&rest[..authority_start]);
        let after = &rest[authority_start..];
        let authority_length = run_length(after, |character| {
            !character.is_whitespace() && !matches!(character, '/' | '?' | '#' | '"' | '\'')
        });
        let authority = &after[..authority_length];
        match authority.rfind('@') {
            Some(at) => {
                output.push_str(REDACTED);
                output.push_str(&authority[at..]);
            }
            None => output.push_str(authority),
        }
        rest = &after[authority_length..];
    }
    output.push_str(rest);
    output
}

fn redact_secret_parameters(text: &str) -> String {
    let mut current = text.to_string();
    for name in SECRET_PARAMETERS {
        current = redact_after_keyword(&current, &format!("{name}="), |character| {
            !character.is_whitespace() && !matches!(character, '&' | '"' | '\'' | ';')
        });
    }
    current
}

pub fn redact(text: &str) -> String {
    let without_urls = redact_url_credentials(text);
    let without_headers = redact_header_values(&without_urls);
    let without_schemes = redact_after_keyword(&without_headers, "bearer ", |character| {
        !character.is_whitespace() && !matches!(character, '"' | '\'')
    });
    let without_basic = redact_after_keyword(&without_schemes, "basic ", |character| {
        !character.is_whitespace() && !matches!(character, '"' | '\'')
    });
    let without_parameters = redact_secret_parameters(&without_basic);
    redact_prefixed_tokens(&without_parameters)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_tokens_are_removed() {
        let text = "push failed with ghp_abcdefghijklmnopqrstuvwxyz0123456789 today";
        assert_eq!(redact(text), "push failed with [redacted] today");
        let fine_grained = "using github_pat_11ABCDEFG0abcdefghijklmnop_qrstuvwxyz";
        assert_eq!(redact(fine_grained), "using [redacted]");
    }

    #[test]
    fn short_lookalikes_are_left_alone() {
        assert_eq!(
            redact("the ghp_ prefix is documented"),
            "the ghp_ prefix is documented"
        );
        assert_eq!(redact("ghs_short"), "ghs_short");
    }

    #[test]
    fn credentials_inside_urls_are_removed_but_the_host_stays() {
        assert_eq!(
            redact("fatal: unable to access 'https://user:secretpass@github.com/o/r.git/'"),
            "fatal: unable to access 'https://[redacted]@github.com/o/r.git/'"
        );
        assert_eq!(
            redact("https://x-access-token:abc@host.example/repo"),
            "https://[redacted]@host.example/repo"
        );
        assert_eq!(
            redact("https://github.com/o/r.git"),
            "https://github.com/o/r.git"
        );
    }

    #[test]
    fn an_at_sign_after_the_authority_is_not_a_credential() {
        assert_eq!(
            redact("https://github.com/o/r/blob/main/a@b.txt"),
            "https://github.com/o/r/blob/main/a@b.txt"
        );
    }

    #[test]
    fn authorization_headers_and_schemes_are_removed() {
        assert_eq!(
            redact("Authorization: Bearer abc.def.ghi\nnext line"),
            "Authorization: [redacted]\nnext line"
        );
        assert_eq!(
            redact("sent Bearer abc123 to server"),
            "sent Bearer [redacted] to server"
        );
        assert_eq!(
            redact("header BASIC dXNlcjpwYXNz ok"),
            "header BASIC [redacted] ok"
        );
    }

    #[test]
    fn secret_query_parameters_are_removed_without_touching_the_rest() {
        assert_eq!(
            redact("GET /x?access_token=abc123&page=2 and password=hunter2 done"),
            "GET /x?access_token=[redacted]&page=2 and password=[redacted] done"
        );
        assert_eq!(redact("page=2&per_page=50"), "page=2&per_page=50");
    }

    #[test]
    fn plain_text_and_non_ascii_survive_unchanged() {
        let text = "error: la rama «ñandú» no existe";
        assert_eq!(redact(text), text);
        assert_eq!(redact(""), "");
    }

    #[test]
    fn several_secrets_in_one_message_are_all_removed() {
        let text = "a ghp_aaaaaaaaaaaaaaaaaaaaaaaa b https://u:p@h.io/x c token=zzz";
        let cleaned = redact(text);
        assert!(!cleaned.contains("ghp_a"));
        assert!(!cleaned.contains("u:p"));
        assert!(!cleaned.contains("zzz"));
        assert!(cleaned.contains("h.io/x"));
    }
}
