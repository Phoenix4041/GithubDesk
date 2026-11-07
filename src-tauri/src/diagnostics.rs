use std::fs::{self, OpenOptions};
use std::io::Write;
use std::panic::PanicHookInfo;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::redact::redact;

pub const MAX_LOG_BYTES: u64 = 1_048_576;
const MAX_DETAIL_CHARS: usize = 4000;
const LOG_FILE: &str = "errors.log";
const ROTATED_FILE: &str = "errors.1.log";

static LOG: OnceLock<ErrorLog> = OnceLock::new();

pub struct ErrorLog {
    directory: PathBuf,
    max_bytes: u64,
    writing: Mutex<()>,
}

pub fn format_utc(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let remainder = seconds % 86_400;
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        remainder / 3_600,
        remainder % 3_600 / 60,
        remainder % 60
    )
}

fn clean_field(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\n' | '\r' | '\t' => ' ',
            other if other.is_control() => ' ',
            other => other,
        })
        .collect()
}

fn truncate_chars(value: &str, limit: usize) -> String {
    match value.char_indices().nth(limit) {
        Some((index, _)) => format!("{}...", &value[..index]),
        None => value.to_string(),
    }
}

fn single_line(detail: &str) -> String {
    let joined = detail.replace("\r\n", "\\n").replace(['\n', '\r'], "\\n");
    clean_field(&truncate_chars(&redact(&joined), MAX_DETAIL_CHARS))
}

impl ErrorLog {
    pub fn new(directory: PathBuf, max_bytes: u64) -> Self {
        Self {
            directory,
            max_bytes,
            writing: Mutex::new(()),
        }
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    fn rotate_if_needed(&self, incoming: u64) -> std::io::Result<()> {
        let current = self.directory.join(LOG_FILE);
        let size = fs::metadata(&current).map(|meta| meta.len()).unwrap_or(0);
        if size > 0 && size + incoming > self.max_bytes {
            let rotated = self.directory.join(ROTATED_FILE);
            let _ = fs::remove_file(&rotated);
            fs::rename(&current, &rotated)?;
        }
        Ok(())
    }

    pub fn record_at(
        &self,
        seconds: u64,
        source: &str,
        kind: &str,
        detail: &str,
    ) -> std::io::Result<()> {
        let line = format!(
            "{}\t{}\t{}\t{}\n",
            format_utc(seconds),
            truncate_chars(&clean_field(source), 32),
            truncate_chars(&clean_field(kind), 64),
            single_line(detail)
        );
        let _guard = self
            .writing
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        fs::create_dir_all(&self.directory)?;
        self.rotate_if_needed(line.len() as u64)?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.directory.join(LOG_FILE))?;
        file.write_all(line.as_bytes())
    }

    pub fn record(&self, source: &str, kind: &str, detail: &str) -> std::io::Result<()> {
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or(0);
        self.record_at(seconds, source, kind, detail)
    }
}

fn describe_panic(info: &PanicHookInfo<'_>) -> String {
    let message = if let Some(text) = info.payload().downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = info.payload().downcast_ref::<String>() {
        text.clone()
    } else {
        "panic without a message".to_string()
    };
    match info.location() {
        Some(location) => format!("{message} at {}:{}", location.file(), location.line()),
        None => message,
    }
}

pub fn init(directory: PathBuf) {
    if LOG.set(ErrorLog::new(directory, MAX_LOG_BYTES)).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record("backend", "panic", &describe_panic(info));
        previous(info);
    }));
}

pub fn record(source: &str, kind: &str, detail: &str) {
    if let Some(log) = LOG.get() {
        let _ = log.record(source, kind, detail);
    }
}

pub fn log_directory() -> Option<PathBuf> {
    LOG.get().map(|log| log.directory().to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(directory: &Path, name: &str) -> String {
        fs::read_to_string(directory.join(name)).unwrap_or_default()
    }

    #[test]
    fn timestamps_are_formatted_as_utc() {
        assert_eq!(format_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_utc(1_000_000_000), "2001-09-09T01:46:40Z");
        assert_eq!(format_utc(1_709_164_800), "2024-02-29T00:00:00Z");
        assert_eq!(format_utc(4_102_444_799), "2099-12-31T23:59:59Z");
    }

    #[test]
    fn each_error_is_one_line_with_time_source_kind_and_detail() {
        let directory = tempfile::tempdir().expect("temp dir");
        let log = ErrorLog::new(directory.path().join("logs"), MAX_LOG_BYTES);
        log.record_at(
            1_000_000_000,
            "command",
            "remoteAhead",
            "line one\nline two\ttabbed",
        )
        .expect("record");
        let text = read(&directory.path().join("logs"), LOG_FILE);
        assert_eq!(
            text,
            "2001-09-09T01:46:40Z\tcommand\tremoteAhead\tline one\\nline two tabbed\n"
        );
    }

    #[test]
    fn secrets_never_reach_the_file() {
        let directory = tempfile::tempdir().expect("temp dir");
        let log = ErrorLog::new(directory.path().to_path_buf(), MAX_LOG_BYTES);
        log.record(
            "command",
            "unknown",
            "failed https://user:hunter2@github.com/o/r.git with ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        )
        .expect("record");
        let text = read(directory.path(), LOG_FILE);
        assert!(!text.contains("hunter2"));
        assert!(!text.contains("ghp_abcdef"));
        assert!(text.contains("github.com/o/r.git"));
    }

    #[test]
    fn long_details_are_cut() {
        let directory = tempfile::tempdir().expect("temp dir");
        let log = ErrorLog::new(directory.path().to_path_buf(), MAX_LOG_BYTES);
        log.record("window", "uncaught", &"x".repeat(10_000))
            .expect("record");
        let text = read(directory.path(), LOG_FILE);
        assert!(text.len() < 4_200);
        assert!(text.trim_end().ends_with("..."));
    }

    #[test]
    fn the_file_rotates_instead_of_growing_forever() {
        let directory = tempfile::tempdir().expect("temp dir");
        let log = ErrorLog::new(directory.path().to_path_buf(), 300);
        for number in 0..12 {
            log.record_at(
                number,
                "backend",
                "panic",
                &format!("failure number {number} {}", "y".repeat(40)),
            )
            .expect("record");
        }
        let current = read(directory.path(), LOG_FILE);
        let rotated = read(directory.path(), ROTATED_FILE);
        assert!(!rotated.is_empty());
        assert!(current.len() as u64 <= 300);
        assert!(rotated.len() as u64 <= 300);
        assert!(current.contains("failure number 11"));
        assert!(!rotated.contains("failure number 11"));
        assert!(!directory.path().join("errors.2.log").exists());
    }
}
