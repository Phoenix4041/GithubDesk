mod common;

use common::{commit_file, git_output, new_repository};
use githubdesk_lib::commands::submodule::{
    add_submodule, list_submodules, remove_submodule, update_submodules,
};
use githubdesk_lib::commands::worktree::{
    add_worktree, list_worktrees, lock_worktree, prune_worktrees, remove_worktree, unlock_worktree,
    NewWorktree,
};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::git::parse::submodule::SubmoduleState;
use githubdesk_lib::jobs::CancelToken;
use tempfile::TempDir;

fn request(path: &std::path::Path) -> NewWorktree {
    NewWorktree {
        path: path.to_string_lossy().into_owned(),
        branch: None,
        new_branch: None,
        start_point: None,
        detach: false,
    }
}

#[tokio::test]
async fn a_new_branch_worktree_is_listed_and_can_be_removed() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    let holder = TempDir::new().expect("tempdir");
    let destination = holder.path().join("feature-tree");

    let mut new_branch = request(&destination);
    new_branch.new_branch = Some("feature/tree".to_string());
    add_worktree(&workspace.path, &new_branch)
        .await
        .expect("add");

    let worktrees = list_worktrees(&workspace.path).await.expect("list");
    assert_eq!(worktrees.len(), 2);
    assert!(worktrees[0].is_main);
    assert!(worktrees[0].is_current);
    assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
    assert_eq!(worktrees[1].branch.as_deref(), Some("feature/tree"));
    assert!(!worktrees[1].is_current);
    assert!(destination.join("a.txt").is_file());

    remove_worktree(&workspace.path, &worktrees[1].path, false)
        .await
        .expect("remove");
    assert_eq!(
        list_worktrees(&workspace.path).await.expect("list").len(),
        1
    );
    assert!(!destination.exists());
}

#[tokio::test]
async fn existing_branches_and_detached_heads_can_have_a_worktree() {
    let workspace = new_repository().await;
    let first = commit_file(&workspace.path, "a.txt", "one", "first").await;
    git_output(&workspace.path, &["branch", "topic"]);
    let holder = TempDir::new().expect("tempdir");

    let mut existing = request(&holder.path().join("topic-tree"));
    existing.branch = Some("topic".to_string());
    add_worktree(&workspace.path, &existing).await.expect("add");

    let mut detached = request(&holder.path().join("detached-tree"));
    detached.detach = true;
    detached.start_point = Some(first.clone());
    add_worktree(&workspace.path, &detached).await.expect("add");

    let worktrees = list_worktrees(&workspace.path).await.expect("list");
    assert_eq!(worktrees.len(), 3);
    let on_topic = worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some("topic"))
        .expect("topic worktree");
    assert!(!on_topic.detached);
    let loose = worktrees
        .iter()
        .find(|worktree| worktree.detached)
        .expect("detached worktree");
    assert_eq!(loose.head.as_deref(), Some(first.as_str()));
}

#[tokio::test]
async fn a_branch_in_use_by_another_worktree_is_refused_with_a_typed_error() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    let holder = TempDir::new().expect("tempdir");

    let mut same_branch = request(&holder.path().join("again"));
    same_branch.branch = Some("main".to_string());
    let error = add_worktree(&workspace.path, &same_branch)
        .await
        .expect_err("main is already checked out");
    assert_eq!(error.kind, ErrorKind::BranchInUseByWorktree);
}

#[tokio::test]
async fn invalid_worktree_requests_are_rejected() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    let holder = TempDir::new().expect("tempdir");

    let relative = NewWorktree {
        path: "relative/path".to_string(),
        branch: Some("main".to_string()),
        new_branch: None,
        start_point: None,
        detach: false,
    };
    assert_eq!(
        add_worktree(&workspace.path, &relative)
            .await
            .expect_err("relative")
            .kind,
        ErrorKind::InvalidInput
    );

    let no_target = request(&holder.path().join("nothing"));
    assert_eq!(
        add_worktree(&workspace.path, &no_target)
            .await
            .expect_err("no branch")
            .kind,
        ErrorKind::InvalidInput
    );

    let occupied = holder.path().join("occupied");
    std::fs::create_dir_all(&occupied).expect("dir");
    std::fs::write(occupied.join("x.txt"), "x").expect("file");
    let mut taken = request(&occupied);
    taken.new_branch = Some("other".to_string());
    assert_eq!(
        add_worktree(&workspace.path, &taken)
            .await
            .expect_err("occupied")
            .kind,
        ErrorKind::DestinationNotEmpty
    );

    let mut bad_name = request(&holder.path().join("badname"));
    bad_name.new_branch = Some("bad name~".to_string());
    assert_eq!(
        add_worktree(&workspace.path, &bad_name)
            .await
            .expect_err("name")
            .kind,
        ErrorKind::InvalidName
    );
}

#[tokio::test]
async fn dirty_and_locked_worktrees_need_explicit_steps_to_be_removed() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    let holder = TempDir::new().expect("tempdir");
    let destination = holder.path().join("dirty-tree");
    let mut new_branch = request(&destination);
    new_branch.new_branch = Some("dirty".to_string());
    add_worktree(&workspace.path, &new_branch)
        .await
        .expect("add");
    let target = list_worktrees(&workspace.path).await.expect("list")[1]
        .path
        .clone();

    std::fs::write(destination.join("scratch.txt"), "work in progress").expect("file");
    let dirty = remove_worktree(&workspace.path, &target, false)
        .await
        .expect_err("dirty");
    assert_eq!(dirty.kind, ErrorKind::WorktreeHasChanges);
    assert!(destination.exists());

    lock_worktree(&workspace.path, &target, Some("on a usb drive"))
        .await
        .expect("lock");
    let locked = list_worktrees(&workspace.path).await.expect("list");
    assert!(locked[1].locked);
    assert_eq!(locked[1].lock_reason.as_deref(), Some("on a usb drive"));
    assert!(remove_worktree(&workspace.path, &target, true)
        .await
        .is_err());

    unlock_worktree(&workspace.path, &target)
        .await
        .expect("unlock");
    remove_worktree(&workspace.path, &target, true)
        .await
        .expect("forced removal");
    assert!(!destination.exists());
}

#[tokio::test]
async fn the_main_and_unknown_worktrees_cannot_be_removed() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    let main = workspace.path.to_string_lossy().into_owned();

    let main_error = remove_worktree(&workspace.path, &main, true)
        .await
        .expect_err("main");
    assert_eq!(main_error.kind, ErrorKind::InvalidInput);
    let unknown = remove_worktree(&workspace.path, "Z:/not/a/worktree", true)
        .await
        .expect_err("unknown");
    assert_eq!(unknown.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn pruning_forgets_worktrees_whose_folder_disappeared() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "one", "first").await;
    let holder = TempDir::new().expect("tempdir");
    let destination = holder.path().join("gone");
    let mut new_branch = request(&destination);
    new_branch.new_branch = Some("gone".to_string());
    add_worktree(&workspace.path, &new_branch)
        .await
        .expect("add");

    std::fs::remove_dir_all(&destination).expect("delete folder");
    let before = list_worktrees(&workspace.path).await.expect("list");
    assert_eq!(before.len(), 2);
    assert!(before[1].prunable);

    prune_worktrees(&workspace.path).await.expect("prune");
    assert_eq!(
        list_worktrees(&workspace.path).await.expect("list").len(),
        1
    );
}

async fn library_repository() -> (TempDir, std::path::PathBuf) {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "lib.txt", "library", "library first").await;
    let holder = TempDir::new().expect("tempdir");
    let library = holder.path().join("library");
    std::fs::create_dir_all(&library).expect("library dir");
    git_output(&library, &["init", "-q", "-b", "main"]);
    std::fs::write(library.join("lib.txt"), "library").expect("file");
    git_output(&library, &["add", "-A"]);
    git_output(&library, &["commit", "-q", "-m", "library first"]);
    drop(workspace);
    (holder, library)
}

#[tokio::test]
async fn submodules_can_be_added_listed_updated_and_removed() {
    let (_library_holder, library) = library_repository().await;
    let workspace = new_repository().await;
    commit_file(&workspace.path, "app.txt", "app", "app first").await;
    let url = library.to_string_lossy().replace('\\', "/");

    add_submodule(
        &workspace.path,
        &url,
        "vendor/library",
        None,
        CancelToken::never(),
        &|_| {},
    )
    .await
    .expect("add submodule");

    let listed = list_submodules(&workspace.path).await.expect("list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].path, "vendor/library");
    assert_eq!(listed[0].name, "vendor/library");
    assert_eq!(listed[0].url.as_deref(), Some(url.as_str()));
    assert_eq!(listed[0].state, SubmoduleState::UpToDate);
    assert!(workspace.path.join("vendor/library/lib.txt").is_file());

    git_output(
        &library,
        &["commit", "-q", "--allow-empty", "-m", "library second"],
    );
    update_submodules(
        &workspace.path,
        Some("vendor/library"),
        false,
        false,
        true,
        CancelToken::never(),
        &|_| {},
    )
    .await
    .expect("update from remote");
    let moved = list_submodules(&workspace.path).await.expect("list");
    assert_eq!(moved[0].state, SubmoduleState::Modified);

    remove_submodule(&workspace.path, "vendor/library")
        .await
        .expect("remove");
    assert!(list_submodules(&workspace.path)
        .await
        .expect("list")
        .is_empty());
    assert!(!workspace.path.join("vendor/library").exists());
}

#[tokio::test]
async fn an_uninitialized_submodule_is_reported_and_initialized_by_update() {
    let (_library_holder, library) = library_repository().await;
    let origin = new_repository().await;
    commit_file(&origin.path, "app.txt", "app", "app first").await;
    let url = library.to_string_lossy().replace('\\', "/");
    add_submodule(
        &origin.path,
        &url,
        "deps/library",
        None,
        CancelToken::never(),
        &|_| {},
    )
    .await
    .expect("add submodule");
    git_output(&origin.path, &["commit", "-q", "-m", "add the library"]);

    let holder = TempDir::new().expect("tempdir");
    let clone_path = holder.path().join("clone");
    git_output(
        holder.path(),
        &["clone", "-q", &origin.path.to_string_lossy(), "clone"],
    );

    let before = list_submodules(&clone_path).await.expect("list");
    assert_eq!(before.len(), 1);
    assert_eq!(before[0].state, SubmoduleState::Uninitialized);
    assert!(!clone_path.join("deps/library/lib.txt").exists());

    update_submodules(
        &clone_path,
        None,
        true,
        true,
        false,
        CancelToken::never(),
        &|_| {},
    )
    .await
    .expect("init and update");
    let after = list_submodules(&clone_path).await.expect("list");
    assert_eq!(after[0].state, SubmoduleState::UpToDate);
    assert!(clone_path.join("deps/library/lib.txt").is_file());
}

#[tokio::test]
async fn invalid_submodule_requests_are_rejected() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "app.txt", "app", "app first").await;

    let bad_url = add_submodule(
        &workspace.path,
        "--upload-pack=evil",
        "vendor/x",
        None,
        CancelToken::never(),
        &|_| {},
    )
    .await
    .expect_err("url");
    assert_eq!(bad_url.kind, ErrorKind::InvalidInput);

    let bad_path = add_submodule(
        &workspace.path,
        "https://example.com/x.git",
        "../escape",
        None,
        CancelToken::never(),
        &|_| {},
    )
    .await
    .expect_err("path");
    assert_eq!(bad_path.kind, ErrorKind::InvalidInput);

    let not_a_submodule = remove_submodule(&workspace.path, "app.txt")
        .await
        .expect_err("not a submodule");
    assert_eq!(not_a_submodule.kind, ErrorKind::InvalidInput);
}
