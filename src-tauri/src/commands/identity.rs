use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::git::parse::signing::{last_setting, parse_scoped_settings};
use crate::git::runner::{git, git_unchecked};

const MAX_FIELD_LENGTH: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityValue {
    pub value: String,
    pub scope: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub name: Option<IdentityValue>,
    pub email: Option<IdentityValue>,
    pub signing_key: Option<IdentityValue>,
    pub signing_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySigning {
    pub key: String,
    pub format: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityUpdate {
    pub name: String,
    pub email: String,
    pub signing: Option<IdentitySigning>,
}

fn clean_field(value: &str, what: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > MAX_FIELD_LENGTH
        || trimmed.starts_with('-')
        || trimmed.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input(format!("invalid {what}")));
    }
    Ok(trimmed.to_string())
}

fn clean_email(value: &str) -> AppResult<String> {
    let email = clean_field(value, "email")?;
    let mut parts = email.split('@');
    let valid = matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(local), Some(domain), None) if !local.is_empty() && domain.contains('.')
    ) && !email.chars().any(char::is_whitespace);
    if valid {
        Ok(email)
    } else {
        Err(AppError::invalid_input("invalid email"))
    }
}

fn clean_format(value: &str) -> AppResult<&'static str> {
    match value.trim() {
        "openpgp" => Ok("openpgp"),
        "ssh" => Ok("ssh"),
        "x509" => Ok("x509"),
        other => Err(AppError::invalid_input(format!(
            "invalid signing format: {other}"
        ))),
    }
}

pub async fn read_identity(repo: &Path) -> AppResult<Identity> {
    let output = git_unchecked(
        repo,
        &[
            "config",
            "--show-scope",
            "--get-regexp",
            r"^(user\.name|user\.email|user\.signingkey|commit\.gpgsign)$",
        ],
    )
    .await?;
    let settings = if output.success() {
        parse_scoped_settings(&output.text())
    } else {
        Vec::new()
    };
    let value_of = |key: &str| {
        last_setting(&settings, key)
            .filter(|setting| !setting.value.is_empty())
            .map(|setting| IdentityValue {
                value: setting.value.clone(),
                scope: setting.scope.clone(),
            })
    };
    let signing_enabled = last_setting(&settings, "commit.gpgsign").is_some_and(|setting| {
        matches!(
            setting.value.to_lowercase().as_str(),
            "true" | "yes" | "on" | "1"
        )
    });
    Ok(Identity {
        name: value_of("user.name"),
        email: value_of("user.email"),
        signing_key: value_of("user.signingkey"),
        signing_enabled,
    })
}

async fn unset_local(repo: &Path, key: &str) -> AppResult<()> {
    let output = git_unchecked(repo, &["config", "--local", "--unset-all", key]).await?;
    if output.success() || output.exit_code == 5 {
        Ok(())
    } else {
        Err(AppError::from_git_failure(
            &String::from_utf8_lossy(&output.stdout),
            &output.stderr,
        ))
    }
}

pub async fn apply_identity(repo: &Path, update: &IdentityUpdate) -> AppResult<()> {
    let name = clean_field(&update.name, "name")?;
    let email = clean_email(&update.email)?;
    let signing = match &update.signing {
        Some(choice) => Some((
            clean_field(&choice.key, "signing key")?,
            clean_format(&choice.format)?,
        )),
        None => None,
    };

    git(repo, &["config", "--local", "user.name", &name]).await?;
    git(repo, &["config", "--local", "user.email", &email]).await?;
    match signing {
        Some((key, format)) => {
            git(repo, &["config", "--local", "user.signingkey", &key]).await?;
            git(repo, &["config", "--local", "gpg.format", format]).await?;
            git(repo, &["config", "--local", "commit.gpgsign", "true"]).await?;
        }
        None => {
            unset_local(repo, "user.signingkey").await?;
            unset_local(repo, "commit.gpgsign").await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn identity_get(path: String) -> AppResult<Identity> {
    read_identity(Path::new(&path)).await
}

#[tauri::command]
pub async fn identity_apply(path: String, update: IdentityUpdate) -> AppResult<()> {
    apply_identity(Path::new(&path), &update).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fields_reject_flags_empty_values_and_control_characters() {
        assert!(clean_field(" Ana Pérez ", "name").is_ok());
        for bad in ["", "   ", "-x", "a\nb", "a\u{0}b"] {
            assert!(clean_field(bad, "name").is_err(), "{bad:?}");
        }
        assert!(clean_field(&"x".repeat(201), "name").is_err());
    }

    #[test]
    fn emails_need_one_at_sign_and_a_dotted_domain() {
        assert!(clean_email("ana@example.com").is_ok());
        assert!(clean_email("12345+ana@users.noreply.github.com").is_ok());
        for bad in [
            "ana",
            "ana@",
            "@example.com",
            "a@b",
            "a@b@c.com",
            "a b@c.com",
        ] {
            assert!(clean_email(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_known_signing_formats_are_accepted() {
        assert_eq!(clean_format("openpgp").expect("format"), "openpgp");
        assert_eq!(clean_format(" ssh ").expect("format"), "ssh");
        assert!(clean_format("other").is_err());
    }
}
