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
        sizeClasses[size],
        variant === 'default' &&
          'border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-surface-dark group-hover:border-accent group-hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]',
        variant === 'accent' &&
          'border-2 border-accent/30 bg-accent/10 group-hover:bg-accent/20 group-hover:border-accent',
        variant === 'accent-filled' &&
          'bg-accent border-3 border-black shadow-[4px_4px_0_#000] group-hover:shadow-[6px_6px_0_#000]',
        className
      )}
    >
      {icon}
    </div>
  );
}
