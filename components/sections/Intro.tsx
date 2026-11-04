'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  FaDownload,
  FaGithub,
  FaLinkedin,
  FaGraduationCap,
} from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { HiCheck, HiClipboard } from 'react-icons/hi2';
import { IconButton } from '@/components/ui';
import { formatFullName, isCJK } from '@/lib/utils';
import type {
  IntroTranslations,
  DetailsTranslations,
  EducationTranslations,
} from '@/types';
import type { IconType } from 'react-icons';

interface IntroProps {
  intro: IntroTranslations;
  details: DetailsTranslations;
  education: EducationTranslations;
}

interface DetailItem {
  key: 'email' | 'phone' | 'wechat' | 'address';
  label: string;
  value: string;
  icon: IconType;
  sensitive?: boolean;
  href?: string;
}

function CopyButton({
  value,
  copyLabel,
  copiedLabel,
}: {
  readonly value: string;
  readonly copyLabel: string;
  readonly copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      type="button"
      aria-label={copied ? copiedLabel : copyLabel}
      className="shrink-0 p-1 rounded text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors"
      title={copied ? copiedLabel : copyLabel}
    >
      {copied ? (
        <HiCheck className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <HiClipboard className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

export function Intro({ intro, details, education }: IntroProps) {
  const hasCJKName = isCJK(intro.name.first) || isCJK(intro.name.last);
  const fullName = formatFullName(intro.name.first, intro.name.last);
  const [revealedItems, setRevealedItems] = useState<Record<string, boolean>>(
    {}
  );

  const detailItems: DetailItem[] = [
    {
      key: 'email',
      ...details.email,
      icon: FiMail,
      href: `mailto:${details.email.value}`,
    },
    {
      key: 'phone',
      ...details.phone,
      icon: FiPhone,
      sensitive: true,
      href: `tel:${details.phone.value}`,
    },
    {
      key: 'wechat',
      ...details.wechat,
      icon: FiMessageSquare,
      sensitive: true,
    },
    { key: 'address', ...details.address, icon: FiMapPin },
  ];

  const schoolBadge = isCJK(education.university) ? '985 / 双一流' : '985';

  return (
    <section id="intro" className="scroll-mt-28">
      <div className="glass-card glass-card-static rounded-xl p-5 sm:p-7 md:p-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 lg:gap-10">
          {/* Left: Editorial Dossier Typography */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs sm:text-sm font-mono font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              {intro.greeting}
            </p>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-[-0.03em] text-gray-900 dark:text-white mb-2 leading-[1.08]">
              {hasCJKName ? fullName : `${intro.name.first} ${intro.name.last}`}
            </h1>

            <p className="text-base sm:text-lg md:text-xl font-bold text-accent mb-3 tracking-[-0.01em]">
              {intro.tagline}
            </p>

            <p className="text-gray-600 dark:text-gray-300 text-sm md:text-[15px] leading-[1.65] mb-5 max-w-[56ch]">
              {intro.introduction}
            </p>

            {/* Primary Actions + Social Links */}
            <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
              <Link
                href="#contact"
                className="brutal-btn brutal-btn-accent rounded-lg px-4 py-2 text-xs sm:text-sm inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span>{intro.hireMe}</span>
              </Link>

              <a
                href={intro.resumeFile}
                target="_blank"
                rel="noopener noreferrer"
                className="brutal-btn rounded-lg px-4 py-2 text-xs sm:text-sm bg-white dark:bg-surface-dark text-gray-900 dark:text-white border-gray-900 dark:border-white/30 hover:border-accent dark:hover:border-accent hover:text-accent dark:hover:text-accent inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <FaDownload className="w-3 h-3" />
                <span>{intro.viewResume}</span>
              </a>

              <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-0.5 hidden sm:block" />

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
                    icon={<Icon className="text-base" />}
                    aria-label={label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Avatar + Education & Contact Dossier beside Avatar */}
          <div
            id="contact"
            className="scroll-mt-28 w-full lg:w-auto flex flex-col sm:flex-row items-center gap-5 sm:gap-6 lg:pl-8 lg:border-l-2 lg:border-gray-200/80 lg:dark:border-white/10"
          >
            {/* Architectural Portrait Frame */}
            <div className="flex-shrink-0">
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl border-2 border-accent bg-accent/10"
                />
                <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-gray-900 dark:border-white/25 bg-white dark:bg-surface-darker">
                  <Image
                    src="/selfie.png"
                    alt={fullName}
                    width={180}
                    height={180}
                    className="w-full h-full object-cover"
                    priority
                  />
                </div>
              </div>
            </div>

            {/* Compact Education + Contact Ledger beside Avatar */}
            <dl
              id="education"
              className="scroll-mt-28 w-full sm:w-auto min-w-[240px] divide-y divide-gray-200/80 dark:divide-white/10"
            >
              {/* Education Row */}
              <div className="pb-2 flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 mt-0.5">
                  <FaGraduationCap className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>{education.title}</span>
                </dt>
                <dd className="flex flex-col items-end text-right min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white">
                    <Image
                      src="/logo/school.png"
                      alt={education.university}
                      width={16}
                      height={16}
                      className="w-4 h-4 rounded-sm object-contain shrink-0 bg-white"
                    />
                    <span className="truncate">{education.university}</span>
                    <span className="px-1.5 py-0.2 text-[10px] font-mono font-semibold rounded bg-accent/15 text-accent border border-accent/30 shrink-0">
                      {schoolBadge}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                    {education.major}
                  </span>
                </dd>
              </div>

              {/* Contact Detail Rows */}
              {detailItems.map((detail) => {
                const Icon = detail.icon;
                const isRevealed =
                  !detail.sensitive || !!revealedItems[detail.key];

                return (
                  <div
                    key={detail.key}
                    className="py-1.5 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <dt className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                      <Icon className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span>{detail.label}</span>
                    </dt>
                    <dd className="flex items-center justify-end gap-1 text-gray-900 dark:text-white font-medium text-xs min-w-0">
                      {!isRevealed ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedItems((prev) => ({
                              ...prev,
                              [detail.key]: true,
                            }))
                          }
                          className="text-xs font-mono font-medium text-accent hover:underline"
                        >
                          {details.clickToReveal}
                        </button>
                      ) : (
                        <>
                          {detail.href ? (
                            <a
                              href={detail.href}
                              className="truncate hover:text-accent transition-colors font-mono"
                            >
                              {detail.value}
                            </a>
                          ) : (
                            <span className="truncate font-mono">
                              {detail.value}
                            </span>
                          )}
                          <CopyButton
                            value={detail.value}
                            copyLabel={details.copyToClipboard}
                            copiedLabel={details.copied}
                          />
                        </>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
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
