'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { InterviewFile } from '@/types';
import { HiXMark, HiArrowsPointingOut } from 'react-icons/hi2';

interface TabBarProps {
  readonly tabs: readonly string[];
  readonly activeTab: string;
  readonly splitSlug: string | null;
  readonly files: readonly InterviewFile[];
  readonly onSelectTab: (slug: string) => void;
  readonly onCloseTab: (slug: string) => void;
  readonly onSplitTab: (slug: string) => void;
}

export function TabBar({
  tabs,
  activeTab,
  splitSlug,
  files,
  onSelectTab,
  onCloseTab,
  onSplitTab,
}: TabBarProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeTab]);

  const getTitle = (slug: string) =>
    files.find((f) => f.slug === slug)?.title ?? slug;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin pb-1 min-h-[2.5rem]">
      {tabs.map((slug) => {
        const isActive = slug === activeTab;
        const isSplit = slug === splitSlug;

        return (
          <div
            key={slug}
            className={cn(
              'group flex items-center gap-1 shrink-0 rounded-t-lg border transition-all duration-200',
              'text-xs font-medium max-w-[200px]',
              isActive
                ? 'bg-accent/15 border-accent/30 text-accent'
                : isSplit
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
            )}
          >
            <button
              ref={isActive ? activeRef : undefined}
              onClick={() => onSelectTab(slug)}
              className="pl-3 py-1.5 truncate"
              title={getTitle(slug)}
            >
              {getTitle(slug)}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplitTab(slug);
              }}
              className={cn(
                'p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                'hover:bg-black/10 dark:hover:bg-white/10',
                isSplit && 'opacity-100 text-blue-500'
              )}
              title={isSplit ? 'Close split' : 'Open in split view'}
            >
              <HiArrowsPointingOut className="w-3 h-3" />
            </button>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(slug);
                }}
                className="p-1 pr-2 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10 dark:hover:bg-white/10"
                title="Close tab"
              >
                <HiXMark className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
