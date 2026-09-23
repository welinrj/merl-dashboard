import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const hasRecoveryMarker = () => {
  if (typeof window === 'undefined') return false;
  const here = `${window.location.search}${window.location.hash}`;
  return /(?:type=recovery|recovery_token|access_token)/i.test(here);
};

/**
 * Global password-recovery gate.
 *
 * Supabase recovery links establish a short-lived recovery session before the
 * normal MERL profile gate runs. This component listens for PASSWORD_RECOVERY
 * and forces the user to choose a new password before continuing.
 */
export default function PasswordRecoveryGate() {
  const [open, setOpen] = useState(hasRecoveryMarker);
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
        setMessage('');
        setError('');
      }
    });

    // If the auth client consumed the URL before this component subscribed,
    // keep the recovery screen visible when the recovery marker was present.
    if (hasRecoveryMarker()) {
      void supabase.auth.getSession().then(({ data }) => {
        if (alive && data.session) setOpen(true);
      });
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

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message || 'The password could not be changed. Request a new recovery link and try again.');
      setBusy(false);
      return;
    }

    setPassword('');
    setConfirm('');
    setMessage('Password changed successfully. You can now sign in with your new password.');

    // End the recovery session so the user proves the new password at the next
    // sign-in and does not retain access through an old recovery link.
    await supabase.auth.signOut();
    setBusy(false);
  };

  if (!open) return null;

  return (
    <div className="merl-recovery-backdrop" role="dialog" aria-modal="true" aria-labelledby="merl-recovery-title">
      <form className="merl-recovery-card" onSubmit={save}>
        <div className="merl-recovery-kicker">MERL account recovery</div>
        <h2 id="merl-recovery-title">Set a new password</h2>
        <p>Enter a new password for your MERL account. It must contain at least 10 characters.</p>

        {message ? (
          <>
            <div className="merl-recovery-success" role="status">{message}</div>
            <button type="button" className="merl-recovery-primary" onClick={() => {
              setOpen(false);
              window.location.hash = '#/dashboards';
            }}>
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
