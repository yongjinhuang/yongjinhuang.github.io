import { Font } from '@react-pdf/renderer';
import { FaCode, FaJava, FaDatabase, FaRobot, FaBrain } from 'react-icons/fa';
import {
  SiGo,
  SiPython,
  SiTypescript,
  SiFastapi,
  SiLangchain,
  SiDjango,
  SiSpringboot,
  SiReact,
  SiNextdotjs,
  SiGit,
  SiLinux,
  SiDocker,
  SiKubernetes,
  SiPostgresql,
  SiMysql,
  SiRedis,
  SiMongodb,
  SiApachekafka,
  SiHelm,
  SiOpentelemetry,
} from 'react-icons/si';
import type { IconType } from 'react-icons';

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

export const SKILL_ICONS: Record<string, IconType> = {
  golang: SiGo,
  go: SiGo,
  python: SiPython,
  typescript: SiTypescript,
  java: FaJava,
  sql: FaDatabase,
  gin: SiGo,
  fastapi: SiFastapi,
  langchain: SiLangchain,
  'langchain / langgraph': SiLangchain,
  'ai agents': FaRobot,
  'llm / rag': FaBrain,
  django: SiDjango,
  'spring boot': SiSpringboot,
  react: SiReact,
  'next.js': SiNextdotjs,
  git: SiGit,
  linux: SiLinux,
  docker: SiDocker,
  k8s: SiKubernetes,
  kubernetes: SiKubernetes,
  postgresql: SiPostgresql,
  mysql: SiMysql,
  redis: SiRedis,
  mongodb: SiMongodb,
  kafka: SiApachekafka,
  helm: SiHelm,
  opentelemetry: SiOpentelemetry,
  default: FaCode,
};

let fontsRegistered = false;

export function registerResumeFonts(baseUrl = ''): void {
  if (fontsRegistered) return;
  fontsRegistered = true;

  Font.register({
    family: 'PlusJakartaSans',
    fonts: [
      {
        src: `${baseUrl}/fonts/plus-jakarta-sans-v12-latin-regular.woff2`,
        fontWeight: 400,
      },
      {
        src: `${baseUrl}/fonts/plus-jakarta-sans-v12-latin-500.woff2`,
        fontWeight: 500,
      },
      {
        src: `${baseUrl}/fonts/plus-jakarta-sans-v12-latin-600.woff2`,
        fontWeight: 600,
      },
      {
        src: `${baseUrl}/fonts/plus-jakarta-sans-v12-latin-700.woff2`,
        fontWeight: 700,
      },
      {
        src: `${baseUrl}/fonts/plus-jakarta-sans-v12-latin-800.woff2`,
        fontWeight: 800,
      },
    ],
  });

  Font.register({
    family: 'JetBrainsMono',
    fonts: [
      {
        src: `${baseUrl}/fonts/jetbrains-mono-v24-latin-regular.woff2`,
        fontWeight: 400,
      },
      {
        src: `${baseUrl}/fonts/jetbrains-mono-v24-latin-500.woff2`,
        fontWeight: 500,
      },
      {
        src: `${baseUrl}/fonts/jetbrains-mono-v24-latin-600.woff2`,
        fontWeight: 600,
      },
      {
        src: `${baseUrl}/fonts/jetbrains-mono-v24-latin-700.woff2`,
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: 'NotoSansSC',
    fonts: [
      {
        src: `${baseUrl}/fonts/noto-sans-sc-v37-chinese-simplified-regular.woff`,
        fontWeight: 400,
      },
      {
        src: `${baseUrl}/fonts/noto-sans-sc-v37-chinese-simplified-700.woff`,
        fontWeight: 700,
      },
    ],
  });

  Font.registerHyphenationCallback((word) => [word]);
}
