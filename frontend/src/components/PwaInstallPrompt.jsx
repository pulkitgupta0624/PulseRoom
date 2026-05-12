import { useEffect, useState } from 'react';

const DISMISS_KEY = 'pulseroom.installPromptDismissed';

const readDismissedPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(DISMISS_KEY) === '1';
};

const persistDismissedPreference = () => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(DISMISS_KEY, '1');
  }
};

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => readDismissedPreference());
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      if (!readDismissedPreference()) {
        setDismissed(false);
      }
    };

    const handleAppInstalled = () => {
      persistDismissedPreference();
      setDeferredPrompt(null);
      setDismissed(true);
      setInstalling(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    persistDismissedPreference();
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setInstalling(true);
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice?.outcome === 'accepted') {
      persistDismissedPreference();
      setDismissed(true);
    }

    setDeferredPrompt(null);
    setInstalling(false);
  };

  if (!deferredPrompt || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-6 z-[55] w-[min(92vw,360px)] rounded-[28px] border border-ink/10 bg-white/95 p-5 shadow-bloom backdrop-blur">
      <p className="text-xs uppercase tracking-[0.24em] text-dusk">Install App</p>
      <h3 className="mt-2 font-display text-2xl text-ink">Keep PulseRoom on your home screen</h3>
      <p className="mt-3 text-sm leading-6 text-ink/62">
        Launch faster, keep key screens cached, and stay ready for check-in or event ops even on weaker networks.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-60"
        >
          {installing ? 'Preparing...' : 'Install PulseRoom'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink"
        >
          Not now
        </button>
      </div>
    </div>
  );
};

export default PwaInstallPrompt;
