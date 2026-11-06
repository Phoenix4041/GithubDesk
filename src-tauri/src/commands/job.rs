use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub fn job_cancel(state: State<'_, AppState>, job_id: String) -> bool {
    state.jobs.cancel(&job_id)
}
