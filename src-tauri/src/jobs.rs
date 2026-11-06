use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::watch;

#[derive(Clone)]
pub struct CancelToken {
    receiver: watch::Receiver<bool>,
}

impl CancelToken {
    pub fn never() -> Self {
        let (_sender, receiver) = watch::channel(false);
        Self { receiver }
    }

    pub fn is_cancelled(&self) -> bool {
        *self.receiver.borrow()
    }

    pub async fn cancelled(&mut self) {
        loop {
            if *self.receiver.borrow_and_update() {
                return;
            }
            if self.receiver.changed().await.is_err() {
                std::future::pending::<()>().await;
            }
        }
    }
}

#[derive(Default)]
pub struct JobRegistry {
    senders: Mutex<HashMap<String, watch::Sender<bool>>>,
}

impl JobRegistry {
    fn lock(&self) -> MutexGuard<'_, HashMap<String, watch::Sender<bool>>> {
        self.senders
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn register(self: &Arc<Self>, id: &str) -> JobGuard {
        let (sender, receiver) = watch::channel(false);
        self.lock().insert(id.to_string(), sender);
        JobGuard {
            registry: Arc::clone(self),
            id: id.to_string(),
            token: CancelToken { receiver },
        }
    }

    pub fn cancel(&self, id: &str) -> bool {
        match self.lock().get(id) {
            Some(sender) => sender.send(true).is_ok(),
            None => false,
        }
    }

    fn remove(&self, id: &str) {
        self.lock().remove(id);
    }
}

pub struct JobGuard {
    registry: Arc<JobRegistry>,
    id: String,
    token: CancelToken,
}

impl JobGuard {
    pub fn token(&self) -> CancelToken {
        self.token.clone()
    }
}

impl Drop for JobGuard {
    fn drop(&mut self) {
        self.registry.remove(&self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancel_reaches_registered_token() {
        let registry = Arc::new(JobRegistry::default());
        let guard = registry.register("job-1");
        let mut token = guard.token();
        assert!(!token.is_cancelled());
        assert!(registry.cancel("job-1"));
        token.cancelled().await;
        assert!(token.is_cancelled());
    }

    #[tokio::test]
    async fn cancel_unknown_job_returns_false() {
        let registry = Arc::new(JobRegistry::default());
        assert!(!registry.cancel("missing"));
    }

    #[tokio::test]
    async fn guard_removes_job_on_drop() {
        let registry = Arc::new(JobRegistry::default());
        {
            let _guard = registry.register("job-2");
            assert!(registry.cancel("job-2"));
        }
        assert!(!registry.cancel("job-2"));
    }
}
