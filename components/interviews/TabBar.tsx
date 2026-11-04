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
    <div className="flex items-center overflow-x-auto scrollbar-thin bg-gray-100/80 dark:bg-[#0d0d12] border-b border-gray-200/80 dark:border-white/10 px-2 shrink-0 h-9">
      {tabs.map((slug) => {
        const isActive = slug === activeTab;
        const isSplit = slug === splitSlug;

        return (
          <div
            key={slug}
            className={cn(
              'group relative flex items-center gap-1 shrink-0 h-full border-r border-gray-200/70 dark:border-white/10 transition-colors duration-150',
              'text-xs font-medium max-w-[220px]',
              isActive
                ? 'bg-white dark:bg-[#121218] text-gray-900 dark:text-white font-semibold'
                : isSplit
                  ? 'bg-accent/10 text-accent'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/5 hover:text-gray-800 dark:hover:text-gray-200'
            )}
          >
            {isActive && (
              <span className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
            )}
            <button
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelectTab(slug)}
              className="pl-3 pr-1 h-full flex items-center truncate"
              title={getTitle(slug)}
            >
              {getTitle(slug)}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSplitTab(slug);
              }}
              className={cn(
                'hidden md:inline-flex p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                'hover:bg-black/10 dark:hover:bg-white/10',
                isSplit && 'opacity-100 text-accent'
              )}
              title={isSplit ? 'Close split' : 'Open in split view'}
            >
              <HiArrowsPointingOut className="w-3 h-3" />
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(slug);
                }}
                className={cn(
                  'p-1 mr-1.5 rounded transition-opacity hover:bg-black/10 dark:hover:bg-white/10',
                  'opacity-100 lg:opacity-0 lg:group-hover:opacity-100',
                  isActive && 'lg:opacity-100'
                )}
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
