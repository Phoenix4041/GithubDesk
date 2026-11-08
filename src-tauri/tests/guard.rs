mod common;

use common::{commit_file, git_output, new_repository, write_file};
use githubdesk_lib::commands::guard::{
    scan_staged, silence, FindingKind, FindingLevel, LARGE_FILE_WARNING,
};
use githubdesk_lib::commands::predict::{predict_cherry_pick, predict_many, predict_merge};
use githubdesk_lib::error::ErrorKind;

#[tokio::test]
async fn only_staged_additions_are_scanned() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "readme.md", "hello\n", "base").await;
    write_file(
        repo,
        "config.js",
        "const a = 1;\nconst password = \"Hunter2hunter2\";\n",
    );
    write_file(
        repo,
        "notes.txt",
        "token = \"ghp_abcdefghijklmnopqrstuvwxyz0123456789\"\n",
    );
    git_output(repo, &["add", "config.js"]);

    let findings = scan_staged(repo).await.expect("scan");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].path, "config.js");
    assert_eq!(findings[0].line, Some(2));
    assert_eq!(findings[0].kind, FindingKind::Secret);
    assert_eq!(findings[0].rule, "generic-secret");
    assert!(!format!("{findings:?}").contains("Hunter2"));
}

#[tokio::test]
async fn secrets_that_were_already_committed_are_not_reported_again() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(
        repo,
        "old.js",
        "const password = \"Hunter2hunter2\";\n",
        "old",
    )
    .await;
    write_file(
        repo,
        "old.js",
        "const password = \"Hunter2hunter2\";\nconst more = 1;\n",
    );
    git_output(repo, &["add", "old.js"]);
    assert!(scan_staged(repo).await.expect("scan").is_empty());
}

#[tokio::test]
async fn conflict_markers_env_files_and_dependency_folders_are_flagged() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "x\n", "base").await;
    write_file(
        repo,
        "merge.txt",
        "<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> topic\n",
    );
    write_file(repo, ".env", "MODE=dev\n");
    write_file(repo, ".env.example", "MODE=dev\n");
    write_file(repo, "node_modules/pkg/index.js", "module.exports = 1;\n");
    git_output(repo, &["add", "-A", "-f"]);

    let findings = scan_staged(repo).await.expect("scan");
    let rules: Vec<(&str, &str)> = findings
        .iter()
        .map(|finding| (finding.path.as_str(), finding.rule.as_str()))
        .collect();
    assert!(rules.contains(&("merge.txt", "conflict-marker")));
    assert!(rules.contains(&(".env", "env-file")));
    assert!(rules.contains(&("node_modules/pkg/index.js", "dependency-folder")));
    assert!(!rules.iter().any(|(path, _)| *path == ".env.example"));
    assert_eq!(
        findings
            .iter()
            .filter(|finding| finding.rule == "conflict-marker")
            .count(),
        3
    );
}

#[tokio::test]
async fn a_large_staged_file_is_reported_with_its_size() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "x\n", "base").await;
    let size = usize::try_from(LARGE_FILE_WARNING).expect("size");
    std::fs::write(repo.join("big.bin"), vec![b'a'; size]).expect("big file");
    git_output(repo, &["add", "big.bin"]);

    let findings = scan_staged(repo).await.expect("scan");
    let large = findings
        .iter()
        .find(|finding| finding.kind == FindingKind::LargeFile)
        .expect("large file");
    assert_eq!(large.path, "big.bin");
    assert_eq!(large.size, Some(LARGE_FILE_WARNING));
    assert_eq!(large.level, FindingLevel::Warning);
}

#[tokio::test]
async fn a_silenced_finding_stays_quiet_for_that_file_only() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "base.txt", "x\n", "base").await;
    write_file(repo, "a.js", "const password = \"Hunter2hunter2\";\n");
    write_file(repo, "b.js", "const password = \"Hunter2hunter2\";\n");
    git_output(repo, &["add", "-A"]);
    assert_eq!(scan_staged(repo).await.expect("scan").len(), 2);

    silence(repo, "generic-secret", "a.js")
        .await
        .expect("silence");
    silence(repo, "generic-secret", "a.js")
        .await
        .expect("twice");
    let findings = scan_staged(repo).await.expect("scan");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].path, "b.js");
    assert_eq!(
        git_output(
            repo,
            &["config", "--local", "--get-all", "githubdesk.guardignore"]
        )
        .trim(),
        "generic-secret:a.js"
    );
    assert_eq!(
        silence(repo, "bad rule", "a.js")
            .await
            .expect_err("invalid")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(
        silence(repo, "x", "../a.js")
            .await
            .expect_err("invalid")
            .kind,
        ErrorKind::InvalidInput
    );
}

#[tokio::test]
async fn an_empty_index_has_nothing_to_report() {
    let workspace = new_repository().await;
    commit_file(&workspace.path, "a.txt", "x\n", "base").await;
    assert!(scan_staged(&workspace.path).await.expect("scan").is_empty());
}

#[tokio::test]
async fn merging_a_clean_branch_is_predicted_without_touching_the_tree() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    git_output(repo, &["switch", "-q", "-c", "topic"]);
    commit_file(repo, "b.txt", "topic\n", "topic").await;
    git_output(repo, &["switch", "-q", "main"]);
    commit_file(repo, "c.txt", "main\n", "main").await;
    let head_before = git_output(repo, &["rev-parse", "HEAD"]);

    let prediction = predict_merge(repo, "topic").await.expect("predict");
    assert!(prediction.supported);
    assert!(!prediction.conflicts);
    assert_eq!(git_output(repo, &["rev-parse", "HEAD"]), head_before);
    assert_eq!(git_output(repo, &["status", "--porcelain"]), "");
}

#[tokio::test]
async fn conflicting_branches_list_the_files_that_would_clash() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    commit_file(repo, "b.txt", "one\n", "base two").await;
    git_output(repo, &["switch", "-q", "-c", "topic"]);
    commit_file(repo, "a.txt", "topic\n", "topic a").await;
    commit_file(repo, "b.txt", "topic\n", "topic b").await;
    git_output(repo, &["switch", "-q", "main"]);
    commit_file(repo, "a.txt", "main\n", "main a").await;
    commit_file(repo, "b.txt", "main\n", "main b").await;

    let prediction = predict_merge(repo, "topic").await.expect("predict");
    assert!(prediction.conflicts);
    assert_eq!(prediction.files, vec!["a.txt", "b.txt"]);

    git_output(repo, &["switch", "-q", "-c", "clean", "main~2"]);
    commit_file(repo, "z.txt", "z\n", "z").await;
    git_output(repo, &["switch", "-q", "main"]);
    let many = predict_many(repo, &["topic".to_string(), "clean".to_string()])
        .await
        .expect("many");
    assert!(many[0].conflicts);
    assert!(!many[1].conflicts);
}

#[tokio::test]
async fn a_cherry_pick_that_would_clash_is_predicted() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    git_output(repo, &["switch", "-q", "-c", "topic"]);
    let picked = commit_file(repo, "a.txt", "topic\n", "topic a").await;
    let harmless = commit_file(repo, "other.txt", "x\n", "other").await;
    git_output(repo, &["switch", "-q", "main"]);
    commit_file(repo, "a.txt", "main\n", "main a").await;

    let clash = predict_cherry_pick(repo, &picked).await.expect("predict");
    assert!(clash.conflicts);
    assert_eq!(clash.files, vec!["a.txt"]);
    let fine = predict_cherry_pick(repo, &harmless).await.expect("predict");
    assert!(!fine.conflicts);
}

#[tokio::test]
async fn unknown_or_unsafe_revisions_are_not_predicted() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    commit_file(repo, "a.txt", "one\n", "base").await;
    assert_eq!(
        predict_merge(repo, "--output=x")
            .await
            .expect_err("unsafe")
            .kind,
        ErrorKind::InvalidInput
    );
    let missing = predict_merge(repo, "no-such-branch").await.expect("answer");
    assert!(!missing.supported || !missing.conflicts);
}
