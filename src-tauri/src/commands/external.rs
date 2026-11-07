use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;

use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::validate::ensure_relative_path;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LineStyle {
    GotoFlag,
    Suffix,
    None,
}

struct KnownEditor {
    id: &'static str,
    label: &'static str,
    commands: &'static [&'static str],
    windows_paths: &'static [&'static str],
    line_style: LineStyle,
}

const KNOWN_EDITORS: &[KnownEditor] = &[
    KnownEditor {
        id: "vscode",
        label: "Visual Studio Code",
        commands: &["code"],
        windows_paths: &["%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\bin\\code.cmd"],
        line_style: LineStyle::GotoFlag,
    },
    KnownEditor {
        id: "vscode-insiders",
        label: "VS Code Insiders",
        commands: &["code-insiders"],
        windows_paths: &[
            "%LOCALAPPDATA%\\Programs\\Microsoft VS Code Insiders\\bin\\code-insiders.cmd",
        ],
        line_style: LineStyle::GotoFlag,
    },
    KnownEditor {
        id: "cursor",
        label: "Cursor",
        commands: &["cursor"],
        windows_paths: &["%LOCALAPPDATA%\\Programs\\cursor\\resources\\app\\bin\\cursor.cmd"],
        line_style: LineStyle::GotoFlag,
    },
    KnownEditor {
        id: "zed",
        label: "Zed",
        commands: &["zed"],
        windows_paths: &[],
        line_style: LineStyle::Suffix,
    },
    KnownEditor {
        id: "sublime",
        label: "Sublime Text",
        commands: &["subl"],
        windows_paths: &["%ProgramFiles%\\Sublime Text\\subl.exe"],
        line_style: LineStyle::Suffix,
    },
    KnownEditor {
        id: "notepad++",
        label: "Notepad++",
        commands: &["notepad++"],
        windows_paths: &[
            "%ProgramFiles%\\Notepad++\\notepad++.exe",
            "%ProgramFiles(x86)%\\Notepad++\\notepad++.exe",
        ],
        line_style: LineStyle::None,
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditorOption {
    pub id: String,
    pub label: String,
}

fn expand_variables(template: &str) -> Option<PathBuf> {
    let mut result = template.to_string();
    while let Some(start) = result.find('%') {
        let rest = &result[start + 1..];
        let end = rest.find('%')?;
        let name = &rest[..end];
        let value = std::env::var(name).ok()?;
        result = format!("{}{}{}", &result[..start], value, &rest[end + 1..]);
    }
    Some(PathBuf::from(result))
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let candidates: Vec<String> = if cfg!(windows) {
        vec![
            format!("{name}.cmd"),
            format!("{name}.exe"),
            format!("{name}.bat"),
        ]
    } else {
        vec![name.to_string()]
    };
    for directory in std::env::split_paths(&path) {
        for candidate in &candidates {
            let full = directory.join(candidate);
            if full.is_file() {
                return Some(full);
            }
        }
    }
    None
}

fn locate(editor: &KnownEditor) -> Option<PathBuf> {
    for command in editor.commands {
        if let Some(found) = find_in_path(command) {
            return Some(found);
        }
    }
    if cfg!(windows) {
        for template in editor.windows_paths {
            if let Some(path) = expand_variables(template).filter(|candidate| candidate.is_file()) {
                return Some(path);
            }
        }
    }
    None
}

pub fn detect_editors() -> Vec<EditorOption> {
    KNOWN_EDITORS
        .iter()
        .filter(|editor| locate(editor).is_some())
        .map(|editor| EditorOption {
            id: editor.id.to_string(),
            label: editor.label.to_string(),
        })
        .collect()
}

fn editor_not_found(detail: &str) -> AppError {
    AppError::new(ErrorKind::EditorNotFound, detail)
}

fn resolve_editor(editor: &str, custom: Option<&str>) -> AppResult<(PathBuf, LineStyle)> {
    if editor == "custom" {
        let program = custom
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| editor_not_found("no program was configured"))?;
        if program.chars().any(char::is_control) || program.starts_with('-') {
            return Err(AppError::invalid_input("invalid editor program"));
        }
        let candidate = PathBuf::from(program);
        if candidate.is_file() {
            return Ok((candidate, LineStyle::None));
        }
        let found = find_in_path(program).ok_or_else(|| editor_not_found(program))?;
        return Ok((found, LineStyle::None));
    }
    let known = KNOWN_EDITORS
        .iter()
        .find(|item| item.id == editor)
        .ok_or_else(|| AppError::invalid_input(format!("unknown editor: {editor}")))?;
    let program = locate(known).ok_or_else(|| editor_not_found(known.label))?;
    Ok((program, known.line_style))
}

pub fn target_path(repo: &Path, relative: Option<&str>) -> AppResult<PathBuf> {
    match relative.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(repo.to_path_buf()),
        Some(value) => {
            ensure_relative_path(value)?;
            let full = repo.join(value);
            if full.exists() {
                Ok(full)
            } else {
                Err(AppError::invalid_input(format!(
                    "the path does not exist: {value}"
                )))
            }
        }
    }
}

fn editor_arguments(style: LineStyle, target: &Path, line: Option<u32>) -> Vec<String> {
    let text = target.to_string_lossy().into_owned();
    match (style, line) {
        (LineStyle::GotoFlag, Some(number)) if target.is_file() => {
            vec!["-g".to_string(), format!("{text}:{number}")]
        }
        (LineStyle::Suffix, Some(number)) if target.is_file() => vec![format!("{text}:{number}")],
        _ => vec![text],
    }
}

pub fn open_in_editor(
    repo: &Path,
    relative: Option<&str>,
    editor: &str,
    custom: Option<&str>,
    line: Option<u32>,
) -> AppResult<()> {
    let (program, style) = resolve_editor(editor, custom)?;
    let target = target_path(repo, relative)?;
    let mut command = Command::new(&program);
    command
        .args(editor_arguments(style, &target, line))
        .current_dir(repo)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|error| editor_not_found(&error.to_string()))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

pub fn reveal(repo: &Path, relative: Option<&str>) -> AppResult<()> {
    let target = target_path(repo, relative)?;
    let result = if relative.is_some() && target.is_file() {
        tauri_plugin_opener::reveal_item_in_dir(&target)
    } else {
        tauri_plugin_opener::open_path(target.to_string_lossy().into_owned(), None::<&str>)
    };
    result.map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))
}

#[tauri::command]
pub async fn editors_list() -> AppResult<Vec<EditorOption>> {
    tokio::task::spawn_blocking(detect_editors)
        .await
        .map_err(|error| AppError::new(ErrorKind::Unknown, error.to_string()))
}

#[tauri::command]
pub async fn editor_open(
    path: String,
    relative: Option<String>,
    editor: String,
    custom: Option<String>,
    line: Option<u32>,
) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        open_in_editor(
            Path::new(&path),
            relative.as_deref(),
            &editor,
            custom.as_deref(),
            line,
        )
    })
    .await
    .map_err(|error| AppError::new(ErrorKind::Unknown, error.to_string()))?
}

#[tauri::command]
pub async fn reveal_in_file_manager(path: String, relative: Option<String>) -> AppResult<()> {
    tokio::task::spawn_blocking(move || reveal(Path::new(&path), relative.as_deref()))
        .await
        .map_err(|error| AppError::new(ErrorKind::Unknown, error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn goto_style_editors_receive_the_line_for_files_only() {
        let directory = std::env::temp_dir();
        let file = directory.join("githubdesk-external-test.txt");
        std::fs::write(&file, "x").expect("file");
        let with_line = editor_arguments(LineStyle::GotoFlag, &file, Some(12));
        assert_eq!(with_line[0], "-g");
        assert!(with_line[1].ends_with(":12"));
        let folder = editor_arguments(LineStyle::GotoFlag, &directory, Some(12));
        assert_eq!(folder.len(), 1);
        let suffix = editor_arguments(LineStyle::Suffix, &file, Some(3));
        assert_eq!(suffix.len(), 1);
        assert!(suffix[0].ends_with(":3"));
        let plain = editor_arguments(LineStyle::None, &file, Some(3));
        assert_eq!(plain.len(), 1);
        assert!(!plain[0].ends_with(":3"));
        let _ = std::fs::remove_file(file);
    }

    #[test]
    fn variables_are_expanded_and_missing_ones_fail() {
        std::env::set_var("GITHUBDESK_TEST_BASE", "C:\\Base");
        assert_eq!(
            expand_variables("%GITHUBDESK_TEST_BASE%\\app.exe"),
            Some(PathBuf::from("C:\\Base\\app.exe"))
        );
        assert_eq!(
            expand_variables("%GITHUBDESK_DOES_NOT_EXIST%\\app.exe"),
            None
        );
        assert_eq!(expand_variables("plain"), Some(PathBuf::from("plain")));
    }

    #[test]
    fn unknown_and_unconfigured_editors_are_rejected() {
        assert_eq!(
            resolve_editor("nope", None).expect_err("unknown").kind,
            ErrorKind::InvalidInput
        );
        assert_eq!(
            resolve_editor("custom", None).expect_err("unset").kind,
            ErrorKind::EditorNotFound
        );
        assert_eq!(
            resolve_editor("custom", Some("-x")).expect_err("flag").kind,
            ErrorKind::InvalidInput
        );
        assert_eq!(
            resolve_editor("custom", Some("definitely-not-a-program-123"))
                .expect_err("missing")
                .kind,
            ErrorKind::EditorNotFound
        );
    }

    #[test]
    fn target_paths_stay_inside_the_repository() {
        let directory = std::env::temp_dir();
        assert_eq!(target_path(&directory, None).expect("root"), directory);
        assert_eq!(
            target_path(&directory, Some("../escape"))
                .expect_err("escape")
                .kind,
            ErrorKind::InvalidInput
        );
        assert_eq!(
            target_path(&directory, Some("no-such-file-xyz"))
                .expect_err("missing")
                .kind,
            ErrorKind::InvalidInput
        );
    }
}
