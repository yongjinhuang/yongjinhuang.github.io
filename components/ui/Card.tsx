'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: React.ReactNode;
  variant?: 'default' | 'accent';
  hover?: boolean;
  className?: string;
}

export function Card({
  children,
  variant = 'default',
  hover = true,
  className,
  ...props
}: CardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -4 } : undefined}
      className={cn(
        'glass-card p-6 md:p-8 group transition-all duration-300',
        hover && 'hover:border-accent',
        variant === 'accent' && 'border-accent',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
