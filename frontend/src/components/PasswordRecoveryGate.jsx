import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

import { recoveryBootstrap } from '../lib/passwordRecovery';
import './public-header-login.css';

/**
 * Global password-recovery gate.
 *
 * Supabase recovery links establish a short-lived recovery session before the
 * normal MERL profile gate runs. This component listens for PASSWORD_RECOVERY
 * and forces the user to choose a new password before continuing.
 */
export default function PasswordRecoveryGate({ children }) {
  const [open, setOpen] = useState(recoveryBootstrap.active);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(recoveryBootstrap.invalid);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (alive && event === 'PASSWORD_RECOVERY') {
        setOpen(true);
        setReady(true);
        setInvalid(false);
        setMessage('');
        setError('');
      }
    });

    if (recoveryBootstrap.active) {
      void (async () => {
        try {
          const { error: initError } = await supabase.auth.initialize();
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (!alive) return;
          const valid = !recoveryBootstrap.invalid && !initError && !sessionError
            && recoveryBootstrap.credentials && !!data.session;
          setInvalid(!valid);
          setReady(valid);
        } catch {
          if (alive) setInvalid(true);
        }
      })();
    }

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 10) {
      setError('Use at least 10 characters for the new password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    if (!ready || busy) return;
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'The password could not be changed. Request a new recovery link.');
        return;
      }
      setPassword('');
      setConfirm('');
      setMessage('Password changed successfully. You can now sign in with your new password.');
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      setError('The request could not be completed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const returnToSignIn = () => {
    recoveryBootstrap.active = false;
    window.history.replaceState(null, '', `${window.location.pathname}#/dashboards`);
    setOpen(false);
  };

  if (!open) return children;

  return (
    <div className="merl-recovery-backdrop" role="dialog" aria-modal="true" aria-labelledby="merl-recovery-title">
      <form className="merl-recovery-card" onSubmit={save}>
        <div className="merl-recovery-kicker">MERL account recovery</div>
        <h2 id="merl-recovery-title">Set a new password</h2>
        <p>Enter a new password for your MERL account. It must contain at least 10 characters.</p>

        {invalid ? (
          <>
            <div className="merl-recovery-error" role="alert">This recovery link has expired or is incomplete. Return to sign in and request a new link using Forgot password.</div>
            <button type="button" className="merl-recovery-primary" onClick={returnToSignIn}>Return to sign in</button>
          </>
        ) : !ready && !message ? (
          <p role="status">Checking recovery link…</p>
        ) : message ? (
          <>
            <div className="merl-recovery-success" role="status">{message}</div>
            <button type="button" className="merl-recovery-primary" onClick={returnToSignIn} disabled={busy}>
              Return to sign in
            </button>
          </>
        ) : (
          <>
            <label>
              <span>New password</span>
              <input type="password" autoComplete="new-password" value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }} required minLength={10} />
            </label>
            <label>
              <span>Confirm new password</span>
              <input type="password" autoComplete="new-password" value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(''); }} required minLength={10} />
            </label>
            {error && <div className="merl-recovery-error" role="alert">{error}</div>}
            <button type="submit" className="merl-recovery-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
