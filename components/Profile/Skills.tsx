'use client';

import { motion } from 'framer-motion';
import { FaCode, FaTools, FaLayerGroup } from 'react-icons/fa';

interface SkillsProps {
  t: any;
}

export function Skills({ t }: SkillsProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0 },
  };

  const categories = [
    {
      title: t.skills.languages.title,
      skills: t.skills.languages.value,
      icon: FaCode,
    },
    {
      title: t.skills.frameworks.title,
      skills: t.skills.frameworks.value,
      icon: FaLayerGroup,
    },
    {
      title: t.skills.tools.title,
      skills: t.skills.tools.value,
      icon: FaTools,
    },
  ];

  return (
    <section className="py-12" id="skills">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <span className="text-accent text-sm font-bold uppercase tracking-wider block mb-2">
          {t.skills.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black gradient-text">
          {t.skills.title}
        </h2>
      </motion.div>

      {/* Skills Grid - Single Column on Mobile, 3 Columns on Desktop */}
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto"
      >
        {categories.map((category, catIndex) => (
          <motion.div
            key={category.title}
            variants={item}
            className="glass-card p-6 md:p-8 group hover:border-accent transition-all duration-300"
          >
            {/* Category Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-accent/10 border-2 border-accent/30 group-hover:bg-accent/20 group-hover:border-accent transition-all duration-300">
                <category.icon className="text-accent text-xl" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {category.title}
              </h3>
            </div>

            {/* Skill Tags */}
            <div className="flex flex-wrap gap-3">
              {category.skills.map((skill: string, index: number) => (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05 + catIndex * 0.1,
                  }}
                  whileHover={{ y: -2 }}
                  key={skill}
                  className="px-4 py-2 bg-gray-100 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(251,191,36,0.2)] transition-all duration-300 cursor-default"
                >
                  {skill}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
