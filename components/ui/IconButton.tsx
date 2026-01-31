'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface IconButtonProps extends Omit<HTMLMotionProps<'a'>, 'children'> {
  icon: React.ReactNode;
  href: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'accent';
  className?: string;
  'aria-label': string;
}

const sizeClasses = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12 md:w-14 md:h-14',
  lg: 'w-14 h-14 md:w-16 md:h-16',
};

export function IconButton({
  icon,
  href,
  size = 'md',
  variant = 'default',
  className,
  ...props
}: IconButtonProps) {
  return (
    <motion.a
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'rounded-full flex items-center justify-center transition-all duration-300',
        'bg-white dark:bg-surface-dark border-2',
        variant === 'default' &&
          'border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:border-accent hover:text-accent hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        variant === 'accent' &&
          'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 hover:border-accent',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {icon}
    </motion.a>
  );
}
