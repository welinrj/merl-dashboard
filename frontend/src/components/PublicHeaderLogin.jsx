import { useEffect, useId, useState } from 'react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const fr = i18n.resolvedLanguage?.startsWith('fr');
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  const mobileAccess = <>
    <button type="button" className="pbd-mobile-signin" aria-expanded={mobileOpen} aria-controls="pbd-mobile-login" onClick={() => setMobileOpen(true)}>
      {fr ? 'Connexion' : 'Sign in'}
    </button>
    {mobileOpen && <button type="button" className="pbd-login-backdrop" aria-label={fr ? 'Fermer la connexion' : 'Close sign in'} onClick={() => setMobileOpen(false)} />}
  </>;
  const mobileClose = <div className="pbd-mobile-login-heading"><strong>{recovery ? (fr ? 'Récupérer le compte' : 'Recover account') : (fr ? 'Connexion MERL' : 'MERL sign in')}</strong><button type="button" onClick={() => setMobileOpen(false)} aria-label={fr ? 'Fermer' : 'Close'}>×</button></div>;

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
        return;
      }
      setEmail(normalizedEmail);
      setPassword('');
      // PublicEntry observes the authenticated session and opens the existing
      // role-gated workspace at the shared /dashboards route.
    } catch {
      setError(fr ? 'Connexion impossible. Veuillez réessayer.' : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (recovery) {
    return <>{mobileAccess}<form id="pbd-mobile-login" className={`pbd-header-login pbd-header-recovery${mobileOpen ? ' pbd-login-open' : ''}`} onSubmit={requestRecovery}
      aria-label={fr ? 'Récupération du compte MERL' : 'MERL account recovery'}>
      {mobileClose}
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
    </form></>;
  }

  return <>{mobileAccess}<form id="pbd-mobile-login" className={`pbd-header-login${mobileOpen ? ' pbd-login-open' : ''}`} onSubmit={submit} aria-label={fr ? 'Connexion MERL' : 'MERL sign in'}>
    {mobileClose}
    <div className="pbd-header-login-fields">
      <label htmlFor={emailId}>
        <span>{t('login.email')}</span>
        <input id={emailId} type="email" autoComplete="username" inputMode="email" autoCapitalize="none"
          autoCorrect="off" spellCheck={false} required
          value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder={t('login.email')} disabled={loading}/>
      </label>
      <label htmlFor={passwordId}>
        <span className="pbd-password-label-row">
          <span>{t('login.password')}</span>
          <span className="pbd-password-actions">
            <button type="button" className="pbd-header-login-link" onClick={() => setShowPassword(value => !value)}>
              {showPassword ? (fr ? 'Masquer' : 'Hide') : (fr ? 'Afficher' : 'Show')}
            </button>
            <button type="button" className="pbd-header-login-link" onClick={() => {
              setRecovery(true); setRecoverySent(false); setError(''); setPassword('');
            }}>
              {fr ? 'Oublié ?' : 'Forgot?'}
            </button>
          </span>
        </span>
        <input id={passwordId} type={showPassword ? 'text' : 'password'} autoComplete="current-password"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} required
          value={password} onChange={e => { setPassword(e.target.value.replace(/[\r\n]/g, '')); setError(''); }}
          placeholder={t('login.password')} disabled={loading}/>
      </label>
      <button type="submit" disabled={loading}>{loading ? t('login.signingIn') : t('login.signIn')}</button>
    </div>
    {error && <div className="pbd-header-login-error" role="alert">{error}</div>}
  </form></>;
}
