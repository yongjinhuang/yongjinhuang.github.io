import { ThemeProvider, ColorSchemeProvider } from '@/components/theme';
import {
  Navbar,
  Footer,
  ScrollToTop,
  AnimatedBackground,
} from '@/components/layout';
import { resolveLocale, getTranslations } from '../i18n/settings';

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
