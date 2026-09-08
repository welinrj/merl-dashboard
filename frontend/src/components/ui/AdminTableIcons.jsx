// Compact Lucide line icons, as used by the 21st.dev shadcn table examples.
// Keep this small set local so an icon-only change adds no dependency or alters
// the portal's existing global icon vocabulary. Lucide is licensed under ISC.
// https://lucide.dev/license
import React from 'react';

const paths = {
  arrowUpDown: <><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></>,
  arrowUp: <><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></>,
  arrowDown: <><path d="m5 12 7 7 7-7"/><path d="M12 5v14"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  chevronLeft: <path d="m15 18-6-6 6-6"/>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  chevronsLeft: <><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></>,
  chevronsRight: <><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></>,
  moreHorizontal: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
};

export function AdminTableIcon({ name, size = 14, ...props }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    {paths[name]}
  </svg>;
}

export function AdminSortIcon({ direction }) {
  return <AdminTableIcon name={direction === 'ascending' ? 'arrowUp' : direction === 'descending' ? 'arrowDown' : 'arrowUpDown'}/>;
}
