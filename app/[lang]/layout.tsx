import { ThemeProvider } from '@/components/ThemeProvider';
import { resolveLocale, getTranslations } from '../i18n/settings';
import { Footer } from '@/components/Footer';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { CustomCursor } from '@/components/CustomCursor';
import { Navbar } from '@/components/layout';
import { ColorSchemeProvider } from '@/components/ColorSchemeProvider';

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function LangLayout({ children, params }: Props) {
  const { lang: rawLang } = await params;
  const lang = resolveLocale(rawLang);
  const t = await getTranslations(lang);

  return (
    <ThemeProvider defaultTheme="dark" disableTransitionOnChange>
      <ColorSchemeProvider>
        <div className="min-h-screen relative flex flex-col">
          <AnimatedBackground />
          <CustomCursor />
          <Navbar nav={t.nav} />

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-28 md:pt-32 pb-12 md:pb-16">
            {children}
          </main>

          <Footer params={params} />
          <ScrollToTop />
        </div>
      </ColorSchemeProvider>
    </ThemeProvider>
  );
}
