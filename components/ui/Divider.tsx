import { cn } from '@/lib/utils';

interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return (
    <div
      className={cn(
        'w-full h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent my-8 md:my-12',
        className
      )}
    />
  );
}
