'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SkillTagProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  delay?: number;
  className?: string;
}

export function SkillTag({
  children,
  icon,
  delay = 0,
  className,
}: SkillTagProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay }}
      className={cn(
        'brutal-pill inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-white/5',
        'text-sm font-semibold text-gray-800 dark:text-gray-200',
        'hover:border-accent hover:text-accent hover:shadow-glow-accent',
        'cursor-default',
        className
      )}
    >
      {icon && <span className="text-accent flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </motion.span>
  );
}
