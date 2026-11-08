use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::git::runner::{git, git_unchecked};

const FIELD_SEPARATOR: char = '\u{1f}';
const DEFAULT_SCAN: usize = 1000;
const MAX_SCAN: usize = 10_000;
const MAX_PEOPLE: usize = 50;
const TEMPLATE_KEY: &str = "githubdesk.commitTemplate";
const MAX_TEMPLATE: usize = 4000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoauthorCandidate {
    pub name: String,
    pub email: String,
    pub commits: usize,
}

fn email_of_ident(ident: &str) -> Option<String> {
    let start = ident.find('<')?;
    let end = ident[start..].find('>')? + start;
    Some(ident[start + 1..end].trim().to_lowercase())
}

pub fn rank_authors(log: &str, own_email: Option<&str>) -> Vec<CoauthorCandidate> {
    let mut people: HashMap<String, CoauthorCandidate> = HashMap::new();
    for line in log.lines() {
        let Some((name, email)) = line.split_once(FIELD_SEPARATOR) else {
            continue;
        };
        let name = name.trim();
        let email = email.trim();
        if name.is_empty() || email.is_empty() || email.contains(['<', '>']) {
            continue;
        }
        let key = email.to_lowercase();
        if own_email == Some(key.as_str()) {
            continue;
        }
        people
            .entry(key)
            .and_modify(|person| person.commits += 1)
            .or_insert_with(|| CoauthorCandidate {
                name: name.to_string(),
                email: email.to_string(),
                commits: 1,
            });
    }
    let mut ranked: Vec<CoauthorCandidate> = people.into_values().collect();
    ranked.sort_by(|left, right| {
        right
            .commits
            .cmp(&left.commits)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    ranked.truncate(MAX_PEOPLE);
    ranked
}

pub async fn list_coauthors(
    repo: &Path,
    limit: Option<usize>,
) -> AppResult<Vec<CoauthorCandidate>> {
    let verify = git_unchecked(repo, &["rev-parse", "--verify", "-q", "HEAD"]).await?;
    if !verify.success() {
        return Ok(Vec::new());
    }
    let scan = limit.unwrap_or(DEFAULT_SCAN).clamp(1, MAX_SCAN).to_string();
    let output = git(
        repo,
        &["log", "--no-merges", "-n", &scan, "--format=%an%x1f%ae"],
    )
    .await?;
    let ident = git_unchecked(repo, &["var", "GIT_AUTHOR_IDENT"]).await?;
    let own = if ident.success() {
        email_of_ident(&ident.text())
    } else {
        None
    };
    Ok(rank_authors(&output.text(), own.as_deref()))
}

pub async fn read_template(repo: &Path) -> AppResult<String> {
    let output = git_unchecked(repo, &["config", "--local", "--get", TEMPLATE_KEY]).await?;
    if output.exit_code == 1 {
        return Ok(String::new());
    }
    if !output.success() {
        return Err(AppError::from_git_failure("", &output.stderr));
    }
    Ok(output.text().trim_end_matches(['\r', '\n']).to_string())
}

pub async fn write_template(repo: &Path, template: &str) -> AppResult<()> {
    let clean = template.replace("\r\n", "\n");
    let clean = clean.trim_end();
    if clean.chars().count() > MAX_TEMPLATE {
        return Err(AppError::invalid_input("the template is too long"));
    }
    if clean.contains('\0') {
        return Err(AppError::invalid_input(
            "the template has invalid characters",
        ));
    }
    if clean.trim().is_empty() {
        let output =
            git_unchecked(repo, &["config", "--local", "--unset-all", TEMPLATE_KEY]).await?;
        if output.success() || output.exit_code == 5 {
            return Ok(());
        }
        return Err(AppError::from_git_failure("", &output.stderr));
    }
    git(repo, &["config", "--local", TEMPLATE_KEY, clean]).await?;
    Ok(())
}

#[tauri::command]
pub async fn commit_coauthors(
    path: String,
    limit: Option<usize>,
) -> AppResult<Vec<CoauthorCandidate>> {
    list_coauthors(Path::new(&path), limit).await
}

#[tauri::command]
pub async fn commit_template_get(path: String) -> AppResult<String> {
    read_template(Path::new(&path)).await
}

#[tauri::command]
pub async fn commit_template_set(path: String, template: String) -> AppResult<()> {
    write_template(Path::new(&path), &template).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_people_by_commits_and_skips_the_current_author() {
        let log = "Ana\u{1f}ana@example.com\nLuis\u{1f}luis@example.com\nAna\u{1f}ANA@example.com\nMe\u{1f}me@example.com\nbroken line\n";
        let ranked = rank_authors(log, Some("me@example.com"));
        assert_eq!(ranked.len(), 2);
        assert_eq!(ranked[0].name, "Ana");
        assert_eq!(ranked[0].commits, 2);
        assert_eq!(ranked[1].email, "luis@example.com");
    }

    #[test]
    fn reads_the_email_of_an_identity() {
        assert_eq!(
            email_of_ident("Test User <Test@Example.com> 1700000000 +0000"),
            Some("test@example.com".to_string())
        );
        assert_eq!(email_of_ident("nothing"), None);
    }
}
