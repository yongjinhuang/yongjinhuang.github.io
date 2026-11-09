'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { InterviewFile } from '@/types';
import { HiDocumentText } from 'react-icons/hi2';

interface SidebarItemProps {
  readonly file: InterviewFile;
  readonly isSelected: boolean;
  readonly onSelect: (slug: string) => void;
  readonly locateTrigger?: number;
}

export function SidebarItem({
  file,
  isSelected,
  onSelect,
  locateTrigger = 0,
}: SidebarItemProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected, locateTrigger]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(file.slug)}
      aria-current={isSelected ? 'page' : undefined}
      className={cn(
        'w-full text-left px-2.5 py-1.5 rounded-md flex items-center gap-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'text-xs font-medium',
        isSelected
          ? 'bg-accent/15 text-accent font-semibold'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
      )}
    >
      <HiDocumentText
        aria-hidden="true"
        className={cn(
          'w-3.5 h-3.5 shrink-0',
          isSelected ? 'text-accent' : 'text-gray-400 dark:text-gray-500'
        )}
      />
      <span className="truncate">{file.title}</span>
    </button>
  );
}
