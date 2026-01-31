import { Locale, getTranslations } from '@/app/i18n/settings';
import { PageTransition } from '@/components/PageTransition';
import { Divider } from '@/components/ui';
import {
  Intro,
  Details,
  Education,
  Skills,
  Experience,
} from '@/components/sections';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export default async function Home({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations(lang);

  return (
    <PageTransition>
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

// Add this function to generate static paths
export function generateStaticParams() {
  // Add all languages you want to support
  return [
    { lang: 'en' },
    { lang: 'zh' }, // Add other languages as needed
  ];
}
