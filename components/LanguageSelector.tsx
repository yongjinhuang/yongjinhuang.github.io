'use client';

import { usePathname, useRouter } from 'next/navigation';
import { i18n } from '@/app/i18n/settings';
import React from 'react';

export default function LanguageSelector() {
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (lang: string) => {
    // Store the current scroll position
    sessionStorage.setItem('scrollPosition', window.scrollY.toString());

    // Update the URL with the new locale
    const segments = pathname.split('/');
    if (segments.length > 1) {
      segments[1] = lang;
    } else {
      segments.push(lang);
    }
    const newPath = segments.join('/');
    router.push(newPath);
  };

  // Restore the scroll position after the page loads
  React.useEffect(() => {
    const scrollPosition = sessionStorage.getItem('scrollPosition');
    if (scrollPosition) {
      window.scrollTo(0, parseInt(scrollPosition, 10));
      sessionStorage.removeItem('scrollPosition');
    }
  }, []);

  return (
    <div className="flex space-x-4">
      {i18n.locales.map((locale) => (
        <button
          key={locale}
          onClick={() => handleLanguageChange(locale)}
          className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-amber-600 dark:hover:text-accent transition-colors"
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
