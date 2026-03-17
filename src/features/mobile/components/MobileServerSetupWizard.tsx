import "../../../styles/mobile-setup-wizard.css";
import X from "lucide-react/dist/esm/icons/x";
import { ModalShell } from "../../design-system/components/modal/ModalShell";

export type MobileServerSetupWizardProps = {
  remoteHostDraft: string;
  remoteTokenDraft: string;
  busy: boolean;
  checking: boolean;
  handoffPayloadDraft: string;
  handoffApplying: boolean;
  statusMessage: string | null;
  statusError: boolean;
  onClose: () => void;
  onRemoteHostChange: (value: string) => void;
  onRemoteTokenChange: (value: string) => void;
  onHandoffPayloadChange: (value: string) => void;
  onConnectTest: () => void;
  onApplyHandoff: () => void;
};

export function MobileServerSetupWizard({
  remoteHostDraft,
  remoteTokenDraft,
  busy,
  checking,
  handoffPayloadDraft,
  handoffApplying,
  statusMessage,
  statusError,
  onClose,
  onRemoteHostChange,
  onRemoteTokenChange,
  onHandoffPayloadChange,
  onConnectTest,
  onApplyHandoff,
}: MobileServerSetupWizardProps) {
  const controlsDisabled = busy || checking || handoffApplying;

  return (
    <ModalShell
      className="mobile-setup-wizard-overlay"
      cardClassName="mobile-setup-wizard-card"
      onBackdropClick={onClose}
      ariaLabel="Mobile server setup"
    >
      <div className="mobile-setup-wizard-header">
        <button
          type="button"
          className="ghost icon-button mobile-setup-wizard-close"
          onClick={onClose}
          aria-label="Close mobile setup"
        >
          <X aria-hidden />
        </button>
        <div className="mobile-setup-wizard-kicker">Mobile Setup Required</div>
        <h2 className="mobile-setup-wizard-title">Connect to your desktop backend</h2>
        <p className="mobile-setup-wizard-subtitle">
          Complete this setup before using the app. Use the same connection details configured on
          your desktop CodexMonitor server settings.
        </p>
      </div>

      <div className="mobile-setup-wizard-body">
        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-host">
          Tailscale host
        </label>
        <input
          id="mobile-setup-host"
          className="mobile-setup-wizard-input"
          value={remoteHostDraft}
          placeholder="macbook.your-tailnet.ts.net:4732"
          onChange={(event) => onRemoteHostChange(event.target.value)}
          disabled={controlsDisabled}
        />

        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-token">
          Remote backend token
        </label>
        <input
          id="mobile-setup-token"
          type="password"
          className="mobile-setup-wizard-input"
          value={remoteTokenDraft}
          placeholder="Token"
          onChange={(event) => onRemoteTokenChange(event.target.value)}
          disabled={controlsDisabled}
        />

        <button
          type="button"
          className="button primary mobile-setup-wizard-action"
          onClick={onConnectTest}
          disabled={controlsDisabled}
        >
          {checking ? "Checking..." : busy ? "Connecting..." : "Connect & test"}
        </button>

        <div className="mobile-setup-wizard-divider" />

        <label className="mobile-setup-wizard-label" htmlFor="mobile-setup-handoff">
          Desktop handoff payload
        </label>
        <textarea
          id="mobile-setup-handoff"
          className="mobile-setup-wizard-textarea"
          value={handoffPayloadDraft}
          placeholder='Paste the JSON payload copied from desktop Server settings'
          onChange={(event) => onHandoffPayloadChange(event.target.value)}
          disabled={controlsDisabled}
          spellCheck={false}
        />
        <button
          type="button"
          className="button mobile-setup-wizard-action"
          onClick={onApplyHandoff}
          disabled={controlsDisabled}
        >
          {handoffApplying ? "Applying..." : "Apply desktop handoff"}
        </button>

        {statusMessage ? (
          <div
            className={`mobile-setup-wizard-status${
              statusError ? " mobile-setup-wizard-status-error" : ""
            }`}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mobile-setup-wizard-hint">
          Paste the desktop handoff payload to continue the same remote workspace and thread, or
          enter host/token manually if you only need connectivity.
        </div>
      </div>
    </ModalShell>
  );
}
