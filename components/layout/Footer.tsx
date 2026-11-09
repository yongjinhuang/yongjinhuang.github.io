import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import { resolveLocale, getTranslations } from '@/app/i18n/settings';

interface FooterProps {
  params: Promise<{ lang: string }>;
}

const socialLinks = [
  { icon: FaGithub, key: 'github' as const, label: 'GitHub' },
  { icon: FaLinkedin, key: 'linkedin' as const, label: 'LinkedIn' },
  { icon: SiLeetcode, key: 'leetcode' as const, label: 'LeetCode' },
];

export async function Footer({ params }: FooterProps) {
  const { lang: rawLang } = await params;
  const lang = resolveLocale(rawLang);
  const t = await getTranslations(lang);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-2 border-gray-200/80 dark:border-white/10 py-8 mt-8">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
          <span className="text-accent font-mono font-semibold">{year}</span>
          <span className="mx-2 text-gray-300 dark:text-white/20">/</span>
          <span>{t.footer.name}</span>
        </p>

        <div className="flex items-center gap-2.5">
          {socialLinks.map(({ icon: Icon, key, label }) => (
            <a
              key={label}
              href={t.intro.links[key]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="w-9 h-9 rounded-lg border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-200"
            >
              <Icon aria-hidden="true" className="text-base" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
