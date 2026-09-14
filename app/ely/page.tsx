import type { Metadata } from 'next';
import ElyCorner from './ElyCorner';

export const metadata: Metadata = {
  title: { absolute: 'Our little corner' },
  description: 'A little place, made with care.',
  keywords: [],
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: 'Our little corner',
    description: 'A little place, made with care.',
    siteName: 'Our little corner',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'Our little corner',
    description: 'A little place, made with care.',
    images: [],
  },
};

export default function ElyPage() {
  return <ElyCorner />;
}
