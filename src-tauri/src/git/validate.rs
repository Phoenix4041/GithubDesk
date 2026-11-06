use std::path::{Component, Path};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::runner::git_unchecked;

pub async fn ensure_valid_branch_name(repo: &Path, name: &str) -> AppResult<()> {
    let candidate = name.trim();
    if candidate.is_empty() || candidate.starts_with('-') || candidate.starts_with('@') {
        return Err(AppError::new(ErrorKind::InvalidName, name));
    }
    let output = git_unchecked(repo, &["check-ref-format", "--branch", candidate]).await?;
    if output.success() {
        Ok(())
    } else {
        Err(AppError::new(ErrorKind::InvalidName, name))
    }
}

pub fn ensure_revision(value: &str) -> AppResult<()> {
    let candidate = value.trim();
    if candidate.is_empty() || candidate.starts_with('-') || candidate.contains('\0') {
        return Err(AppError::invalid_input(format!(
            "invalid revision: {value}"
        )));
    }
    Ok(())
}

pub fn ensure_commit_hash(value: &str) -> AppResult<()> {
    let valid = (4..=64).contains(&value.len()) && value.chars().all(|c| c.is_ascii_hexdigit());
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "invalid commit hash: {value}"
        )))
    }
}

pub fn ensure_relative_path(value: &str) -> AppResult<()> {
    let path = Path::new(value);
    let safe = !value.is_empty()
        && !value.contains('\0')
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    if safe {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid path: {value}")))
    }
}

pub fn ensure_folder_name(value: &str) -> AppResult<()> {
    let forbidden = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'];
    let trimmed = value.trim();
    let valid = !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && !trimmed
            .chars()
            .any(|character| forbidden.contains(&character))
        && !trimmed.ends_with('.');
    if valid {
        Ok(())
    } else {
        Err(AppError::new(ErrorKind::InvalidName, value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_relative_paths() {
        assert!(ensure_relative_path("src/main.rs").is_ok());
        assert!(ensure_relative_path("dir name/file one.txt").is_ok());
    }

    #[test]
    fn rejects_unsafe_paths() {
        assert!(ensure_relative_path("").is_err());
        assert!(ensure_relative_path("../outside").is_err());
        assert!(ensure_relative_path("a/../../b").is_err());
        assert!(ensure_relative_path("/etc/passwd").is_err());
        #[cfg(windows)]
        assert!(ensure_relative_path("C:\\Windows").is_err());
    }

    #[test]
    fn validates_commit_hashes() {
        assert!(ensure_commit_hash("abcdef0").is_ok());
        assert!(ensure_commit_hash("--output=x").is_err());
        assert!(ensure_commit_hash("abc").is_err());
        assert!(ensure_commit_hash("xyzxyzxyz").is_err());
    }

    #[test]
    fn rejects_option_like_revisions() {
        assert!(ensure_revision("origin/main").is_ok());
        assert!(ensure_revision("--upload-pack=evil").is_err());
        assert!(ensure_revision(" ").is_err());
    }

    #[test]
    fn validates_folder_names() {
        assert!(ensure_folder_name("my-project").is_ok());
        assert!(ensure_folder_name("a/b").is_err());
        assert!(ensure_folder_name("..").is_err());
        assert!(ensure_folder_name("bad:name").is_err());
        assert!(ensure_folder_name("").is_err());
    }
}
