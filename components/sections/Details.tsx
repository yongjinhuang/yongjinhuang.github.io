'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { HiCheck, HiClipboard } from 'react-icons/hi2';
import { Card, IconContainer } from '@/components/ui';
import type { DetailsTranslations } from '@/types';
import { IconType } from 'react-icons';

interface DetailsProps {
  details: DetailsTranslations;
}

interface DetailItem {
  label: string;
  value: string;
  icon: IconType;
  sensitive?: boolean;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

function CopyButton({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-accent/10 transition-all opacity-0 group-hover/card:opacity-100"
      title={copied ? 'Copied!' : 'Copy to clipboard'}
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
  const [revealed, setRevealed] = useState(false);

  const detailItems: DetailItem[] = [
    { ...details.email, icon: FiMail },
    { ...details.phone, icon: FiPhone, sensitive: true },
    { ...details.wechat, icon: FiMessageSquare, sensitive: true },
    { ...details.address, icon: FiMapPin },
  ];

  return (
    <section id="contact">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4"
      >
        {detailItems.map((detail, index) => {
          const Icon = detail.icon;
          return (
            <motion.div key={index} variants={item}>
              <Card className="p-5 md:p-6 group/card">
                <div className="flex items-start gap-4">
                  <IconContainer
                    size="sm"
                    icon={
                      <Icon className="text-lg md:text-xl text-gray-600 dark:text-gray-300 group-hover:text-accent transition-colors duration-300" />
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <dt className="text-gray-500 dark:text-gray-400 text-xs md:text-sm font-semibold uppercase tracking-wider mb-1">
                      {detail.label}
                    </dt>
                    <dd className="flex items-center gap-1 text-gray-900 dark:text-white font-semibold text-sm md:text-base">
                      {detail.sensitive && !revealed ? (
                        <button
                          onClick={() => setRevealed(true)}
                          className="text-xs text-accent hover:underline"
                        >
                          Click to reveal
                        </button>
                      ) : (
                        <>
                          <span className="break-words min-w-0">
                            {detail.value}
                          </span>
                          <CopyButton value={detail.value} />
                        </>
                      )}
                    </dd>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
