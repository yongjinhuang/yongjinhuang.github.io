'use client';

import { motion } from 'framer-motion';
import { FaCode, FaTools, FaLayerGroup } from 'react-icons/fa';
import { Card, IconContainer, SkillTag } from '@/components/ui';
import type { SkillsTranslations } from '@/types';
import { IconType } from 'react-icons';

interface SkillsProps {
  skills: SkillsTranslations;
}

interface SkillCategory {
  title: string;
  skills: string[];
  icon: IconType;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.2 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0 },
};

export function Skills({ skills }: SkillsProps) {
  const categories: SkillCategory[] = [
    {
      title: skills.languages.title,
      skills: skills.languages.value,
      icon: FaCode,
    },
    {
      title: skills.frameworks.title,
      skills: skills.frameworks.value,
      icon: FaLayerGroup,
    },
    {
      title: skills.tools.title,
      skills: skills.tools.value,
      icon: FaTools,
    },
  ];

  return (
    <section id="skills">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {categories.map((category, catIndex) => (
          <motion.div key={category.title} variants={item}>
            <Card className="p-4 md:p-5">
              <div className="flex items-center gap-3 mb-3">
                <IconContainer
                  size="sm"
                  variant="accent"
                  icon={<category.icon className="text-accent text-lg" />}
                />
                <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white">
                  {category.title}
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                {category.skills.map((skill, index) => (
                  <SkillTag key={skill} delay={index * 0.05 + catIndex * 0.1}>
                    {skill}
                  </SkillTag>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
