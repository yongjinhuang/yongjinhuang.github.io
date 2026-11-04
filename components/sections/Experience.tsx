'use client';

import Image from 'next/image';
import ReactMarkdown, { type Components } from 'react-markdown';
import { FiExternalLink } from 'react-icons/fi';
import { SectionHeader, Card } from '@/components/ui';
import { cn, isCJK } from '@/lib/utils';
import type {
  ExperienceTranslations,
  CompanyExperienceTranslations,
} from '@/types';

interface ExperienceProps {
  experience: ExperienceTranslations;
}

const markdownComponents: Components = {
  p: ({ ...props }) => <span {...props} />,
  a: ({ ...props }) => (
    <a
      {...props}
      className="break-words text-accent font-medium underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  strong: ({ ...props }) => (
    <strong
      {...props}
      className="font-semibold text-gray-900 dark:text-white underline decoration-accent/50 decoration-2 underline-offset-2"
    />
  ),
  code: ({ ...props }) => (
    <code
      {...props}
      className="break-words rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-white/10 dark:text-gray-100"
    />
  ),
};

function ExperienceCard({
  exp,
  isCurrent,
  currentLabel,
}: {
  readonly exp: CompanyExperienceTranslations;
  readonly isCurrent: boolean;
  readonly currentLabel: string;
}) {
  const techItems = exp.techStack
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <Card
      variant={isCurrent ? 'accent' : 'default'}
      className={cn(
        'relative overflow-hidden p-6 md:p-8',
        isCurrent && 'border-l-4 !border-l-accent'
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 items-start">
        {/* Left Column: Tenure, Company Identity & Stack */}
        <div className="md:col-span-4 flex flex-col gap-3 md:border-r md:border-gray-200/80 md:dark:border-white/10 md:pr-6">
          <div className="flex items-center gap-2 flex-wrap">
            <time className="text-xs font-mono font-semibold text-accent">
              {exp.period}
            </time>
            {isCurrent && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold bg-accent/15 text-accent border border-accent/30 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                {currentLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-gray-200 dark:border-white/15 overflow-hidden flex-shrink-0 bg-white p-0.5">
              <Image
                width={40}
                height={40}
                src={exp.logoUrl}
                alt={`${exp.name} logo`}
                className="w-full h-full object-contain rounded"
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white leading-snug">
                <a
                  href={exp.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 break-words transition-colors hover:text-accent group/link"
                >
                  <span>{exp.name}</span>
                  <FiExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 group-hover/link:text-accent group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                </a>
              </h3>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {exp.position}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {techItems.map((tech) => (
              <span
                key={tech}
                className="border border-gray-200/90 bg-gray-100/80 px-2 py-0.5 font-mono text-[11px] font-medium text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 rounded"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Right Column: Engineering Impact */}
        <div className="md:col-span-8">
          <ul className="space-y-2.5">
            {exp.responsibilities.map((responsibility, respIndex) => (
              <li
                key={respIndex}
                className="flex items-start gap-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200 max-w-[68ch]"
              >
                <span className="flex-shrink-0 w-1.5 h-1.5 mt-2 bg-accent rounded-full" />
                <div className="min-w-0 flex-1">
                  <ReactMarkdown components={markdownComponents}>
                    {responsibility}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function Experience({ experience }: ExperienceProps) {
  const experiences = Object.entries(experience.company).map(([id, data]) => ({
    id,
    data,
  }));

  const defaultCurrentLabel = isCJK(experience.title) ? '在职' : 'Current';

  return (
    <section id="experience" className="py-4 md:py-6 scroll-mt-28">
      <SectionHeader tagline={experience.tagline} title={experience.title} />

      <div className="space-y-4 md:space-y-5 max-w-6xl mx-auto">
        {experiences.map(({ id, data: exp }) => (
          <ExperienceCard
            key={id}
            exp={exp}
            isCurrent={/present|至今/i.test(exp.period)}
            currentLabel={experience.currentBadge ?? defaultCurrentLabel}
          />
        ))}
      </div>
    </section>
  );
}
