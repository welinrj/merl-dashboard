import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function MetricInformation({ label, value, detail, stamp, french, onClose }) {
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    const node = ref.current, previous = document.activeElement;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} className="metric-information" aria-labelledby={titleId} onClose={onClose}>
    <header><h2 id={titleId}>{label}</h2><button type="button" onClick={() => ref.current.close()} aria-label={french ? 'Fermer' : 'Close'}>×</button></header>
    <strong>{value}</strong><p>{detail}</p><p>{stamp}</p>
  </dialog>, document.body);
}
