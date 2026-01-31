'use client';

import { motion } from 'framer-motion';
import { FaGraduationCap } from 'react-icons/fa';

interface EducationProps {
  t: any;
}

export function Education({ t }: EducationProps) {
  return (
    <section id="education" className="py-12">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <span className="text-accent text-sm font-bold uppercase tracking-wider block mb-2">
          {t.education.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black gradient-text">
          {t.education.title}
        </h2>
      </motion.div>

      {/* Featured Brutal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mx-auto"
      >
        <div className="glass-card p-6 md:p-8 group hover:border-accent transition-all duration-300">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Icon Container */}
            <div className="flex-shrink-0">
              <div className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-accent/10 border-2 border-accent/30 group-hover:bg-accent/20 group-hover:border-accent transition-all duration-300">
                <FaGraduationCap className="text-accent text-2xl md:text-3xl" />
              </div>
            </div>

            {/* Education Details */}
            <div className="flex-1 space-y-3">
              <h3 className="text-xl md:text-2xl font-black gradient-text">
                {t.education.university}
              </h3>
              <p className="text-gray-700 dark:text-gray-100 font-semibold text-base md:text-lg">
                {t.education.major}
              </p>
              {/* Period */}
              <div className="inline-block">
                <span className="font-mono text-sm md:text-base text-accent">
                  {t.education.period}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
