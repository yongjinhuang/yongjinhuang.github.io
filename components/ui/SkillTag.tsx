import { cn } from '@/lib/utils';

interface SkillTagProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function SkillTag({ children, icon, className }: SkillTagProps) {
  return (
    <span
      className={cn(
        'brutal-pill inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-white/5',
        'text-sm font-semibold text-gray-800 dark:text-gray-200',
        'cursor-default',
        className
      )}
    >
      {icon && <span className="text-accent flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
