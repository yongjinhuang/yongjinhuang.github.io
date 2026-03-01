import { i18n } from '@/app/i18n/settings';
import { getInterviewCategories } from '@/lib/interviews';
import { InterviewViewer } from '@/components/interviews/InterviewViewer';
import { PageTransition } from '@/components/PageTransition';

export default function InterviewsPage() {
  const categories = getInterviewCategories();
  const files = categories.flatMap((c) => c.files);

  return (
    <PageTransition>
      <div className="-mx-4 md:-mx-8 lg:-mx-12 xl:-mx-16 px-4 md:px-8 lg:px-12 xl:px-16">
        <InterviewViewer files={files} categories={categories} />
      </div>
    </PageTransition>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}
