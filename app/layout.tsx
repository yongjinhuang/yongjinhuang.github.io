import type { Metadata } from 'next';
import { BASE_URL, OG_IMAGE, SITE_NAME } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Yongjin Huang — Software Engineer',
    template: '%s | Yongjin Huang',
  },
  description:
    'Full-stack engineer with experience at Shopee, Huawei & startups. Go, TypeScript, Python, React, distributed systems.',
  keywords: [
    'Yongjin Huang',
    'software engineer',
    'full-stack developer',
    'Shopee',
    'Huawei',
    'Java',
    'Go',
    'TypeScript',
    'React',
    'distributed systems',
    'Shenzhen',
  ],
  openGraph: {
    type: 'website',
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
  twitter: { card: 'summary_large_image' },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
