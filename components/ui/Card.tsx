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
  hover = false,
  className,
  ...props
}: CardProps) {
  return (
    <motion.div
      className={cn(
        'glass-card p-6 md:p-8 group',
        !hover && 'glass-card-static',
        variant === 'accent' && '!border-accent',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
