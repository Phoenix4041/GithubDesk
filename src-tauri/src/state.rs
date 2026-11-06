use std::sync::{Arc, Mutex};

use crate::jobs::JobRegistry;
use crate::watcher::RepoWatcher;

#[derive(Default)]
pub struct AppState {
    pub jobs: Arc<JobRegistry>,
    pub watcher: Mutex<Option<RepoWatcher>>,
}
