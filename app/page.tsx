import type { Metadata } from 'next';
import { i18n } from './i18n/settings';
import { BASE_URL } from '@/lib/seo';
import { ClientRedirect } from '@/components/ClientRedirect';

const DEFAULT_LOCALE = i18n.defaultLocale;

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: {
    canonical: `${BASE_URL}/${DEFAULT_LOCALE}`,
    languages: Object.fromEntries(
      i18n.locales.map((l) => [l, `${BASE_URL}/${l}`])
    ),
  },
};

export default function Home() {
  return (
    <>
      <ClientRedirect to={`/${DEFAULT_LOCALE}`} />
      <p style={{ textAlign: 'center', marginTop: '2rem' }}>
        Redirecting to <a href={`/${DEFAULT_LOCALE}`}>portfolio</a>…
      </p>
    </>
  );
}
