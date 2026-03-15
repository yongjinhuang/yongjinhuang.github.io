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

function TimelineDot({
  index,
  logoUrl,
  name,
}: {
  readonly index: number;
  readonly logoUrl: string;
  readonly name: string;
}) {
  return (
    <div className="absolute left-0 z-10 flex items-center">
      {/* Outer pulsing ring */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
        className="relative w-12 h-12"
      >
        {/* Pulse animation ring */}
        <motion.div
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.4, 0, 0.4],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: index * 0.5,
          }}
          className="absolute inset-0 rounded-full border-2 border-accent"
        />

        {/* Glow background */}
        <div className="absolute inset-0 rounded-full bg-accent/20 dark:bg-accent/10 blur-sm" />

        {/* Logo container */}
        <div className="relative w-12 h-12 rounded-full border-[3px] border-accent bg-white dark:bg-surface-darker overflow-hidden shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_40%,transparent)]">
          <Image
            width={48}
            height={48}
            src={logoUrl}
            alt={`${name} logo`}
            className="w-full h-full object-cover"
          />
        </div>
      </motion.div>

      {/* Connector line from dot to card */}
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: index * 0.1 + 0.4 }}
        className="h-[2px] w-4 origin-left bg-gradient-to-r from-accent to-accent/30"
      />
    </div>
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
    <section id="experience" className="py-12">
      <SectionHeader tagline={experience.tagline} title={experience.title} />

      <div className="relative max-w-5xl mx-auto">
        {/* Animated gradient timeline line */}
        <div className="absolute left-[23px] top-0 bottom-0 w-[2px]">
          {/* Base line */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent via-accent/60 to-accent/20 rounded-full" />

          {/* Animated glow traveling down */}
          <motion.div
            animate={{
              top: ['-20%', '120%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute left-1/2 -translate-x-1/2 w-[6px] h-24 rounded-full"
            style={{
              background:
                'linear-gradient(to bottom, transparent, var(--accent), transparent)',
              filter: 'blur(3px)',
            }}
          />

          {/* Subtle static glow */}
          <div
            className="absolute inset-0 w-[6px] -left-[2px] rounded-full opacity-30"
            style={{
              background:
                'linear-gradient(to bottom, var(--accent), transparent, var(--accent), transparent)',
              filter: 'blur(4px)',
            }}
          />
        </div>

        <div className="space-y-10 md:space-y-14">
          {experiences.map((exp, index) => (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              key={index}
              className="relative flex items-start"
            >
              <TimelineDot
                index={index}
                logoUrl={exp.logoUrl}
                name={exp.name}
              />

              {/* Content Card */}
              <div className="w-full ml-[4.5rem]">
                <Card className="p-6 relative overflow-hidden">
                  {/* Accent top border gradient */}
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent via-accent/50 to-transparent" />

                  {/* Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white group-hover:text-accent transition-colors duration-300">
                        <a
                          href={exp.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline underline-offset-4"
                        >
                          {exp.name}
                        </a>
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 font-medium text-sm md:text-base">
                        {exp.position}
                      </p>
                    </div>
                  </div>

                  {/* Period */}
                  <div className="flex items-center gap-2 mb-4 text-accent">
                    <FaCalendarAlt className="text-sm" />
                    <span className="text-sm font-mono font-semibold">
                      {exp.period}
                    </span>
                  </div>

                  {/* Tech Stack */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {exp.techStack.split(',').map((tech, techIndex) => (
                      <span
                        key={techIndex}
                        className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-accent hover:text-accent transition-colors duration-300"
                      >
                        {tech.trim()}
                      </span>
                    ))}
                  </div>

                  {/* Responsibilities */}
                  <ul className="space-y-2">
                    {exp.responsibilities.map((responsibility, respIndex) => (
                      <motion.li
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 0.3,
                          delay: respIndex * 0.05,
                        }}
                        key={respIndex}
                        className="flex items-start gap-2.5 text-gray-700 dark:text-gray-200 text-sm"
                      >
                        <span className="flex-shrink-0 w-1.5 h-1.5 mt-2 bg-accent rounded-full shadow-[0_0_6px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />
                        <div className="flex-1">
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
                              strong: ({ ...props }) => (
                                <strong
                                  {...props}
                                  className="text-accent font-semibold"
                                />
                              ),
                            }}
                          >
                            {responsibility}
                          </ReactMarkdown>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                </Card>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
