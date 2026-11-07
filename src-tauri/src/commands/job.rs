use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn job_cancel(state: State<'_, AppState>, job_id: String) -> AppResult<bool> {
    Ok(state.jobs.cancel(&job_id))
}
