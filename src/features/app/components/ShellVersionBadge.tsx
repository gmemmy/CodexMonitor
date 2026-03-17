type ShellVersionBadgeProps = {
  className?: string;
};

function formatVersionLabel(version: string) {
  return version.startsWith("v") ? version : `v${version}`;
}

export function ShellVersionBadge({ className }: ShellVersionBadgeProps) {
  const versionLabel = formatVersionLabel(__APP_VERSION__);
  const classNames = ["shell-version-badge", className].filter(Boolean).join(" ");

  return (
    <span
      className={classNames}
      aria-label={`App version ${versionLabel}`}
      title={`CodexMonitor ${versionLabel}`}
    >
      {versionLabel}
    </span>
  );
}
