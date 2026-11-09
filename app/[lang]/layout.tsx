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

  const skipLabel = lang === 'zh' ? '跳转到主要内容' : 'Skip to main content';

  return (
    <ThemeProvider defaultTheme="dark" disableTransitionOnChange>
      <ColorSchemeProvider>
        <div className="min-h-dvh relative flex flex-col">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-[var(--accent-foreground,#000)] focus:font-bold focus:text-sm focus:shadow-lg focus:outline-none"
          >
            {skipLabel}
          </a>
          <AnimatedBackground />
          <Navbar nav={t.nav} />

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-28 md:pt-32 pb-12 md:pb-16 focus:outline-none"
          >
            {children}
          </main>

          <Footer params={params} />
          <ScrollToTop />
        </div>
      </ColorSchemeProvider>
    </ThemeProvider>
  );
}
