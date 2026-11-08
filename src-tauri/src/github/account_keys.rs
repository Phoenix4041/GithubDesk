use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::github::client::GithubClient;
use crate::github::hooks::validate_deploy_key;

const MAX_ARMORED_BYTES: usize = 100 * 1024;
const MAX_NAME: usize = 255;
const MAX_BIO: usize = 160;
const PGP_BEGIN: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----";
const PGP_END: &str = "-----END PGP PUBLIC KEY BLOCK-----";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct AccountSshKey {
    pub id: u64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct GpgEmail {
    pub email: String,
    #[serde(default)]
    pub verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct AccountGpgKey {
    pub id: u64,
    #[serde(default)]
    pub key_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub emails: Vec<GpgEmail>,
    #[serde(default)]
    pub can_sign: bool,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct AccountEmail {
    pub email: String,
    #[serde(default)]
    pub primary: bool,
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct UserProfile {
    pub login: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub bio: Option<String>,
    #[serde(default)]
    pub company: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub blog: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdate {
    pub name: String,
    pub bio: String,
    pub company: String,
    pub location: String,
    pub blog: String,
}

fn single_line(value: &str, limit: usize, what: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.chars().count() > limit || trimmed.chars().any(char::is_control) {
        return Err(AppError::invalid_input(format!("invalid {what}")));
    }
    Ok(trimmed.to_string())
}

pub fn validate_profile(update: &ProfileUpdate) -> AppResult<ProfileUpdate> {
    let blog = single_line(&update.blog, MAX_NAME, "website")?;
    if !blog.is_empty() && !(blog.starts_with("https://") || blog.starts_with("http://")) {
        return Err(AppError::invalid_input(
            "the website must start with http:// or https://",
        ));
    }
    Ok(ProfileUpdate {
        name: single_line(&update.name, MAX_NAME, "name")?,
        bio: single_line(&update.bio, MAX_BIO, "bio")?,
        company: single_line(&update.company, MAX_NAME, "company")?,
        location: single_line(&update.location, MAX_NAME, "location")?,
        blog,
    })
}

pub fn validate_armored_key(armored: &str) -> AppResult<String> {
    let trimmed = armored.trim();
    let valid = trimmed.starts_with(PGP_BEGIN)
        && trimmed.ends_with(PGP_END)
        && trimmed.len() <= MAX_ARMORED_BYTES
        && !trimmed.contains("PRIVATE KEY");
    if valid {
        Ok(trimmed.to_string())
    } else {
        Err(AppError::invalid_input("paste an armored PGP public key"))
    }
}

pub async fn get_profile(client: &GithubClient) -> AppResult<UserProfile> {
    client.get_json("/user", &[]).await
}

pub async fn update_profile(
    client: &GithubClient,
    update: &ProfileUpdate,
) -> AppResult<UserProfile> {
    let clean = validate_profile(update)?;
    client
        .send_json(
            Method::PATCH,
            "/user",
            &json!({
                "name": clean.name,
                "bio": clean.bio,
                "company": clean.company,
                "location": clean.location,
                "blog": clean.blog,
            }),
        )
        .await
}

pub async fn list_emails(client: &GithubClient) -> AppResult<Vec<AccountEmail>> {
    client
        .get_json("/user/emails", &[("per_page", "100".to_string())])
        .await
}

fn keys_path(signing: bool) -> &'static str {
    if signing {
        "/user/ssh_signing_keys"
    } else {
        "/user/keys"
    }
}

pub async fn list_ssh_keys(client: &GithubClient, signing: bool) -> AppResult<Vec<AccountSshKey>> {
    client
        .get_json(keys_path(signing), &[("per_page", "100".to_string())])
        .await
}

pub async fn add_ssh_key(
    client: &GithubClient,
    signing: bool,
    title: &str,
    key: &str,
) -> AppResult<AccountSshKey> {
    let (title, key) = validate_deploy_key(title, key)?;
    client
        .send_json(
            Method::POST,
            keys_path(signing),
            &json!({ "title": title, "key": key }),
        )
        .await
}

pub async fn delete_ssh_key(client: &GithubClient, signing: bool, id: u64) -> AppResult<()> {
    client
        .send_no_content::<()>(
            Method::DELETE,
            &format!("{}/{id}", keys_path(signing)),
            None,
        )
        .await
}

pub async fn list_gpg_keys(client: &GithubClient) -> AppResult<Vec<AccountGpgKey>> {
    client
        .get_json("/user/gpg_keys", &[("per_page", "100".to_string())])
        .await
}

pub async fn add_gpg_key(
    client: &GithubClient,
    name: &str,
    armored: &str,
) -> AppResult<AccountGpgKey> {
    let armored = validate_armored_key(armored)?;
    let name = single_line(name, 100, "name")?;
    let mut body = json!({ "armored_public_key": armored });
    if !name.is_empty() {
        body["name"] = json!(name);
    }
    client
        .send_json(Method::POST, "/user/gpg_keys", &body)
        .await
}

pub async fn delete_gpg_key(client: &GithubClient, id: u64) -> AppResult<()> {
    client
        .send_no_content::<()>(Method::DELETE, &format!("/user/gpg_keys/{id}"), None)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn update() -> ProfileUpdate {
        ProfileUpdate {
            name: " Ana ".to_string(),
            bio: "Hi".to_string(),
            company: String::new(),
            location: "Lima".to_string(),
            blog: "https://ana.example".to_string(),
        }
    }

    #[test]
    fn profile_fields_are_trimmed_and_limited() {
        let clean = validate_profile(&update()).expect("profile");
        assert_eq!(clean.name, "Ana");
        let mut long_bio = update();
        long_bio.bio = "x".repeat(161);
        assert!(validate_profile(&long_bio).is_err());
        let mut odd_site = update();
        odd_site.blog = "javascript:alert(1)".to_string();
        assert!(validate_profile(&odd_site).is_err());
        let mut no_site = update();
        no_site.blog = String::new();
        assert!(validate_profile(&no_site).is_ok());
        let mut control = update();
        control.name = "a\nb".to_string();
        assert!(validate_profile(&control).is_err());
    }

    #[test]
    fn only_armored_public_keys_are_accepted() {
        let public = format!("{PGP_BEGIN}\n\nmQINBF\n{PGP_END}\n");
        assert!(validate_armored_key(&public).is_ok());
        for bad in [
            "".to_string(),
            "-----BEGIN PGP PRIVATE KEY BLOCK-----\nabc\n-----END PGP PRIVATE KEY BLOCK-----"
                .to_string(),
            format!("{PGP_BEGIN}\nabc"),
            "ssh-ed25519 AAAA".to_string(),
            format!("{PGP_BEGIN}\n{}\n{PGP_END}", "A".repeat(MAX_ARMORED_BYTES)),
        ] {
            assert!(validate_armored_key(&bad).is_err());
        }
    }
}
