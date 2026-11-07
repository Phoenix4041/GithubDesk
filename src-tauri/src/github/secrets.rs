use std::collections::HashMap;
use std::sync::Mutex;

use crate::error::{AppError, AppResult, ErrorKind};

pub const SERVICE_NAME: &str = "githubdesk";

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> AppResult<Option<String>>;
    fn set(&self, key: &str, value: &str) -> AppResult<()>;
    fn delete(&self, key: &str) -> AppResult<()>;
}

#[derive(Default)]
pub struct MemoryStore {
    entries: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemoryStore {
    fn get(&self, key: &str) -> AppResult<Option<String>> {
        Ok(self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(key)
            .cloned())
    }

    fn set(&self, key: &str, value: &str) -> AppResult<()> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, key: &str) -> AppResult<()> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(key);
        Ok(())
    }
}

pub struct KeyringStore;

fn store_error(error: keyring::Error) -> AppError {
    AppError::new(ErrorKind::CredentialStoreUnavailable, error.to_string())
}

impl SecretStore for KeyringStore {
    fn get(&self, key: &str) -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(SERVICE_NAME, key).map_err(store_error)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(store_error(error)),
        }
    }

    fn set(&self, key: &str, value: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, key).map_err(store_error)?;
        entry.set_password(value).map_err(store_error)
    }

    fn delete(&self, key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(SERVICE_NAME, key).map_err(store_error)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(store_error(error)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trips_and_deletes() {
        let store = MemoryStore::default();
        assert_eq!(store.get("a").expect("get"), None);
        store.set("a", "one").expect("set");
        store.set("a", "two").expect("overwrite");
        assert_eq!(store.get("a").expect("get").as_deref(), Some("two"));
        store.delete("a").expect("delete");
        assert_eq!(store.get("a").expect("get"), None);
        store.delete("missing").expect("deleting nothing is fine");
    }
}
