'use client';

import { motion } from 'framer-motion';
import {
  FaCode,
  FaTools,
  FaLayerGroup,
  FaJava,
  FaDatabase,
} from 'react-icons/fa';
import {
  SiGo,
  SiPython,
  SiTypescript,
  SiDjango,
  SiSpringboot,
  SiReact,
  SiNextdotjs,
  SiGit,
  SiLinux,
  SiDocker,
  SiKubernetes,
  SiMysql,
  SiRedis,
  SiMongodb,
  SiApachekafka,
  SiHelm,
} from 'react-icons/si';
import { Card, IconContainer } from '@/components/ui';
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

const skillIcons: Record<string, IconType> = {
  golang: SiGo,
  go: SiGo,
  python: SiPython,
  typescript: SiTypescript,
  java: FaJava,
  sql: FaDatabase,
  gin: SiGo,
  django: SiDjango,
  'spring boot': SiSpringboot,
  react: SiReact,
  'next.js': SiNextdotjs,
  git: SiGit,
  linux: SiLinux,
  docker: SiDocker,
  k8s: SiKubernetes,
  kubernetes: SiKubernetes,
  mysql: SiMysql,
  redis: SiRedis,
  mongodb: SiMongodb,
  kafka: SiApachekafka,
  helm: SiHelm,
};

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
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      {categories.map((category, catIndex) => (
        <motion.div key={category.title} variants={item} className="h-full">
          <Card className="p-4 md:p-5 h-full">
            <div className="flex items-center gap-3 mb-3">
              <IconContainer
                size="sm"
                variant="accent"
                icon={<category.icon className="text-accent text-lg" />}
              />
              <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white flex-1 min-w-0">
                {category.title}
              </h3>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 flex-shrink-0">
                {category.skills.length}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {category.skills.map((skill, index) => {
                const SkillIcon =
                  skillIcons[skill.trim().toLowerCase()] ?? FaCode;
                return (
                  <motion.span
                    key={skill}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.05 + catIndex * 0.1,
                    }}
                    whileHover={{ y: -2 }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-100 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(251,191,36,0.2)] transition-all duration-300 cursor-default group/skill"
                  >
                    <SkillIcon className="w-4 h-4 text-accent/80 group-hover/skill:text-accent transition-colors flex-shrink-0" />
                    <span>{skill}</span>
                  </motion.span>
                );
              })}
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
