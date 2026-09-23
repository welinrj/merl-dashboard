import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { loadCurrentProfile } from '../lib/authProfile';
import { loginErrorKey } from '../lib/loginError';
import './public-header-login.css';

/** Use the existing MERL authentication and profile checks, without a second login system. */
export default function PublicHeaderLogin() {
  const { t, i18n } = useTranslation();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const fr = i18n.resolvedLanguage?.startsWith('fr');

  const requestRecovery = async event => {
    event.preventDefault();
    if (loading) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError(fr ? 'Entrez votre adresse e-mail.' : 'Enter your email address.');
      return;
    }
    setLoading(true);
    setError('');
    setRecoverySent(false);
    try {
      const redirectTo = 'https://welinrj.github.io/merl-dashboard/';
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (recoveryError) {
        setError(fr
          ? 'Impossible d’envoyer le lien de récupération. Veuillez réessayer.'
          : 'Unable to send the recovery link. Please try again.');
        return;
      }
      setRecoverySent(true);
    } catch {
      setError(fr
        ? 'Impossible d’envoyer le lien de récupération. Veuillez réessayer.'
        : 'Unable to send the recovery link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (authError) {
        setError(t(loginErrorKey(authError)));
        setPassword('');
        return;
      }
      // A valid Supabase session is not sufficient to enter the MERL workspace.
      // Resolve the linked MERL profile with a short retry window because a fresh
      // auth session can become visible to PostgREST slightly after SIGNED_IN.
      // This is especially important for Viewer/read-only accounts, which were
      // previously being signed out when the first profile lookup returned empty.
      const { profile } = await loadCurrentProfile();
      if (!profile) {
        await supabase.auth.signOut();
        setError(t('login.noProfile'));
        setPassword('');
        return;
      }
      setEmail(normalizedEmail);
      setPassword('');
      // PublicEntry observes the authenticated session and opens the existing
      // role-gated workspace at the shared /dashboards route.
    } catch {
      setError(fr ? 'Connexion impossible. Veuillez réessayer.' : 'Unable to sign in. Please try again.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  if (recovery) {
    return <form className="pbd-header-login pbd-header-recovery" onSubmit={requestRecovery}
      aria-label={fr ? 'Récupération du compte MERL' : 'MERL account recovery'}>
      <div className="pbd-header-recovery-row">
        <label htmlFor={emailId}>
          <span>{t('login.email')}</span>
          <input id={emailId} type="email" autoComplete="username" inputMode="email" required
            value={email} onChange={e => { setEmail(e.target.value); setError(''); setRecoverySent(false); }}
            placeholder={t('login.email')} disabled={loading}/>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? (fr ? 'Envoi…' : 'Sending…') : (fr ? 'Envoyer le lien' : 'Send recovery link')}
        </button>
        <button type="button" className="pbd-header-login-secondary" onClick={() => {
          setRecovery(false); setRecoverySent(false); setError('');
        }} disabled={loading}>
          {fr ? 'Retour' : 'Back'}
        </button>
      </div>
      {recoverySent && <div className="pbd-header-login-success" role="status">
        {fr
          ? 'Si cette adresse possède un compte MERL, un lien de récupération a été envoyé.'
          : 'If this email has a MERL account, a recovery link has been sent.'}
      </div>}
      {error && <div className="pbd-header-login-error" role="alert">{error}</div>}
    </form>;
  }

  return <form className="pbd-header-login" onSubmit={submit} aria-label={fr ? 'Connexion MERL' : 'MERL sign in'}>
    <div className="pbd-header-login-fields">
      <label htmlFor={emailId}>
        <span>{t('login.email')}</span>
        <input id={emailId} type="email" autoComplete="username" inputMode="email" required
          value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder={t('login.email')} disabled={loading}/>
      </label>
      <label htmlFor={passwordId}>
        <span className="pbd-password-label-row">
          <span>{t('login.password')}</span>
          <button type="button" className="pbd-header-login-link" onClick={() => {
            setRecovery(true); setRecoverySent(false); setError(''); setPassword('');
          }}>
            {fr ? 'Oublié ?' : 'Forgot?'}
          </button>
        </span>
        <input id={passwordId} type="password" autoComplete="current-password" required
          value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder={t('login.password')} disabled={loading}/>
      </label>
      <button type="submit" disabled={loading}>{loading ? t('login.signingIn') : t('login.signIn')}</button>
    </div>
    {error && <div className="pbd-header-login-error" role="alert">{error}</div>}
  </form>;
}
