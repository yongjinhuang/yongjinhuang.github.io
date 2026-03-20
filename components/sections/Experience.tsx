'use client';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { FaCalendarAlt } from 'react-icons/fa';
import { SectionHeader, Card } from '@/components/ui';
import type {
  ExperienceTranslations,
  CompanyExperienceTranslations,
} from '@/types';

interface ExperienceProps {
  experience: ExperienceTranslations;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0 },
};

function ExperienceCard({
  exp,
  isCurrent,
}: {
  readonly exp: CompanyExperienceTranslations;
  readonly isCurrent: boolean;
}) {
  return (
    <Card className="p-5 md:p-6 relative overflow-hidden h-full">
      {/* Accent top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent via-accent/50 to-transparent" />

      {/* Header: Logo + Company + Badge */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg border-2 border-gray-200 dark:border-white/10 overflow-hidden flex-shrink-0 bg-white">
          <Image
            width={40}
            height={40}
            src={exp.logoUrl}
            alt={`${exp.name} logo`}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white truncate">
              <a
                href={exp.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                {exp.name}
              </a>
            </h3>
            {isCurrent && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-accent/15 text-accent border border-accent/30 rounded-full flex-shrink-0">
                Current
              </span>
            )}
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">
            {exp.position}
          </p>
        </div>
      </div>

      {/* Period */}
      <div className="flex items-center gap-1.5 mb-3 text-accent">
        <FaCalendarAlt className="text-xs" />
        <span className="text-xs font-mono font-semibold">{exp.period}</span>
      </div>

      {/* Tech Stack */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {exp.techStack.split(',').map((tech, techIndex) => (
          <span
            key={techIndex}
            className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-accent hover:text-accent transition-colors duration-300"
          >
            {tech.trim()}
          </span>
        ))}
      </div>

      {/* Responsibilities (top 3) */}
      <ul className="space-y-1.5">
        {exp.responsibilities.slice(0, 3).map((responsibility, respIndex) => (
          <li
            key={respIndex}
            className="flex items-start gap-2 text-gray-700 dark:text-gray-200 text-xs md:text-sm"
          >
            <span className="flex-shrink-0 w-1 h-1 mt-1.5 bg-accent rounded-full" />
            <div className="flex-1 line-clamp-2">
              <ReactMarkdown
                components={{
                  p: ({ ...props }) => <span {...props} />,
                  a: ({ ...props }) => (
                    <a
                      {...props}
                      className="text-accent hover:underline underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ),
                }}
              >
                {responsibility}
              </ReactMarkdown>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Experience({ experience }: ExperienceProps) {
  const experiences: CompanyExperienceTranslations[] = [
    experience.company.wilddata,
    experience.company.tarro,
    experience.company.shopee,
    experience.company.huawei,
  ];

  return (
    <section id="experience" className="py-4 md:py-6">
      <SectionHeader tagline={experience.tagline} title={experience.title} />

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-6xl mx-auto"
      >
        {experiences.map((exp, index) => (
          <motion.div key={index} variants={item} className="h-full">
            <ExperienceCard exp={exp} isCurrent={index === 0} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
