'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { HiCheck, HiClipboard } from 'react-icons/hi2';
import { Card, IconContainer } from '@/components/ui';
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
      className="shrink-0 p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-accent/10 transition-all opacity-100 sm:opacity-60 sm:group-hover/card:opacity-100"
      title={copied ? copiedLabel : copyLabel}
    >
      {copied ? (
        <HiCheck className="w-4 h-4 text-green-500" />
      ) : (
        <HiClipboard className="w-4 h-4" />
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
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 flex-1">
      {detailItems.map((detail) => {
        const Icon = detail.icon;
        const isRevealed = !detail.sensitive || !!revealedItems[detail.key];

        return (
          <Card key={detail.key} className="p-5 md:p-6 h-full group/card">
            <div className="flex items-start gap-3.5">
              <IconContainer
                size="sm"
                icon={
                  <Icon className="text-lg text-gray-600 dark:text-gray-300 group-hover/card:text-accent transition-colors duration-300" />
                }
              />
              <div className="flex-1 min-w-0">
                <dt className="text-gray-500 dark:text-gray-400 text-xs font-medium mb-1">
                  {detail.label}
                </dt>
                <dd className="flex items-center gap-1 text-gray-900 dark:text-white font-semibold text-sm md:text-base">
                  {!isRevealed ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedItems((prev) => ({
                          ...prev,
                          [detail.key]: true,
                        }))
                      }
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {details.clickToReveal}
                    </button>
                  ) : (
                    <>
                      {detail.href ? (
                        <a
                          href={detail.href}
                          className="break-all min-w-0 hover:text-accent transition-colors"
                        >
                          {detail.value}
                        </a>
                      ) : (
                        <span className="break-words min-w-0">
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
            </div>
          </Card>
        );
      })}
    </dl>
  );
}
