// Capture recovery intent before Supabase consumes the fragment or HashRouter rewrites it.
export function readRecoveryUrl(href) {
  const url = new URL(href);
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const value = key => fragment.get(key) || query.get(key);
  const error = value('error') || value('error_code');
  const active = value('type') === 'recovery' || query.get('recovery') === '1'
    || error === 'access_denied' || error === 'otp_expired';
  return { active, invalid: !!error, credentials: !!value('access_token') || !!value('code') };
}

export const recoveryBootstrap = typeof window === 'undefined'
  ? { active: false, invalid: false, credentials: false }
  : readRecoveryUrl(window.location.href);

export function recoveryDeliveryError(error, fr = false) {
  const code = error?.code || '';
  if (error?.status === 429 || /rate_limit|over_email_send/.test(code)) {
    return fr ? 'Trop de demandes. Attendez avant de demander un nouveau lien.'
      : 'Too many recovery requests. Please wait before requesting another link.';
  }
  if (/email_address_not_authorized|unexpected_failure|email_send/.test(code) || error?.status >= 500) {
    return fr ? 'Le service e-mail ne peut pas envoyer le lien. Contactez l’administrateur MERL.'
      : 'The email service could not send the link. Contact the MERL administrator.';
  }
  return fr ? 'Impossible d’envoyer le lien. Vérifiez votre connexion et réessayez.'
    : 'Unable to send the link. Check your connection and try again.';
}
