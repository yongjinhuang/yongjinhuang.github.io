import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  tagline?: string;
  title: string;
  className?: string;
  align?: 'left' | 'center';
}

export function SectionHeader({
  tagline,
  title,
  className,
  align = 'left',
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 md:mb-8 pb-3 border-b-2 border-gray-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4',
        align === 'center' &&
          'text-center sm:flex-col sm:items-center sm:justify-center',
        className
      )}
    >
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
        {title}
      </h2>
      {tagline && (
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {tagline}
        </span>
      )}
    </div>
  );
}
