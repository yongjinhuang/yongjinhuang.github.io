import { getTranslations } from '@/app/i18n/settings';
import { Locale } from '@/app/i18n/settings';

interface FooterProps {
  params: Promise<{ lang: string }>;
}

export async function Footer({ params }: FooterProps) {
  const { lang: rawLang } = await params;
  const lang = rawLang as Locale;
  const t = await getTranslations(lang);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-3 border-gray-200 dark:border-white/10 py-6 mt-12">
      <div className="max-w-4xl mx-auto text-center px-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
          <span className="text-accent font-mono font-bold">{year}</span>
          <span className="mx-2">|</span>
          {t.footer.name}
          <span className="mx-2">|</span>
          <span className="text-gray-500 dark:text-gray-500">
            All rights reserved.
          </span>
        </p>
      </div>
    </footer>
  );
}
