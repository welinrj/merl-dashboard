import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecoveryUrl, recoveryDeliveryError } from '../src/lib/passwordRecovery.js';

test('captures implicit recovery intent before SDK clears the hash', () => {
  assert.deepEqual(readRecoveryUrl('https://example.com/#access_token=test&refresh_token=test&type=recovery'),
    { active: true, invalid: false, credentials: true });
});
test('ordinary sign-in tokens do not open password recovery', () => {
  assert.equal(readRecoveryUrl('https://example.com/#access_token=test&type=signup').active, false);
});
test('expired links remain actionable even without a session', () => {
  assert.deepEqual(readRecoveryUrl('https://example.com/#error=access_denied&error_code=otp_expired'),
    { active: true, invalid: true, credentials: false });
});
test('query recovery callbacks support code-based links', () => {
  assert.deepEqual(readRecoveryUrl('https://example.com/?recovery=1&code=test'),
    { active: true, invalid: false, credentials: true });
});
test('delivery failures distinguish rate limits from sender failures', () => {
  assert.match(recoveryDeliveryError({ status: 429 }), /wait/);
  assert.match(recoveryDeliveryError({ code: 'email_address_not_authorized' }), /administrator/);
  assert.match(recoveryDeliveryError({ status: 500 }), /email service/);
});
