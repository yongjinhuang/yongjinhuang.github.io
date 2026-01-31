import { ThemeProvider } from 'next-themes';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSelector from '@/components/LanguageSelector';
import { Locale, getTranslations } from '../i18n/settings';
import { Footer } from '@/components/Footer';
import Link from 'next/link';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { CustomCursor } from '@/components/CustomCursor';

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export default async function LangLayout({ children, params }: Props) {
  const { lang } = await params;
  const t = await getTranslations(lang);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className="min-h-screen relative">
        {/* Animated Background */}
        <AnimatedBackground />

        {/* Custom Cursor */}
        <CustomCursor />

        {/* Neo-Brutalism Navbar */}
        <nav className="fixed w-full top-0 z-50 transition-all duration-300">
          <div className="mx-4 mt-4">
            <div className="glass-card px-4 py-3 md:px-6 md:py-4">
              <div className="container mx-auto flex justify-between items-center">
                {/* Logo + Language */}
                <div className="flex items-center gap-3 md:gap-4">
                  <Link
                    href="/"
                    className="brutal-btn brutal-btn-accent px-3 py-1 md:px-4 md:py-2 text-lg md:text-xl font-black tracking-tight hover:scale-105 transition-transform"
                  >
                    YH
                  </Link>
                  <LanguageSelector />
                </div>

                {/* Nav Links + Theme Toggle */}
                <div className="flex items-center gap-4 md:gap-6">
                  <Link
                    href="#skills"
                    className="relative group hidden sm:block"
                  >
                    <span className="text-gray-800 dark:text-gray-100 font-semibold hover:text-accent transition-colors duration-300">
                      {t.nav.skills}
                    </span>
                    <span className="absolute -bottom-1 left-0 w-0 h-[3px] bg-accent group-hover:w-full transition-all duration-300" />
                  </Link>
                  <Link
                    href="#experience"
                    className="relative group hidden sm:block"
                  >
                    <span className="text-gray-800 dark:text-gray-100 font-semibold hover:text-accent transition-colors duration-300">
                      {t.nav.experience}
                    </span>
                    <span className="absolute -bottom-1 left-0 w-0 h-[3px] bg-accent group-hover:w-full transition-all duration-300" />
                  </Link>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 pt-28 md:pt-32 pb-16">
          {children}
        </main>
        <Footer params={params} />
        <ScrollToTop />
      </div>
    </ThemeProvider>
  );
}
