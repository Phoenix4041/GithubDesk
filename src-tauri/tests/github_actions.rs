mod common;

use std::collections::BTreeMap;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::actions::{
    cancel_run, dispatch_workflow, get_job_log, list_jobs, list_runs, list_workflows, rerun,
};
use githubdesk_lib::github::client::GithubClient;
use serde_json::Value;

const RUN: &str = r#"{"id":900,"name":"CI","display_title":"Fix crash","head_branch":"main","head_sha":"abc123",
  "event":"push","status":"completed","conclusion":"failure","run_number":14,"run_attempt":1,
  "created_at":"2026-01-01T10:00:00Z","updated_at":"2026-01-01T10:05:00Z","run_started_at":"2026-01-01T10:00:05Z",
  "html_url":"https://github.com/o/r/actions/runs/900","actor":{"login":"octocat"},"workflow_id":5}"#;

const JOBS: &str = r#"{"total_count":1,"jobs":[{"id":1001,"name":"build","status":"completed","conclusion":"failure",
  "started_at":"2026-01-01T10:00:10Z","completed_at":"2026-01-01T10:04:00Z","html_url":"https://github.com/o/r/runs/1001",
  "steps":[{"name":"Checkout","status":"completed","conclusion":"success","number":1},
           {"name":"Test","status":"completed","conclusion":"failure","number":2}]}]}"#;

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("GET", "/repos/o/r/actions/runs") => MockResponse::json(
            200,
            &format!("{{\"total_count\":1,\"workflow_runs\":[{RUN}]}}"),
        )
        .with_header("Link", "<http://x/repos/o/r/actions/runs?page=2>; rel=\"next\""),
        ("GET", "/repos/o/r/actions/runs/900/jobs") => MockResponse::json(200, JOBS),
        ("GET", "/repos/o/r/actions/jobs/1001/logs") => {
            MockResponse::text(302, "").with_header("Location", "/blob/log-1001")
        }
        ("GET", "/blob/log-1001") => MockResponse::text(
            200,
            "2026-01-01T10:00:11.0000000Z ##[group]Run tests\n2026-01-01T10:00:12.0000000Z error: boom\n",
        ),
        ("POST", "/repos/o/r/actions/runs/900/rerun") => MockResponse::text(201, ""),
        ("POST", "/repos/o/r/actions/runs/900/rerun-failed-jobs") => MockResponse::text(201, ""),
        ("POST", "/repos/o/r/actions/runs/900/cancel") => MockResponse::text(202, ""),
        ("GET", "/repos/o/r/actions/workflows") => MockResponse::json(
            200,
            r#"{"total_count":1,"workflows":[{"id":5,"name":"CI","path":".github/workflows/ci.yml","state":"active"}]}"#,
        ),
        ("POST", "/repos/o/r/actions/workflows/5/dispatches") => MockResponse::text(204, ""),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

#[tokio::test]
async fn runs_are_listed_with_filters_and_paging() {
    let (server, client) = setup().await;
    let page = list_runs(&client, "o", "r", Some("main"), Some("failure"), 1)
        .await
        .expect("runs");
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].id, 900);
    assert_eq!(page.items[0].conclusion.as_deref(), Some("failure"));
    assert_eq!(page.next_page, Some(2));

    let request = &server.requests()[0];
    assert_eq!(request.query("branch").as_deref(), Some("main"));
    assert_eq!(request.query("status").as_deref(), Some("failure"));
    assert_eq!(request.query("per_page").as_deref(), Some("30"));
}

#[tokio::test]
async fn the_all_status_adds_no_filter_and_unknown_values_are_rejected() {
    let (server, client) = setup().await;
    list_runs(&client, "o", "r", None, Some("all"), 1)
        .await
        .expect("runs");
    assert_eq!(server.requests()[0].query("status"), None);

    let invalid = list_runs(&client, "o", "r", None, Some("bogus"), 1)
        .await
        .expect_err("status");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
    let invalid = list_runs(&client, "o", "r", Some("a\nb"), None, 1)
        .await
        .expect_err("branch");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn jobs_come_with_their_steps() {
    let (server, client) = setup().await;
    let jobs = list_jobs(&client, "o", "r", 900).await.expect("jobs");
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].steps.len(), 2);
    assert_eq!(jobs[0].steps[1].conclusion.as_deref(), Some("failure"));
    assert_eq!(
        server.requests()[0].query("filter").as_deref(),
        Some("latest")
    );
}

#[tokio::test]
async fn job_logs_follow_the_redirect() {
    let (server, client) = setup().await;
    let log = get_job_log(&client, "o", "r", 1001).await.expect("log");
    assert!(!log.truncated);
    assert!(log.text.contains("error: boom"));
    let paths: Vec<String> = server
        .requests()
        .iter()
        .map(|request| request.path().to_string())
        .collect();
    assert_eq!(
        paths,
        vec!["/repos/o/r/actions/jobs/1001/logs", "/blob/log-1001"]
    );
}

#[tokio::test]
async fn reruns_and_cancellations_hit_the_right_endpoints() {
    let (server, client) = setup().await;
    rerun(&client, "o", "r", 900, false).await.expect("rerun");
    rerun(&client, "o", "r", 900, true)
        .await
        .expect("rerun failed");
    cancel_run(&client, "o", "r", 900).await.expect("cancel");
    let paths: Vec<String> = server
        .requests()
        .iter()
        .map(|request| format!("{} {}", request.method, request.path()))
        .collect();
    assert_eq!(
        paths,
        vec![
            "POST /repos/o/r/actions/runs/900/rerun",
            "POST /repos/o/r/actions/runs/900/rerun-failed-jobs",
            "POST /repos/o/r/actions/runs/900/cancel",
        ]
    );
}

#[tokio::test]
async fn missing_runs_map_to_not_found() {
    let (_server, client) = setup().await;
    let error = rerun(&client, "o", "r", 12345, false)
        .await
        .expect_err("missing");
    assert_eq!(error.kind, ErrorKind::GithubNotFound);
}

#[tokio::test]
async fn workflows_are_listed_and_can_be_dispatched_with_inputs() {
    let (server, client) = setup().await;
    let workflows = list_workflows(&client, "o", "r").await.expect("workflows");
    assert_eq!(workflows[0].name, "CI");

    let mut inputs = BTreeMap::new();
    inputs.insert("environment".to_string(), "staging".to_string());
    dispatch_workflow(&client, "o", "r", 5, " main ", &inputs)
        .await
        .expect("dispatch");
    let request = server.requests().pop().expect("request");
    let body: Value = serde_json::from_str(&request.body).expect("json");
    assert_eq!(body["ref"], "main");
    assert_eq!(body["inputs"]["environment"], "staging");

    let invalid = dispatch_workflow(&client, "o", "r", 5, "", &inputs)
        .await
        .expect_err("ref");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
    let mut bad_inputs = BTreeMap::new();
    bad_inputs.insert("  ".to_string(), "x".to_string());
    let invalid = dispatch_workflow(&client, "o", "r", 5, "main", &bad_inputs)
        .await
        .expect_err("input");
    assert_eq!(invalid.kind, ErrorKind::InvalidInput);
}
