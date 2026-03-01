'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { InterviewCategory } from '@/types';
import { SidebarItem } from './SidebarItem';
import { HiChevronDown, HiChevronRight, HiFolderOpen } from 'react-icons/hi2';

interface SidebarProps {
  readonly categories: readonly InterviewCategory[];
  readonly selectedSlug: string;
  readonly onSelect: (slug: string) => void;
}

export function Sidebar({ categories, selectedSlug, onSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (name: string) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="glass-card p-4 h-full overflow-y-auto max-h-[calc(100vh-8rem)]">
      <h3 className="text-sm font-bold uppercase tracking-wider text-accent mb-4 px-3">
        Files
      </h3>
      <nav className="space-y-3">
        {categories.map((category) => {
          const isCollapsed = collapsed[category.name] ?? false;
          const hasSelected = category.files.some(
            (f) => f.slug === selectedSlug
          );

          if (categories.length === 1) {
            return (
              <div key={category.name} className="space-y-1">
                {category.files.map((file) => (
                  <SidebarItem
                    key={file.slug}
                    file={file}
                    isSelected={file.slug === selectedSlug}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            );
          }

          return (
            <div key={category.name}>
              <button
                onClick={() => toggleCategory(category.name)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200',
                  'text-xs font-bold uppercase tracking-wider',
                  hasSelected
                    ? 'text-accent'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                )}
              >
                {isCollapsed ? (
                  <HiChevronRight className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <HiChevronDown className="w-3.5 h-3.5 shrink-0" />
                )}
                <HiFolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{category.label}</span>
                <span className="ml-auto text-[10px] font-normal opacity-60">
                  {category.files.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-gray-200 dark:border-white/10 pl-1">
                  {category.files.map((file) => (
                    <SidebarItem
                      key={file.slug}
                      file={file}
                      isSelected={file.slug === selectedSlug}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
