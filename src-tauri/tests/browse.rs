mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::browse::{
    diff_file, diff_files, list_tree, read_file, restore_file, FileSource, TreeEntryKind,
};
use githubdesk_lib::commands::rescue::list_entries;
use githubdesk_lib::commands::status::stage_paths;
use githubdesk_lib::error::ErrorKind;

fn at(revision: &str) -> FileSource {
    FileSource::Revision {
        revision: revision.to_string(),
    }
}

#[tokio::test]
async fn a_file_reads_back_as_it_was_in_each_revision() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let first = commit_file(repo, "notes.txt", "one\n", "first").await;
    let second = commit_file(repo, "notes.txt", "one\ntwo\n", "second").await;

    let old = read_file(repo, &at(&first), "notes.txt")
        .await
        .expect("old");
    let new = read_file(repo, &at(&second), "notes.txt")
        .await
        .expect("new");
    assert_eq!(old.text.as_deref(), Some("one\n"));
    assert_eq!(new.text.as_deref(), Some("one\ntwo\n"));
    assert_eq!(new.size, 8);
    assert!(!new.binary);

    let missing = read_file(repo, &at(&first), "absent.txt")
        .await
        .expect("missing");
    assert!(!missing.exists);
}

#[tokio::test]
async fn the_tree_lists_folders_first_and_opens_subfolders() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    write_file(repo, "src/inner/deep.rs", "fn main() {}\n");
    write_file(repo, "src/lib.rs", "pub fn a() {}\n");
    commit_file(repo, "README.md", "hello\n", "tree").await;
    stage_paths(repo, &["src".to_string()])
        .await
        .expect("stage");
    git_output(repo, &["commit", "-m", "src"]);

    let root = list_tree(repo, "HEAD", None).await.expect("root");
    let names: Vec<_> = root
        .entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect();
    assert_eq!(names, ["src", "README.md"]);
    assert_eq!(root.entries[0].kind, TreeEntryKind::Folder);
    assert_eq!(root.entries[1].size, Some(6));

    let src = list_tree(repo, "HEAD", Some("src")).await.expect("src");
    let paths: Vec<_> = src
        .entries
        .iter()
        .map(|entry| entry.path.as_str())
        .collect();
    assert_eq!(paths, ["src/inner", "src/lib.rs"]);

    let inner = list_tree(repo, "HEAD", Some("src/inner"))
        .await
        .expect("inner");
    assert_eq!(inner.entries[0].name, "deep.rs");

    let error = list_tree(repo, "HEAD", Some("nowhere"))
        .await
        .expect_err("missing folder");
    assert_eq!(error.kind, ErrorKind::FileNotInRevision);
}

#[tokio::test]
async fn binary_files_are_flagged_and_images_come_as_base64() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    std::fs::write(repo.join("data.bin"), [0u8, 1, 2, 3]).expect("bin");
    std::fs::write(repo.join("pixel.png"), [137u8, 80, 78, 71, 0]).expect("png");
    stage_paths(repo, &["data.bin".to_string(), "pixel.png".to_string()])
        .await
        .expect("stage");
    git_output(repo, &["commit", "-m", "binary"]);

    let binary = read_file(repo, &at("HEAD"), "data.bin").await.expect("bin");
    assert!(binary.binary);
    assert_eq!(binary.size, 4);
    assert!(binary.text.is_none());
    assert!(binary.image_base64.is_none());

    let image = read_file(repo, &at("HEAD"), "pixel.png")
        .await
        .expect("png");
    assert!(image.binary);
    assert_eq!(image.image_base64.as_deref(), Some("iVBORwA="));

    std::fs::write(repo.join("pixel.png"), [1u8, 2, 3]).expect("edit");
    let disk = read_file(repo, &FileSource::Worktree, "pixel.png")
        .await
        .expect("disk");
    assert_eq!(disk.image_base64.as_deref(), Some("AQID"));
    let index = read_file(repo, &FileSource::Index, "pixel.png")
        .await
        .expect("index");
    assert_eq!(index.image_base64.as_deref(), Some("iVBORwA="));
}

#[tokio::test]
async fn invalid_paths_and_unknown_revisions_are_refused() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "a\n", "base").await;

    assert!(read_file(repo, &at("HEAD"), "../outside.txt")
        .await
        .is_err());
    assert!(read_file(repo, &at("--output=x"), "a.txt").await.is_err());
    assert!(list_tree(repo, "HEAD", Some("../up")).await.is_err());
    let unknown = read_file(repo, &at("does-not-exist"), "a.txt")
        .await
        .expect_err("unknown revision");
    assert_eq!(unknown.kind, ErrorKind::InvalidInput);
    assert!(list_tree(repo, "0123456789abcdef", None).await.is_err());
    assert!(restore_file(repo, "nope", "a.txt").await.is_err());
}

#[tokio::test]
async fn restoring_a_file_keeps_a_rescue_copy_of_the_edits() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let first = commit_file(repo, "a.txt", "one\n", "first").await;
    commit_file(repo, "a.txt", "one\ntwo\n", "second").await;
    write_file(repo, "a.txt", "local edit\n");

    restore_file(repo, &first, "a.txt").await.expect("restore");
    assert_eq!(
        std::fs::read_to_string(repo.join("a.txt")).expect("read"),
        "one\n"
    );
    let entries = list_entries(repo).await.expect("rescue");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].reason, "restore-file");

    let missing = restore_file(repo, &first, "other.txt")
        .await
        .expect_err("missing file");
    assert_eq!(missing.kind, ErrorKind::FileNotInRevision);
}

#[tokio::test]
async fn two_revisions_compare_directly() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    let first = commit_file(repo, "a.txt", "one\n", "first").await;
    commit_file(repo, "b.txt", "bee\n", "second").await;
    let third = commit_file(repo, "a.txt", "one\nthree\n", "third").await;

    let files = diff_files(repo, &first, &third).await.expect("files");
    let paths: Vec<_> = files.iter().map(|file| file.path.as_str()).collect();
    assert_eq!(paths, ["a.txt", "b.txt"]);

    let reversed = diff_file(repo, &third, &first, "a.txt", None, false)
        .await
        .expect("diff");
    let removed: Vec<_> = reversed
        .hunks
        .iter()
        .flat_map(|hunk| hunk.lines.iter())
        .filter(|line| line.content == "three")
        .collect();
    assert_eq!(removed.len(), 1);
}
