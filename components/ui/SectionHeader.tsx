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
        'mb-12 md:mb-16',
        align === 'center' && 'text-center',
        className
      )}
    >
      <span className="text-accent text-sm font-bold uppercase tracking-wider block mb-2">
        {tagline}
      </span>
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-black gradient-text">
        {title}
      </h2>
    </motion.div>
  );
}
