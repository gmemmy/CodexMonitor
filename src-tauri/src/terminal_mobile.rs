use serde::Serialize;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::{terminal_session_core, workspace_rpc};
use crate::state::AppState;
use crate::types::ActiveTerminalSessionInfo;

const UNSUPPORTED_MESSAGE: &str = "Terminal is not available on mobile builds.";

pub(crate) struct TerminalSession {
    pub(crate) id: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TerminalSessionInfo {
    id: String,
}

#[tauri::command]
pub(crate) async fn terminal_open(
    _workspace_id: String,
    terminal_id: String,
    _cols: u16,
    _rows: u16,
    _state: State<'_, AppState>,
    _app: AppHandle,
) -> Result<TerminalSessionInfo, String> {
    if terminal_id.trim().is_empty() {
        return Err("Terminal id is required".to_string());
    }
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[tauri::command]
pub(crate) async fn terminal_write(
    _workspace_id: String,
    _terminal_id: String,
    _data: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[tauri::command]
pub(crate) async fn terminal_resize(
    _workspace_id: String,
    _terminal_id: String,
    _cols: u16,
    _rows: u16,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[tauri::command]
pub(crate) async fn terminal_close(
    _workspace_id: String,
    _terminal_id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[tauri::command]
pub(crate) async fn list_active_terminal_sessions(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<ActiveTerminalSessionInfo>, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WorkspaceIdRequest { workspace_id };
        let response = remote_backend::call_remote(
            &*state,
            app,
            terminal_session_core::METHOD_LIST_ACTIVE_TERMINAL_SESSIONS,
            workspace_rpc::to_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    Ok(
        terminal_session_core::list_active_terminal_sessions_core(
            &state.active_terminal_sessions,
            &workspace_id,
        )
        .await,
    )
}
