use crate::error::{AppError, AppResult};

pub fn encode_segment(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

pub fn ensure_branch_name(name: &str) -> AppResult<()> {
    let valid = !name.trim().is_empty()
        && name.len() <= 255
        && !name.contains("..")
        && !name.starts_with('/')
        && !name.ends_with('/')
        && !name.chars().any(char::is_control);
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid branch name: {name}"
        )))
    }
}

pub fn ensure_slug(value: &str, what: &str) -> AppResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid {what}: {value}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_escape_slashes_spaces_and_unicode() {
        assert_eq!(encode_segment("main"), "main");
        assert_eq!(encode_segment("feature/login"), "feature%2Flogin");
        assert_eq!(encode_segment("a b"), "a%20b");
        assert_eq!(encode_segment("ñ"), "%C3%B1");
        assert_eq!(encode_segment("v1.0_x-y~z"), "v1.0_x-y~z");
    }

    #[test]
    fn branch_names_reject_traversal_and_control_characters() {
        for good in ["main", "feature/login", "release-1.0"] {
            assert!(ensure_branch_name(good).is_ok(), "{good}");
        }
        for bad in ["", " ", "a..b", "/x", "x/", "a\nb"] {
            assert!(ensure_branch_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn slugs_are_plain_words() {
        assert!(ensure_slug("core-team_2", "team").is_ok());
        for bad in ["", "a b", "../x", "a/b"] {
            assert!(ensure_slug(bad, "team").is_err(), "{bad}");
        }
    }
}
