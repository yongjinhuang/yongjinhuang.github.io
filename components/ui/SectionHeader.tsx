'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HiChevronDown } from 'react-icons/hi2';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  tagline?: string;
  title: string;
  className?: string;
  align?: 'left' | 'center';
  isExpanded?: boolean;
  controlsId?: string;
  onToggle?: () => void;
}

export function SectionHeader({
  tagline,
  title,
  className,
  align = 'left',
  isExpanded,
  controlsId,
  onToggle,
}: SectionHeaderProps) {
  const isCollapsible = typeof onToggle === 'function';

  const headerContent = (
    <>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 min-w-0 text-left">
        <span
          className={cn(
            'text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-[-0.025em] leading-tight text-balance transition-colors',
            isCollapsible && 'group-hover:text-accent'
          )}
        >
          {title}
        </span>
        {tagline && (
          <span className="text-sm font-mono font-medium text-gray-500 dark:text-gray-400">
            {tagline}
          </span>
        )}
      </div>

      {isCollapsible && (
        <span
          aria-hidden="true"
          className="w-8 h-8 rounded-lg border border-gray-200 dark:border-white/15 bg-white/80 dark:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:border-accent group-hover:text-accent transition-colors shrink-0"
        >
          <HiChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isExpanded === false && '-rotate-90'
            )}
          />
        </span>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'pb-3.5 border-b-2 border-gray-200/80 dark:border-white/10 transition-colors',
        isExpanded === false ? 'mb-0' : 'mb-6 md:mb-8',
        isCollapsible && 'hover:border-accent/60',
        align === 'center' && 'text-center justify-center',
        className
      )}
    >
      {isCollapsible ? (
        <h2 className="m-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={controlsId}
            className="w-full flex items-center justify-between gap-4 select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            {headerContent}
          </button>
        </h2>
      ) : (
        <h2 className="m-0 flex items-center justify-between gap-4">
          {headerContent}
        </h2>
      )}
    </div>
  );
}

interface CollapsibleSectionProps {
  id: string;
  title: string;
  tagline?: string;
  defaultExpanded?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  tagline,
  defaultExpanded = true,
  className,
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const prefersReducedMotion = useReducedMotion();
  const panelId = `${id}-panel`;

  // Auto-expand when user navigates to this section via hash link (#experience, #skills, etc.)
  useEffect(() => {
    const expandIfTargeted = () => {
      if (window.location.hash === `#${id}`) {
        setIsExpanded(true);
      }
    };

    expandIfTargeted();
    window.addEventListener('hashchange', expandIfTargeted);
    return () => window.removeEventListener('hashchange', expandIfTargeted);
  }, [id]);

  return (
    <section id={id} className={cn('scroll-mt-28 flex flex-col', className)}>
      <SectionHeader
        title={title}
        tagline={tagline}
        isExpanded={isExpanded}
        controlsId={panelId}
        onToggle={() => setIsExpanded((prev) => !prev)}
      />
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={panelId}
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={
              prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
            }
            transition={{
              duration: prefersReducedMotion ? 0 : 0.22,
              ease: 'easeInOut',
            }}
            className="overflow-hidden flex-1 flex flex-col"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
