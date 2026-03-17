type RemoteSyncBannerProps = {
  state: "stale" | "offline";
  title: string;
  message: string;
  actionLabel?: string;
  actionBusy?: boolean;
  onAction?: () => void;
};

export function RemoteSyncBanner({
  state,
  title,
  message,
  actionLabel = "Reconnect",
  actionBusy = false,
  onAction,
}: RemoteSyncBannerProps) {
  return (
    <div
      className={`remote-sync-banner remote-sync-banner-${state}`}
      role="status"
      aria-live="polite"
    >
      <div className="remote-sync-banner-copy">
        <div className="remote-sync-banner-title">{title}</div>
        <div className="remote-sync-banner-message">{message}</div>
      </div>
      {onAction ? (
        <button
          type="button"
          className="ghost remote-sync-banner-action"
          onClick={onAction}
          disabled={actionBusy}
        >
          {actionBusy ? "Reconnecting…" : actionLabel}
        </button>
      ) : null}
    </div>
  );
}
