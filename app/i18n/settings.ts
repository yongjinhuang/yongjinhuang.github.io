import type { Translations } from '@/types';

export const i18n = {
  defaultLocale: 'en',
  locales: ['en', 'zh'],
} as const;

export type Locale = (typeof i18n)['locales'][number];

export async function getTranslations(locale: Locale): Promise<Translations> {
  try {
    const translations = await import(`./locales/${locale}.json`);
    return translations.default as Translations;
  } catch (error) {
    console.error(`Error loading translations for ${locale}:`, error);
    const fallback = await import('./locales/en.json');
    return fallback.default as Translations;
  }
}
