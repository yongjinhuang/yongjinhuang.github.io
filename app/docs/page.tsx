import type { Metadata } from 'next';
import { getAvailableVaults, getVaultCategories } from '@/lib/docs/vaults';
import { DocsViewer } from '@/components/docs';
import { ThemeProvider, ColorSchemeProvider } from '@/components/theme';

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
        <DocsViewer vaults={vaults} vaultData={vaultData} />
      </ColorSchemeProvider>
    </ThemeProvider>
  );
}
