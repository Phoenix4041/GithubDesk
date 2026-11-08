use tauri::State;

use crate::error::AppResult;
use crate::launch::{self, LaunchRequest};
use crate::state::AppState;

#[tauri::command]
pub async fn launch_take_pending(state: State<'_, AppState>) -> AppResult<Option<LaunchRequest>> {
    Ok(launch::take(&state.launch))
}
