import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
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
    <div
      className={cn(
        'glass-card rounded-xl p-6 md:p-8 group',
        !hover && 'glass-card-static',
        variant === 'accent' && '!border-accent',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
