import { i18n } from '@/app/i18n/settings';
import { getInterviewFiles } from '@/lib/interviews';
import { InterviewViewer } from '@/components/interviews/InterviewViewer';
import { PageTransition } from '@/components/PageTransition';

export default function InterviewsPage() {
  const files = getInterviewFiles();

  return (
    <PageTransition>
      <InterviewViewer files={files} />
    </PageTransition>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}
