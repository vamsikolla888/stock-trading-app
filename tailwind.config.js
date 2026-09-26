/**
 * Semantic tokens mirror src/theme/tokens.ts (and the web client's tokens.css). Pair
 * every light class with its `-dark` counterpart under `dark:`, e.g.
 * `bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx,ts,tsx}',
    './src/components/**/*.{js,jsx,ts,tsx}',
    './src/features/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: { DEFAULT: '#ffffff', dark: '#111417' },
        surface: {
          DEFAULT: '#ffffff',
          sunk: '#f7f8fa',
          dark: '#1a1e23',
          'sunk-dark': '#171b1f',
        },
        ink: {
          DEFAULT: '#171a1f',
          muted: '#4a4e5a',
          faint: '#6a6f7b',
          dark: '#eceff3',
          'dark-muted': '#a2a8b3',
          'dark-faint': '#828896',
        },
        line: {
          DEFAULT: '#eceef2',
          strong: '#d7dae1',
          dark: '#252a30',
          'dark-strong': '#3a4149',
        },
        // Vivid fill for icons/markers only; `strong` for button fills (AA with white
        // text); `text` for links and gains (AA on the page).
        brand: {
          DEFAULT: '#00b386',
          strong: '#00805e',
          text: '#007854',
          wash: '#e4f7f0',
          'strong-dark': '#00a97e',
          'text-dark': '#00d09c',
          'wash-dark': '#0c2a22',
        },
        primary: {
          50: '#f0fbf7',
          100: '#e4f7f0',
          200: '#cdf3e3',
          300: '#9ce2c6',
          400: '#24bf92',
          500: '#00b386',
          600: '#00805e',
          700: '#007854',
          800: '#005c41',
          900: '#0c2a22',
        },
        success: { 500: '#00b386', 600: '#007854', wash: '#e4f7f0', 'wash-dark': '#0c2a22' },
        danger: {
          500: '#eb5b3c',
          600: '#c0392a',
          dark: '#ff8062',
          wash: '#fdeee9',
          'wash-dark': '#2c1712',
        },
        warning: {
          500: '#db9c00',
          600: '#8a6212',
          dark: '#f5bc57',
          wash: '#fdf3e0',
          'wash-dark': '#2a2210',
        },
        info: { DEFAULT: '#2e5fa3', dark: '#8ab0e6', wash: '#ebf1fa', 'wash-dark': '#151e2b' },
      },
      borderRadius: {
        field: '10px',
        card: '14px',
        hero: '22px',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@gluestack-ui/nativewind-utils/tailwind-plugin'),
  ],
};
