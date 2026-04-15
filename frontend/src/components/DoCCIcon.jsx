// Professional DoCC climate emblem — replaces emoji
export function DoCCIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Leaf / climate globe */}
      <circle cx="18" cy="18" r="14" stroke={color} strokeWidth="1.5" opacity="0.3"/>
      {/* Leaf path */}
      <path d="M18 6C12 6 8 11 8 17c0 3 1.5 5.5 4 7.5 1.5 1.2 3.5 2 6 2s4.5-.8 6-2c2.5-2 4-4.5 4-7.5 0-6-4-11-10-11z"
        fill={color} opacity="0.9"/>
      {/* Leaf vein - vertical */}
      <path d="M18 7v18" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Leaf vein - left */}
      <path d="M18 14c-2.5-1.5-5-1-6.5 0" stroke="rgba(0,0,0,0.3)" strokeWidth="1" strokeLinecap="round"/>
      {/* Leaf vein - right */}
      <path d="M18 18c2-1 4.5-0.8 5.5 0.5" stroke="rgba(0,0,0,0.3)" strokeWidth="1" strokeLinecap="round"/>
      {/* Small circle — monitoring point */}
      <circle cx="18" cy="26" r="2" fill={color} opacity="0.6"/>
    </svg>
  );
}

export function VanuatuStarIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="8,1 10,6 15,6 11,9.5 12.5,15 8,11.5 3.5,15 5,9.5 1,6 6,6" fill={color}/>
    </svg>
  );
}

export function MFATIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="6" width="14" height="8" rx="1.5" stroke={color} strokeWidth="1.2"/>
      <path d="M5 6V4a3 3 0 016 0v2" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="8" cy="10" r="1.5" fill={color}/>
    </svg>
  );
}
