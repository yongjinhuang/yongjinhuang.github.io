'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { HiCheck, HiClipboard } from 'react-icons/hi2';
import { Card } from '@/components/ui';
import type { DetailsTranslations } from '@/types';
import { IconType } from 'react-icons';

interface DetailsProps {
  details: DetailsTranslations;
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

export function Details({ details }: DetailsProps) {
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

  return (
    <div className="flex-1 flex flex-col">
      <Card className="p-5 md:p-6 h-full flex flex-col justify-center">
        <dl className="divide-y divide-gray-200/80 dark:divide-white/10">
          {detailItems.map((detail) => {
            const Icon = detail.icon;
            const isRevealed = !detail.sensitive || !!revealedItems[detail.key];

            return (
              <div
                key={detail.key}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
              >
                <dt className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0">
                  <Icon className="w-4 h-4 text-accent shrink-0" />
                  <span>{detail.label}</span>
                </dt>
                <dd className="flex items-center justify-end gap-1.5 text-gray-900 dark:text-white font-medium text-xs sm:text-sm min-w-0">
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
      </Card>
    </div>
  );
}
