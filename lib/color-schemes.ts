export const COLOR_SCHEME_NAMES = [
  'amber',
  'aurora',
  'sunset',
  'ocean',
  'violet',
  'rose',
  'cyan',
  'indigo',
  'lime',
  'orange',
  'fuchsia',
  'slate',
] as const;

export type ColorSchemeName = (typeof COLOR_SCHEME_NAMES)[number];

export const SCHEME_DISPLAY_COLORS: Record<ColorSchemeName, string> = {
  amber: '#d97706',
  aurora: '#059669',
  sunset: '#dc2626',
  ocean: '#2563eb',
  violet: '#7c3aed',
  rose: '#e11d48',
  cyan: '#0891b2',
  indigo: '#4f46e5',
  lime: '#65a30d',
  orange: '#ea580c',
  fuchsia: '#c026d3',
  slate: '#475569',
};

export const STORAGE_KEY = 'color-scheme-override';
