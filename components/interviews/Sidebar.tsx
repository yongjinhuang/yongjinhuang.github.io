'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { InterviewCategory, VaultInfo } from '@/types';
import { SidebarItem } from './SidebarItem';
import {
  HiChevronDown,
  HiChevronRight,
  HiFolderOpen,
  HiMagnifyingGlass,
  HiXMark,
  HiMapPin,
  HiMinus,
  HiBars3BottomLeft,
} from 'react-icons/hi2';
import { HiArchiveBox } from 'react-icons/hi2';

interface SidebarProps {
  readonly categories: readonly InterviewCategory[];
  readonly selectedSlug: string;
  readonly onSelect: (slug: string) => void;
  readonly vaults?: readonly VaultInfo[];
  readonly currentVault?: string;
  readonly onVaultChange?: (vault: string) => void;
}

export function Sidebar({
  categories,
  selectedSlug,
  onSelect,
  vaults,
  currentVault,
  onVaultChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [query, setQuery] = useState('');

  const toggleCategory = (name: string) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    categories.forEach((c) => {
      next[c.name] = false;
    });
    setCollapsed(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    categories.forEach((c) => {
      next[c.name] = true;
    });
    setCollapsed(next);
  };

  // Auto-expand the category containing the selected file
  useEffect(() => {
    const selectedCategory = categories.find((c) =>
      c.files.some((f) => f.slug === selectedSlug)
    );
    if (selectedCategory && collapsed[selectedCategory.name]) {
      setCollapsed((prev) => ({ ...prev, [selectedCategory.name]: false }));
    }
  }, [selectedSlug, categories, collapsed]);

  const isSearching = query.trim().length > 0;

  const filteredCategories = useMemo(() => {
    if (!isSearching) return categories;
    const lowerQuery = query.toLowerCase();
    return categories
      .map((category) => ({
        ...category,
        files: category.files.filter((f) =>
          f.title.toLowerCase().includes(lowerQuery)
        ),
      }))
      .filter((category) => category.files.length > 0);
  }, [categories, query, isSearching]);

  const totalResults = useMemo(
    () =>
      isSearching
        ? filteredCategories.reduce((sum, c) => sum + c.files.length, 0)
        : 0,
    [filteredCategories, isSearching]
  );

  return (
    <div className="glass-card p-4 h-full overflow-y-auto max-h-[calc(100vh-8rem)]">
      {/* Vault selector */}
      {vaults && vaults.length > 1 && onVaultChange && (
        <div className="mb-3 px-1">
          <div className="flex items-center gap-2 mb-1 px-2">
            <HiArchiveBox className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Vault
            </span>
          </div>
          <select
            value={currentVault}
            onChange={(e) => onVaultChange(e.target.value)}
            className={cn(
              'w-full px-3 py-2 text-sm font-semibold rounded-lg',
              'bg-gray-100 dark:bg-white/5',
              'border border-gray-200 dark:border-white/10',
              'text-gray-800 dark:text-gray-200',
              'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
              'transition-colors duration-200 cursor-pointer'
            )}
          >
            {vaults.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 px-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-accent">
          Files
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-gray-400 dark:text-gray-500 hover:text-accent transition-colors"
            title="Expand all"
          >
            <HiBars3BottomLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={collapseAll}
            className="text-gray-400 dark:text-gray-500 hover:text-accent transition-colors"
            title="Collapse all"
          >
            <HiMinus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const selectedCategory = categories.find((c) =>
                c.files.some((f) => f.slug === selectedSlug)
              );
              if (selectedCategory) {
                setCollapsed((prev) => ({
                  ...prev,
                  [selectedCategory.name]: false,
                }));
              }
              setLocateTrigger((prev) => prev + 1);
            }}
            className="text-gray-400 dark:text-gray-500 hover:text-accent transition-colors"
            title="Locate current file"
          >
            <HiMapPin className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-3 px-1">
        <HiMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          className={cn(
            'w-full pl-9 pr-8 py-2 text-sm rounded-lg',
            'bg-gray-100 dark:bg-white/5',
            'border border-gray-200 dark:border-white/10',
            'text-gray-800 dark:text-gray-200',
            'placeholder-gray-400 dark:placeholder-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
            'transition-colors duration-200'
          )}
        />
        {isSearching && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <HiXMark className="w-4 h-4" />
          </button>
        )}
      </div>

      {isSearching && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 mb-2">
          {totalResults} result{totalResults !== 1 ? 's' : ''}
        </p>
      )}

      <nav className="space-y-3">
        {filteredCategories.map((category) => {
          const isCollapsed = isSearching
            ? false
            : (collapsed[category.name] ?? false);
          const hasSelected = category.files.some(
            (f) => f.slug === selectedSlug
          );

          if (filteredCategories.length === 1 && !isSearching) {
            return (
              <div key={category.name} className="space-y-1">
                {category.files.map((file) => (
                  <SidebarItem
                    key={file.slug}
                    file={file}
                    isSelected={file.slug === selectedSlug}
                    onSelect={onSelect}
                    locateTrigger={locateTrigger}
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
                      locateTrigger={locateTrigger}
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
