import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
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
  const fr = i18n.resolvedLanguage?.startsWith('fr');

  const submit = async event => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        setError(t('login.badCredentials'));
        setPassword('');
        return;
      }
      // A valid Supabase session is not sufficient to enter the MERL workspace.
      // Require the same current_profile RPC used by the existing login screen.
      const { data: profile, error: profileError } = await supabase.rpc('current_profile');
      if (profileError || !Array.isArray(profile) || !profile[0]?.id || !profile[0]?.role) {
        await supabase.auth.signOut();
        setError(t('login.noProfile'));
        setPassword('');
        return;
      }
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

  return <form className="pbd-header-login" onSubmit={submit} aria-label={fr ? 'Connexion MERL' : 'MERL sign in'}>
    <div className="pbd-header-login-fields">
      <label htmlFor={emailId}>
        <span>{t('login.email')}</span>
        <input id={emailId} type="email" autoComplete="username" inputMode="email" required
          value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder={t('login.email')} disabled={loading}/>
      </label>
      <label htmlFor={passwordId}>
        <span>{t('login.password')}</span>
        <input id={passwordId} type="password" autoComplete="current-password" required
          value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder={t('login.password')} disabled={loading}/>
      </label>
      <button type="submit" disabled={loading}>{loading ? t('login.signingIn') : t('login.signIn')}</button>
    </div>
    {error && <div className="pbd-header-login-error" role="alert">{error}</div>}
  </form>;
}
