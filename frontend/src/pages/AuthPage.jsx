import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import {
  clearTwoFactorChallenge,
  login,
  register,
  verifyTwoFactorLogin
} from '../features/auth/authSlice';

const baseForm = {
  name: '',
  email: '',
  password: '',
  role: 'attendee'
};

const AuthPage = () => {
  const dispatch = useDispatch();
  const { user, loading, error, twoFactorChallenge } = useSelector((state) => state.auth);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(baseForm);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  if (user) {
    return <Navigate to="/" replace />;
  }

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setTwoFactorCode('');
    dispatch(clearTwoFactorChallenge());
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (twoFactorChallenge) {
      await dispatch(
        verifyTwoFactorLogin({
          twoFactorToken: twoFactorChallenge.token,
          code: twoFactorCode
        })
      );
      return;
    }

    if (mode === 'login') {
      await dispatch(
        login({
          email: form.email,
          password: form.password
        })
      );
      return;
    }

    await dispatch(register(form));
  };

  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-[36px] border border-ink/10 bg-white/80 shadow-bloom">
      <div className="grid md:grid-cols-[0.95fr,1.05fr]">
        <div className="bg-gradient-to-br from-reef via-dusk to-ink p-8 text-sand md:p-10">
          <p className="text-xs uppercase tracking-[0.35em] text-sand/60">Identity</p>
          <h1 className="mt-4 font-display text-4xl md:text-5xl">Step into the event control layer.</h1>
          <p className="mt-4 text-base text-sand/78">
            Attendees can discover and join live experiences. Organizers get access to event creation, analytics surfaces, and live moderation controls.
          </p>
          <div className="mt-8 grid gap-3">
            {['JWT auth with refresh cookies', 'Role-aware organizer and admin access', 'Realtime chat, polls, and notifications'].map((item) => (
              <div key={item} className="rounded-2xl border border-sand/10 bg-sand/5 px-4 py-3 text-sm text-sand/82">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 md:p-10">
          <div className="mb-6 inline-flex rounded-full border border-ink/10 bg-sand p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'login' ? 'bg-ink text-sand' : 'text-ink/60'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'register' ? 'bg-ink text-sand' : 'text-ink/60'}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {twoFactorChallenge ? (
              <div className="space-y-4 rounded-[28px] border border-ink/10 bg-sand/60 p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-reef">Two-Factor</p>
                  <h2 className="mt-2 font-display text-2xl text-ink">Enter your security code</h2>
                  <p className="mt-2 text-sm text-ink/65">
                    Use the 6-digit code from your authenticator app or one of your backup codes for{' '}
                    <strong>{twoFactorChallenge.email}</strong>.
                  </p>
                </div>

                <input
                  value={twoFactorCode}
                  onChange={(inputEvent) => setTwoFactorCode(inputEvent.target.value)}
                  placeholder="123456 or ABCD-EFGH"
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"
                  required
                />

                <button
                  type="button"
                  onClick={() => {
                    dispatch(clearTwoFactorChallenge());
                    setTwoFactorCode('');
                  }}
                  className="text-sm font-medium text-reef"
                >
                  Back to password sign-in
                </button>
              </div>
            ) : mode === 'register' ? (
              <input
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Full name"
                className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3"
                required
              />
            ) : null}
            {!twoFactorChallenge ? (
              <>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3"
                  required
                />
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder="Strong password"
                  className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3"
                  required
                />

                {mode === 'register' ? (
                  <select
                    value={form.role}
                    onChange={(event) => updateField('role', event.target.value)}
                    className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3"
                  >
                    <option value="attendee">Attendee</option>
                    <option value="organizer">Organizer</option>
                    <option value="speaker">Speaker</option>
                    <option value="moderator">Moderator</option>
                  </select>
                ) : null}
              </>
            ) : null}

            {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

            <button type="submit" disabled={loading} className="w-full rounded-2xl bg-ink px-5 py-3 font-semibold text-sand">
              {loading
                ? 'Working...'
                : twoFactorChallenge
                  ? 'Verify and continue'
                  : mode === 'login'
                    ? 'Sign in'
                    : 'Create PulseRoom account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
