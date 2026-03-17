use std::path::{Path, PathBuf};

use crate::types::ActiveSelectionState;

const ACTIVE_SELECTION_FILE_NAME: &str = "active_selection.json";

fn active_selection_path(settings_path: &Path) -> Result<PathBuf, String> {
    settings_path
        .parent()
        .map(|dir| dir.join(ACTIVE_SELECTION_FILE_NAME))
        .ok_or_else(|| "Unable to resolve active selection storage path".to_string())
}

fn normalize_optional_id(value: Option<String>) -> Option<String> {
    value.and_then(|candidate| {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn read_state(path: &Path) -> Result<ActiveSelectionState, String> {
    if !path.exists() {
        return Ok(ActiveSelectionState::default());
    }

    let data = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
    match serde_json::from_str(&data) {
        Ok(state) => Ok(state),
        Err(_) => Ok(ActiveSelectionState::default()),
    }
}

fn write_state(path: &Path, state: &ActiveSelectionState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let data = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    std::fs::write(path, data).map_err(|err| err.to_string())
}

pub(crate) fn get_active_selection_state_core(
    settings_path: &Path,
) -> Result<ActiveSelectionState, String> {
    let path = active_selection_path(settings_path)?;
    read_state(&path)
}

pub(crate) fn set_active_workspace_selection_core(
    settings_path: &Path,
    workspace_id: Option<String>,
) -> Result<ActiveSelectionState, String> {
    let path = active_selection_path(settings_path)?;
    let mut state = read_state(&path)?;
    state.active_workspace_id = normalize_optional_id(workspace_id);
    write_state(&path, &state)?;
    Ok(state)
}

pub(crate) fn set_active_thread_selection_core(
    settings_path: &Path,
    workspace_id: String,
    thread_id: Option<String>,
) -> Result<ActiveSelectionState, String> {
    let workspace_id = workspace_id.trim().to_string();
    if workspace_id.is_empty() {
        return Err("Workspace ID is required.".to_string());
    }

    let path = active_selection_path(settings_path)?;
    let mut state = read_state(&path)?;
    match normalize_optional_id(thread_id) {
        Some(thread_id) => {
            state.active_thread_id_by_workspace.insert(workspace_id, thread_id);
        }
        None => {
            state.active_thread_id_by_workspace.remove(&workspace_id);
        }
    }
    write_state(&path, &state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;

    use super::{
        get_active_selection_state_core, set_active_thread_selection_core,
        set_active_workspace_selection_core,
    };

    fn temp_settings_path(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-active-selection-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).expect("create temp dir");
        root.join("settings.json")
    }

    #[test]
    fn returns_default_state_when_file_is_missing() {
        let settings_path = temp_settings_path("default");
        let state = get_active_selection_state_core(&settings_path).expect("read default state");
        assert_eq!(state.active_workspace_id, None);
        assert!(state.active_thread_id_by_workspace.is_empty());
    }

    #[test]
    fn persists_active_workspace_selection() {
        let settings_path = temp_settings_path("workspace");

        let saved = set_active_workspace_selection_core(
            &settings_path,
            Some(" workspace-1 ".to_string()),
        )
        .expect("save workspace selection");

        assert_eq!(saved.active_workspace_id.as_deref(), Some("workspace-1"));
        let reloaded =
            get_active_selection_state_core(&settings_path).expect("reload workspace selection");
        assert_eq!(reloaded.active_workspace_id.as_deref(), Some("workspace-1"));
    }

    #[test]
    fn clears_thread_selection_for_workspace() {
        let settings_path = temp_settings_path("thread");
        let mut active_thread_id_by_workspace = HashMap::new();
        active_thread_id_by_workspace.insert("workspace-1".to_string(), "thread-1".to_string());
        let initial = crate::types::ActiveSelectionState {
            active_workspace_id: Some("workspace-1".to_string()),
            active_thread_id_by_workspace,
        };
        let state_path = settings_path.parent().expect("settings dir").join("active_selection.json");
        let data = serde_json::to_string_pretty(&initial).expect("serialize state");
        std::fs::write(&state_path, data).expect("write initial state");

        let saved = set_active_thread_selection_core(
            &settings_path,
            "workspace-1".to_string(),
            None,
        )
        .expect("clear thread selection");

        assert_eq!(saved.active_workspace_id.as_deref(), Some("workspace-1"));
        assert!(!saved.active_thread_id_by_workspace.contains_key("workspace-1"));
    }
}
