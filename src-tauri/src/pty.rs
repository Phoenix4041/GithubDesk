use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};

const READ_BUFFER_BYTES: usize = 8192;
const EXIT_FLUSH_DELAY: Duration = Duration::from_millis(150);
const MAX_SESSION_ID_LENGTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TerminalEvent {
    Output { data: String },
    Exit { code: Option<u32> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellInfo {
    pub id: String,
    pub label: String,
    pub program: PathBuf,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShellOption {
    pub id: String,
    pub label: String,
}

impl From<&ShellInfo> for ShellOption {
    fn from(shell: &ShellInfo) -> Self {
        Self {
            id: shell.id.clone(),
            label: shell.label.clone(),
        }
    }
}

pub type EventSink = Arc<dyn Fn(TerminalEvent) + Send + Sync>;

#[derive(Default)]
pub struct Utf8Chunker {
    pending: Vec<u8>,
}

impl Utf8Chunker {
    pub fn push(&mut self, bytes: &[u8]) -> Option<String> {
        self.pending.extend_from_slice(bytes);
        let ready = match std::str::from_utf8(&self.pending) {
            Ok(_) => self.pending.len(),
            Err(error) if error.error_len().is_none() => error.valid_up_to(),
            Err(_) => self.pending.len(),
        };
        if ready == 0 {
            return None;
        }
        let chunk: Vec<u8> = self.pending.drain(..ready).collect();
        Some(String::from_utf8_lossy(&chunk).into_owned())
    }

    pub fn finish(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }
        let rest = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        Some(rest)
    }
}

fn find_in_path(names: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&path) {
        for name in names {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn shell(id: &str, label: &str, program: PathBuf, args: &[&str]) -> ShellInfo {
    ShellInfo {
        id: id.to_string(),
        label: label.to_string(),
        program,
        args: args.iter().map(|value| value.to_string()).collect(),
    }
}

#[cfg(windows)]
pub fn detect_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();
    if let Some(program) = find_in_path(&["pwsh.exe"]) {
        shells.push(shell("pwsh", "PowerShell 7", program, &["-NoLogo"]));
    }
    if let Some(root) = std::env::var_os("SystemRoot") {
        let program = PathBuf::from(root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        if program.is_file() {
            shells.push(shell(
                "powershell",
                "Windows PowerShell",
                program,
                &["-NoLogo"],
            ));
        }
    }
    let git_bash_candidates = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .flat_map(|base| {
            let base = PathBuf::from(base);
            [
                base.join("Git").join("bin").join("bash.exe"),
                base.join("Programs")
                    .join("Git")
                    .join("bin")
                    .join("bash.exe"),
            ]
        });
    if let Some(program) = git_bash_candidates.into_iter().find(|path| path.is_file()) {
        shells.push(shell("gitbash", "Git Bash", program, &["--login", "-i"]));
    }
    let command_prompt = std::env::var_os("ComSpec")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| find_in_path(&["cmd.exe"]));
    if let Some(program) = command_prompt {
        shells.push(shell("cmd", "Símbolo del sistema", program, &[]));
    }
    shells
}

#[cfg(not(windows))]
pub fn detect_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();
    let mut seen = Vec::new();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(value) = std::env::var_os("SHELL") {
        candidates.push(PathBuf::from(value));
    }
    for name in ["bash", "zsh", "fish", "sh"] {
        if let Some(path) = find_in_path(&[name]) {
            candidates.push(path);
        }
    }
    for program in candidates {
        if !program.is_file() {
            continue;
        }
        let name = program
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default();
        if name.is_empty() || seen.contains(&name) {
            continue;
        }
        seen.push(name.clone());
        shells.push(shell(&name, &name, program, &["-i"]));
    }
    shells
}

pub fn pick_shell<'a>(shells: &'a [ShellInfo], wanted: Option<&str>) -> Option<&'a ShellInfo> {
    wanted
        .and_then(|id| shells.iter().find(|candidate| candidate.id == id))
        .or_else(|| shells.first())
}

pub fn ensure_session_id(id: &str) -> AppResult<()> {
    let valid = !id.is_empty()
        && id.len() <= MAX_SESSION_ID_LENGTH
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid_input("invalid terminal session id"))
    }
}

fn pty_error(error: impl std::fmt::Display) -> AppError {
    AppError::new(ErrorKind::TerminalUnavailable, error.to_string())
}

fn size(columns: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: columns.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Clone, Default)]
pub struct TerminalRegistry {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl TerminalRegistry {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Session>> {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn open(
        &self,
        id: &str,
        cwd: &Path,
        shell: &ShellInfo,
        columns: u16,
        rows: u16,
        sink: EventSink,
    ) -> AppResult<()> {
        ensure_session_id(id)?;
        if !cwd.is_dir() {
            return Err(AppError::new(
                ErrorKind::TerminalUnavailable,
                "the folder does not exist",
            ));
        }
        if self.lock().contains_key(id) {
            return Err(AppError::invalid_input(
                "the terminal session already exists",
            ));
        }

        let pair = native_pty_system()
            .openpty(size(columns, rows))
            .map_err(pty_error)?;
        let mut command = CommandBuilder::new(&shell.program);
        command.args(&shell.args);
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        let mut child = pair.slave.spawn_command(command).map_err(pty_error)?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(pty_error)?;
        let writer = pair.master.take_writer().map_err(pty_error)?;
        let killer = child.clone_killer();

        self.lock().insert(
            id.to_string(),
            Session {
                master: pair.master,
                writer,
                killer,
            },
        );

        let reader_sink = Arc::clone(&sink);
        thread::spawn(move || {
            let mut chunker = Utf8Chunker::default();
            let mut buffer = [0u8; READ_BUFFER_BYTES];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        if let Some(data) = chunker.push(&buffer[..count]) {
                            reader_sink(TerminalEvent::Output { data });
                        }
                    }
                }
            }
            if let Some(data) = chunker.finish() {
                reader_sink(TerminalEvent::Output { data });
            }
        });

        let registry = self.clone();
        let session_id = id.to_string();
        thread::spawn(move || {
            let code = child.wait().ok().map(|status| status.exit_code());
            thread::sleep(EXIT_FLUSH_DELAY);
            sink(TerminalEvent::Exit { code });
            registry.lock().remove(&session_id);
        });

        Ok(())
    }

    pub fn write(&self, id: &str, data: &[u8]) -> AppResult<()> {
        let mut sessions = self.lock();
        let session = sessions.get_mut(id).ok_or_else(not_found)?;
        session.writer.write_all(data).map_err(pty_error)?;
        session.writer.flush().map_err(pty_error)
    }

    pub fn resize(&self, id: &str, columns: u16, rows: u16) -> AppResult<()> {
        let sessions = self.lock();
        let session = sessions.get(id).ok_or_else(not_found)?;
        session
            .master
            .resize(size(columns, rows))
            .map_err(pty_error)
    }

    pub fn close(&self, id: &str) {
        let removed = self.lock().remove(id);
        if let Some(mut session) = removed {
            let _ = session.killer.kill();
        }
    }

    pub fn close_all(&self) {
        let sessions: Vec<Session> = self.lock().drain().map(|(_, session)| session).collect();
        for mut session in sessions {
            let _ = session.killer.kill();
        }
    }

    pub fn contains(&self, id: &str) -> bool {
        self.lock().contains_key(id)
    }
}

fn not_found() -> AppError {
    AppError::new(
        ErrorKind::TerminalNotFound,
        "the terminal session is not open",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_chunks_pass_through() {
        let mut chunker = Utf8Chunker::default();
        assert_eq!(chunker.push(b"hello"), Some("hello".to_string()));
        assert_eq!(chunker.push(b""), None);
    }

    #[test]
    fn multibyte_characters_split_across_reads_stay_whole() {
        let bytes = "añb".as_bytes();
        let mut chunker = Utf8Chunker::default();
        assert_eq!(chunker.push(&bytes[..2]), Some("a".to_string()));
        assert_eq!(chunker.push(&bytes[2..]), Some("ñb".to_string()));
    }

    #[test]
    fn invalid_bytes_are_replaced_instead_of_blocking_the_stream() {
        let mut chunker = Utf8Chunker::default();
        let text = chunker.push(&[b'a', 0xFF, b'b']).expect("text");
        assert_eq!(text, "a\u{FFFD}b");
        assert_eq!(chunker.finish(), None);
    }

    #[test]
    fn an_unfinished_character_is_flushed_at_the_end() {
        let mut chunker = Utf8Chunker::default();
        assert_eq!(chunker.push(&"ñ".as_bytes()[..1]), None);
        assert_eq!(chunker.finish(), Some("\u{FFFD}".to_string()));
    }

    #[test]
    fn session_ids_are_validated() {
        assert!(ensure_session_id("3f2c-91ab").is_ok());
        assert!(ensure_session_id("").is_err());
        assert!(ensure_session_id("a b").is_err());
        assert!(ensure_session_id(&"x".repeat(65)).is_err());
    }

    #[test]
    fn the_requested_shell_wins_and_the_first_one_is_the_fallback() {
        let shells = vec![
            shell("one", "One", PathBuf::from("one"), &[]),
            shell("two", "Two", PathBuf::from("two"), &[]),
        ];
        assert_eq!(
            pick_shell(&shells, Some("two")).map(|s| s.id.as_str()),
            Some("two")
        );
        assert_eq!(
            pick_shell(&shells, Some("zzz")).map(|s| s.id.as_str()),
            Some("one")
        );
        assert_eq!(
            pick_shell(&shells, None).map(|s| s.id.as_str()),
            Some("one")
        );
        assert!(pick_shell(&[], None).is_none());
    }
}
