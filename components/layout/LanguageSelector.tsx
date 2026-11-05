'use client';

import { usePathname, useRouter } from 'next/navigation';
import { i18n } from '@/app/i18n/settings';
import React from 'react';

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  zh: '中',
};

export function LanguageSelector() {
  const router = useRouter();
  const pathname = usePathname() || '/en';

  const segments = pathname.split('/').filter(Boolean);
  const activeLocale = segments[0] === 'zh' ? 'zh' : 'en';

  const handleLanguageChange = (lang: string) => {
    if (lang === activeLocale) return;

    try {
      sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    } catch {
      // Ignore sessionStorage errors in restricted contexts
    }

    const rawSegments = pathname.split('/');
    if (rawSegments.length > 1) {
      rawSegments[1] = lang;
    } else {
      rawSegments.push(lang);
    }
    const newPath = rawSegments.join('/') || `/${lang}`;
    router.push(newPath);
  };

  React.useEffect(() => {
    document.documentElement.lang = activeLocale;
  }, [activeLocale]);

  React.useEffect(() => {
    try {
      const scrollPosition = sessionStorage.getItem('scrollPosition');
      if (scrollPosition) {
        window.scrollTo(0, parseInt(scrollPosition, 10));
        sessionStorage.removeItem('scrollPosition');
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, []);

  return (
    <div
      role="group"
      aria-label="Language selector"
      className="inline-flex items-center p-0.5 rounded-lg bg-gray-100 dark:bg-white/5 border-2 border-gray-200 dark:border-white/15"
    >
      {i18n.locales.map((locale) => {
        const isActive = activeLocale === locale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => handleLanguageChange(locale)}
            aria-pressed={isActive}
            aria-label={
              locale === 'zh' ? 'Switch to Chinese' : 'Switch to English'
            }
            className={`px-2.5 py-1 rounded-md text-xs font-mono leading-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isActive
                ? 'bg-accent text-[var(--accent-foreground,#000)] font-bold'
                : 'font-medium text-gray-600 dark:text-gray-300 hover:text-accent dark:hover:text-accent'
            }`}
          >
            {LOCALE_LABELS[locale] ?? locale.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSelector;
