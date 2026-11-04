'use client';

import {
  FaCode,
  FaTools,
  FaLayerGroup,
  FaJava,
  FaDatabase,
  FaRobot,
  FaBrain,
} from 'react-icons/fa';
import {
  SiGo,
  SiPython,
  SiTypescript,
  SiFastapi,
  SiLangchain,
  SiDjango,
  SiSpringboot,
  SiReact,
  SiNextdotjs,
  SiGit,
  SiLinux,
  SiDocker,
  SiKubernetes,
  SiPostgresql,
  SiMysql,
  SiRedis,
  SiMongodb,
  SiApachekafka,
  SiHelm,
  SiOpentelemetry,
} from 'react-icons/si';
import { Card, IconContainer, SkillTag } from '@/components/ui';
import type { SkillsTranslations } from '@/types';
import { IconType } from 'react-icons';

interface SkillsProps {
  skills: SkillsTranslations;
}

interface SkillCategory {
  id: string;
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
  fastapi: SiFastapi,
  langchain: SiLangchain,
  'langchain / langgraph': SiLangchain,
  'ai agents': FaRobot,
  'llm / rag': FaBrain,
  django: SiDjango,
  'spring boot': SiSpringboot,
  react: SiReact,
  'next.js': SiNextdotjs,
  git: SiGit,
  linux: SiLinux,
  docker: SiDocker,
  k8s: SiKubernetes,
  kubernetes: SiKubernetes,
  postgresql: SiPostgresql,
  mysql: SiMysql,
  redis: SiRedis,
  mongodb: SiMongodb,
  kafka: SiApachekafka,
  helm: SiHelm,
  opentelemetry: SiOpentelemetry,
};

export function Skills({ skills }: SkillsProps) {
  const categories: SkillCategory[] = [
    {
      id: 'languages',
      title: skills.languages.title,
      skills: skills.languages.value,
      icon: FaCode,
    },
    {
      id: 'frameworks',
      title: skills.frameworks.title,
      skills: skills.frameworks.value,
      icon: FaLayerGroup,
    },
    {
      id: 'tools',
      title: skills.tools.title,
      skills: skills.tools.value,
      icon: FaTools,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
      {categories.map((category) => (
        <Card key={category.id} className="p-5 md:p-6 h-full">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200/70 dark:border-white/10">
            <IconContainer
              size="sm"
              variant="accent"
              icon={<category.icon className="text-accent text-lg" />}
            />
            <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white flex-1 min-w-0">
              {category.title}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {category.skills.map((skill) => {
              const SkillIcon =
                skillIcons[skill.trim().toLowerCase()] ?? FaCode;
              return (
                <SkillTag
                  key={skill}
                  icon={<SkillIcon className="w-4 h-4 text-accent/80" />}
                >
                  {skill}
                </SkillTag>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
