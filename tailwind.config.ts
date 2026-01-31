import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Accent colors - Warm Gold/Amber
        accent: 'var(--accent)',
        'accent-light': 'var(--accent-light)',
        'accent-dark': 'var(--accent-dark)',
        // Surface colors for dark cards
        'surface-dark': '#0f0f14',
        'surface-darker': '#0a0a0f',
        'surface-card': 'rgba(15, 15, 20, 0.9)',
      },
      boxShadow: {
        brutal: '4px 4px 0 0 currentColor',
        'brutal-sm': '2px 2px 0 0 currentColor',
        'brutal-lg': '6px 6px 0 0 currentColor',
        'brutal-accent': '4px 4px 0 0 var(--accent)',
        'glow-accent': '0 0 20px rgba(251, 191, 36, 0.4)',
      },
      animation: {
        'mesh-gradient': 'mesh-gradient 15s ease infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'border-flow': 'border-flow 3s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'mesh-gradient': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.2)' },
        },
        'border-flow': {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '200% 0%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
