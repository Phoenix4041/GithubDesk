use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::github::client::GithubClient;
use crate::github::host::Endpoints;
use crate::github::secrets::SecretStore;

const ACCOUNTS_FILE: &str = "accounts.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AccountSource {
    Oauth,
    Token,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub host: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub source: AccountSource,
    #[serde(default)]
    pub user_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct UserResponse {
    #[serde(default)]
    id: Option<u64>,
    login: String,
    name: Option<String>,
    avatar_url: String,
}

pub fn account_id(host: &str, login: &str) -> String {
    format!("{host}:{}", login.to_lowercase())
}

pub struct AccountStore {
    directory: PathBuf,
    secrets: Arc<dyn SecretStore>,
    write_lock: Mutex<()>,
}

impl AccountStore {
    pub fn new(directory: PathBuf, secrets: Arc<dyn SecretStore>) -> Self {
        Self {
            directory,
            secrets,
            write_lock: Mutex::new(()),
        }
    }

    fn file_path(&self) -> PathBuf {
        self.directory.join(ACCOUNTS_FILE)
    }

    async fn read_accounts(&self) -> AppResult<Vec<Account>> {
        match tokio::fs::read_to_string(self.file_path()).await {
            Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_default()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(error) => Err(error.into()),
        }
    }

    async fn write_accounts(&self, accounts: &[Account]) -> AppResult<()> {
        tokio::fs::create_dir_all(&self.directory).await?;
        let text = serde_json::to_string_pretty(accounts)
            .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))?;
        let temporary = self.directory.join(format!("{ACCOUNTS_FILE}.tmp"));
        tokio::fs::write(&temporary, text).await?;
        tokio::fs::rename(&temporary, self.file_path()).await?;
        Ok(())
    }

    pub async fn list(&self) -> AppResult<Vec<Account>> {
        self.read_accounts().await
    }

    pub async fn get(&self, id: &str) -> AppResult<Account> {
        self.read_accounts()
            .await?
            .into_iter()
            .find(|account| account.id == id)
            .ok_or_else(|| AppError::new(ErrorKind::GithubNoAccount, id))
    }

    pub async fn token(&self, id: &str) -> AppResult<String> {
        let secrets = Arc::clone(&self.secrets);
        let key = id.to_string();
        let found = tokio::task::spawn_blocking(move || secrets.get(&key))
            .await
            .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))??;
        found.ok_or_else(|| AppError::new(ErrorKind::GithubNoAccount, id))
    }

    pub async fn save(&self, account: Account, token: &str) -> AppResult<Account> {
        let secrets = Arc::clone(&self.secrets);
        let key = account.id.clone();
        let secret = token.to_string();
        tokio::task::spawn_blocking(move || secrets.set(&key, &secret))
            .await
            .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))??;

        let _guard = self.write_lock.lock().await;
        let mut accounts = self.read_accounts().await?;
        accounts.retain(|existing| existing.id != account.id);
        accounts.push(account.clone());
        self.write_accounts(&accounts).await?;
        Ok(account)
    }

    pub async fn remove(&self, id: &str) -> AppResult<()> {
        let secrets = Arc::clone(&self.secrets);
        let key = id.to_string();
        tokio::task::spawn_blocking(move || secrets.delete(&key))
            .await
            .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))??;

        let _guard = self.write_lock.lock().await;
        let mut accounts = self.read_accounts().await?;
        accounts.retain(|existing| existing.id != id);
        self.write_accounts(&accounts).await
    }

    pub async fn client_for(
        &self,
        id: &str,
        cache: Option<Arc<crate::github::client::EtagCache>>,
    ) -> AppResult<(Account, GithubClient)> {
        let account = self.get(id).await?;
        let token = self.token(id).await?;
        let endpoints = Endpoints::for_host(&account.host)?;
        let mut client = GithubClient::new(&endpoints.api_base, Some(token))?;
        if let Some(cache) = cache {
            client = client.with_cache(cache, account.id.clone());
        }
        Ok((account, client))
    }

    pub async fn add_with_token(
        &self,
        host: &str,
        token: &str,
        source: AccountSource,
    ) -> AppResult<Account> {
        self.add_with_token_expecting(host, token, source, None)
            .await
    }

    pub async fn add_with_token_expecting(
        &self,
        host: &str,
        token: &str,
        source: AccountSource,
        expected_login: Option<&str>,
    ) -> AppResult<Account> {
        let token = token.trim();
        if token.is_empty() || token.chars().any(char::is_whitespace) {
            return Err(AppError::invalid_input(
                "the token is empty or contains spaces",
            ));
        }
        let endpoints = Endpoints::for_host(host)?;
        let client = GithubClient::new(&endpoints.api_base, Some(token.to_string()))?;
        let user: UserResponse = client.get_json("/user", &[]).await?;
        if let Some(expected) = expected_login {
            if !user.login.eq_ignore_ascii_case(expected) {
                return Err(AppError::new(ErrorKind::GithubAccountMismatch, user.login));
            }
        }
        let account = Account {
            id: account_id(&endpoints.host, &user.login),
            host: endpoints.host,
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            source,
            user_id: user.id,
        };
        self.save(account, token).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_ids_ignore_login_case() {
        assert_eq!(account_id("github.com", "Octo-Cat"), "github.com:octo-cat");
    }
}
