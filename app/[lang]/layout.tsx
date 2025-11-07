import { ThemeProvider } from 'next-themes';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSelector from '@/components/LanguageSelector';
import { Locale } from '../i18n/settings';
import { Footer } from '@/components/Footer';
import Link from 'next/link';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { CustomCursor } from '@/components/CustomCursor';
import { Poppins } from 'next/font/google';

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
});

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export default function LangLayout({ children, params }: Props) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className={`min-h-screen relative ${poppins.variable}`}>
        {/* Animated Background */}
        <AnimatedBackground />

        {/* Custom Cursor */}
        <CustomCursor />

        {/* Glassmorphism Navbar */}
        <nav className="fixed w-full top-0 z-50 transition-all duration-300">
          <div className="glass-card mx-4 mt-4 rounded-full shadow-lg">
            <div className="container mx-auto px-6 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <Link
                  href="/"
                  className="font-bold text-2xl gradient-text hover:scale-110 transition-transform duration-300"
                >
                  YH
                </Link>
                <LanguageSelector />
              </div>

              <div className="flex items-center space-x-6">
                <Link href="#skills" className="relative group hidden sm:block">
                  <span className="text-gray-800 dark:text-gray-100 font-medium hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2] transition-all duration-300">
                    Skills
                  </span>
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link
                  href="#experience"
                  className="relative group hidden sm:block"
                >
                  <span className="text-gray-800 dark:text-gray-100 font-medium hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2] transition-all duration-300">
                    Experience
                  </span>
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] group-hover:w-full transition-all duration-300"></span>
                </Link>
                <Link
                  href="https://yongjinhuang.github.io/blog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group"
                >
                  <span className="text-gray-800 dark:text-gray-100 font-medium hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2] transition-all duration-300">
                    Blog
                  </span>
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] group-hover:w-full transition-all duration-300"></span>
                </Link>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 pt-32 pb-16">{children}</main>
        <Footer params={params} />
        <ScrollToTop />
      </div>
    </ThemeProvider>
  );
}
