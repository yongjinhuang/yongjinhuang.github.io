import { cn } from '@/lib/utils';

interface IconButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: React.ReactNode;
  href: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'accent';
  className?: string;
  'aria-label': string;
}

const sizeClasses = {
  sm: 'w-9 h-9',
  md: 'w-11 h-11',
  lg: 'w-13 h-13',
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
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'rounded-lg flex items-center justify-center transition-[transform,box-shadow,border-color,background-color,color] duration-200',
        'bg-white dark:bg-surface-dark border-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variant === 'default' &&
          'border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300 hover:border-accent hover:text-accent hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--accent)]',
        variant === 'accent' &&
          'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 hover:border-accent hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--accent)]',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {icon}
    </a>
  );
}
