'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FaDownload, FaGithub, FaLinkedin } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import { motion } from 'framer-motion';
import { IconButton } from '@/components/ui';
import { formatFullName, isCJK } from '@/lib/utils';
import type { IntroTranslations } from '@/types';

interface IntroProps {
  intro: IntroTranslations;
}

export function Intro({ intro }: IntroProps) {
  const hasCJKName = isCJK(intro.name.first) || isCJK(intro.name.last);
  const fullName = formatFullName(intro.name.first, intro.name.last);

  return (
    <section id="intro">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-card glass-card-static p-6 sm:p-8 md:p-10 lg:p-12"
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 lg:gap-14">
          {/* Left: Editorial Dossier Typography */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm md:text-base font-mono font-medium text-gray-500 dark:text-gray-400 mb-2.5">
              {intro.greeting}
            </p>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.03em] text-gray-900 dark:text-white mb-3 leading-[1.06]">
              {hasCJKName ? fullName : `${intro.name.first} ${intro.name.last}`}
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl font-bold text-accent mb-5 tracking-[-0.01em]">
              {intro.tagline}
            </p>

            <p className="text-gray-600 dark:text-gray-300 text-[15px] md:text-base leading-[1.75] mb-8 max-w-[60ch]">
              {intro.introduction}
            </p>

            {/* Primary Actions + Social Links */}
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <Link
                href="#contact"
                className="brutal-btn brutal-btn-accent px-6 py-3 text-sm md:text-[15px] inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span>{intro.hireMe}</span>
              </Link>

              <a
                href={intro.resumeFile}
                target="_blank"
                rel="noopener noreferrer"
                className="brutal-btn px-6 py-3 text-sm md:text-[15px] bg-white dark:bg-surface-dark text-gray-900 dark:text-white border-gray-900 dark:border-white/30 hover:border-accent dark:hover:border-accent hover:text-accent dark:hover:text-accent inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <FaDownload className="w-3.5 h-3.5" />
                <span>{intro.viewResume}</span>
              </a>

              <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

              <div className="flex items-center gap-2.5">
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
                    icon={<Icon className="text-lg" />}
                    aria-label={label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Architectural Portrait Frame */}
          <div className="flex-shrink-0 self-center lg:self-auto">
            <div className="relative w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60">
              {/* Architectural offset accent frame */}
              <div
                aria-hidden="true"
                className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border-2 border-accent bg-accent/10"
              />
              {/* Portrait container */}
              <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-gray-900 dark:border-white/25 bg-white dark:bg-surface-darker">
                <Image
                  src="/selfie.png"
                  alt={fullName}
                  width={280}
                  height={280}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Ledger Bar */}
        <dl className="mt-9 pt-7 border-t-2 border-gray-200/80 dark:border-white/10 grid grid-cols-3 gap-4 md:gap-8">
          {intro.stats.map((stat, idx) => (
            <div
              key={stat.label}
              className={
                idx > 0
                  ? 'border-l-2 border-gray-200/80 dark:border-white/10 pl-4 md:pl-8'
                  : ''
              }
            >
              <dt className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">
                {stat.label}
              </dt>
              <dd className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight font-mono tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </motion.div>
    </section>
  );
}
