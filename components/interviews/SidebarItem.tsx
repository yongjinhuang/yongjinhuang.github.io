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
      onClick={() => onSelect(file.slug)}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200',
        'text-sm font-medium',
        isSelected
          ? 'bg-accent/20 text-accent border-l-4 border-accent'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-accent'
      )}
    >
      <HiDocumentText className="w-4 h-4 shrink-0" />
      <span className="truncate">{file.title}</span>
    </button>
  );
}
