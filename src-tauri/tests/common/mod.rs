#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Once;

use githubdesk_lib::commands::{commit, repo, status};
use tempfile::TempDir;

pub fn configure_environment() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let config_directory = std::env::temp_dir().join("githubdesk-test-config");
        std::fs::create_dir_all(&config_directory).expect("config directory");
        let global_config = config_directory.join("gitconfig");
        std::fs::write(
            &global_config,
            "[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n[protocol \"file\"]\n\tallow = always\n",
        )
        .expect("global config");
        std::env::set_var("GIT_CONFIG_GLOBAL", &global_config);
        std::env::set_var("GIT_CONFIG_NOSYSTEM", "1");
        std::env::set_var("GIT_AUTHOR_NAME", "Test User");
        std::env::set_var("GIT_AUTHOR_EMAIL", "test@example.com");
        std::env::set_var("GIT_COMMITTER_NAME", "Test User");
        std::env::set_var("GIT_COMMITTER_EMAIL", "test@example.com");
    });
}

pub fn git_output(directory: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(directory)
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

pub fn git_try(directory: &Path, args: &[&str]) -> (bool, String) {
    let output = Command::new("git")
        .args(args)
        .current_dir(directory)
        .output()
        .expect("git runs");
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    (output.status.success(), text)
}

pub fn write_file(repo: &Path, relative: &str, content: &str) {
    let full_path = repo.join(relative);
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).expect("parent directory");
    }
    std::fs::write(full_path, content).expect("write file");
}

pub struct Workspace {
    _root: TempDir,
    pub path: PathBuf,
}

pub async fn new_repository() -> Workspace {
    configure_environment();
    let root = TempDir::new().expect("temp dir");
    let info = repo::init_repository(root.path(), "work", "main")
        .await
        .expect("init repository");
    Workspace {
        path: PathBuf::from(info.path),
        _root: root,
    }
}

pub async fn commit_file(repo: &Path, relative: &str, content: &str, title: &str) -> String {
    write_file(repo, relative, content);
    status::stage_paths(repo, &[relative.to_string()])
        .await
        .expect("stage");
    commit::create_commit(repo, title, "", false)
        .await
        .expect("commit")
}
