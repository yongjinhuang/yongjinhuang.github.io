'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FaDownload, FaGithub, FaLinkedin } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import { IconButton } from '@/components/ui';
import { useColorScheme } from '@/components/theme';
import { exportResumePdf } from '@/lib/pdf';
import { formatFullName, isCJK } from '@/lib/utils';
import { ContactLedger } from './ContactLedger';
import type {
  IntroTranslations,
  DetailsTranslations,
  EducationTranslations,
  Translations,
} from '@/types';

interface IntroProps {
  intro: IntroTranslations;
  details: DetailsTranslations;
  education: EducationTranslations;
  translations: Translations;
  locale: string;
}

export function Intro({
  intro,
  details,
  education,
  translations,
  locale,
}: IntroProps) {
  const { scheme } = useColorScheme();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const hasCJKName = isCJK(intro.name.first) || isCJK(intro.name.last);
  const fullName = formatFullName(intro.name.first, intro.name.last);

  return (
    <section id="intro" className="scroll-mt-28">
      <div className="glass-card glass-card-static rounded-xl p-5 sm:p-7 md:p-8">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 lg:gap-8">
          {/* Left: Editorial Dossier Typography + Actions */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs sm:text-sm font-mono font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              {intro.greeting}
            </p>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-[-0.03em] text-gray-900 dark:text-white mb-2 leading-[1.08] text-balance">
              {hasCJKName ? fullName : `${intro.name.first} ${intro.name.last}`}
            </h1>

            <p className="text-base sm:text-lg md:text-xl font-bold text-accent mb-3 tracking-[-0.01em] text-balance">
              {intro.tagline}
            </p>

            <p className="text-gray-600 dark:text-gray-300 text-sm md:text-[15px] leading-[1.65] mb-5 max-w-[54ch]">
              {intro.introduction}
            </p>

            {/* Primary Actions + Social Icon Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="#contact"
                className="brutal-btn brutal-btn-accent rounded-lg px-4 py-2 text-xs sm:text-sm inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span>{intro.hireMe}</span>
              </Link>

              <button
                type="button"
                disabled={isGeneratingPdf}
                aria-busy={isGeneratingPdf}
                onClick={async () => {
                  setIsGeneratingPdf(true);
                  try {
                    await exportResumePdf(translations, locale, scheme);
                  } finally {
                    setIsGeneratingPdf(false);
                  }
                }}
                className="brutal-btn rounded-lg px-4 py-2 text-xs sm:text-sm bg-white dark:bg-surface-dark text-gray-900 dark:text-white border-gray-900 dark:border-white/30 hover:border-accent dark:hover:border-accent hover:text-accent dark:hover:text-accent inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-wait"
              >
                <FaDownload
                  aria-hidden="true"
                  className={`w-3 h-3 ${isGeneratingPdf ? 'animate-bounce' : ''}`}
                />
                <span>
                  {isGeneratingPdf
                    ? locale === 'zh'
                      ? '正在生成…'
                      : 'Generating…'
                    : intro.viewResume}
                </span>
              </button>

              <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

              <div className="flex items-center gap-2">
                {[
                  {
                    icon: FaGithub,
                    href: intro.links.github,
                    label: 'GitHub',
                  },
                  {
                    icon: FaLinkedin,
                    href: intro.links.linkedin,
                    label: 'LinkedIn',
                  },
                  {
                    icon: SiLeetcode,
                    href: intro.links.leetcode,
                    label: 'LeetCode',
                  },
                ].map(({ icon: Icon, href, label }) => (
                  <IconButton
                    key={label}
                    href={href}
                    size="sm"
                    icon={<Icon aria-hidden="true" className="text-base" />}
                    aria-label={label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Education & Contact Ledger + Avatar on the Far Right */}
          <ContactLedger
            details={details}
            education={education}
            fullName={fullName}
          />
        </div>

        {/* Bottom Ledger Bar */}
        <dl className="mt-6 pt-5 border-t-2 border-gray-200/80 dark:border-white/10 grid grid-cols-3 gap-4 md:gap-8">
          {intro.stats.map((stat, idx) => (
            <div
              key={stat.label}
              className={
                idx > 0
                  ? 'border-l-2 border-gray-200/80 dark:border-white/10 pl-4 md:pl-8'
                  : ''
              }
            >
              <dt className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                {stat.label}
              </dt>
              <dd className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight font-mono tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
