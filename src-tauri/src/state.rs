use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::github::accounts::AccountStore;
use crate::github::client::EtagCache;
use crate::github::secrets::{KeyringStore, SecretStore};
use crate::jobs::JobRegistry;
use crate::pty::TerminalRegistry;
use crate::watcher::RepoWatcher;

pub struct AppState {
    pub jobs: Arc<JobRegistry>,
    pub watcher: Mutex<Option<RepoWatcher>>,
    pub accounts: AccountStore,
    pub etags: Arc<EtagCache>,
    pub terminals: TerminalRegistry,
}

impl AppState {
    pub fn new(accounts_directory: PathBuf) -> Self {
        let secrets: Arc<dyn SecretStore> = Arc::new(KeyringStore);
        Self::with_secrets(accounts_directory, secrets)
    }

    pub fn with_secrets(accounts_directory: PathBuf, secrets: Arc<dyn SecretStore>) -> Self {
        Self {
            jobs: Arc::new(JobRegistry::default()),
            watcher: Mutex::new(None),
            accounts: AccountStore::new(accounts_directory, secrets),
            etags: Arc::new(EtagCache::default()),
            terminals: TerminalRegistry::default(),
        }
    }
}
