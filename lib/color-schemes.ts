export const COLOR_SCHEME_NAMES = [
  'amber',
  'aurora',
  'sunset',
  'ocean',
  'violet',
  'rose',
] as const;

export type ColorSchemeName = (typeof COLOR_SCHEME_NAMES)[number];

export const SCHEME_DISPLAY_COLORS: Record<ColorSchemeName, string> = {
  amber: '#d97706',
  aurora: '#059669',
  sunset: '#dc2626',
  ocean: '#2563eb',
  violet: '#7c3aed',
  rose: '#e11d48',
};

export const STORAGE_KEY = 'color-scheme-override';
