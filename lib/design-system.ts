/**
 * Design System Configuration
 * Centralized design tokens for the neo-brutalist theme
 */

// Color Tokens
export const colors = {
  // Accent colors - Warm Gold/Amber
  accent: {
    DEFAULT: 'var(--accent)',
    light: 'var(--accent-light)',
    dark: 'var(--accent-dark)',
  },
  // Surface colors
  surface: {
    dark: '#0f0f14',
    darker: '#0a0a0f',
    card: 'rgba(15, 15, 20, 0.9)',
  },
  // Background/foreground
  background: 'var(--background)',
  foreground: 'var(--foreground)',
} as const;

// Shadow Tokens
export const shadows = {
  brutal: '4px 4px 0 0 currentColor',
  'brutal-sm': '2px 2px 0 0 currentColor',
  'brutal-lg': '6px 6px 0 0 currentColor',
  'brutal-accent': '4px 4px 0 0 var(--accent)',
  'glow-accent': '0 0 20px rgba(251, 191, 36, 0.4)',
} as const;

// Animation Tokens
export const animations = {
  'mesh-gradient': 'mesh-gradient 15s ease infinite',
  'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
  'border-flow': 'border-flow 3s linear infinite',
  float: 'float 6s ease-in-out infinite',
} as const;

// Keyframes
export const keyframes = {
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
} as const;

// Spacing Scale (consistent across the app)
export const spacing = {
  section: {
    y: 'py-12', // Consistent section vertical padding
    gap: 'space-y-8 md:space-y-12', // Gap between sections
  },
  card: {
    padding: 'p-6 md:p-8',
    gap: 'gap-4 md:gap-6',
  },
} as const;

// Border Tokens
export const borders = {
  brutal: '3px solid',
  light: '2px solid',
} as const;

// Transition Tokens
export const transitions = {
  DEFAULT: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  fast: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  slow: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
} as const;
