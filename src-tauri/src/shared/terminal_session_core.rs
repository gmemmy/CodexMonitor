use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::Mutex;

use crate::types::ActiveTerminalSessionInfo;

pub(crate) const METHOD_LIST_ACTIVE_TERMINAL_SESSIONS: &str = "list_active_terminal_sessions";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ActiveTerminalSessionRecord {
    pub(crate) workspace_id: String,
    pub(crate) session: ActiveTerminalSessionInfo,
}

impl ActiveTerminalSessionRecord {
    pub(crate) fn new(
        workspace_id: impl Into<String>,
        terminal_id: impl Into<String>,
        created_at: u64,
        title: Option<String>,
        source: Option<String>,
    ) -> Self {
        Self {
            workspace_id: workspace_id.into(),
            session: ActiveTerminalSessionInfo {
                terminal_id: terminal_id.into(),
                created_at,
                title,
                source,
            },
        }
    }
}

pub(crate) fn terminal_session_key(workspace_id: &str, terminal_id: &str) -> String {
    format!("{workspace_id}:{terminal_id}")
}

pub(crate) fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

pub(crate) async fn register_active_terminal_session_core(
    sessions: &Mutex<HashMap<String, ActiveTerminalSessionRecord>>,
    record: ActiveTerminalSessionRecord,
) {
    let key = terminal_session_key(&record.workspace_id, &record.session.terminal_id);
    sessions.lock().await.insert(key, record);
}

pub(crate) async fn remove_active_terminal_session_core(
    sessions: &Mutex<HashMap<String, ActiveTerminalSessionRecord>>,
    workspace_id: &str,
    terminal_id: &str,
) {
    sessions
        .lock()
        .await
        .remove(&terminal_session_key(workspace_id, terminal_id));
}

pub(crate) async fn list_active_terminal_sessions_core(
    sessions: &Mutex<HashMap<String, ActiveTerminalSessionRecord>>,
    workspace_id: &str,
) -> Vec<ActiveTerminalSessionInfo> {
    let mut active = sessions
        .lock()
        .await
        .values()
        .filter(|entry| entry.workspace_id == workspace_id)
        .map(|entry| entry.session.clone())
        .collect::<Vec<_>>();

    active.sort_by(|left, right| {
        left.created_at
            .cmp(&right.created_at)
            .then_with(|| left.terminal_id.cmp(&right.terminal_id))
    });

    active
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn list_active_terminal_sessions_returns_empty_when_workspace_has_no_sessions() {
        let sessions = Mutex::new(HashMap::new());

        let result = list_active_terminal_sessions_core(&sessions, "ws-empty").await;

        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn list_active_terminal_sessions_returns_single_registered_session() {
        let sessions = Mutex::new(HashMap::new());
        register_active_terminal_session_core(
            &sessions,
            ActiveTerminalSessionRecord::new(
                "ws-single",
                "terminal-1",
                100,
                Some("Launch".to_string()),
                None,
            ),
        )
        .await;

        let result = list_active_terminal_sessions_core(&sessions, "ws-single").await;

        assert_eq!(
            result,
            vec![ActiveTerminalSessionInfo {
                terminal_id: "terminal-1".to_string(),
                created_at: 100,
                title: Some("Launch".to_string()),
                source: None,
            }]
        );
    }

    #[tokio::test]
    async fn list_active_terminal_sessions_filters_and_sorts_multiple_sessions() {
        let sessions = Mutex::new(HashMap::new());
        register_active_terminal_session_core(
            &sessions,
            ActiveTerminalSessionRecord::new("ws-main", "terminal-2", 200, None, None),
        )
        .await;
        register_active_terminal_session_core(
            &sessions,
            ActiveTerminalSessionRecord::new("ws-other", "terminal-x", 50, None, None),
        )
        .await;
        register_active_terminal_session_core(
            &sessions,
            ActiveTerminalSessionRecord::new(
                "ws-main",
                "terminal-1",
                100,
                None,
                Some("launchScript".to_string()),
            ),
        )
        .await;

        let result = list_active_terminal_sessions_core(&sessions, "ws-main").await;

        assert_eq!(
            result,
            vec![
                ActiveTerminalSessionInfo {
                    terminal_id: "terminal-1".to_string(),
                    created_at: 100,
                    title: None,
                    source: Some("launchScript".to_string()),
                },
                ActiveTerminalSessionInfo {
                    terminal_id: "terminal-2".to_string(),
                    created_at: 200,
                    title: None,
                    source: None,
                },
            ]
        );
    }
}
