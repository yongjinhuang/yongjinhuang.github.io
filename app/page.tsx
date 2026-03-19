import type { Metadata } from 'next';
import { i18n } from './i18n/settings';
import { BASE_URL, META, OG_IMAGE, SITE_NAME } from '@/lib/seo';

const DEFAULT_LOCALE = i18n.defaultLocale;
const meta = META[DEFAULT_LOCALE];

export const metadata: Metadata = {
  title: meta.homeTitle,
  description: meta.homeDescription,
  alternates: {
    canonical: `${BASE_URL}/${DEFAULT_LOCALE}`,
    languages: Object.fromEntries(
      i18n.locales.map((l) => [l, `${BASE_URL}/${l}`])
    ),
  },
  openGraph: {
    type: 'profile',
    url: `${BASE_URL}/${DEFAULT_LOCALE}`,
    title: meta.homeTitle,
    description: meta.homeDescription,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Yongjin Huang — Software Engineer',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: meta.homeTitle,
    description: meta.homeDescription,
    images: [{ url: OG_IMAGE, alt: 'Yongjin Huang — Software Engineer' }],
  },
};

export default function Home() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=/${DEFAULT_LOCALE}`} />
      <p style={{ textAlign: 'center', marginTop: '2rem' }}>
        Redirecting to <a href={`/${DEFAULT_LOCALE}`}>portfolio</a>...
      </p>
    </>
  );
}
