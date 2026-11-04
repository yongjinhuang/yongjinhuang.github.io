import type { Metadata } from 'next';
import { getAvailableVaults, getVaultCategories } from '@/lib/vaults';
import { InterviewViewer } from '@/components/interviews/InterviewViewer';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ColorSchemeProvider } from '@/components/ColorSchemeProvider';

export const metadata: Metadata = {
  title: 'Knowledge Base & Docs',
  robots: { index: false, follow: false },
};

export default function DocsAppPage() {
  const vaults = getAvailableVaults();
  const vaultData = Object.fromEntries(
    vaults.map((v) => {
      const categories = getVaultCategories(v.name);
      const files = categories.flatMap((c) => c.files);
      return [v.name, { categories, files }];
    })
  );

  return (
    <ThemeProvider defaultTheme="dark" disableTransitionOnChange>
      <ColorSchemeProvider>
        <InterviewViewer vaults={vaults} vaultData={vaultData} />
      </ColorSchemeProvider>
    </ThemeProvider>
  );
}
