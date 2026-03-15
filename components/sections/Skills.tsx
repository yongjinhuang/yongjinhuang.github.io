'use client';

import { motion } from 'framer-motion';
import { FaCode, FaTools, FaLayerGroup } from 'react-icons/fa';
import { SectionHeader, Card, IconContainer, SkillTag } from '@/components/ui';
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
    <section className="py-12" id="skills">
      <SectionHeader tagline={skills.tagline} title={skills.title} />

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 gap-6 md:gap-8 max-w-6xl mx-auto"
      >
        {categories.map((category, catIndex) => (
          <motion.div key={category.title} variants={item}>
            <Card>
              <div className="flex items-center gap-4 mb-6">
                <IconContainer
                  size="md"
                  variant="accent"
                  icon={<category.icon className="text-accent text-xl" />}
                />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {category.title}
                </h3>
              </div>

              <div className="flex flex-wrap gap-3">
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
