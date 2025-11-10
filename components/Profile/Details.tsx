'use client';

import { motion } from 'framer-motion';
import { FiPhone, FiMail, FiMapPin, FiMessageSquare } from 'react-icons/fi';

interface DetailsProps {
  t: any;
}

export function Details({ t }: DetailsProps) {
  const details = [
    {
      ...t.details.phone,
      icon: <FiPhone className="text-cyan-500 dark:text-cyan-400" />,
    },
    {
      ...t.details.wechat,
      icon: <FiMessageSquare className="text-cyan-500 dark:text-cyan-400" />,
    },
    {
      ...t.details.address,
      icon: <FiMapPin className="text-cyan-500 dark:text-cyan-400" />,
    },
    {
      ...t.details.email,
      icon: <FiMail className="text-cyan-500 dark:text-cyan-400" />,
    },
  ];

  return (
    <section id="details" className="py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <span className="text-cyan-400 text-sm font-semibold uppercase tracking-wider block mb-2">
          {t.details.tagline}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold gradient-text">
          {t.details.title}
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {details.map((item, index) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            key={index}
            className="glass-card p-5 hover:scale-105 transition-transform duration-300"
          >
            <div className="flex items-center mb-3">
              <div className="text-cyan-400">{item.icon}</div>
              <dt className="text-gray-700 dark:text-gray-100 text-sm font-semibold ml-2">
                {item.label}
              </dt>
            </div>
            <dd className="text-gray-800 dark:text-white font-medium break-words text-sm md:text-base">
              {item.value}
            </dd>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
