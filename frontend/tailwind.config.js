/** @type {import('tailwindcss').Config} */
export default {
  // The portal is a light-only design. Class strategy (we never add a .dark
  // class) keeps `dark:` variants from third-party/registry components from
  // activating on devices whose OS is in dark mode, which flipped the tab
  // tracks to dark slate against the light theme.
  darkMode: 'class',
  content: [
    './index.html',
    './public/index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Clean light theme: indigo primary + colourful accents ──
        // The primary brand scale (green/brand) is indigo; success/positive
        // uses a true green (emerald); savings/warning uses orange (yellow/
        // amber); negatives use red. Overriding these scales themes every
        // utility class (bg-green-700, text-amber-600, …) portal-wide.
        green: {
          50: '#eaf4f3', 100: '#d3e8e6', 200: '#a7d3d0', 300: '#6fb8b4',
          400: '#2f9995', 500: '#12827f', 600: '#0e6e6e', 700: '#0c5b59',
          800: '#0b4443', 900: '#08302f', 950: '#052120',
        },
        // True green — success / positive states
        emerald: {
          50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
          400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857',
          800: '#065f46', 900: '#064e3b', 950: '#022c22',
        },
        red: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
          400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
          800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
        },
        yellow: {
          50: '#fdf6e9', 100: '#f7ead0', 200: '#f0d5a1', 300: '#eac069',
          400: '#eab24a', 500: '#e0a12a', 600: '#c2841c', 700: '#9a6717',
          800: '#7c521a', 900: '#653f18', 950: '#3a2309',
        },
        amber: {
          50: '#fdf6e9', 100: '#f7ead0', 200: '#f0d5a1', 300: '#eac069',
          400: '#eab24a', 500: '#e0a12a', 600: '#c2841c', 700: '#9a6717',
          800: '#7c521a', 900: '#653f18', 950: '#3a2309',
        },
        // Primary brand alias (teal)
        brand: {
          50: '#eaf4f3', 100: '#d3e8e6', 200: '#a7d3d0', 300: '#6fb8b4',
          400: '#2f9995', 500: '#12827f', 600: '#0e6e6e', 700: '#0c5b59',
          800: '#0b4443', 900: '#08302f', 950: '#052120',
        },
        // Event type colours
        cyclone:  { DEFAULT: '#ef4444', light: '#fee2e2' },
        flood:    { DEFAULT: '#3b82f6', light: '#dbeafe' },
        drought:  { DEFAULT: '#f97316', light: '#ffedd5' },
        sealevel: { DEFAULT: '#8b5cf6', light: '#ede9fe' },
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        // Pans a background image clipped to text for a living-texture effect.
        'text': 'text 8s ease infinite',
        'text-reverse': 'textReverse 8s ease infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        text: {
          '0%': { backgroundPosition: '0 0' },
          '50%': { backgroundPosition: '200px' },
          '100%': { backgroundPosition: '0 0' },
        },
        textReverse: {
          '0%': { backgroundPosition: '0 0' },
          '50%': { backgroundPosition: '-200px' },
          '100%': { backgroundPosition: '0 0' },
        },
      },
    },
  },
  plugins: [],
};
