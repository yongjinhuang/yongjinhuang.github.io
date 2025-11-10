'use client';

import { motion } from 'framer-motion';
import { FaCode, FaTools, FaLayerGroup } from 'react-icons/fa';

interface SkillsProps {
  t: any;
}

// Skill tag color mapping
const skillColors: Record<
  string,
  { hover: string; border: string; shadow: string }
> = {
  Golang: {
    hover: 'hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#00f2fe]',
    border: 'hover:border-cyan-400',
    shadow: 'hover:shadow-cyan-400/30',
  },
  Python: {
    hover: 'hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#667eea]',
    border: 'hover:border-blue-400',
    shadow: 'hover:shadow-blue-400/30',
  },
  TypeScript: {
    hover: 'hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2]',
    border: 'hover:border-purple-400',
    shadow: 'hover:shadow-purple-400/30',
  },
  Java: {
    hover: 'hover:bg-gradient-to-r hover:from-[#ff6b6b] hover:to-[#feca57]',
    border: 'hover:border-orange-400',
    shadow: 'hover:shadow-orange-400/30',
  },
  SQL: {
    hover: 'hover:bg-gradient-to-r hover:from-[#f093fb] hover:to-[#f5576c]',
    border: 'hover:border-pink-400',
    shadow: 'hover:shadow-pink-400/30',
  },
  Gin: {
    hover: 'hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#00f2fe]',
    border: 'hover:border-cyan-400',
    shadow: 'hover:shadow-cyan-400/30',
  },
  Django: {
    hover: 'hover:bg-gradient-to-r hover:from-[#43e97b] hover:to-[#38f9d7]',
    border: 'hover:border-green-400',
    shadow: 'hover:shadow-green-400/30',
  },
  'Spring Boot': {
    hover: 'hover:bg-gradient-to-r hover:from-[#43e97b] hover:to-[#38f9d7]',
    border: 'hover:border-green-400',
    shadow: 'hover:shadow-green-400/30',
  },
  React: {
    hover: 'hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#667eea]',
    border: 'hover:border-blue-400',
    shadow: 'hover:shadow-blue-400/30',
  },
  'Next.js': {
    hover: 'hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2]',
    border: 'hover:border-purple-400',
    shadow: 'hover:shadow-purple-400/30',
  },
  Git: {
    hover: 'hover:bg-gradient-to-r hover:from-[#ff6b6b] hover:to-[#feca57]',
    border: 'hover:border-orange-400',
    shadow: 'hover:shadow-orange-400/30',
  },
  Linux: {
    hover: 'hover:bg-gradient-to-r hover:from-[#feca57] hover:to-[#ff6b6b]',
    border: 'hover:border-yellow-400',
    shadow: 'hover:shadow-yellow-400/30',
  },
  Docker: {
    hover: 'hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#667eea]',
    border: 'hover:border-blue-400',
    shadow: 'hover:shadow-blue-400/30',
  },
  K8S: {
    hover: 'hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2]',
    border: 'hover:border-purple-400',
    shadow: 'hover:shadow-purple-400/30',
  },
  MySQL: {
    hover: 'hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#667eea]',
    border: 'hover:border-blue-400',
    shadow: 'hover:shadow-blue-400/30',
  },
  Redis: {
    hover: 'hover:bg-gradient-to-r hover:from-[#ee5a6f] hover:to-[#f093fb]',
    border: 'hover:border-red-400',
    shadow: 'hover:shadow-red-400/30',
  },
  MongoDB: {
    hover: 'hover:bg-gradient-to-r hover:from-[#43e97b] hover:to-[#38f9d7]',
    border: 'hover:border-green-400',
    shadow: 'hover:shadow-green-400/30',
  },
};

export function Skills({ t }: SkillsProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <section className="py-12" id="skills">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <span className="text-cyan-400 text-sm font-semibold uppercase tracking-wider block mb-2">
          {t.skills.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold gradient-text">
          {t.skills.title}
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
      >
        {/* Programming Languages */}
        <motion.div variants={item} className="glass-card p-5 md:p-6 group">
          <div className="flex items-center mb-4 flex-wrap gap-2">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] flex items-center justify-center flex-shrink-0">
              <FaCode className="text-white text-lg md:text-xl" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold gradient-text">
              {t.skills.languages.title}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {t.skills.languages.value.map((lang: string, index: number) => {
              const colors = skillColors[lang] ||
                skillColors.default || { hover: '', border: '', shadow: '' };
              return (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -3 }}
                  key={lang}
                  className={`skill-tag px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 dark:bg-white/5 backdrop-blur-sm border border-gray-300 dark:border-white/20 rounded-full text-xs md:text-sm font-medium text-gray-700 dark:text-white transition-all duration-300 cursor-pointer ${colors.hover} ${colors.border} hover:shadow-lg ${colors.shadow} hover:text-white`}
                >
                  {lang}
                </motion.span>
              );
            })}
          </div>
        </motion.div>

        {/* Frameworks */}
        <motion.div variants={item} className="glass-card p-5 md:p-6 group">
          <div className="flex items-center mb-4 flex-wrap gap-2">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-r from-[#43e97b] to-[#38f9d7] flex items-center justify-center flex-shrink-0">
              <FaLayerGroup className="text-white text-lg md:text-xl" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold gradient-text">
              {t.skills.frameworks.title}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {t.skills.frameworks.value.map(
              (framework: string, index: number) => {
                const colors = skillColors[framework] ||
                  skillColors.default || { hover: '', border: '', shadow: '' };
                return (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    whileHover={{ scale: 1.05, y: -3 }}
                    key={framework}
                    className={`skill-tag px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 dark:bg-white/5 backdrop-blur-sm border border-gray-300 dark:border-white/20 rounded-full text-xs md:text-sm font-medium text-gray-700 dark:text-white transition-all duration-300 cursor-pointer ${colors.hover} ${colors.border} hover:shadow-lg ${colors.shadow} hover:text-white`}
                  >
                    {framework}
                  </motion.span>
                );
              }
            )}
          </div>
        </motion.div>

        {/* Tools & Technologies */}
        <motion.div variants={item} className="glass-card p-5 md:p-6 group">
          <div className="flex items-center mb-4 flex-wrap gap-2">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-r from-[#f093fb] to-[#f5576c] flex items-center justify-center flex-shrink-0">
              <FaTools className="text-white text-lg md:text-xl" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold gradient-text">
              {t.skills.tools.title}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {t.skills.tools.value.map((tool: string, index: number) => {
              const colors = skillColors[tool] ||
                skillColors.default || { hover: '', border: '', shadow: '' };
              return (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -3 }}
                  key={tool}
                  className={`skill-tag px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 dark:bg-white/5 backdrop-blur-sm border border-gray-300 dark:border-white/20 rounded-full text-xs md:text-sm font-medium text-gray-700 dark:text-white transition-all duration-300 cursor-pointer ${colors.hover} ${colors.border} hover:shadow-lg ${colors.shadow} hover:text-white`}
                >
                  {tool}
                </motion.span>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
