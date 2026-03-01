import type { Metadata } from 'next';
import { Locale, i18n, getTranslations } from '@/app/i18n/settings';
import { PageTransition } from '@/components/PageTransition';
import { Divider } from '@/components/ui';
import {
  Intro,
  Details,
  Education,
  Skills,
  Experience,
} from '@/components/sections';
import { JsonLd } from '@/components/JsonLd';
import { BASE_URL, META, OG_IMAGE, SITE_NAME } from '@/lib/seo';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const meta = META[lang] ?? META.en;

  return {
    title: meta.homeTitle,
    description: meta.homeDescription,
    alternates: {
      canonical: `${BASE_URL}/${lang}`,
      languages: Object.fromEntries(
        i18n.locales.map((l) => [l, `${BASE_URL}/${l}`])
      ),
    },
    openGraph: {
      type: 'profile',
      url: `${BASE_URL}/${lang}`,
      title: meta.homeTitle,
      description: meta.homeDescription,
      siteName: SITE_NAME,
      images: [
        { url: OG_IMAGE, width: 800, height: 800, alt: 'Yongjin Huang' },
      ],
      locale: lang === 'zh' ? 'zh_CN' : 'en_US',
    },
    twitter: {
      card: 'summary',
      title: meta.homeTitle,
      description: meta.homeDescription,
      images: [OG_IMAGE],
    },
  };
}

export default async function Home({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations(lang);

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${t.intro.name.first} ${t.intro.name.last}`,
    jobTitle: t.intro.tagline,
    description: t.intro.introduction,
    url: `${BASE_URL}/${lang}`,
    image: OG_IMAGE,
    sameAs: [t.intro.links.github, t.intro.links.linkedin],
    knowsAbout: [
      ...t.skills.languages.value,
      ...t.skills.frameworks.value,
      ...t.skills.tools.value,
    ],
  };

  return (
    <PageTransition>
      <JsonLd data={personSchema} />
      <div className="max-w-7xl mx-auto space-y-8 md:space-y-12">
        <Intro intro={t.intro} />
        <Details details={t.details} />
        <Divider />
        <Education education={t.education} />
        <Divider />
        <Skills skills={t.skills} />
        <Divider />
        <Experience experience={t.experience} />
      </div>
    </PageTransition>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}
