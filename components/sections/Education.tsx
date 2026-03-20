'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui';
import type { EducationTranslations } from '@/types';

interface EducationProps {
  education: EducationTranslations;
}

export function Education({ education }: EducationProps) {
  return (
    <section id="education">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <Card className="p-5 md:p-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <Image
                src="/logo/school.png"
                alt="School logo"
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
        </Card>
      </motion.div>
    </section>
  );
}
