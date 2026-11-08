mod common;

use std::io::Write;

use common::mock_http::{MockRequest, MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::github::client::GithubClient;
use githubdesk_lib::github::releases::{
    create_label, create_milestone, create_release, delete_asset, delete_label, delete_milestone,
    delete_release, generate_notes, list_releases, update_label, update_milestone, update_release,
    upload_asset, LabelEdit, MilestoneEdit, NewRelease, ReleaseEdit,
};
use serde_json::Value;
use tempfile::TempDir;

const RELEASE: &str = r#"{"id":7,"tag_name":"v1.0.0","name":"One","body":"Notes","draft":false,"prerelease":false,
  "target_commitish":"main","created_at":"2026-01-01T00:00:00Z","published_at":"2026-01-02T00:00:00Z",
  "html_url":"https://github.com/o/r/releases/tag/v1.0.0","author":{"login":"octo"},
  "assets":[{"id":3,"name":"app.zip","size":1024,"download_count":5,"content_type":"application/zip","browser_download_url":"https://x/app.zip"}]}"#;

const LABEL: &str = r#"{"name":"bug","color":"d73a4a","description":"Broken"}"#;
const MILESTONE: &str =
    r#"{"number":3,"title":"v1","state":"open","open_issues":1,"closed_issues":2}"#;

fn handler(request: &MockRequest) -> MockResponse {
    match (request.method.as_str(), request.path()) {
        ("POST", "/repos/o/r/labels") => MockResponse::json(201, LABEL),
        ("PATCH", "/repos/o/r/labels/help%20wanted") => MockResponse::json(200, LABEL),
        ("DELETE", "/repos/o/r/labels/help%20wanted") => MockResponse::json(204, ""),
        ("POST", "/repos/o/r/milestones") => MockResponse::json(201, MILESTONE),
        ("PATCH", "/repos/o/r/milestones/3") => MockResponse::json(200, MILESTONE),
        ("DELETE", "/repos/o/r/milestones/3") => MockResponse::json(204, ""),
        ("GET", "/repos/o/r/releases") => MockResponse::json(200, &format!("[{RELEASE}]"))
            .with_header("Link", "<http://x/releases?page=2>; rel=\"next\""),
        ("POST", "/repos/o/r/releases") => MockResponse::json(201, RELEASE),
        ("PATCH", "/repos/o/r/releases/7") => MockResponse::json(200, RELEASE),
        ("DELETE", "/repos/o/r/releases/7") => MockResponse::json(204, ""),
        ("POST", "/repos/o/r/releases/generate-notes") => MockResponse::json(
            200,
            r###"{"name":"v1.1.0","body":"## What's changed\n* A fix"}"###,
        ),
        ("DELETE", "/repos/o/r/releases/assets/3") => MockResponse::json(204, ""),
        ("POST", "/repos/o/r/releases/7/assets") => MockResponse::json(
            201,
            r#"{"id":4,"name":"notes.txt","size":11,"download_count":0,"content_type":"text/plain","browser_download_url":"https://x/notes.txt"}"#,
        ),
        _ => MockResponse::json(404, r#"{"message":"Not Found"}"#),
    }
}

async fn setup() -> (MockServer, GithubClient) {
    let server = MockServer::start(handler).await;
    let client = GithubClient::new(&server.base_url, Some("tok".into())).expect("client");
    (server, client)
}

fn body_of(request: &MockRequest) -> Value {
    serde_json::from_str(&request.body).expect("json body")
}

fn new_release(tag: &str) -> NewRelease {
    NewRelease {
        tag_name: tag.to_string(),
        target: None,
        name: "One".to_string(),
        body: "Notes".to_string(),
        draft: false,
        prerelease: false,
    }
}

#[tokio::test]
async fn labels_are_created_edited_and_deleted_with_encoded_names() {
    let (server, client) = setup().await;

    create_label(&client, "o", "r", " bug ", "#D73A4A", " Broken ")
        .await
        .expect("create");
    update_label(
        &client,
        "o",
        "r",
        "help wanted",
        &LabelEdit {
            new_name: Some("help-wanted".to_string()),
            color: Some("008672".to_string()),
            description: None,
        },
    )
    .await
    .expect("update");
    delete_label(&client, "o", "r", "help wanted")
        .await
        .expect("delete");

    let requests = server.requests();
    let created = body_of(&requests[0]);
    assert_eq!(created["name"], "bug");
    assert_eq!(created["color"], "d73a4a");
    assert_eq!(created["description"], "Broken");
    let updated = body_of(&requests[1]);
    assert_eq!(updated["new_name"], "help-wanted");
    assert_eq!(updated["color"], "008672");
    assert!(updated.get("description").is_none());
    assert_eq!(requests[2].path(), "/repos/o/r/labels/help%20wanted");
}

#[tokio::test]
async fn invalid_labels_never_reach_github() {
    let (server, client) = setup().await;

    for (name, color) in [("", "ffffff"), ("ok", "nothex"), ("a\nb", "ffffff")] {
        let error = create_label(&client, "o", "r", name, color, "")
            .await
            .expect_err("invalid");
        assert_eq!(error.kind, ErrorKind::InvalidInput);
    }
    let empty = update_label(&client, "o", "r", "bug", &LabelEdit::default())
        .await
        .expect_err("nothing");
    assert_eq!(empty.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn milestones_are_created_changed_and_deleted() {
    let (server, client) = setup().await;

    create_milestone(
        &client,
        "o",
        "r",
        " v1 ",
        "Goals",
        Some("2026-12-31T00:00:00Z"),
    )
    .await
    .expect("create");
    update_milestone(
        &client,
        "o",
        "r",
        3,
        &MilestoneEdit {
            state: Some("closed".to_string()),
            clear_due: true,
            ..MilestoneEdit::default()
        },
    )
    .await
    .expect("update");
    delete_milestone(&client, "o", "r", 3)
        .await
        .expect("delete");

    let requests = server.requests();
    let created = body_of(&requests[0]);
    assert_eq!(created["title"], "v1");
    assert_eq!(created["due_on"], "2026-12-31T00:00:00Z");
    let updated = body_of(&requests[1]);
    assert_eq!(updated["state"], "closed");
    assert!(updated["due_on"].is_null());
    assert!(updated.as_object().expect("object").contains_key("due_on"));
    assert_eq!(requests[2].method, "DELETE");

    let bad_date = create_milestone(&client, "o", "r", "x", "", Some("tomorrow"))
        .await
        .expect_err("date");
    assert_eq!(bad_date.kind, ErrorKind::InvalidInput);
}

#[tokio::test]
async fn releases_are_listed_created_edited_and_deleted() {
    let (server, client) = setup().await;

    let page = list_releases(&client, "o", "r", 1).await.expect("list");
    assert_eq!(page.items[0].tag_name, "v1.0.0");
    assert_eq!(page.items[0].assets[0].name, "app.zip");
    assert_eq!(page.next_page, Some(2));
    assert_eq!(
        server.requests()[0].query("per_page").as_deref(),
        Some("30")
    );

    let mut request = new_release("v1.0.0");
    request.target = Some("main".to_string());
    request.draft = true;
    create_release(&client, "o", "r", &request)
        .await
        .expect("create");
    update_release(
        &client,
        "o",
        "r",
        7,
        &ReleaseEdit {
            draft: Some(false),
            name: Some(" Final ".to_string()),
            ..ReleaseEdit::default()
        },
    )
    .await
    .expect("publish");
    delete_release(&client, "o", "r", 7).await.expect("delete");

    let requests = server.requests();
    let created = body_of(&requests[1]);
    assert_eq!(created["tag_name"], "v1.0.0");
    assert_eq!(created["target_commitish"], "main");
    assert_eq!(created["draft"], true);
    let edited = body_of(&requests[2]);
    assert_eq!(edited["draft"], false);
    assert_eq!(edited["name"], "Final");
    assert!(edited.get("body").is_none());
    assert_eq!(requests[3].method, "DELETE");
}

#[tokio::test]
async fn invalid_releases_never_reach_github() {
    let (server, client) = setup().await;

    for tag in ["", "has space", "a..b", "-flag"] {
        let error = create_release(&client, "o", "r", &new_release(tag))
            .await
            .expect_err("tag");
        assert_eq!(error.kind, ErrorKind::InvalidInput, "{tag}");
    }
    let nothing = update_release(&client, "o", "r", 7, &ReleaseEdit::default())
        .await
        .expect_err("nothing");
    assert_eq!(nothing.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn github_writes_the_notes_from_the_tag_and_the_previous_one() {
    let (server, client) = setup().await;

    let notes = generate_notes(&client, "o", "r", "v1.1.0", Some("main"), Some("v1.0.0"))
        .await
        .expect("notes");

    assert_eq!(notes.name, "v1.1.0");
    assert!(notes.body.contains("A fix"));
    let body = body_of(&server.requests()[0]);
    assert_eq!(body["tag_name"], "v1.1.0");
    assert_eq!(body["target_commitish"], "main");
    assert_eq!(body["previous_tag_name"], "v1.0.0");
}

#[tokio::test]
async fn an_asset_is_uploaded_with_its_name_type_and_exact_bytes() {
    let (server, client) = setup().await;
    let directory = TempDir::new().expect("dir");
    let file = directory.path().join("notes.txt");
    std::fs::File::create(&file)
        .expect("file")
        .write_all(b"hello world")
        .expect("write");

    let asset = upload_asset(&client, "o", "r", 7, file.to_str().expect("path"))
        .await
        .expect("upload");

    assert_eq!(asset.name, "notes.txt");
    let request = &server.requests()[0];
    assert_eq!(request.method, "POST");
    assert_eq!(request.path(), "/repos/o/r/releases/7/assets");
    assert_eq!(request.query("name").as_deref(), Some("notes.txt"));
    assert_eq!(request.header("content-type"), Some("text/plain"));
    assert_eq!(request.body, "hello world");
}

#[tokio::test]
async fn unusable_files_are_refused_before_any_upload() {
    let (server, client) = setup().await;
    let directory = TempDir::new().expect("dir");
    let empty = directory.path().join("empty.bin");
    std::fs::write(&empty, b"").expect("empty");

    for file in [
        "relative.zip",
        directory.path().to_str().expect("dir"),
        empty.to_str().expect("empty"),
    ] {
        let error = upload_asset(&client, "o", "r", 7, file)
            .await
            .expect_err("refused");
        assert_eq!(error.kind, ErrorKind::InvalidInput, "{file}");
    }
    let missing = directory.path().join("missing.zip");
    let error = upload_asset(&client, "o", "r", 7, missing.to_str().expect("path"))
        .await
        .expect_err("missing");
    assert_eq!(error.kind, ErrorKind::InvalidInput);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn assets_can_be_deleted() {
    let (server, client) = setup().await;

    delete_asset(&client, "o", "r", 3).await.expect("delete");

    assert_eq!(server.requests()[0].path(), "/repos/o/r/releases/assets/3");
}
