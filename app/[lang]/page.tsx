import { Locale } from '@/app/i18n/settings';
import { getTranslations } from '../i18n/settings';
import { Skills } from '@/components/Profile/Skills';
import { Experience } from '@/components/Profile/Experience';
import { Details } from '@/components/Profile/Details';
import { Intro } from '@/components/Profile/Intro';
import { Education } from '@/components/Profile/Education';
import { PageTransition } from '@/components/PageTransition';

interface Props {
  params: Promise<{ lang: Locale }>;
}

const Divider = () => (
  <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent my-8 md:my-12"></div>
);

export default async function Home({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations(lang);

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto space-y-8 md:space-y-12">
        {/* Profile Section */}
        <Intro
          resumeFile={t.intro.resumeFile}
          // resumePrompt={t.intro.resumePrompt}
          title={t.intro.title}
          introduction={t.intro.introduction}
          links={t.intro.links}
          greeting={t.intro.greeting}
          name={t.intro.name}
          tagline={t.intro.tagline}
          viewResume={t.intro.viewResume}
          hireMe={t.intro.hireMe}
        />

        {/* Details Section */}
        <Details t={t} />
        <Divider />

        {/* Skills and Education Section - Full width on mobile, side by side on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <Education t={t} />
          <Skills t={t} />
        </div>
        <Divider />

        {/* Experience Section */}
        <Experience t={t} />
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
