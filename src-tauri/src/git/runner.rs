use std::path::Path;
use std::process::Stdio;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::parse::progress::{parse_progress_line, Progress};
use crate::jobs::CancelToken;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Default, Clone)]
pub struct GitOutput {
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub exit_code: i32,
}

impl GitOutput {
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }

    pub fn trimmed(&self) -> String {
        self.text().trim().to_string()
    }

    pub fn success(&self) -> bool {
        self.exit_code == 0
    }
}

fn base_command(cwd: Option<&Path>, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    command
        .arg("--no-pager")
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_EDITOR", ":")
        .env("GIT_MERGE_AUTOEDIT", "no")
        .env("LC_ALL", "C")
        .env("LANG", "C");
    if let Some(directory) = cwd {
        command.current_dir(directory);
    }
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn spawn_error(error: std::io::Error) -> AppError {
    if error.kind() == std::io::ErrorKind::NotFound {
        AppError::new(ErrorKind::GitNotFound, error.to_string())
    } else {
        error.into()
    }
}

fn ensure_success(output: GitOutput) -> AppResult<GitOutput> {
    if output.exit_code == 0 {
        Ok(output)
    } else {
        Err(AppError::from_git_failure(
            &String::from_utf8_lossy(&output.stdout),
            &output.stderr,
        ))
    }
}

async fn run_to_completion(mut command: Command, input: Option<Vec<u8>>) -> AppResult<GitOutput> {
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .kill_on_drop(true);

    let mut child = command.spawn().map_err(spawn_error)?;

    if let Some(bytes) = input {
        if let Some(mut stdin) = child.stdin.take() {
            tokio::spawn(async move {
                let _ = stdin.write_all(&bytes).await;
                let _ = stdin.shutdown().await;
            });
        }
    }

    let output = child.wait_with_output().await?;
    Ok(GitOutput {
        stdout: output.stdout,
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

pub async fn git_unchecked(cwd: &Path, args: &[&str]) -> AppResult<GitOutput> {
    run_to_completion(base_command(Some(cwd), args), None).await
}

pub async fn git(cwd: &Path, args: &[&str]) -> AppResult<GitOutput> {
    ensure_success(git_unchecked(cwd, args).await?)
}

pub async fn git_with_env(
    cwd: &Path,
    args: &[&str],
    envs: &[(&str, &str)],
) -> AppResult<GitOutput> {
    let mut command = base_command(Some(cwd), args);
    for (key, value) in envs {
        command.env(key, value);
    }
    ensure_success(run_to_completion(command, None).await?)
}

pub async fn git_with_input(cwd: &Path, args: &[&str], input: Vec<u8>) -> AppResult<GitOutput> {
    ensure_success(run_to_completion(base_command(Some(cwd), args), Some(input)).await?)
}

#[cfg(windows)]
async fn kill_process_tree(pid: u32) {
    let mut killer = Command::new("taskkill");
    killer
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    killer.creation_flags(CREATE_NO_WINDOW);
    let _ = killer.status().await;
}

async fn terminate(child: &mut Child) {
    #[cfg(windows)]
    if let Some(pid) = child.id() {
        kill_process_tree(pid).await;
    }
    let _ = child.kill().await;
}

fn emit_segment(segment: &mut Vec<u8>, on_progress: &(dyn Fn(Progress) + Send + Sync)) {
    if segment.is_empty() {
        return;
    }
    let line = String::from_utf8_lossy(segment).into_owned();
    segment.clear();
    if let Some(progress) = parse_progress_line(&line) {
        on_progress(progress);
    }
}

pub async fn git_streaming(
    cwd: Option<&Path>,
    args: &[&str],
    mut cancel: CancelToken,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> AppResult<GitOutput> {
    let mut command = base_command(cwd, args);
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);

    let mut child = command.spawn().map_err(spawn_error)?;
    let mut stdout = child.stdout.take().expect("stdout is piped");
    let mut stderr = child.stderr.take().expect("stderr is piped");

    let stdout_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        let _ = stdout.read_to_end(&mut buffer).await;
        buffer
    });

    let mut stderr_bytes: Vec<u8> = Vec::new();
    let mut segment: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                terminate(&mut child).await;
                stdout_task.abort();
                return Err(AppError::cancelled());
            }
            read = stderr.read(&mut chunk) => {
                let count = read?;
                if count == 0 {
                    break;
                }
                for &byte in &chunk[..count] {
                    stderr_bytes.push(byte);
                    if byte == b'\r' || byte == b'\n' {
                        emit_segment(&mut segment, on_progress);
                    } else {
                        segment.push(byte);
                    }
                }
            }
        }
    }
    emit_segment(&mut segment, on_progress);

    let status = tokio::select! {
        biased;
        _ = cancel.cancelled() => {
            terminate(&mut child).await;
            stdout_task.abort();
            return Err(AppError::cancelled());
        }
        status = child.wait() => status?,
    };

    let stdout_bytes = stdout_task.await.unwrap_or_default();
    let stderr_text = String::from_utf8_lossy(&stderr_bytes).replace('\r', "\n");

    ensure_success(GitOutput {
        stdout: stdout_bytes,
        stderr: stderr_text,
        exit_code: status.code().unwrap_or(-1),
    })
}
