'use client';

import { useState } from 'react';
import Image from 'next/image';
import { FaGraduationCap } from 'react-icons/fa';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { CopyButton } from '@/components/ui';
import { isCJK } from '@/lib/utils';
import type { DetailsTranslations, EducationTranslations } from '@/types';
import type { IconType } from 'react-icons';

export interface ContactLedgerProps {
  readonly details: DetailsTranslations;
  readonly education: EducationTranslations;
  readonly fullName: string;
}

interface DetailItem {
  key: 'email' | 'phone' | 'wechat' | 'address';
  label: string;
  value: string;
  icon: IconType;
  sensitive?: boolean;
  href?: string;
}

export function ContactLedger({
  details,
  education,
  fullName,
}: ContactLedgerProps) {
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
    <div
      id="contact"
      className="scroll-mt-28 w-full lg:w-auto flex flex-col-reverse sm:flex-row items-center sm:items-start justify-between lg:justify-end gap-5 sm:gap-6 pt-5 lg:pt-0 border-t lg:border-t-0 lg:pl-7 lg:border-l-2 border-gray-200/80 dark:border-white/10 shrink-0"
    >
      {/* Compact Education + Contact Ledger */}
      <dl
        id="education"
        className="scroll-mt-28 w-full sm:w-[300px] md:w-[315px] divide-y divide-gray-200/80 dark:divide-white/10"
      >
        {/* Education Row */}
        <div className="pb-2 flex items-start justify-between gap-4">
          <dt className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 mt-0.5">
            <FaGraduationCap
              aria-hidden="true"
              className="w-3.5 h-3.5 text-accent shrink-0"
            />
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
          const isRevealed = !detail.sensitive || !!revealedItems[detail.key];

          return (
            <div
              key={detail.key}
              className="py-1.5 last:pb-0 flex items-center justify-between gap-3"
            >
              <dt className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                <Icon
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-accent shrink-0"
                />
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
                    aria-label={`${details.clickToReveal} (${detail.label})`}
                    className="text-xs font-mono font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1 -mx-1"
                  >
                    {details.clickToReveal}
                  </button>
                ) : (
                  <>
                    {detail.href ? (
                      <a
                        href={detail.href}
                        className="truncate hover:text-accent transition-colors font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                      >
                        {detail.value}
                      </a>
                    ) : (
                      <span className="truncate font-mono">{detail.value}</span>
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

      {/* Architectural Portrait Frame on the Far Right */}
      <div className="flex-shrink-0 mr-2 mb-2">
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
    </div>
  );
}
