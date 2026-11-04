import type { Metadata } from 'next';
import { i18n } from '@/app/i18n/settings';
import { getAvailableVaults, getVaultCategories } from '@/lib/vaults';
import { InterviewViewer } from '@/components/interviews/InterviewViewer';
import { PageTransition } from '@/components/PageTransition';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InterviewsPage() {
  const vaults = getAvailableVaults();
  const vaultData = Object.fromEntries(
    vaults.map((v) => {
      const categories = getVaultCategories(v.name);
      const files = categories.flatMap((c) => c.files);
      return [v.name, { categories, files }];
    })
  );

  return (
    <PageTransition>
      <div className="w-full max-w-[1600px] mx-auto">
        <InterviewViewer vaults={vaults} vaultData={vaultData} />
      </div>
    </PageTransition>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}
