mod common;

use common::mock_http::{MockResponse, MockServer};
use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::self_update;
use serde_json::json;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, AppHandle};
use tauri_plugin_updater::UpdaterExt;

const PUBLIC_KEY: &str = include_str!("fixtures/updater/public-key.txt");
const PAYLOAD: &str = include_str!("fixtures/updater/payload.txt");
const SIGNATURE: &str = include_str!("fixtures/updater/payload.txt.sig");

const TARGETS: [&str; 6] = [
    "windows-x86_64",
    "windows-aarch64",
    "linux-x86_64",
    "linux-aarch64",
    "darwin-x86_64",
    "darwin-aarch64",
];

fn app_with(updater: Option<serde_json::Value>) -> App<MockRuntime> {
    let mut context = mock_context(noop_assets());
    if let Some(config) = updater {
        context
            .config_mut()
            .plugins
            .0
            .insert("updater".to_string(), config);
    }
    let app = mock_builder().build(context).expect("app");
    self_update::register(app.handle()).expect("register");
    app
}

fn updater_config(base_url: &str, key: &str) -> serde_json::Value {
    json!({
        "pubkey": key.trim(),
        "endpoints": [format!("{base_url}/latest.json")],
        "dangerousInsecureTransportProtocol": true
    })
}

async fn serve(version: &'static str, signature: &'static str) -> MockServer {
    MockServer::start(move |request| match request.path() {
        "/latest.json" => {
            let platforms: serde_json::Map<String, serde_json::Value> = TARGETS
                .iter()
                .map(|target| {
                    (
                        target.to_string(),
                        json!({
                            "signature": signature.trim(),
                            "url": format!("http://{}/payload.txt", request.headers.get("host").cloned().unwrap_or_default())
                        }),
                    )
                })
                .collect();
            let manifest = json!({
                "version": version,
                "notes": "Notas de prueba",
                "pub_date": "2026-01-01T00:00:00Z",
                "platforms": platforms
            });
            MockResponse::json(200, &manifest.to_string())
        }
        "/payload.txt" => MockResponse::text(200, PAYLOAD),
        _ => MockResponse::text(404, ""),
    })
    .await
}

#[tokio::test]
async fn the_updater_stays_off_without_a_signing_key_in_the_configuration() {
    let app = app_with(None);
    let handle: &AppHandle<MockRuntime> = app.handle();
    assert!(!self_update::is_configured(handle));
}

#[tokio::test]
async fn a_newer_signed_version_is_reported_and_its_download_is_verified() {
    let server = serve("99.0.0", SIGNATURE).await;
    let app = app_with(Some(updater_config(&server.base_url, PUBLIC_KEY)));
    let handle = app.handle();
    assert!(self_update::is_configured(handle));

    let status = self_update::check(handle).await.expect("check");
    assert!(status.configured);
    assert!(status.installable);
    assert!(status.update_available);
    assert_eq!(status.latest.as_deref(), Some("99.0.0"));

    let update = self_update::find_update(handle)
        .await
        .expect("find")
        .expect("update");
    let bytes = update.download(|_, _| {}, || {}).await.expect("download");
    assert_eq!(bytes, PAYLOAD.as_bytes());
}

#[tokio::test]
async fn an_older_or_equal_version_is_not_offered() {
    let server = serve("0.0.1", SIGNATURE).await;
    let app = app_with(Some(updater_config(&server.base_url, PUBLIC_KEY)));
    let status = self_update::check(app.handle()).await.expect("check");
    assert!(status.configured);
    assert!(!status.update_available);
    assert_eq!(status.latest, None);
}

#[tokio::test]
async fn a_download_signed_with_another_key_is_refused() {
    let server = serve("99.0.0", SIGNATURE).await;
    let other = include_str!("fixtures/updater/other-public-key.txt");
    let app = app_with(Some(updater_config(&server.base_url, other)));
    let update = self_update::find_update(app.handle())
        .await
        .expect("find")
        .expect("update");
    assert!(update.download(|_, _| {}, || {}).await.is_err());
}

#[tokio::test]
async fn an_unreachable_server_is_reported_as_a_network_problem() {
    let app = app_with(Some(updater_config("http://127.0.0.1:9", PUBLIC_KEY)));
    let error = self_update::check(app.handle()).await.expect_err("offline");
    assert_eq!(error.kind, ErrorKind::NetworkUnavailable);
}

#[tokio::test]
async fn the_builder_can_be_reached_through_the_plugin_extension() {
    let server = serve("99.0.0", SIGNATURE).await;
    let app = app_with(Some(updater_config(&server.base_url, PUBLIC_KEY)));
    assert!(app.handle().updater().is_ok());
}
