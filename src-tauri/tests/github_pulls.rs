mod common;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use common::{commit_file, git_output, new_repository};
use githubdesk_lib::commands::github_pulls::checkout_pull;
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::pulls::{
    add_comment, create_pull, get_pull_bundle, get_repo, list_pull_files, list_pulls, merge_pull,
    set_pull_state, submit_review, NewPull,
};
use githubdesk_lib::jobs::CancelToken;
use serde_json::Value;

const PULL: &str = r#"{
  "number": 42, "state": "open", "title": "Add feature", "draft": false, "body": "Details",
  "user": {"login": "octocat", "avatar_url": "https://avatars.githubusercontent.com/u/1"},
  "labels": [], "assignees": [], "requested_reviewers": [],
  "created_at": "2026-01-01T10:00:00Z", "updated_at": "2026-01-02T10:00:00Z",
  "html_url": "https://github.com/o/r/pull/42",
  "head": {"label": "octocat:topic", "ref": "topic", "sha": "abc123"},
  "base": {"label": "o:main", "ref": "main", "sha": "def456"},
  "merged": false, "mergeable": true, "mergeable_state": "clean",
  "additions": 3, "deletions": 1, "changed_files": 2, "commits": 1, "comments": 1, "review_comments": 0
}"#;

fn github_handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/repos/o/r") => MockResponse::json(
            200,
            r#"{"full_name":"o/r","default_branch":"main","html_url":"u","permissions":{"admin":false,"push":true,"pull":true},"allow_squash_merge":false}"#,
        ),
        ("GET", "/repos/o/r/pulls") => {
            let page: u32 = request
                .query("page")
                .and_then(|value| value.parse().ok())
                .unwrap_or(1);
            let response = MockResponse::json(200, &format!("[{PULL}]"));
            if page == 1 {
                response.with_header(
                    "Link",
                    "<http://x.test/repos/o/r/pulls?page=2>; rel=\"next\"",
                )
            } else {
                response
            }
        }
        ("GET", "/repos/o/r/pulls/42") => MockResponse::json(200, PULL),
        ("GET", "/repos/o/r/issues/42/comments") => MockResponse::json(
            200,
            r#"[{"id":1,"user":{"login":"hubot"},"body":"Looks good","created_at":"2026-01-03T10:00:00Z","html_url":"u"}]"#,
        ),
        ("GET", "/repos/o/r/pulls/42/reviews") => MockResponse::json(
            200,
            r#"[{"id":5,"user":{"login":"hubot"},"state":"APPROVED","body":"","submitted_at":"2026-01-03T11:00:00Z","html_url":"u"}]"#,
        ),
        ("GET", "/repos/o/r/commits/abc123/check-runs") => MockResponse::json(
            200,
            r#"{"total_count":2,"check_runs":[{"id":1,"name":"build","status":"completed","conclusion":"success"},{"id":2,"name":"lint","status":"in_progress","conclusion":null}]}"#,
        ),
        ("GET", "/repos/o/r/pulls/42/files") => MockResponse::json(
            200,
            r#"[{"filename":"src/a.rs","status":"modified","additions":1,"deletions":1,"changes":2,"patch":"@@ -1,2 +1,2 @@\n keep\n-old\n+new"},
                {"filename":"data.bin","status":"added","additions":0,"deletions":0,"changes":0}]"#,
        ),
        ("POST", "/repos/o/r/pulls") => MockResponse::json(201, PULL),
        ("POST", "/repos/o/r/issues/42/comments") => MockResponse::json(
            201,
            r#"{"id":9,"user":{"login":"me"},"body":"Thanks","created_at":"2026-01-04T10:00:00Z","html_url":"u"}"#,
        ),
        ("PUT", "/repos/o/r/pulls/42/merge") => MockResponse::json(
            200,
            r#"{"merged":true,"message":"Pull Request successfully merged","sha":"cafe"}"#,
        ),
        ("PATCH", "/repos/o/r/pulls/42") => MockResponse::json(200, PULL),
        ("POST", "/repos/o/r/pulls/42/reviews") => MockResponse::json(
            200,
            r#"{"id":6,"user":{"login":"me"},"state":"APPROVED","body":"ok","submitted_at":"2026-01-05T10:00:00Z","html_url":"u"}"#,
        ),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(github_handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

fn body_of(request: &MockRequest) -> Value {
    serde_json::from_str(&request.body).expect("json body")
}

#[tokio::test]
async fn repository_details_include_permissions_and_merge_rules() {
    let (_, client) = setup().await;
    let info = get_repo(&client, "o", "r").await.expect("repo");
    assert_eq!(info.default_branch, "main");
    assert!(info.permissions.expect("permissions").push);
    assert!(!info.allow_squash_merge);
    assert!(info.allow_merge_commit);
}

#[tokio::test]
async fn pull_lists_are_paged_and_filtered_by_state() {
    let (server, client) = setup().await;
    let first = list_pulls(&client, "o", "r", "open", 1)
        .await
        .expect("list");
    assert_eq!(first.items[0].number, 42);
    assert_eq!(first.next_page, Some(2));
    let second = list_pulls(&client, "o", "r", "open", 2)
        .await
        .expect("list");
    assert_eq!(second.next_page, None);

    let request = &server.requests()[0];
    assert_eq!(request.query("state").as_deref(), Some("open"));
    assert_eq!(request.query("sort").as_deref(), Some("updated"));

    let invalid = list_pulls(&client, "o", "r", "merged", 1)
        .await
        .expect_err("state");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
    let traversal = list_pulls(&client, "..", "r", "open", 1)
        .await
        .expect_err("path");
    assert_eq!(traversal.kind, ErrorKind::InvalidInput);
    assert_eq!(server.requests().len(), 2);
}

#[tokio::test]
async fn a_pull_request_bundle_gathers_comments_reviews_and_checks() {
    let (server, client) = setup().await;
    let bundle = get_pull_bundle(&client, "o", "r", 42)
        .await
        .expect("bundle");
    assert_eq!(bundle.pull.title, "Add feature");
    assert_eq!(bundle.comments[0].body.as_deref(), Some("Looks good"));
    assert_eq!(bundle.reviews[0].state, "APPROVED");
    assert_eq!(bundle.checks.len(), 2);
    assert_eq!(bundle.checks[1].conclusion, None);

    let paths: Vec<String> = server
        .requests()
        .iter()
        .map(|request| request.path().to_string())
        .collect();
    assert!(paths.contains(&"/repos/o/r/commits/abc123/check-runs".to_string()));
}

#[tokio::test]
async fn failing_checks_do_not_hide_the_pull_request() {
    let server = MockServer::start(|request| {
        if request.path().ends_with("/check-runs") {
            MockResponse::json(
                403,
                r#"{"message":"Resource not accessible by integration"}"#,
            )
        } else {
            github_handler(request)
        }
    })
    .await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    let bundle = get_pull_bundle(&client, "o", "r", 42)
        .await
        .expect("bundle");
    assert!(bundle.checks.is_empty());
    assert_eq!(bundle.pull.number, 42);
}

#[tokio::test]
async fn files_are_converted_to_diffs() {
    let (_, client) = setup().await;
    let page = list_pull_files(&client, "o", "r", 42, 1)
        .await
        .expect("files");
    assert_eq!(page.items.len(), 2);
    let source = &page.items[0];
    assert_eq!(source.path, "src/a.rs");
    assert_eq!(source.diff.hunks[0].lines.len(), 3);
    assert_eq!(source.additions, 1);
    let binary = &page.items[1];
    assert!(binary.diff.hunks.is_empty());
    assert!(!binary.diff.too_large);
}

#[tokio::test]
async fn creating_a_pull_request_sends_the_branches_and_validates_input() {
    let (server, client) = setup().await;
    let created = create_pull(
        &client,
        "o",
        "r",
        &NewPull {
            title: "  Add feature ".into(),
            body: "Details".into(),
            head: "topic".into(),
            base: "main".into(),
            draft: true,
        },
    )
    .await
    .expect("create");
    assert_eq!(created.number, 42);
    let body = body_of(&server.requests()[0]);
    assert_eq!(body["title"], "Add feature");
    assert_eq!(body["head"], "topic");
    assert_eq!(body["base"], "main");
    assert_eq!(body["draft"], true);

    let empty_title = NewPull {
        title: " ".into(),
        body: String::new(),
        head: "a".into(),
        base: "b".into(),
        draft: false,
    };
    assert_eq!(
        create_pull(&client, "o", "r", &empty_title)
            .await
            .expect_err("title")
            .kind,
        ErrorKind::InvalidInput
    );
    let no_head = NewPull {
        title: "t".into(),
        body: String::new(),
        head: String::new(),
        base: "b".into(),
        draft: false,
    };
    assert_eq!(
        create_pull(&client, "o", "r", &no_head)
            .await
            .expect_err("head")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(server.requests().len(), 1);
}

#[tokio::test]
async fn comments_merges_state_changes_and_reviews_use_the_right_endpoints() {
    let (server, client) = setup().await;

    let comment = add_comment(&client, "o", "r", 42, "Thanks")
        .await
        .expect("comment");
    assert_eq!(comment.id, 9);
    assert_eq!(
        add_comment(&client, "o", "r", 42, "  ")
            .await
            .expect_err("empty")
            .kind,
        ErrorKind::InvalidInput
    );

    let merged = merge_pull(&client, "o", "r", 42, "squash", Some("Title"), Some(""))
        .await
        .expect("merge");
    assert!(merged.merged);
    assert_eq!(merged.sha.as_deref(), Some("cafe"));
    assert_eq!(
        merge_pull(&client, "o", "r", 42, "fast-forward", None, None)
            .await
            .expect_err("method")
            .kind,
        ErrorKind::InvalidInput
    );

    set_pull_state(&client, "o", "r", 42, "closed")
        .await
        .expect("close");
    assert_eq!(
        set_pull_state(&client, "o", "r", 42, "merged")
            .await
            .expect_err("state")
            .kind,
        ErrorKind::InvalidInput
    );

    let review = submit_review(&client, "o", "r", 42, "APPROVE", "")
        .await
        .expect("review");
    assert_eq!(review.state, "APPROVED");
    assert_eq!(
        submit_review(&client, "o", "r", 42, "COMMENT", " ")
            .await
            .expect_err("needs text")
            .kind,
        ErrorKind::InvalidInput
    );
    assert_eq!(
        submit_review(&client, "o", "r", 42, "DELETE", "x")
            .await
            .expect_err("event")
            .kind,
        ErrorKind::InvalidInput
    );

    let requests = server.requests();
    assert_eq!(requests.len(), 4);
    assert_eq!(
        (requests[0].method.as_str(), requests[0].path()),
        ("POST", "/repos/o/r/issues/42/comments")
    );
    assert_eq!(body_of(&requests[0])["body"], "Thanks");
    assert_eq!(
        (requests[1].method.as_str(), requests[1].path()),
        ("PUT", "/repos/o/r/pulls/42/merge")
    );
    let merge_body = body_of(&requests[1]);
    assert_eq!(merge_body["merge_method"], "squash");
    assert_eq!(merge_body["commit_title"], "Title");
    assert!(merge_body.get("commit_message").is_none());
    assert_eq!(body_of(&requests[2])["state"], "closed");
    assert_eq!(body_of(&requests[3])["event"], "APPROVE");
}

#[tokio::test]
async fn merge_refusals_are_reported_as_not_mergeable() {
    let server = MockServer::start(|_| {
        MockResponse::json(405, r#"{"message":"Pull Request is not mergeable"}"#)
    })
    .await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    let error = merge_pull(&client, "o", "r", 1, "merge", None, None)
        .await
        .expect_err("refused");
    assert_eq!(error.kind, ErrorKind::GithubNotMergeable);
    assert!(error.detail.contains("not mergeable"));
}

#[tokio::test]
async fn pull_requests_can_be_checked_out_from_the_pull_refs() {
    let source = new_repository().await;
    let origin_repo = source.path.as_path();
    commit_file(origin_repo, "a.txt", "main\n", "main commit").await;
    git_output(origin_repo, &["checkout", "-b", "feature"]);
    commit_file(
        origin_repo,
        "feature.txt",
        "from the pull request\n",
        "pr commit",
    )
    .await;
    let pr_head = git_output(origin_repo, &["rev-parse", "HEAD"])
        .trim()
        .to_string();
    git_output(origin_repo, &["checkout", "main"]);
    git_output(origin_repo, &["update-ref", "refs/pull/5/head", &pr_head]);

    let clone_root = tempfile::TempDir::new().expect("dir");
    let clone = clone_root.path().join("clone");
    git_output(
        clone_root.path(),
        &[
            "clone",
            &origin_repo.to_string_lossy(),
            &clone.to_string_lossy(),
        ],
    );

    let branch = checkout_pull(&clone, "origin", 5, CancelToken::never(), &|_| {})
        .await
        .expect("checkout");
    assert_eq!(branch, "pr-5");
    assert_eq!(
        git_output(&clone, &["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
        "pr-5"
    );
    assert!(clone.join("feature.txt").exists());

    git_output(origin_repo, &["checkout", "feature"]);
    commit_file(
        origin_repo,
        "feature.txt",
        "updated by the author\n",
        "pr update",
    )
    .await;
    let updated = git_output(origin_repo, &["rev-parse", "HEAD"])
        .trim()
        .to_string();
    git_output(origin_repo, &["update-ref", "refs/pull/5/head", &updated]);
    checkout_pull(&clone, "origin", 5, CancelToken::never(), &|_| {})
        .await
        .expect("checkout again while on the branch");
    assert_eq!(git_output(&clone, &["rev-parse", "HEAD"]).trim(), updated);

    let unknown = checkout_pull(&clone, "nope", 5, CancelToken::never(), &|_| {})
        .await
        .expect_err("unknown remote");
    assert_eq!(unknown.kind, ErrorKind::InvalidInput);
    let missing = checkout_pull(&clone, "origin", 999, CancelToken::never(), &|_| {})
        .await
        .expect_err("missing pull request");
    assert_ne!(missing.kind, ErrorKind::InvalidInput);
}
