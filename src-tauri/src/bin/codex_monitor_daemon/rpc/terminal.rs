use super::*;
use crate::shared::{terminal_session_core, workspace_rpc};
use serde::Serialize;
use std::future::Future;

fn serialize_value<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|err| err.to_string())
}

async fn serialize_result<T, Fut>(future: Fut) -> Result<Value, String>
where
    T: Serialize,
    Fut: Future<Output = Result<T, String>>,
{
    future.await.and_then(serialize_value)
}

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        terminal_session_core::METHOD_LIST_ACTIVE_TERMINAL_SESSIONS => {
            let request = match workspace_rpc::from_params::<workspace_rpc::WorkspaceIdRequest>(params)
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serialize_result(state.list_active_terminal_sessions(request.workspace_id)).await)
        }
        _ => None,
    }
}
