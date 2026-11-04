'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { FaGraduationCap, FaAward } from 'react-icons/fa';
import { Card } from '@/components/ui';
import type { EducationTranslations } from '@/types';

interface EducationProps {
  education: EducationTranslations;
}

export function Education({ education }: EducationProps) {
  const isCJK = /[一-鿿]/.test(education.university);
  const highlights = isCJK
    ? ['985 / 211 / 双一流高校', '软件工程工学学士', '全日制本科（4 年）']
    : [
        'Project 985 / Double First-Class',
        'B.Eng. in Software Engineering',
        'Full-time (4 Years)',
      ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="flex-1 flex flex-col"
    >
      <Card className="p-5 md:p-6 h-full flex flex-col justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <Image
              src="/logo/school.png"
              alt={education.university}
              width={64}
              height={64}
              className="rounded-lg"
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg md:text-xl font-black gradient-text">
              {education.university}
            </h3>
            <p className="text-gray-700 dark:text-gray-100 font-semibold text-sm md:text-base">
              {education.major}
            </p>
            <span className="font-mono text-xs md:text-sm text-accent">
              {education.period}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-white/10 flex flex-wrap items-center gap-2">
          {highlights.map((badge, index) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300"
            >
              {index === 0 ? (
                <FaAward className="text-accent w-3 h-3 flex-shrink-0" />
              ) : (
                <FaGraduationCap className="text-accent w-3 h-3 flex-shrink-0" />
              )}
              <span>{badge}</span>
            </span>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
