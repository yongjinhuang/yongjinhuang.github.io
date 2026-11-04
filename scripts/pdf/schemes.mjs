import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.join(__dirname, '..', '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const LOCALES_DIR = path.join(ROOT_DIR, 'app', 'i18n', 'locales');

export const SCHEMES = {
  amber: { accent: '#b45309', accentVivid: '#d97706', accentLight: '#fef3c7', accentBorder: '#f59e0b' },
  aurora: { accent: '#047857', accentVivid: '#059669', accentLight: '#d1fae5', accentBorder: '#10b981' },
  sunset: { accent: '#b91c1c', accentVivid: '#dc2626', accentLight: '#fee2e2', accentBorder: '#ef4444' },
  ocean: { accent: '#1d4ed8', accentVivid: '#2563eb', accentLight: '#dbeafe', accentBorder: '#3b82f6' },
  violet: { accent: '#6d28d9', accentVivid: '#7c3aed', accentLight: '#ede9fe', accentBorder: '#8b5cf6' },
  rose: { accent: '#be123c', accentVivid: '#e11d48', accentLight: '#ffe4e6', accentBorder: '#f43f5e' },
  cyan: { accent: '#0e7490', accentVivid: '#0891b2', accentLight: '#cffafe', accentBorder: '#06b6d4' },
  indigo: { accent: '#4338ca', accentVivid: '#4f46e5', accentLight: '#e0e7ff', accentBorder: '#6366f1' },
  lime: { accent: '#4d7c0f', accentVivid: '#65a30d', accentLight: '#ecfccb', accentBorder: '#84cc16' },
  orange: { accent: '#c2410c', accentVivid: '#ea580c', accentLight: '#ffedd5', accentBorder: '#f97316' },
  fuchsia: { accent: '#a21caf', accentVivid: '#c026d3', accentLight: '#fae8ff', accentBorder: '#d946ef' },
  slate: { accent: '#334155', accentVivid: '#475569', accentLight: '#f1f5f9', accentBorder: '#64748b' },
};

const MIME_MAP = {
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export function toDataUri(relPath) {
  const fullPath = path.join(PUBLIC_DIR, relPath.replace(/^\//, ''));
  if (!fs.existsSync(fullPath)) return '';
  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  const base64 = fs.readFileSync(fullPath).toString('base64');
  return `data:${mime};base64,${base64}`;
}

export function buildFontFacesCss() {
  const fonts = [
    { family: 'Plus Jakarta Sans', weight: 400, file: 'fonts/plus-jakarta-sans-v12-latin-regular.woff2' },
    { family: 'Plus Jakarta Sans', weight: 500, file: 'fonts/plus-jakarta-sans-v12-latin-500.woff2' },
    { family: 'Plus Jakarta Sans', weight: 600, file: 'fonts/plus-jakarta-sans-v12-latin-600.woff2' },
    { family: 'Plus Jakarta Sans', weight: 700, file: 'fonts/plus-jakarta-sans-v12-latin-700.woff2' },
    { family: 'Plus Jakarta Sans', weight: 800, file: 'fonts/plus-jakarta-sans-v12-latin-800.woff2' },
    { family: 'JetBrains Mono', weight: 400, file: 'fonts/jetbrains-mono-v24-latin-regular.woff2' },
    { family: 'JetBrains Mono', weight: 500, file: 'fonts/jetbrains-mono-v24-latin-500.woff2' },
    { family: 'JetBrains Mono', weight: 600, file: 'fonts/jetbrains-mono-v24-latin-600.woff2' },
    { family: 'JetBrains Mono', weight: 700, file: 'fonts/jetbrains-mono-v24-latin-700.woff2' },
  ];

  return fonts
    .map(
      (f) => `
@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  src: url('${toDataUri(f.file)}') format('woff2');
}`
    )
    .join('\n');
}
