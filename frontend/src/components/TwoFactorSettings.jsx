import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';

const initialProtectedForm = {
  password: '',
  code: ''
};

const BackupCodePanel = ({ codes }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-dusk/20 bg-dusk/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Backup codes</p>
          <p className="mt-1 text-xs text-ink/60">
            Save these somewhere offline. Each code can be used once if you lose your authenticator app.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <div
            key={code}
            className="rounded-2xl border border-ink/8 bg-white px-4 py-3 font-mono text-sm tracking-[0.15em] text-ink"
          >
            {code}
          </div>
        ))}
      </div>
    </div>
  );
};

const TwoFactorSettings = () => {
  const [status, setStatus] = useState({
    loading: true,
    enabled: false,
    backupCodesRemaining: 0
  });
  const [setupData, setSetupData] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [regeneratedCodes, setRegeneratedCodes] = useState([]);
  const [disableForm, setDisableForm] = useState(initialProtectedForm);
  const [regenerateForm, setRegenerateForm] = useState(initialProtectedForm);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [action, setAction] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const loadStatus = async () => {
    try {
      const response = await api.get('/api/auth/me');
      setStatus({
        loading: false,
        enabled: Boolean(response.data.data.twoFactor?.enabled),
        backupCodesRemaining: response.data.data.twoFactor?.backupCodesRemaining || 0
      });
    } catch (_error) {
      setStatus({
        loading: false,
        enabled: false,
        backupCodesRemaining: 0
      });
      setError('Unable to load your two-factor settings right now.');
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!setupData?.otpauthUrl) {
      setQrCodeUrl('');
      return undefined;
    }

    let cancelled = false;
    QRCode.toDataURL(setupData.otpauthUrl, {
      width: 220,
      margin: 1
    })
      .then((url) => {
        if (!cancelled) {
          setQrCodeUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrCodeUrl('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setupData]);

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const beginSetup = async () => {
    resetFeedback();
    setAction('setup');
    setRegeneratedCodes([]);

    try {
      const response = await api.post('/api/auth/2fa/setup');
      setSetupData(response.data.data);
      setShowDisableForm(false);
      setShowRegenerateForm(false);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to start two-factor setup.');
    } finally {
      setAction(null);
    }
  };

  const handleEnable = async (event) => {
    event.preventDefault();
    resetFeedback();
    setAction('enable');

    try {
      await api.post('/api/auth/2fa/enable', {
        code: setupCode
      });
      setSetupData(null);
      setSetupCode('');
      setMessage('Two-factor authentication is now enabled on your account.');
      await loadStatus();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to enable two-factor authentication.');
    } finally {
      setAction(null);
    }
  };

  const handleDisable = async (event) => {
    event.preventDefault();
    resetFeedback();
    setAction('disable');

    try {
      await api.post('/api/auth/2fa/disable', disableForm);
      setDisableForm(initialProtectedForm);
      setShowDisableForm(false);
      setRegeneratedCodes([]);
      setMessage('Two-factor authentication has been disabled.');
      await loadStatus();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to disable two-factor authentication.');
    } finally {
      setAction(null);
    }
  };

  const handleRegenerate = async (event) => {
    event.preventDefault();
    resetFeedback();
    setAction('regenerate');

    try {
      const response = await api.post('/api/auth/2fa/recovery-codes/regenerate', regenerateForm);
      setRegenerateForm(initialProtectedForm);
      setShowRegenerateForm(false);
      setRegeneratedCodes(response.data.data.backupCodes || []);
      setMessage('New backup codes generated. Replace the old ones everywhere you stored them.');
      await loadStatus();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to regenerate backup codes.');
    } finally {
      setAction(null);
    }
  };

  if (status.loading) {
    return (
      <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
        <p className="text-sm text-ink/55">Loading two-factor settings...</p>
      </div>
    );
  }

  return (
    <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink">Two-factor authentication</h2>
          <p className="mt-2 text-sm text-ink/60">
            Protect your account with an authenticator app and one-time backup codes.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
            status.enabled ? 'bg-reef/10 text-reef' : 'bg-ink/8 text-ink/50'
          }`}
        >
          {status.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[24px] bg-sand p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Status</p>
          <p className="mt-2 font-semibold text-ink">
            {status.enabled ? 'Authenticator app required at sign-in' : 'Password-only sign-in'}
          </p>
        </div>
        <div className="rounded-[24px] bg-sand p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Backup codes left</p>
          <p className="mt-2 font-semibold text-ink">{status.backupCodesRemaining}</p>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}
      {message && (
        <p className="rounded-2xl bg-reef/10 px-4 py-3 text-sm text-reef">{message}</p>
      )}

      {!status.enabled && !setupData && (
        <button
          type="button"
          onClick={beginSetup}
          disabled={action === 'setup'}
          className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
        >
          {action === 'setup' ? 'Preparing setup...' : 'Set up 2FA'}
        </button>
      )}

      {setupData && (
        <div className="space-y-4 rounded-[24px] border border-reef/20 bg-reef/5 p-5">
          <div>
            <p className="text-sm font-semibold text-ink">Step 1: Scan the QR code</p>
            <p className="mt-1 text-sm text-ink/60">
              Use Google Authenticator, 1Password, Authy, or any TOTP app.
            </p>
          </div>

          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded-[28px] bg-white p-3">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Two-factor QR code" className="h-full w-full rounded-[20px]" />
              ) : (
                <div className="text-center text-sm text-ink/50">
                  QR preview unavailable.
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div className="rounded-2xl border border-ink/8 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Manual entry key</p>
                <p className="mt-2 break-all font-mono text-sm text-ink">{setupData.manualEntryKey}</p>
              </div>

              <BackupCodePanel codes={setupData.backupCodes || []} />
            </div>
          </div>

          <form onSubmit={handleEnable} className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-ink/45">Step 2: Enter a 6-digit code</label>
              <input
                value={setupCode}
                onChange={(event) => setSetupCode(event.target.value)}
                placeholder="123456"
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                required
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={action === 'enable'}
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
              >
                {action === 'enable' ? 'Verifying...' : 'Enable 2FA'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetupData(null);
                  setSetupCode('');
                }}
                className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                Cancel setup
              </button>
            </div>
          </form>
        </div>
      )}

      {status.enabled && !setupData && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                resetFeedback();
                setShowRegenerateForm((value) => !value);
                setShowDisableForm(false);
              }}
              className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink"
            >
              Regenerate backup codes
            </button>
            <button
              type="button"
              onClick={() => {
                resetFeedback();
                setShowDisableForm((value) => !value);
                setShowRegenerateForm(false);
              }}
              className="rounded-2xl border border-ember/20 bg-ember/5 px-5 py-3 text-sm font-semibold text-ember"
            >
              Disable 2FA
            </button>
          </div>

          {showRegenerateForm && (
            <form onSubmit={handleRegenerate} className="space-y-3 rounded-[24px] border border-ink/10 bg-sand/60 p-4">
              <p className="text-sm font-semibold text-ink">Confirm before generating new backup codes</p>
              <input
                type="password"
                value={regenerateForm.password}
                onChange={(event) => setRegenerateForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Current password"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                required
              />
              <input
                value={regenerateForm.code}
                onChange={(event) => setRegenerateForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="Authenticator code or backup code"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                required
              />
              <button
                type="submit"
                disabled={action === 'regenerate'}
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
              >
                {action === 'regenerate' ? 'Generating...' : 'Generate new codes'}
              </button>
            </form>
          )}

          {showDisableForm && (
            <form onSubmit={handleDisable} className="space-y-3 rounded-[24px] border border-ember/20 bg-ember/5 p-4">
              <p className="text-sm font-semibold text-ink">Confirm before disabling two-factor authentication</p>
              <input
                type="password"
                value={disableForm.password}
                onChange={(event) => setDisableForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Current password"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                required
              />
              <input
                value={disableForm.code}
                onChange={(event) => setDisableForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="Authenticator code or backup code"
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                required
              />
              <button
                type="submit"
                disabled={action === 'disable'}
                className="rounded-2xl bg-ember px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {action === 'disable' ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </form>
          )}

          {regeneratedCodes.length > 0 && <BackupCodePanel codes={regeneratedCodes} />}
        </div>
      )}
    </div>
  );
};

export default TwoFactorSettings;
