'use client';

import { motion } from 'framer-motion';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';

interface DetailsProps {
  t: any;
}

export function Details({ t }: DetailsProps) {
  const details = [
    {
      ...t.details.email,
      icon: FiMail,
    },
    {
      ...t.details.phone,
      icon: FiPhone,
    },
    {
      ...t.details.wechat,
      icon: FiMessageSquare,
    },
    {
      ...t.details.address,
      icon: FiMapPin,
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <section id="details" className="py-12">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <span className="text-accent text-sm font-bold uppercase tracking-wider block mb-2">
          {t.details.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black gradient-text">
          {t.details.title}
        </h2>
      </motion.div>

      {/* Contact Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 max-w-3xl mx-auto"
      >
        {details.map((detail, index) => {
          const Icon = detail.icon;
          return (
            <motion.div
              key={index}
              variants={item}
              className="glass-card p-5 md:p-6 group hover:border-accent transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex-shrink-0 flex items-center justify-center border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-surface-dark group-hover:border-accent group-hover:shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all duration-300">
                  <Icon className="text-lg md:text-xl text-gray-600 dark:text-gray-300 group-hover:text-accent transition-colors duration-300" />
                </div>

                <div className="flex-1 min-w-0">
                  <dt className="text-gray-500 dark:text-gray-400 text-xs md:text-sm font-semibold uppercase tracking-wider mb-1">
                    {detail.label}
                  </dt>
                  <dd className="text-gray-900 dark:text-white font-semibold text-sm md:text-base break-words">
                    {detail.value}
                  </dd>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
