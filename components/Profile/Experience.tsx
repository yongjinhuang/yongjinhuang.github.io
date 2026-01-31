'use client';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { FaCalendarAlt } from 'react-icons/fa';

interface CompanyExperience {
  name: string;
  position: string;
  period: string;
  techStack: string;
  project?: string;
  responsibilities: string[];
  logoUrl: string;
  linkUrl: string;
}

interface ExperienceProps {
  t: any;
}

export function Experience({ t }: ExperienceProps) {
  const experiences: CompanyExperience[] = [
    t.experience.company.wilddata,
    t.experience.company.tarro,
    t.experience.company.shopee,
    t.experience.company.huawei,
  ];

  return (
    <section id="experience" className="py-16">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <span className="text-accent text-sm font-bold uppercase tracking-wider block mb-2">
          {t.experience.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black gradient-text">
          {t.experience.title}
        </h2>
      </motion.div>

      {/* Timeline */}
      <div className="relative max-w-5xl mx-auto">
        {/* Vertical Timeline Line */}
        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[3px] bg-accent/50 dark:bg-accent/30 md:-translate-x-1/2" />

        <div className="space-y-12 md:space-y-16">
          {experiences.map((experience, index) => (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              key={index}
              className={`relative flex items-start ${
                index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
              }`}
            >
              {/* Timeline Dot */}
              <div className="absolute left-4 md:left-1/2 md:-translate-x-1/2 z-10">
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 + 0.2 }}
                  className="w-4 h-4 bg-accent border-[3px] border-white dark:border-surface-darker shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                />
              </div>

              {/* Content Card */}
              <div
                className={`w-full md:w-[calc(50%-2.5rem)] ml-12 md:ml-0 ${
                  index % 2 === 0 ? 'md:pr-10' : 'md:pl-10'
                }`}
              >
                <motion.div
                  whileHover={{ y: -4 }}
                  className="glass-card p-6 group hover:border-accent transition-all duration-300"
                >
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-4">
                    {/* Logo */}
                    <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 bg-white border-2 border-gray-200 dark:border-white/10 overflow-hidden group-hover:border-accent transition-colors duration-300">
                      <Image
                        width={56}
                        height={56}
                        src={experience.logoUrl}
                        alt={`${experience.name} logo`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white group-hover:text-accent transition-colors duration-300">
                        <a
                          href={experience.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline underline-offset-4"
                        >
                          {experience.name}
                        </a>
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 font-medium text-sm md:text-base">
                        {experience.position}
                      </p>
                    </div>
                  </div>

                  {/* Period */}
                  <div className="flex items-center gap-2 mb-4 text-accent">
                    <FaCalendarAlt className="text-sm" />
                    <span className="text-sm font-mono font-semibold">
                      {experience.period}
                    </span>
                  </div>

                  {/* Tech Stack */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {experience.techStack.split(',').map((tech, techIndex) => (
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
                    {experience.responsibilities.map(
                      (responsibility, respIndex) => (
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
                          <span className="flex-shrink-0 w-1.5 h-1.5 mt-2 bg-accent rounded-full shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
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
                      )
                    )}
                  </ul>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
