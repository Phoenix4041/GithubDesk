use githubdesk_lib::launch::{self, LaunchRequest};
use githubdesk_lib::state::AppState;
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

fn arguments(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_string()).collect()
}

#[test]
fn a_second_launch_with_a_link_leaves_the_request_pending() {
    let directory = tempfile::tempdir().expect("tempdir");
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("app");
    app.manage(AppState::new(directory.path().to_path_buf()));
    let handle = app.handle();

    launch::handle_arguments(
        handle,
        &arguments(&[
            "githubdesk",
            "githubdesk://clone?url=https%3A%2F%2Fgithub.com%2Focto%2Fhello&branch=dev",
        ]),
    );

    let state = handle.state::<AppState>();
    assert_eq!(
        launch::take(&state.launch),
        Some(LaunchRequest::Clone {
            url: "https://github.com/octo/hello".to_string(),
            branch: Some("dev".to_string()),
        })
    );
    assert_eq!(launch::take(&state.launch), None);
}

#[test]
fn links_from_the_system_are_handled_like_arguments() {
    let directory = tempfile::tempdir().expect("tempdir");
    let folder = directory.path().join("repo");
    std::fs::create_dir(&folder).expect("folder");
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("app");
    app.manage(AppState::new(directory.path().to_path_buf()));
    let handle = app.handle();

    let text = folder.to_string_lossy().into_owned();
    launch::handle_links(handle, std::slice::from_ref(&text));

    let state = handle.state::<AppState>();
    assert_eq!(
        launch::take(&state.launch),
        Some(LaunchRequest::Open { path: text })
    );
}

#[test]
fn an_unknown_argument_leaves_nothing_pending() {
    let directory = tempfile::tempdir().expect("tempdir");
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("app");
    app.manage(AppState::new(directory.path().to_path_buf()));
    let handle = app.handle();

    launch::handle_arguments(handle, &arguments(&["githubdesk", "--minimized"]));

    assert_eq!(launch::take(&handle.state::<AppState>().launch), None);
}
