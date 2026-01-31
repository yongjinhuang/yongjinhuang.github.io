'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SkillTagProps {
  children: string;
  delay?: number;
  className?: string;
}

export function SkillTag({ children, delay = 0, className }: SkillTagProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -2 }}
      className={cn(
        'px-4 py-2 bg-gray-100 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10',
        'text-sm font-semibold text-gray-700 dark:text-gray-200',
        'hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(251,191,36,0.2)]',
        'transition-all duration-300 cursor-default',
        className
      )}
    >
      {children}
    </motion.span>
  );
}
