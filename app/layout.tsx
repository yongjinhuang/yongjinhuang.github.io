import type { Metadata } from 'next';
import { BASE_URL, OG_IMAGE, SITE_NAME } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Yongjin Huang — Software Engineer',
    template: '%s | Yongjin Huang',
  },
  description: 'Personal website of Yongjin Huang, a software engineer.',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    images: [{ url: OG_IMAGE }],
  },
  twitter: { card: 'summary' },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
