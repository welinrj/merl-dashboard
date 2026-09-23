// Supabase Auth supplies a stable code for credential failures. Other errors
// must not be presented as an incorrect password.
export function loginErrorKey(error) {
  if (error?.code === 'invalid_credentials'
      || (error?.status === 400 && /invalid login credentials/i.test(error?.message || ''))) {
    return 'login.badCredentials';
  }
  if (error?.code === 'email_not_confirmed') return 'login.emailNotConfirmed';
  if (error?.status === 429 || error?.code === 'over_request_rate_limit') return 'login.rateLimited';
  return 'login.authUnavailable';
}
