'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { SectionHeader, Card } from '@/components/ui';
import type { EducationTranslations } from '@/types';

interface EducationProps {
  education: EducationTranslations;
}

export function Education({ education }: EducationProps) {
  return (
    <section id="education" className="py-12">
      <SectionHeader tagline={education.tagline} title={education.title} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mx-auto"
      >
        <Card>
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="flex-shrink-0">
              <Image
                src="/logo/school.png"
                alt="School logo"
                width={80}
                height={80}
                className="rounded-lg"
              />
            </div>

            <div className="flex-1 space-y-3">
              <h3 className="text-xl md:text-2xl font-black gradient-text">
                {education.university}
              </h3>
              <p className="text-gray-700 dark:text-gray-100 font-semibold text-base md:text-lg">
                {education.major}
              </p>
              <div className="inline-block">
                <span className="font-mono text-sm md:text-base text-accent">
                  {education.period}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}
