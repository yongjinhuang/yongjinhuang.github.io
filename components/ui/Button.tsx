'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ButtonBaseProps {
  variant?: 'default' | 'accent' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

interface ButtonAsButton
  extends ButtonBaseProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> {
  as?: 'button';
  href?: never;
}

interface ButtonAsLink
  extends ButtonBaseProps,
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> {
  as: 'link';
  href: string;
  download?: boolean;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

const sizeClasses = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-6 py-3 text-sm md:text-base',
  lg: 'px-8 py-4 text-base md:text-lg',
};

const variantClasses = {
  default:
    'bg-white dark:bg-surface-dark text-gray-900 dark:text-white border-gray-900 dark:border-white/30',
  accent: 'brutal-btn-accent',
  ghost:
    'bg-transparent border-transparent shadow-none hover:shadow-none hover:transform-none',
};

export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(function Button(props, ref) {
  const {
    variant = 'default',
    size = 'md',
    children,
    className,
    ...rest
  } = props;

  const baseClasses = cn(
    'brutal-btn inline-flex items-center justify-center gap-2 font-semibold transition-all duration-300',
    sizeClasses[size],
    variantClasses[variant],
    className
  );

  if (props.as === 'link') {
    const { href, download, ...linkRest } = rest as ButtonAsLink;
    return (
      <Link
        href={href}
        download={download}
        className={baseClasses}
        ref={ref as React.Ref<HTMLAnchorElement>}
        {...linkRest}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={baseClasses}
      ref={ref as React.Ref<HTMLButtonElement>}
      {...(rest as ButtonAsButton)}
    >
      {children}
    </button>
  );
});
