import { Font } from '@react-pdf/renderer';
import { SKILL_ICONS, getSkillIcon } from '@/lib/skills';

export { SKILL_ICONS, getSkillIcon };

export interface ResumeSchemePalette {
  readonly accent: string;
  readonly accentVivid: string;
  readonly accentLight: string;
  readonly accentBorder: string;
}

export const RESUME_SCHEMES: Record<string, ResumeSchemePalette> = {
  amber: {
    accent: '#b45309',
    accentVivid: '#d97706',
    accentLight: '#fef3c7',
    accentBorder: '#f59e0b',
  },
  aurora: {
    accent: '#047857',
    accentVivid: '#059669',
    accentLight: '#d1fae5',
    accentBorder: '#10b981',
  },
  sunset: {
    accent: '#b91c1c',
    accentVivid: '#dc2626',
    accentLight: '#fee2e2',
    accentBorder: '#ef4444',
  },
  ocean: {
    accent: '#1d4ed8',
    accentVivid: '#2563eb',
    accentLight: '#dbeafe',
    accentBorder: '#3b82f6',
  },
  violet: {
    accent: '#6d28d9',
    accentVivid: '#7c3aed',
    accentLight: '#ede9fe',
    accentBorder: '#8b5cf6',
  },
  rose: {
    accent: '#be123c',
    accentVivid: '#e11d48',
    accentLight: '#ffe4e6',
    accentBorder: '#f43f5e',
  },
  cyan: {
    accent: '#0e7490',
    accentVivid: '#0891b2',
    accentLight: '#cffafe',
    accentBorder: '#06b6d4',
  },
  indigo: {
    accent: '#4338ca',
    accentVivid: '#4f46e5',
    accentLight: '#e0e7ff',
    accentBorder: '#6366f1',
  },
  lime: {
    accent: '#4d7c0f',
    accentVivid: '#65a30d',
    accentLight: '#ecfccb',
    accentBorder: '#84cc16',
  },
  orange: {
    accent: '#c2410c',
    accentVivid: '#ea580c',
    accentLight: '#ffedd5',
    accentBorder: '#f97316',
  },
  fuchsia: {
    accent: '#a21caf',
    accentVivid: '#c026d3',
    accentLight: '#fae8ff',
    accentBorder: '#d946ef',
  },
  slate: {
    accent: '#334155',
    accentVivid: '#475569',
    accentLight: '#f1f5f9',
    accentBorder: '#64748b',
  },
};

let fontsRegistered = false;

export function registerResumeFonts(baseUrl = ''): void {
  if (fontsRegistered) return;
  fontsRegistered = true;

  Font.register({
    family: 'PlusJakartaSans',
    fonts: [
      {
        src: `${baseUrl}/fonts/PlusJakartaSans-Regular.ttf`,
        fontWeight: 400,
      },
      {
        src: `${baseUrl}/fonts/PlusJakartaSans-Medium.ttf`,
        fontWeight: 500,
      },
      {
        src: `${baseUrl}/fonts/PlusJakartaSans-Bold.ttf`,
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: 'JetBrainsMono',
    fonts: [
      {
        src: `${baseUrl}/fonts/JetBrainsMono-Regular.ttf`,
        fontWeight: 400,
      },
      {
        src: `${baseUrl}/fonts/JetBrainsMono-Medium.ttf`,
        fontWeight: 500,
      },
      {
        src: `${baseUrl}/fonts/JetBrainsMono-Bold.ttf`,
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: 'NotoSansSC',
    fonts: [
      {
        src: `${baseUrl}/fonts/NotoSansSC-Regular.otf`,
        fontWeight: 400,
      },
      {
        src: `${baseUrl}/fonts/NotoSansSC-Bold.otf`,
        fontWeight: 700,
      },
    ],
  });

  Font.registerHyphenationCallback((word) => [word]);
}
