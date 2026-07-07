/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './public/index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Vanuatu national palette, standardised across the portal ──
        // green #009543 · red #D21034 · gold #FDCE12 · black. Overriding
        // Tailwind's default green/red/gold scales themes every utility class
        // (bg-green-700, text-red-600, …) to the flag colours.
        green: {
          50: '#eefbf3', 100: '#d6f5e4', 200: '#a5e3c0', 300: '#6fd39d',
          400: '#34c273', 500: '#18b25b', 600: '#009543', 700: '#00713a',
          800: '#063a26', 900: '#04231a', 950: '#04231a',
        },
        emerald: {
          50: '#eefbf3', 100: '#d6f5e4', 200: '#a5e3c0', 300: '#6fd39d',
          400: '#34c273', 500: '#18b25b', 600: '#009543', 700: '#00713a',
          800: '#063a26', 900: '#04231a', 950: '#04231a',
        },
        red: {
          50: '#fef2f4', 100: '#fde0e5', 200: '#fbc7d0', 300: '#f59aab',
          400: '#ee6480', 500: '#e8324f', 600: '#d21034', 700: '#a20c28',
          800: '#87102a', 900: '#6f1026', 950: '#4d0b1a',
        },
        yellow: {
          50: '#fff9e6', 100: '#fff6d6', 200: '#ffe9a3', 300: '#ffdd6f',
          400: '#ffd94a', 500: '#f5c518', 600: '#d9a800', 700: '#a87f00',
          800: '#7a5c00', 900: '#5c4500', 950: '#3d2e00',
        },
        amber: {
          50: '#fff9e6', 100: '#fff6d6', 200: '#ffe9a3', 300: '#ffdd6f',
          400: '#ffd94a', 500: '#f5c518', 600: '#d9a800', 700: '#a87f00',
          800: '#7a5c00', 900: '#5c4500', 950: '#3d2e00',
        },
        // Primary brand alias (Vanuatu green)
        brand: {
          50: '#eefbf3', 100: '#d6f5e4', 200: '#a5e3c0', 300: '#6fd39d',
          400: '#34c273', 500: '#18b25b', 600: '#009543', 700: '#00713a',
          800: '#063a26', 900: '#04231a', 950: '#04231a',
        },
        // Event type colours
        cyclone:  { DEFAULT: '#ef4444', light: '#fee2e2' },
        flood:    { DEFAULT: '#3b82f6', light: '#dbeafe' },
        drought:  { DEFAULT: '#f97316', light: '#ffedd5' },
        sealevel: { DEFAULT: '#8b5cf6', light: '#ede9fe' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
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
      },
    },
  },
  plugins: [],
};
