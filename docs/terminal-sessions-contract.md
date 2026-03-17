# Active Terminal Sessions Contract

Canonical backend contract for listing active terminal sessions by workspace.

## Method

- App/Tauri command: `list_active_terminal_sessions`
- Daemon JSON-RPC method: `list_active_terminal_sessions`

## Request

```json
{
  "workspaceId": "ws-123"
}
```

## Response

```ts
type ActiveTerminalSession = {
  terminalId: string;
  createdAt: number;
  title: string | null;
  source: string | null;
};
```

- `terminalId` is the stable backend terminal session identifier for the workspace.
- `createdAt` is a Unix epoch timestamp in milliseconds.
- `title` is optional display metadata and is `null` when the runtime does not have a title for the session.
- `source` is optional provenance metadata and is `null` when the runtime does not have a source for the session.

## Semantics

- The response lists only sessions registered for the requested workspace in the current backend runtime.
- Results are sorted by `createdAt` ascending, then `terminalId`.
- The payload is remote-safe: it contains only serializable metadata and never includes PTY handles or process objects.
