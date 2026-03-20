import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import { getTranslations } from '@/app/i18n/settings';
import { Locale } from '@/app/i18n/settings';

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
  const lang = rawLang as Locale;
  const t = await getTranslations(lang);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-3 border-gray-200 dark:border-white/10 py-6 mt-12">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
          <span className="text-accent font-mono font-bold">{year}</span>
          <span className="mx-2">|</span>
          {t.footer.name}
        </p>

        <div className="flex items-center gap-3">
          {socialLinks.map(({ icon: Icon, key, label }) => (
            <a
              key={label}
              href={t.intro.links[key]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-gray-500 dark:text-gray-400 hover:text-accent transition-colors duration-300"
            >
              <Icon className="text-lg" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
