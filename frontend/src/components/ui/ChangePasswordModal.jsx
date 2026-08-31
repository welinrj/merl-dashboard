// ChangePasswordModal.jsx — one dialog for both ways a password gets changed.
//
//   <ChangePasswordModal onClose={...} />                     an officer's own
//   <ChangePasswordModal adminFor={userRow} onClose={...} />  an administrator's
//
// Self-service asks for the current password and proves it server-side; the
// administrator's form does not, because they do not have it. Everything else —
// the length rule, the confirmation field, the wording — is shared, so the two
// paths cannot drift apart.
//
// The database is the authority on what it will accept (migration 0040):
// these checks only save a round trip and put the message beside the field.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../../supabaseClient';
import { dbErrorMessage } from '../../lib/dbError';
import { Eye, EyeOff, Lock, X } from './icons';

// Mirrors merl.assert_password_acceptable in migration 0040.
const MIN_LENGTH = 10;

export default function ChangePasswordModal({ adminFor = null, onClose, onDone = null }) {
  const { t } = useTranslation();
  const isAdmin = Boolean(adminFor);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Only complain about a mismatch once there is something to mismatch, so the
  // message does not sit under the box while it is still being typed.
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = next.length >= MIN_LENGTH && next === confirm
    && (isAdmin || current.length > 0) && !busy;

  const submit = async () => {
    setErr('');
    if (next.length < MIN_LENGTH) { setErr(t('pw.tooShort', { count: MIN_LENGTH })); return; }
    if (next !== confirm) { setErr(t('pw.mismatch')); return; }
    setBusy(true);
    const { error } = isAdmin
      ? await supabase.rpc('admin_set_password', { p_id: adminFor.id, p_new: next })
      : await supabase.rpc('change_my_password', { p_current: current, p_new: next });
    setBusy(false);
    if (error) { setErr(dbErrorMessage(error)); return; }
    toast.success(isAdmin ? t('pw.setForToast', { name: adminFor.full_name }) : t('pw.changedToast'));
    onDone?.();
    onClose();
  };

  const field = (label, value, setValue, autoComplete) => (
    <div>
      <label className="field-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className="field-input"
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => { setValue(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && ready) submit(); }}
          style={{ paddingRight: '2.5rem' }}
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          aria-label={t(show ? 'pw.hide' : 'pw.show')} title={t(show ? 'pw.hide' : 'pw.show')}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
          {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 70,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 420,
          padding: '1.2rem', boxShadow: 'var(--shadow-lg)', marginTop: '4vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.9rem' }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={16} aria-hidden="true" />
              {isAdmin ? t('pw.setForTitle') : t('pw.changeTitle')}
            </strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
              {isAdmin
                ? t('pw.setForSubtitle', { name: adminFor.full_name, email: adminFor.email })
                : t('pw.changeSubtitle')}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('pw.close')} title={t('pw.close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {!isAdmin && field(t('pw.current'), current, setCurrent, 'current-password')}
          {field(t('pw.new'), next, setNext, 'new-password')}
          {field(t('pw.confirm'), confirm, setConfirm, 'new-password')}

          <p style={{ fontSize: '0.72rem', color: tooShort ? 'var(--red-600)' : 'var(--text-3)', margin: 0 }}>
            {t('pw.rule', { count: MIN_LENGTH })}
          </p>
          {mismatch && (
            <p style={{ fontSize: '0.72rem', color: 'var(--red-600)', margin: 0 }}>{t('pw.mismatch')}</p>
          )}
          {isAdmin && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', margin: 0 }}>{t('pw.adminSignsOut')}</p>
          )}
          {err && (
            <p role="alert" style={{ fontSize: '0.78rem', color: 'var(--red-600)', margin: 0, fontWeight: 600 }}>{err}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
          <button onClick={submit} disabled={!ready}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 0.9rem',
              fontSize: '0.8125rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none',
              color: '#fff', background: 'var(--green-700)',
              cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.45 }}>
            {busy ? t('pw.saving') : isAdmin ? t('pw.setPassword') : t('pw.changePassword')}
          </button>
          <button onClick={onClose}
            style={{ padding: '0.55rem 0.9rem', fontSize: '0.8125rem', fontWeight: 600,
              borderRadius: 'var(--radius-control)', background: 'var(--white)',
              border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer' }}>
            {t('pw.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
