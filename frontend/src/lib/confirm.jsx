// In-app confirmation dialog — a styled replacement for window.confirm() so
// users never see the browser's native "<host> says" prompt.
//
// Usage (anywhere, inside an async handler):
//   import { confirmDialog } from '../lib/confirm';
//   if (!(await confirmDialog('Delete this photo? This cannot be undone.'))) return;
//   // or: await confirmDialog({ title, message, confirmLabel, danger })
//
// Mount <ConfirmHost /> once near the app root (alongside the toaster).
import { useState, useEffect, useCallback } from 'react';

let openFn = null;

export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return new Promise((resolve) => {
    // Fallback to the native confirm only if the host isn't mounted yet.
    if (!openFn) { resolve(window.confirm(o.message || '')); return; }
    openFn(o, resolve);
  });
}

export function ConfirmHost() {
  const [state, setState] = useState(null); // { opts, resolve }

  useEffect(() => {
    openFn = (opts, resolve) => setState({ opts, resolve });
    return () => { openFn = null; };
  }, []);

  const close = useCallback((value) => {
    setState((s) => { s?.resolve(value); return null; });
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  if (!state) return null;
  const {
    title = 'Please confirm',
    message = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    danger = true,
  } = state.opts;

  return (
    <div
      onClick={() => close(false)}
      style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(18,13,10,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog" aria-modal="true"
        className="card"
        style={{ width:'100%', maxWidth:420, padding:0, overflow:'hidden' }}
      >
        <div style={{ padding:'1.15rem 1.35rem 0.85rem' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', color:'var(--text-1)', marginBottom:'0.4rem' }}>
            {title}
          </div>
          <div style={{ fontSize:'0.85rem', color:'var(--text-2)', lineHeight:1.55, whiteSpace:'pre-line' }}>
            {message}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.5rem', padding:'0.9rem 1.35rem', borderTop:'1px solid var(--border)', background:'var(--surface, transparent)' }}>
          <button type="button" onClick={() => close(false)} className="btn-secondary"
            style={{ padding:'0.5rem 1rem', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:'0.85rem' }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={() => close(true)} autoFocus
            className={danger ? undefined : 'btn-primary'}
            style={{
              padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.85rem',
              color:'#fff', background: danger ? 'var(--red-600, #b3402f)' : undefined,
            }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
