'use client';

import { motion } from 'framer-motion';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { SectionHeader, Card, IconContainer } from '@/components/ui';
import type { DetailsTranslations } from '@/types';
import { IconType } from 'react-icons';

interface DetailsProps {
  details: DetailsTranslations;
}

interface DetailItem {
  label: string;
  value: string;
  icon: IconType;
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

export function Details({ details }: DetailsProps) {
  const detailItems: DetailItem[] = [
    { ...details.email, icon: FiMail },
    { ...details.phone, icon: FiPhone },
    { ...details.wechat, icon: FiMessageSquare },
    { ...details.address, icon: FiMapPin },
  ];

  return (
    <section id="details" className="py-12">
      <SectionHeader tagline={details.tagline} title={details.title} />

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 max-w-3xl mx-auto"
      >
        {detailItems.map((detail, index) => {
          const Icon = detail.icon;
          return (
            <motion.div key={index} variants={item}>
              <Card className="p-5 md:p-6">
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
                    <dd className="text-gray-900 dark:text-white font-semibold text-sm md:text-base break-words">
                      {detail.value}
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
