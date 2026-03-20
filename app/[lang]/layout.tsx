import { ThemeProvider } from 'next-themes';
import { Locale, getTranslations } from '../i18n/settings';
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
  const lang = rawLang as Locale;
  const t = await getTranslations(lang);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";`,
        }}
      />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <ColorSchemeProvider>
          <div className="min-h-screen relative">
            <AnimatedBackground />
            <CustomCursor />
            <Navbar nav={t.nav} />

            <main className="container mx-auto px-4 pt-24 md:pt-28 pb-8">
              {children}
            </main>

            <Footer params={params} />
            <ScrollToTop />
          </div>
        </ColorSchemeProvider>
      </ThemeProvider>
    </>
  );
}
