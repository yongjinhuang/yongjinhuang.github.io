import type { Translations } from '@/types';

export const i18n = {
  defaultLocale: 'en',
  locales: ['en', 'zh'],
} as const;

export type Locale = (typeof i18n)['locales'][number];

export function isValidLocale(lang: string): lang is Locale {
  return (i18n.locales as readonly string[]).includes(lang);
}

export function resolveLocale(lang: string): Locale {
  return isValidLocale(lang) ? lang : i18n.defaultLocale;
}

export async function getTranslations(locale: Locale): Promise<Translations> {
  const safeLocale = resolveLocale(locale);
  try {
    const translations = await import(`./locales/${safeLocale}.json`);
    return translations.default as Translations;
  } catch (error) {
    console.error(`Error loading translations for ${safeLocale}:`, error);
    const fallback = await import('./locales/en.json');
    return fallback.default as Translations;
  }
}
