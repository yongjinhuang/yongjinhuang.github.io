'use client';

import { cn } from '@/lib/utils';

interface IconContainerProps {
  icon: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'accent' | 'accent-filled';
  className?: string;
}

const sizeClasses = {
  sm: 'w-10 h-10 md:w-12 md:h-12',
  md: 'w-12 h-12 md:w-14 md:h-14',
  lg: 'w-14 h-14 md:w-16 md:h-16',
};

export function IconContainer({
  icon,
  size = 'md',
  variant = 'default',
  className,
}: IconContainerProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        sizeClasses[size],
        variant === 'default' &&
          'border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-surface-dark group-hover:border-accent group-hover:shadow-glow-accent',
        variant === 'accent' &&
          'border-2 border-accent/30 bg-accent/10 group-hover:bg-accent/20 group-hover:border-accent group-hover:shadow-glow-accent',
        variant === 'accent-filled' &&
          'bg-accent text-accent-foreground border-3 border-black shadow-[4px_4px_0_#000] group-hover:shadow-[6px_6px_0_#000]',
        className
      )}
    >
      {icon}
    </div>
  );
}
