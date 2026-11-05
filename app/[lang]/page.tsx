import type { Metadata } from 'next';
import {
  i18n,
  isValidLocale,
  getTranslations,
  type Locale,
} from '@/app/i18n/settings';
import { JsonLd, PageTransition } from '@/components/layout';
import { CollapsibleSection } from '@/components/ui';
import { Intro, Skills, Experience } from '@/components/sections';
import { BASE_URL, META, OG_IMAGE, SELFIE_IMAGE, SITE_NAME } from '@/lib/seo';
import { formatFullName } from '@/lib/utils';

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Locale = isValidLocale(rawLang) ? rawLang : i18n.defaultLocale;
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
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ],
      locale: lang === 'zh' ? 'zh_CN' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.homeTitle,
      description: meta.homeDescription,
      images: [{ url: OG_IMAGE, alt: SITE_NAME }],
    },
  };
}

export default async function Home({ params }: Props) {
  const { lang: rawLang } = await params;
  const lang: Locale = isValidLocale(rawLang) ? rawLang : i18n.defaultLocale;
  const t = await getTranslations(lang);

  const fullName = formatFullName(t.intro.name.first, t.intro.name.last);

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: fullName,
    jobTitle: t.intro.tagline,
    description: t.intro.introduction,
    url: `${BASE_URL}/${lang}`,
    image: SELFIE_IMAGE,
    sameAs: [t.intro.links.github, t.intro.links.linkedin],
    knowsAbout: [
      ...t.skills.languages.value,
      ...t.skills.frameworks.value,
      ...t.skills.tools.value,
    ],
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: t.education.university,
    },
    worksFor: Object.values(t.experience.company)
      .slice(0, 1)
      .map((c) => ({
        '@type': 'Organization',
        name: c.name,
      }))[0],
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: BASE_URL,
    inLanguage: [lang === 'zh' ? 'zh-CN' : 'en'],
    author: {
      '@type': 'Person',
      name: fullName,
    },
  };

  return (
    <PageTransition>
      <JsonLd data={personSchema} />
      <JsonLd data={websiteSchema} />
      <div className="space-y-8 md:space-y-10">
        {/* Hero Dossier (with Avatar + Education & Contact Details beside Avatar) */}
        <Intro
          intro={t.intro}
          details={t.details}
          education={t.education}
          translations={t}
          locale={lang}
        />

        {/* Experience */}
        <Experience experience={t.experience} />

        {/* Skills */}
        <CollapsibleSection
          id="skills"
          tagline={t.skills.tagline}
          title={t.skills.title}
        >
          <Skills skills={t.skills} />
        </CollapsibleSection>
      </div>
    </PageTransition>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}
