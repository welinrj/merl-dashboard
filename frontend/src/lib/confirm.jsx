// In-app dialog system — styled replacements for window.confirm() and
// window.prompt() so users never see the browser's native "<host> says" chrome.
//
// Confirm (resolves boolean):
//   import { confirmDialog } from '../lib/confirm';
//   if (!(await confirmDialog('Delete this photo? This cannot be undone.'))) return;
//   // or: await confirmDialog({ title, message, confirmLabel, danger })
//
// Prompt (resolves string, or null when cancelled):
//   import { promptDialog } from '../lib/confirm';
//   const name = await promptDialog({ title:'New objective', label:'Objective statement',
//                                     multiline:true, required:true });
//   if (name == null) return;
//
// Mount <ConfirmHost /> once near the app root (alongside the toaster).
import { useState, useEffect, useCallback, useRef } from 'react';

let openFn = null;

export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return new Promise((resolve) => {
    if (!openFn) { resolve(window.confirm(o.message || '')); return; }
    openFn({ ...o, mode: 'confirm' }, resolve);
  });
}

export function promptDialog(opts) {
  const o = typeof opts === 'string' ? { label: opts } : (opts || {});
  return new Promise((resolve) => {
    if (!openFn) { resolve(window.prompt(o.label || o.message || '', o.defaultValue || '')); return; }
    openFn({ ...o, mode: 'prompt' }, resolve);
  });
}

export function ConfirmHost() {
  const [state, setState] = useState(null); // { opts, resolve }
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    openFn = (opts, resolve) => { setState({ opts, resolve }); setValue(opts.defaultValue ?? ''); };
    return () => { openFn = null; };
  }, []);

  const isPrompt = state?.opts?.mode === 'prompt';

  const close = useCallback((committed) => {
    setState((s) => {
      if (!s) return null;
      if (s.opts.mode === 'prompt') s.resolve(committed ? value : null);
      else s.resolve(!!committed);
      return null;
    });
  }, [value]);

  // Focus the input when a prompt opens.
  useEffect(() => { if (isPrompt && inputRef.current) inputRef.current.focus(); }, [isPrompt, state]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter' && !(isPrompt && state.opts.multiline)) { e.preventDefault(); close(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close, isPrompt]);

  if (!state) return null;
  const {
    title = isPrompt ? 'Enter a value' : 'Please confirm',
    message = '', label = '', helper = '', placeholder = '',
    confirmLabel = isPrompt ? 'Save' : 'OK',
    cancelLabel = 'Cancel',
    danger = !isPrompt,
    multiline = false,
    required = false,
  } = state.opts;

  const disabled = isPrompt && required && !value.trim();

  return (
    <div
      onClick={() => close(false)}
      style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(18,13,10,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role={isPrompt ? 'dialog' : 'alertdialog'} aria-modal="true" aria-label={title}
        className="card"
        style={{ width:'100%', maxWidth:460, padding:0, overflow:'hidden' }}
      >
        <div style={{ padding:'1.15rem 1.35rem 0.85rem' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', color:'var(--text-1)', marginBottom:'0.4rem' }}>
            {title}
          </div>
          {message && (
            <div style={{ fontSize:'0.85rem', color:'var(--text-2)', lineHeight:1.55, whiteSpace:'pre-line', marginBottom: isPrompt ? '0.75rem' : 0 }}>
              {message}
            </div>
          )}
          {isPrompt && (
            <div>
              {label && (
                <label style={{ display:'block', fontSize:'0.72rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'0.3rem' }}>
                  {label}{required && <span style={{ color:'var(--red-600, #b3402f)' }}> *</span>}
                </label>
              )}
              {multiline ? (
                <textarea ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder} rows={3} className="field-input"
                  style={{ width:'100%', resize:'vertical', fontFamily:'var(--font-ui)' }} />
              ) : (
                <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder} className="field-input" style={{ width:'100%' }} />
              )}
              {helper && <div style={{ fontSize:'0.72rem', color:'var(--text-3)', marginTop:'0.35rem' }}>{helper}</div>}
            </div>
          )}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.5rem', padding:'0.9rem 1.35rem', borderTop:'1px solid var(--border)' }}>
          <button type="button" onClick={() => close(false)} className="btn-secondary"
            style={{ padding:'0.5rem 1rem', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:'0.85rem' }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={() => close(true)} disabled={disabled} autoFocus={!isPrompt}
            className={danger ? undefined : 'btn-primary'}
            style={{
              padding:'0.5rem 1.1rem', borderRadius:8, border:'none', cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight:700, fontSize:'0.85rem', opacity: disabled ? 0.5 : 1,
              color:'#fff', background: danger ? 'var(--red-600, #b3402f)' : (isPrompt ? 'var(--green-700, #0e6e6e)' : undefined),
            }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
