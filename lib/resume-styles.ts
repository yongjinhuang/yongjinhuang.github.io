export interface ResumeSchemePalette {
  readonly accent: string;
  readonly accentVivid: string;
  readonly accentLight: string;
  readonly accentBorder: string;
}

export const RESUME_SCHEME_PALETTES: Record<string, ResumeSchemePalette> = {
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

export function buildResumeStyles(scheme: ResumeSchemePalette): string {
  return `
    .resume-root {
      --accent: ${scheme.accent};
      --accent-vivid: ${scheme.accentVivid};
      --accent-light: ${scheme.accentLight};
      --accent-border: ${scheme.accentBorder};
      --fg: #0f172a;
      --fg-muted: #475569;
      --fg-subtle: #64748b;
      --border: rgba(15, 23, 42, 0.15);
      --shadow: 3px 3px 0 rgba(15, 23, 42, 0.08);
      --font-sans: 'Plus Jakarta Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
      font-family: var(--font-sans);
      color: var(--fg);
      background: #ffffff;
      line-height: 1.42;
      font-size: 11px;
      width: 730px;
      padding: 4px;
      -webkit-font-smoothing: antialiased;
    }
    .resume-root *, .resume-root *::before, .resume-root *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    .resume-root a { color: inherit; text-decoration: none; }
    .resume-root svg { display: inline-block; vertical-align: middle; flex-shrink: 0; }
    .resume-root .page { display: flex; flex-direction: column; gap: 6.5px; width: 100%; }
    .resume-root .card { background: #ffffff; border: 1.75px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); }
    .resume-root .hero { padding: 9px 13px; }
    .resume-root .hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .resume-root .hero-left { flex: 1; min-width: 0; padding-right: 4px; }
    .resume-root .hero-name-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 3px; }
    .resume-root .hero-name { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; color: var(--fg); line-height: 1.1; }
    .resume-root .hero-tagline { font-size: 12.5px; font-weight: 700; color: var(--accent-vivid); }
    .resume-root .hero-bio { font-size: 10.2px; color: var(--fg-muted); line-height: 1.45; margin-bottom: 8px; max-width: 54ch; }
    .resume-root .social-links { display: flex; align-items: center; gap: 7px; }
    .resume-root .social-icon-btn { width: 25px; height: 25px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: #ffffff; border: 1.5px solid rgba(15, 23, 42, 0.18); box-shadow: 1.5px 1.5px 0 rgba(15, 23, 42, 0.08); color: var(--fg); }
    .resume-root .social-icon-btn svg { width: 13px; height: 13px; color: var(--fg); }
    .resume-root .hero-right { display: flex; align-items: flex-start; gap: 12px; padding-left: 13px; border-left: 1.5px solid rgba(15, 23, 42, 0.1); flex-shrink: 0; }
    .resume-root .avatar-wrap { position: relative; width: 66px; height: 66px; flex-shrink: 0; margin-right: 4px; margin-bottom: 4px; }
    .resume-root .avatar-offset { position: absolute; inset: 0; transform: translate(3.5px, 3.5px); border-radius: 10px; border: 1.5px solid var(--accent-vivid); background: var(--accent-light); }
    .resume-root .avatar-img { position: relative; width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 1.5px solid var(--fg); background: #fff; }
    .resume-root .dossier-dl { width: 245px; display: flex; flex-direction: column; }
    .resume-root .dossier-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px solid rgba(15, 23, 42, 0.08); font-size: 9.8px; }
    .resume-root .dossier-row:first-child { padding-top: 0; }
    .resume-root .dossier-row:last-child { padding-bottom: 0; border-bottom: none; }
    .resume-root .dossier-dt { display: inline-flex; align-items: center; gap: 4.5px; color: var(--fg-subtle); font-weight: 500; flex-shrink: 0; }
    .resume-root .dossier-dt svg { width: 11px; height: 11px; color: var(--accent-vivid); }
    .resume-root .dossier-dd { font-family: var(--font-mono); font-weight: 600; color: var(--fg); text-align: right; }
    .resume-root .edu-main { display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-family: var(--font-sans); font-weight: 700; }
    .resume-root .edu-logo { width: 12px; height: 12px; object-fit: contain; }
    .resume-root .badge-accent { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; padding: 0.5px 4.5px; border-radius: 4px; background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent-border); }
    .resume-root .edu-sub { display: block; font-family: var(--font-mono); font-size: 8.8px; font-weight: 500; color: var(--fg-subtle); }
    .resume-root .hero-ledger { margin-top: 7px; padding-top: 6px; border-top: 1.5px solid rgba(15, 23, 42, 0.1); display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .resume-root .stat-item { display: flex; align-items: baseline; gap: 6px; }
    .resume-root .stat-item + .stat-item { border-left: 1.5px solid rgba(15, 23, 42, 0.1); padding-left: 14px; }
    .resume-root .stat-val { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--fg); }
    .resume-root .stat-lbl { font-size: 9.8px; font-weight: 500; color: var(--fg-subtle); }
    .resume-root .section-header { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 2.5px; margin-bottom: 4.5px; border-bottom: 1.75px solid rgba(15, 23, 42, 0.14); }
    .resume-root .section-title { font-size: 13px; font-weight: 800; letter-spacing: -0.02em; color: var(--fg); }
    .resume-root .section-tagline { font-family: var(--font-mono); font-size: 9.2px; font-weight: 500; color: var(--fg-subtle); }
    .resume-root .exp-list { display: flex; flex-direction: column; gap: 5px; }
    .resume-root .exp-card { padding: 6.5px 11px; display: grid; grid-template-columns: 205px 1fr; gap: 12px; align-items: start; }
    .resume-root .exp-card-current { border-color: var(--accent-vivid); border-left: 3.5px solid var(--accent-vivid); }
    .resume-root .exp-meta { padding-right: 10px; border-right: 1px solid rgba(15, 23, 42, 0.1); display: flex; flex-direction: column; gap: 3.5px; }
    .resume-root .exp-period-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .resume-root .exp-period { font-family: var(--font-mono); font-size: 9.2px; font-weight: 600; color: var(--accent); }
    .resume-root .exp-company-row { display: flex; align-items: center; gap: 7px; }
    .resume-root .exp-logo { width: 25px; height: 25px; border-radius: 6px; border: 1px solid rgba(15, 23, 42, 0.12); padding: 2px; object-fit: contain; background: #fff; flex-shrink: 0; }
    .resume-root .exp-company-name { font-size: 11.2px; font-weight: 700; color: var(--fg); line-height: 1.2; }
    .resume-root .exp-company-link { display: inline-flex; align-items: center; gap: 3px; }
    .resume-root .exp-company-link svg { width: 9.5px; height: 9.5px; color: #94a3b8; }
    .resume-root .exp-position { font-size: 9.6px; font-weight: 500; color: var(--fg-muted); line-height: 1.25; }
    .resume-root .exp-tech-list { display: flex; flex-wrap: wrap; gap: 3px; padding-top: 1px; }
    .resume-root .tech-pill { font-family: var(--font-mono); font-size: 8.4px; font-weight: 500; padding: 1px 4.5px; border-radius: 3px; background: #f1f5f9; border: 1px solid rgba(15, 23, 42, 0.12); color: #334155; }
    .resume-root .exp-bullets { list-style: none; display: flex; flex-direction: column; gap: 2.5px; }
    .resume-root .exp-bullet { display: flex; align-items: flex-start; gap: 6px; font-size: 9.7px; line-height: 1.37; color: #334155; }
    .resume-root .exp-dot { width: 4px; height: 4px; border-radius: 999px; background: var(--accent-vivid); margin-top: 5px; flex-shrink: 0; }
    .resume-root .exp-bullet strong { font-weight: 700; color: var(--accent); }
    .resume-root .exp-bullet code { font-family: var(--font-mono); font-size: 9px; background: #f1f5f9; border: 1px solid rgba(15, 23, 42, 0.1); padding: 0.5px 3.5px; border-radius: 3px; color: #0f172a; }
    .resume-root .exp-bullet a { color: var(--accent); font-weight: 600; }
    .resume-root .skills-card { padding: 6.5px 11px; }
    .resume-root .skills-row { display: flex; align-items: center; gap: 12px; padding: 3.5px 0; border-bottom: 1px solid rgba(15, 23, 42, 0.08); }
    .resume-root .skills-row:first-child { padding-top: 0; }
    .resume-root .skills-row:last-child { padding-bottom: 0; border-bottom: none; }
    .resume-root .skills-dt { width: 155px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; font-size: 9.8px; font-weight: 700; color: var(--fg); }
    .resume-root .skills-dt svg { width: 11px; height: 11px; color: var(--accent-vivid); }
    .resume-root .skills-dd { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
    .resume-root .skill-badge { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 8.5px; font-weight: 500; padding: 1px 5px; border-radius: 4px; background: #fff; border: 1.25px solid rgba(15, 23, 42, 0.16); box-shadow: 1.5px 1.5px 0 rgba(15, 23, 42, 0.08); color: var(--fg); }
    .resume-root .skill-badge svg { width: 10px; height: 10px; color: var(--accent-vivid); }
  `;
}
