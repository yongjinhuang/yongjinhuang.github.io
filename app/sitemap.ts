import type { MetadataRoute } from 'next';
import { i18n } from './i18n/settings';

export const dynamic = 'force-static';

const BASE_URL = 'https://yongjinhuang.github.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of i18n.locales) {
    entries.push({
      url: `${BASE_URL}/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
      alternates: {
        languages: Object.fromEntries(
          i18n.locales.map((l) => [l, `${BASE_URL}/${l}`])
        ),
      },
    });
  }

  return entries;
}
