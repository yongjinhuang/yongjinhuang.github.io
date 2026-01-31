import { ThemeProvider } from 'next-themes';
import { Locale, getTranslations } from '../i18n/settings';
import { Footer } from '@/components/Footer';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { CustomCursor } from '@/components/CustomCursor';
import { Navbar } from '@/components/layout';

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export default async function LangLayout({ children, params }: Props) {
  const { lang } = await params;
  const t = await getTranslations(lang);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <div className="min-h-screen relative">
        <AnimatedBackground />
        <CustomCursor />
        <Navbar nav={t.nav} />

        <main className="container mx-auto px-4 pt-28 md:pt-32 pb-16">
          {children}
        </main>

        <Footer params={params} />
        <ScrollToTop />
      </div>
    </ThemeProvider>
  );
}
