use std::path::Path;

use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};
use crate::github::client::{GithubClient, Page};
use crate::github::models::{Label, Milestone};
use crate::github::path::encode_segment;
use crate::github::pulls::repo_path;

const MAX_LABEL_LENGTH: usize = 50;
const MAX_LABEL_DESCRIPTION: usize = 100;
const MAX_TITLE_LENGTH: usize = 255;
const MAX_TAG_LENGTH: usize = 255;
const MAX_BODY_LENGTH: usize = 125_000;
pub const RELEASES_PAGE_SIZE: u32 = 30;
pub const MAX_ASSET_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ReleaseAuthor {
    pub login: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ReleaseAsset {
    pub id: u64,
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub browser_download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct Release {
    pub id: u64,
    pub tag_name: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub target_commitish: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub author: Option<ReleaseAuthor>,
    #[serde(default)]
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRelease {
    pub tag_name: String,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseEdit {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub draft: Option<bool>,
    #[serde(default)]
    pub prerelease: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedNotes {
    pub name: String,
    pub body: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelEdit {
    #[serde(default)]
    pub new_name: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneEdit {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub due_on: Option<String>,
    #[serde(default)]
    pub clear_due: bool,
    #[serde(default)]
    pub state: Option<String>,
}

pub fn ensure_tag_name(tag: &str) -> AppResult<String> {
    let trimmed = tag.trim();
    let valid = !trimmed.is_empty()
        && trimmed.len() <= MAX_TAG_LENGTH
        && !trimmed.starts_with('-')
        && !trimmed.contains("..")
        && !trimmed.chars().any(|character| {
            character.is_control() || character.is_whitespace() || "~^:?*[\\".contains(character)
        });
    if valid {
        Ok(trimmed.to_string())
    } else {
        Err(AppError::invalid_input(format!("invalid tag: {tag}")))
    }
}

pub fn normalize_color(color: &str) -> AppResult<String> {
    let hex = color.trim().trim_start_matches('#').to_lowercase();
    if hex.len() == 6 && hex.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(hex)
    } else {
        Err(AppError::invalid_input(format!("invalid color: {color}")))
    }
}

fn ensure_label_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed.chars().count() > MAX_LABEL_LENGTH
        || trimmed.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input("invalid label name"));
    }
    Ok(trimmed.to_string())
}

fn ensure_text(value: &str, limit: usize, what: &str) -> AppResult<()> {
    if value.chars().count() > limit
        || value.chars().any(|character| {
            character.is_control() && character != '\n' && character != '\r' && character != '\t'
        })
    {
        return Err(AppError::invalid_input(format!("invalid {what}")));
    }
    Ok(())
}

fn ensure_due_date(value: &str) -> AppResult<()> {
    let bytes = value.as_bytes();
    let valid = value.len() == 20
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'Z'
        && value.chars().enumerate().all(|(index, character)| {
            matches!(index, 4 | 7 | 10 | 13 | 16 | 19) || character.is_ascii_digit()
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input(
            "the due date must look like 2026-12-31T00:00:00Z",
        ))
    }
}

pub async fn create_label(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    name: &str,
    color: &str,
    description: &str,
) -> AppResult<Label> {
    let name = ensure_label_name(name)?;
    let color = normalize_color(color)?;
    ensure_text(description, MAX_LABEL_DESCRIPTION, "description")?;
    let path = format!("{}/labels", repo_path(owner, repo)?);
    client
        .send_json(
            Method::POST,
            &path,
            &json!({ "name": name, "color": color, "description": description.trim() }),
        )
        .await
}

pub async fn update_label(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    name: &str,
    edit: &LabelEdit,
) -> AppResult<Label> {
    let name = ensure_label_name(name)?;
    let mut body = serde_json::Map::new();
    if let Some(new_name) = &edit.new_name {
        body.insert("new_name".to_string(), json!(ensure_label_name(new_name)?));
    }
    if let Some(color) = &edit.color {
        body.insert("color".to_string(), json!(normalize_color(color)?));
    }
    if let Some(description) = &edit.description {
        ensure_text(description, MAX_LABEL_DESCRIPTION, "description")?;
        body.insert("description".to_string(), json!(description.trim()));
    }
    if body.is_empty() {
        return Err(AppError::invalid_input("nothing to change"));
    }
    let path = format!(
        "{}/labels/{}",
        repo_path(owner, repo)?,
        encode_segment(&name)
    );
    client
        .send_json(Method::PATCH, &path, &serde_json::Value::Object(body))
        .await
}

pub async fn delete_label(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    name: &str,
) -> AppResult<()> {
    let name = ensure_label_name(name)?;
    let path = format!(
        "{}/labels/{}",
        repo_path(owner, repo)?,
        encode_segment(&name)
    );
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

fn milestone_title(title: &str) -> AppResult<String> {
    let trimmed = title.trim();
    if trimmed.is_empty()
        || trimmed.chars().count() > MAX_TITLE_LENGTH
        || trimmed.chars().any(char::is_control)
    {
        return Err(AppError::invalid_input("invalid title"));
    }
    Ok(trimmed.to_string())
}

pub async fn create_milestone(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    title: &str,
    description: &str,
    due_on: Option<&str>,
) -> AppResult<Milestone> {
    let title = milestone_title(title)?;
    ensure_text(description, MAX_BODY_LENGTH, "description")?;
    let mut body = json!({ "title": title, "description": description });
    if let Some(due) = due_on {
        ensure_due_date(due)?;
        body["due_on"] = json!(due);
    }
    let path = format!("{}/milestones", repo_path(owner, repo)?);
    client.send_json(Method::POST, &path, &body).await
}

pub async fn update_milestone(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
    edit: &MilestoneEdit,
) -> AppResult<Milestone> {
    let mut body = serde_json::Map::new();
    if let Some(title) = &edit.title {
        body.insert("title".to_string(), json!(milestone_title(title)?));
    }
    if let Some(description) = &edit.description {
        ensure_text(description, MAX_BODY_LENGTH, "description")?;
        body.insert("description".to_string(), json!(description));
    }
    if edit.clear_due {
        body.insert("due_on".to_string(), serde_json::Value::Null);
    } else if let Some(due) = &edit.due_on {
        ensure_due_date(due)?;
        body.insert("due_on".to_string(), json!(due));
    }
    if let Some(state) = &edit.state {
        if !matches!(state.as_str(), "open" | "closed") {
            return Err(AppError::invalid_input("invalid state"));
        }
        body.insert("state".to_string(), json!(state));
    }
    if body.is_empty() {
        return Err(AppError::invalid_input("nothing to change"));
    }
    let path = format!("{}/milestones/{number}", repo_path(owner, repo)?);
    client
        .send_json(Method::PATCH, &path, &serde_json::Value::Object(body))
        .await
}

pub async fn delete_milestone(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    number: u64,
) -> AppResult<()> {
    let path = format!("{}/milestones/{number}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn list_releases(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    page: u32,
) -> AppResult<Page<Release>> {
    let path = format!("{}/releases", repo_path(owner, repo)?);
    client.get_page(&path, &[], page, RELEASES_PAGE_SIZE).await
}

pub async fn create_release(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    request: &NewRelease,
) -> AppResult<Release> {
    let tag = ensure_tag_name(&request.tag_name)?;
    ensure_text(&request.name, MAX_TITLE_LENGTH, "title")?;
    ensure_text(&request.body, MAX_BODY_LENGTH, "notes")?;
    let mut body = json!({
        "tag_name": tag,
        "name": request.name.trim(),
        "body": request.body,
        "draft": request.draft,
        "prerelease": request.prerelease,
    });
    if let Some(target) = request
        .target
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        crate::github::path::ensure_branch_name(target)?;
        body["target_commitish"] = json!(target);
    }
    let path = format!("{}/releases", repo_path(owner, repo)?);
    client.send_json(Method::POST, &path, &body).await
}

pub async fn update_release(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    id: u64,
    edit: &ReleaseEdit,
) -> AppResult<Release> {
    let mut body = serde_json::Map::new();
    if let Some(name) = &edit.name {
        ensure_text(name, MAX_TITLE_LENGTH, "title")?;
        body.insert("name".to_string(), json!(name.trim()));
    }
    if let Some(text) = &edit.body {
        ensure_text(text, MAX_BODY_LENGTH, "notes")?;
        body.insert("body".to_string(), json!(text));
    }
    if let Some(draft) = edit.draft {
        body.insert("draft".to_string(), json!(draft));
    }
    if let Some(prerelease) = edit.prerelease {
        body.insert("prerelease".to_string(), json!(prerelease));
    }
    if body.is_empty() {
        return Err(AppError::invalid_input("nothing to change"));
    }
    let path = format!("{}/releases/{id}", repo_path(owner, repo)?);
    client
        .send_json(Method::PATCH, &path, &serde_json::Value::Object(body))
        .await
}

pub async fn delete_release(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    id: u64,
) -> AppResult<()> {
    let path = format!("{}/releases/{id}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub async fn generate_notes(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    tag: &str,
    target: Option<&str>,
    previous_tag: Option<&str>,
) -> AppResult<GeneratedNotes> {
    let tag = ensure_tag_name(tag)?;
    let mut body = json!({ "tag_name": tag });
    if let Some(target) = target.map(str::trim).filter(|value| !value.is_empty()) {
        crate::github::path::ensure_branch_name(target)?;
        body["target_commitish"] = json!(target);
    }
    if let Some(previous) = previous_tag
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        body["previous_tag_name"] = json!(ensure_tag_name(previous)?);
    }
    let path = format!("{}/releases/generate-notes", repo_path(owner, repo)?);
    client.send_json(Method::POST, &path, &body).await
}

pub async fn delete_asset(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    id: u64,
) -> AppResult<()> {
    let path = format!("{}/releases/assets/{id}", repo_path(owner, repo)?);
    client
        .send_no_content::<()>(Method::DELETE, &path, None)
        .await
}

pub fn guess_content_type(name: &str) -> &'static str {
    let extension = name.rsplit('.').next().unwrap_or_default().to_lowercase();
    match extension.as_str() {
        "zip" => "application/zip",
        "gz" | "tgz" => "application/gzip",
        "tar" => "application/x-tar",
        "json" => "application/json",
        "txt" | "md" | "sha256" | "sig" | "asc" => "text/plain",
        "exe" | "msi" | "dmg" | "deb" | "rpm" | "appimage" => "application/octet-stream",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

pub async fn upload_asset(
    client: &GithubClient,
    owner: &str,
    repo: &str,
    release_id: u64,
    file: &str,
) -> AppResult<ReleaseAsset> {
    let path = Path::new(file.trim());
    if !path.is_absolute() {
        return Err(AppError::invalid_input("the file path must be absolute"));
    }
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|_| AppError::invalid_input("the file does not exist"))?;
    if !metadata.is_file() {
        return Err(AppError::invalid_input("the chosen path is not a file"));
    }
    if metadata.len() == 0 || metadata.len() > MAX_ASSET_BYTES {
        return Err(AppError::invalid_input(
            "the file is empty or larger than 256 MB",
        ));
    }
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty() && name.len() <= 255 && !name.chars().any(char::is_control))
        .ok_or_else(|| AppError::invalid_input("invalid file name"))?;
    let bytes = tokio::fs::read(path).await?;
    let upload_path = format!("{}/releases/{release_id}/assets", repo_path(owner, repo)?);
    client
        .upload_binary(
            &upload_path,
            &[("name", name.clone())],
            guess_content_type(&name),
            bytes,
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_cannot_hide_git_syntax() {
        for good in ["v1.0.0", "release/2026-01", "1.2.3-rc.1"] {
            assert!(ensure_tag_name(good).is_ok(), "{good}");
        }
        for bad in [
            "", " ", "-x", "a b", "a..b", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a\\b",
        ] {
            assert!(ensure_tag_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn colors_are_six_hex_digits_with_or_without_the_hash() {
        assert_eq!(normalize_color("#D73A4A").expect("color"), "d73a4a");
        assert_eq!(normalize_color(" 008672 ").expect("color"), "008672");
        for bad in ["", "fff", "12345g", "#1234567"] {
            assert!(normalize_color(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn due_dates_must_be_utc_timestamps() {
        assert!(ensure_due_date("2026-12-31T00:00:00Z").is_ok());
        for bad in [
            "2026-12-31",
            "2026-12-31T00:00:00",
            "2026/12/31T00:00:00Z",
            "x",
        ] {
            assert!(ensure_due_date(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn content_types_are_guessed_from_the_extension() {
        assert_eq!(guess_content_type("app.zip"), "application/zip");
        assert_eq!(guess_content_type("app.TAR"), "application/x-tar");
        assert_eq!(guess_content_type("checksums.sha256"), "text/plain");
        assert_eq!(
            guess_content_type("installer.exe"),
            "application/octet-stream"
        );
        assert_eq!(
            guess_content_type("noextension"),
            "application/octet-stream"
        );
    }
}
