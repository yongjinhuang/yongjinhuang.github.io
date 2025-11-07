'use client';

import { motion } from 'framer-motion';
import { FaGraduationCap, FaCalendarAlt } from 'react-icons/fa';

interface EducationProps {
  t: any;
}

export function Education({ t }: EducationProps) {
  return (
    <section id="education" className="py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <span className="text-cyan-400 text-sm font-semibold uppercase tracking-wider block mb-2">
          {t.education.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold gradient-text">
          {t.education.title}
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="glass-card p-6 md:p-8 hover:scale-105 transition-transform duration-300"
      >
        <div className="flex flex-col sm:flex-row items-start">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] p-3 rounded-full mb-4 sm:mb-0 sm:mr-4">
            <FaGraduationCap className="text-white text-2xl" />
          </div>

          <div className="space-y-3 flex-1">
            <h3 className="text-xl md:text-2xl font-bold gradient-text">
              {t.education.university}
            </h3>
            <p className="text-gray-700 dark:text-gray-300 font-medium text-base md:text-lg">
              {t.education.major}
            </p>
            <div className="flex items-center text-gray-600 dark:text-gray-400 text-sm md:text-base">
              <FaCalendarAlt className="mr-2 text-cyan-400" />
              <span>{t.education.period}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
