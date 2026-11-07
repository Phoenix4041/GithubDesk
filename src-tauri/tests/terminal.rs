use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use githubdesk_lib::error::ErrorKind;
use githubdesk_lib::pty::{detect_shells, EventSink, ShellInfo, TerminalEvent, TerminalRegistry};

const WAIT: Duration = Duration::from_secs(25);

#[cfg(windows)]
const NEWLINE: &str = "\r\n";
#[cfg(not(windows))]
const NEWLINE: &str = "\n";

#[cfg(windows)]
const PREFERRED_SHELL: &str = "cmd";
#[cfg(not(windows))]
const PREFERRED_SHELL: &str = "sh";

fn test_shell() -> ShellInfo {
    let shells = detect_shells();
    shells
        .iter()
        .find(|shell| shell.id == PREFERRED_SHELL)
        .or_else(|| shells.first())
        .cloned()
        .expect("a shell")
}

fn collecting_sink() -> (EventSink, Arc<Mutex<Vec<TerminalEvent>>>) {
    let events: Arc<Mutex<Vec<TerminalEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&events);
    let sink: EventSink = Arc::new(move |event| log.lock().expect("log").push(event));
    (sink, events)
}

fn output_so_far(events: &Arc<Mutex<Vec<TerminalEvent>>>) -> String {
    events
        .lock()
        .expect("log")
        .iter()
        .filter_map(|event| match event {
            TerminalEvent::Output { data } => Some(data.as_str()),
            TerminalEvent::Exit { .. } => None,
        })
        .collect()
}

fn has_exited(events: &Arc<Mutex<Vec<TerminalEvent>>>) -> bool {
    events
        .lock()
        .expect("log")
        .iter()
        .any(|event| matches!(event, TerminalEvent::Exit { .. }))
}

fn answer_cursor_queries(
    registry: &TerminalRegistry,
    id: &str,
    events: &Arc<Mutex<Vec<TerminalEvent>>>,
    answered: &mut usize,
) {
    let queries = output_so_far(events).matches("\u{1b}[6n").count();
    while *answered < queries {
        let _ = registry.write(id, b"\x1b[1;1R");
        *answered += 1;
    }
}

fn wait_until(mut condition: impl FnMut() -> bool) -> bool {
    let started = Instant::now();
    while started.elapsed() < WAIT {
        if condition() {
            return true;
        }
        thread::sleep(Duration::from_millis(50));
    }
    false
}

#[test]
fn a_shell_runs_commands_in_the_folder_and_reports_its_exit() {
    let directory = tempfile::tempdir().expect("tempdir");
    let registry = TerminalRegistry::default();
    let (sink, events) = collecting_sink();
    registry
        .open(
            "session-one",
            directory.path(),
            &test_shell(),
            100,
            30,
            sink,
        )
        .expect("open");

    registry
        .write(
            "session-one",
            format!("echo marker-4242{NEWLINE}").as_bytes(),
        )
        .expect("write");
    let mut answered = 0;
    assert!(
        wait_until(|| {
            answer_cursor_queries(&registry, "session-one", &events, &mut answered);
            output_so_far(&events).contains("marker-4242")
        }),
        "the command output never arrived: {}",
        output_so_far(&events)
    );

    registry
        .write("session-one", format!("exit{NEWLINE}").as_bytes())
        .expect("write exit");
    assert!(
        wait_until(|| has_exited(&events)),
        "the exit event never arrived"
    );
    assert!(wait_until(|| !registry.contains("session-one")));
}

#[test]
fn the_shell_starts_inside_the_requested_folder() {
    let directory = tempfile::tempdir().expect("tempdir");
    let marker = directory.path().join("here-4242.txt");
    std::fs::write(&marker, "x").expect("marker");
    let registry = TerminalRegistry::default();
    let (sink, events) = collecting_sink();
    registry
        .open(
            "session-folder",
            directory.path(),
            &test_shell(),
            100,
            30,
            sink,
        )
        .expect("open");

    let listing = if cfg!(windows) { "dir" } else { "ls" };
    registry
        .write("session-folder", format!("{listing}{NEWLINE}").as_bytes())
        .expect("write");
    let mut answered = 0;
    assert!(
        wait_until(|| {
            answer_cursor_queries(&registry, "session-folder", &events, &mut answered);
            output_so_far(&events).contains("here-4242.txt")
        }),
        "the listing did not show the folder files: {}",
        output_so_far(&events)
    );
    registry.close("session-folder");
}

#[test]
fn closing_a_session_stops_the_shell() {
    let directory = tempfile::tempdir().expect("tempdir");
    let registry = TerminalRegistry::default();
    let (sink, events) = collecting_sink();
    registry
        .open(
            "session-close",
            directory.path(),
            &test_shell(),
            80,
            24,
            sink,
        )
        .expect("open");
    registry.close("session-close");
    assert!(wait_until(|| has_exited(&events)), "the shell kept running");
    assert!(!registry.contains("session-close"));
}

#[test]
fn resizing_works_and_duplicate_sessions_are_refused() {
    let directory = tempfile::tempdir().expect("tempdir");
    let registry = TerminalRegistry::default();
    let (sink, _events) = collecting_sink();
    registry
        .open(
            "session-size",
            directory.path(),
            &test_shell(),
            80,
            24,
            Arc::clone(&sink),
        )
        .expect("open");
    registry.resize("session-size", 120, 40).expect("resize");

    let duplicate = registry
        .open(
            "session-size",
            directory.path(),
            &test_shell(),
            80,
            24,
            sink,
        )
        .expect_err("duplicate");
    assert_eq!(duplicate.kind, ErrorKind::InvalidInput);
    registry.close("session-size");
}

#[test]
fn invalid_requests_are_rejected_with_typed_errors() {
    let registry = TerminalRegistry::default();
    let (sink, _events) = collecting_sink();

    let missing_folder = registry
        .open(
            "session-missing",
            Path::new("Z:/definitely/not/here"),
            &test_shell(),
            80,
            24,
            Arc::clone(&sink),
        )
        .expect_err("folder");
    assert_eq!(missing_folder.kind, ErrorKind::TerminalUnavailable);

    let bad_id = registry
        .open("bad id", Path::new("."), &test_shell(), 80, 24, sink)
        .expect_err("id");
    assert_eq!(bad_id.kind, ErrorKind::InvalidInput);

    let write = registry.write("nope", b"x").expect_err("write");
    assert_eq!(write.kind, ErrorKind::TerminalNotFound);
    let resize = registry.resize("nope", 10, 10).expect_err("resize");
    assert_eq!(resize.kind, ErrorKind::TerminalNotFound);
}
