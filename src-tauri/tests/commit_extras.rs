mod common;

use common::{commit_file, git_as, git_output, new_repository, write_file};
use githubdesk_lib::commands::commit_extras::{list_coauthors, read_template, write_template};

#[tokio::test]
async fn coauthors_come_from_the_history_ranked_by_commits_without_the_current_author() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    assert!(list_coauthors(repo, None).await.expect("empty").is_empty());

    commit_file(repo, "a.txt", "a", "first").await;
    for (index, (name, email)) in [
        ("Luis", "luis@example.com"),
        ("Ana", "ana@example.com"),
        ("Ana", "ana@example.com"),
    ]
    .iter()
    .enumerate()
    {
        write_file(repo, &format!("f{index}.txt"), "x");
        git_output(repo, &["add", "."]);
        git_as(repo, name, email, &["commit", "-m", "change"]);
    }

    let people = list_coauthors(repo, None).await.expect("coauthors");
    let emails: Vec<&str> = people.iter().map(|person| person.email.as_str()).collect();
    assert_eq!(emails, vec!["ana@example.com", "luis@example.com"]);
    assert_eq!(people[0].commits, 2);

    let limited = list_coauthors(repo, Some(1)).await.expect("limited");
    assert_eq!(limited.len(), 1);
    assert_eq!(limited[0].name, "Ana");
}

#[tokio::test]
async fn the_commit_template_lives_in_the_local_config() {
    let workspace = new_repository().await;
    let repo = &workspace.path;
    assert_eq!(read_template(repo).await.expect("empty"), "");

    write_template(repo, "- Why:\r\n- How:\n\n")
        .await
        .expect("write");
    assert_eq!(read_template(repo).await.expect("read"), "- Why:\n- How:");
    let local = git_output(
        repo,
        &["config", "--local", "--get", "githubdesk.commitTemplate"],
    );
    assert!(local.starts_with("- Why:"));

    write_template(repo, "   ").await.expect("clear");
    assert_eq!(read_template(repo).await.expect("cleared"), "");
    write_template(repo, "").await.expect("clear twice");

    let too_long = "x".repeat(5000);
    assert!(write_template(repo, &too_long).await.is_err());
}
