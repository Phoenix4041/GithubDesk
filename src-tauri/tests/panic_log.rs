use githubdesk_lib::diagnostics;

#[test]
fn a_panic_is_written_to_the_error_log_without_secrets() {
    let directory = tempfile::tempdir().expect("temp dir");
    let logs = directory.path().join("logs");
    diagnostics::init(logs.clone());
    assert_eq!(
        diagnostics::log_directory().as_deref(),
        Some(logs.as_path())
    );

    let outcome = std::panic::catch_unwind(|| {
        panic!("boom with ghp_abcdefghijklmnopqrstuvwxyz0123456789 inside");
    });
    assert!(outcome.is_err());

    let text = std::fs::read_to_string(logs.join("errors.log")).expect("log file");
    assert!(text.contains("\tbackend\tpanic\t"));
    assert!(text.contains("boom with [redacted] inside"));
    assert!(text.contains("panic_log.rs"));
    assert!(!text.contains("ghp_abcdef"));
    assert_eq!(text.lines().count(), 1);
}
