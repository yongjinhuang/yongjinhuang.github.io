'use client';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { FaCheckCircle, FaCalendarAlt } from 'react-icons/fa';

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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <span className="text-cyan-400 text-sm font-semibold uppercase tracking-wider block mb-2">
          {t.experience.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold gradient-text">
          {t.experience.title}
        </h2>
      </motion.div>

      {/* Timeline */}
      <div className="relative max-w-5xl mx-auto">
        {/* Vertical line */}
        <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#667eea] via-[#4facfe] to-[#00f2fe] hidden md:block transform -translate-x-1/2" />
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#667eea] via-[#4facfe] to-[#00f2fe] md:hidden" />

        <div className="space-y-12">
          {experiences.map((experience, index) => (
            <motion.div
              initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              key={index}
              className={`relative flex items-start ${
                index % 2 === 0
                  ? 'md:flex-row flex-row'
                  : 'md:flex-row-reverse flex-row'
              }`}
            >
              {/* Timeline Dot */}
              <div className="absolute left-8 md:left-1/2 transform md:-translate-x-1/2 -translate-x-1/2">
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 + 0.3 }}
                  className="w-5 h-5 rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] border-4 border-white dark:border-[#0a0a0f] shadow-lg hover:scale-150 transition-transform duration-300"
                />
              </div>

              {/* Content */}
              <div
                className={`w-full md:w-[calc(50%-3rem)] ml-20 md:ml-0 ${
                  index % 2 === 0 ? 'md:pr-12' : 'md:pl-12'
                }`}
              >
                <motion.div
                  whileHover={{ y: -5 }}
                  className="glass-card p-6 group"
                >
                  {/* Header */}
                  <div className="flex items-start mb-4">
                    <div className="relative group/logo">
                      <Image
                        width={56}
                        height={56}
                        src={experience.logoUrl}
                        alt={`${experience.name} logo`}
                        className="h-14 w-14 rounded-full transition-transform duration-300 group-hover/logo:scale-110 shadow-lg"
                      />
                    </div>
                    <div className="ml-4 flex-1">
                      <h3 className="text-2xl font-bold gradient-text">
                        <a
                          href={experience.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {experience.name}
                        </a>
                      </h3>
                      <p className="text-gray-700 dark:text-gray-300 font-medium mt-1">
                        {experience.position}
                      </p>
                    </div>
                  </div>

                  {/* Date and Tech Stack */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="inline-flex items-center gap-2 text-cyan-400 font-semibold">
                      <FaCalendarAlt className="text-sm" />
                      <span className="text-sm">{experience.period}</span>
                    </div>
                  </div>

                  {/* Tech Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {experience.techStack.split(',').map((tech, techIndex) => (
                      <span
                        key={techIndex}
                        className="px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-white/5 backdrop-blur-sm border border-gray-300 dark:border-white/20 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-[#4facfe] hover:to-[#00f2fe] hover:text-white hover:border-cyan-400 transition-all duration-300"
                      >
                        {tech.trim()}
                      </span>
                    ))}
                  </div>

                  {/* Responsibilities */}
                  <ul className="space-y-3">
                    {experience.responsibilities.map(
                      (responsibility, respIndex) => (
                        <motion.li
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.3, delay: respIndex * 0.1 }}
                          key={respIndex}
                          className="flex items-start gap-3 text-gray-700 dark:text-gray-300"
                        >
                          <FaCheckCircle className="text-green-400 mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <ReactMarkdown
                              components={{
                                p: ({ ...props }) => <span {...props} />,
                                a: ({ ...props }) => (
                                  <a
                                    {...props}
                                    className="text-cyan-400 hover:text-cyan-300 underline transition-colors duration-300"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  />
                                ),
                                strong: ({ ...props }) => (
                                  <strong
                                    {...props}
                                    className="text-cyan-400 font-semibold"
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
