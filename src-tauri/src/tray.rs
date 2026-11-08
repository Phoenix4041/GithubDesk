use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::launch::{show_main_window, MAIN_WINDOW};

pub const TRAY_ID: &str = "githubdesk-tray";
pub const TRAY_FETCH_EVENT: &str = "tray-fetch";
const MENU_OPEN: &str = "tray-open";
const MENU_FETCH: &str = "tray-fetch";
const MENU_QUIT: &str = "tray-quit";
const MAX_TEXT_LENGTH: usize = 120;
const MAX_LABEL_LENGTH: usize = 60;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    pub open: String,
    pub fetch: String,
    pub quit: String,
    pub tooltip: String,
}

#[derive(Default)]
pub struct TrayState {
    active: AtomicBool,
    icon: Mutex<Option<TrayIcon<tauri::Wry>>>,
}

impl TrayState {
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }
}

pub fn clean_text(text: &str, limit: usize, fallback: &str) -> String {
    let cleaned: String = text
        .chars()
        .filter(|character| !character.is_control())
        .take(limit)
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn hides_on_close(tray_active: bool, label: &str) -> bool {
    tray_active && label == MAIN_WINDOW
}

fn handle_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        MENU_OPEN => show_main_window(app),
        MENU_FETCH => {
            let _ = app.emit_to(MAIN_WINDOW, TRAY_FETCH_EVENT, ());
        }
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

fn build(app: &AppHandle, labels: &TrayLabels) -> tauri::Result<TrayIcon> {
    let open = MenuItem::with_id(
        app,
        MENU_OPEN,
        clean_text(&labels.open, MAX_LABEL_LENGTH, "Open"),
        true,
        None::<&str>,
    )?;
    let fetch = MenuItem::with_id(
        app,
        MENU_FETCH,
        clean_text(&labels.fetch, MAX_LABEL_LENGTH, "Fetch"),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        MENU_QUIT,
        clean_text(&labels.quit, MAX_LABEL_LENGTH, "Quit"),
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&open, &fetch, &quit])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(clean_text(&labels.tooltip, MAX_TEXT_LENGTH, "GithubDesk"))
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)
}

pub fn enable(app: &AppHandle, labels: &TrayLabels) -> tauri::Result<()> {
    let state = app.state::<TrayState>();
    let mut slot = state
        .icon
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(existing) = slot.take() {
        let _ = app.remove_tray_by_id(existing.id());
    }
    state.active.store(false, Ordering::SeqCst);
    let icon = build(app, labels)?;
    *slot = Some(icon);
    state.active.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn disable(app: &AppHandle) {
    let state = app.state::<TrayState>();
    state.active.store(false, Ordering::SeqCst);
    let mut slot = state
        .icon
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(existing) = slot.take() {
        let _ = app.remove_tray_by_id(existing.id());
    }
}

pub fn pending_tooltip(count: u32, text: &str) -> String {
    let fallback = if count > 0 {
        format!("GithubDesk ({count})")
    } else {
        "GithubDesk".to_string()
    };
    clean_text(text, MAX_TEXT_LENGTH, &fallback)
}

pub fn set_pending(app: &AppHandle, count: u32, text: &str) -> tauri::Result<()> {
    let state = app.state::<TrayState>();
    let slot = state
        .icon
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(icon) = slot.as_ref() {
        icon.set_tooltip(Some(pending_tooltip(count, text)))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tooltip_text_drops_control_characters_and_is_limited() {
        assert_eq!(clean_text("GithubDesk\n(3)", 120, "x"), "GithubDesk(3)");
        assert_eq!(clean_text(&"a".repeat(500), 120, "x").len(), 120);
        assert_eq!(clean_text("   ", 120, "GithubDesk"), "GithubDesk");
    }

    #[test]
    fn an_empty_tooltip_falls_back_to_the_count() {
        assert_eq!(pending_tooltip(0, ""), "GithubDesk");
        assert_eq!(pending_tooltip(4, " "), "GithubDesk (4)");
        assert_eq!(
            pending_tooltip(4, "GithubDesk: 4 pendientes"),
            "GithubDesk: 4 pendientes"
        );
    }

    #[test]
    fn only_the_main_window_hides_and_only_with_the_tray_on() {
        assert!(hides_on_close(true, "main"));
        assert!(!hides_on_close(false, "main"));
        assert!(!hides_on_close(true, "other"));
    }
}
