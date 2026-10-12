import { useEffect, useRef } from 'react';

// Dismiss only a deliberate tap. A drag, cancelled touch, or click retargeted
// onto a newly-mounted backdrop must not close a menu on a phone.
export function useBackdropDismiss(open, onDismiss) {
  const gesture = useRef(null);
  useEffect(() => {
    if (!open) { gesture.current = null; return undefined; }
    const escape = event => { if (event.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, onDismiss]);
  return {
    onPointerDown: event => { gesture.current = {x:event.clientX,y:event.clientY,moved:false}; },
    onPointerMove: event => {
      const start = gesture.current;
      if (start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>10) start.moved = true;
    },
    onPointerCancel: () => { gesture.current = {moved:true}; },
    onClick: event => {
      const start = gesture.current;
      gesture.current = null;
      if (event.detail === 0 || start && !start.moved) onDismiss();
    },
  };
}
