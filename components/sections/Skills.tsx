'use client';

import { FaCode, FaTools, FaLayerGroup } from 'react-icons/fa';
import { Card, SkillTag } from '@/components/ui';
import { getSkillIcon } from '@/lib/skills';
import type { SkillsTranslations } from '@/types';
import type { IconType } from 'react-icons';

interface SkillsProps {
  skills: SkillsTranslations;
}

interface SkillCategory {
  id: string;
  title: string;
  skills: string[];
  icon: IconType;
}

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
    <Card className="p-5 md:p-6">
      <dl className="divide-y divide-gray-200/80 dark:divide-white/10">
        {categories.map((category) => {
          const CategoryIcon = category.icon;
          return (
            <div
              key={category.id}
              className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-6"
            >
              <dt className="sm:w-48 md:w-56 shrink-0 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">
                <CategoryIcon
                  aria-hidden="true"
                  className="w-4 h-4 text-accent shrink-0"
                />
                <span>{category.title}</span>
              </dt>
              <dd className="flex flex-wrap gap-1.5 flex-1">
                {category.skills.map((skill) => {
                  const SkillIcon = getSkillIcon(skill);
                  return (
                    <SkillTag
                      key={skill}
                      icon={
                        <SkillIcon aria-hidden="true" className="w-3.5 h-3.5" />
                      }
                    >
                      {skill}
                    </SkillTag>
                  );
                })}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
