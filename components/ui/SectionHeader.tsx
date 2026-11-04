'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  tagline: string;
  title: string;
  className?: string;
  align?: 'left' | 'center';
}

export function SectionHeader({
  tagline,
  title,
  className,
  align = 'center',
}: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={cn(
        'mb-6 md:mb-8',
        align === 'center' && 'text-center',
        className
      )}
    >
      <span className="text-accent text-xs md:text-sm font-bold uppercase tracking-widest block mb-2">
        {tagline}
      </span>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
        {title}
      </h2>
    </motion.div>
  );
}
