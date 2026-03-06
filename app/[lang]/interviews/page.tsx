import type { Metadata } from 'next';
import { i18n } from '@/app/i18n/settings';
import { getInterviewCategories } from '@/lib/interviews';
import { InterviewViewer } from '@/components/interviews/InterviewViewer';
import { PageTransition } from '@/components/PageTransition';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InterviewsPage() {
  const categories = getInterviewCategories();
  const files = categories.flatMap((c) => c.files);

  return (
    <PageTransition>
      <div className="w-[100vw] relative left-1/2 -translate-x-1/2 px-4 md:px-6 lg:px-8">
        <InterviewViewer files={files} categories={categories} />
      </div>
    </PageTransition>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}
