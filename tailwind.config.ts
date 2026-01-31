import type { Config } from 'tailwindcss';
import { colors, shadows, animations, keyframes } from './lib/design-system';

export default {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: colors.background,
        foreground: colors.foreground,
        accent: colors.accent.DEFAULT,
        'accent-light': colors.accent.light,
        'accent-dark': colors.accent.dark,
        'surface-dark': colors.surface.dark,
        'surface-darker': colors.surface.darker,
        'surface-card': colors.surface.card,
      },
      boxShadow: shadows,
      animation: animations,
      keyframes: keyframes,
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      // Custom border width for brutal design
      borderWidth: {
        '3': '3px',
      },
    },
  },
  plugins: [],
} satisfies Config;
