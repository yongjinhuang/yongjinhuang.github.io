'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { i18n } from './i18n/settings';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${i18n.defaultLocale}`);
  }, [router]);

  return null;
}
