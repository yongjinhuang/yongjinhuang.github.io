'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { InterviewCategory, VaultInfo } from '@/types';
import { SidebarItem } from './SidebarItem';
import {
  HiArchiveBox,
  HiChevronDown,
  HiChevronRight,
  HiFolder,
  HiFolderOpen,
  HiMagnifyingGlass,
  HiXMark,
  HiMapPin,
  HiMinus,
  HiBars3BottomLeft,
} from 'react-icons/hi2';

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
  // Default: ONLY expand the category that contains the active file!
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const activeCat = categories.find((c) =>
      c.files.some((f) => f.slug === selectedSlug)
    );
    return activeCat ? { [activeCat.name]: true } : {};
  });
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleCategory = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    categories.forEach((c) => {
      next[c.name] = true;
    });
    setExpanded(next);
  };

  const collapseAll = () => {
    setExpanded({});
  };

  // Auto-expand the category containing the selected file when selection changes
  useEffect(() => {
    const selectedCategory = categories.find((c) =>
      c.files.some((f) => f.slug === selectedSlug)
    );
    if (selectedCategory) {
      setExpanded((prev) =>
        prev[selectedCategory.name]
          ? prev
          : { ...prev, [selectedCategory.name]: true }
      );
    }
  }, [selectedSlug, categories]);

  // Keyboard shortcut (Cmd/Ctrl+K or /) to focus the visible search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const input = searchInputRef.current;
      if (!input || input.offsetParent === null) return;

      const target = e.target instanceof HTMLElement ? e.target : null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }

      if (
        e.key === '/' &&
        !isEditable &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        input.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isSearching = query.trim().length > 0;

  const filteredCategories = useMemo(() => {
    if (!isSearching) return categories;
    const lowerQuery = query.trim().toLowerCase();
    return categories
      .map((category) => {
        const categoryMatches = category.label
          .toLowerCase()
          .includes(lowerQuery);
        return {
          ...category,
          files: category.files.filter(
            (f) =>
              categoryMatches ||
              f.title.toLowerCase().includes(lowerQuery) ||
              f.content.toLowerCase().includes(lowerQuery)
          ),
        };
      })
      .filter((category) => category.files.length > 0);
  }, [categories, query, isSearching]);

  const totalResults = useMemo(
    () =>
      isSearching
        ? filteredCategories.reduce((sum, c) => sum + c.files.length, 0)
        : categories.reduce((sum, c) => sum + c.files.length, 0),
    [filteredCategories, categories, isSearching]
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0d0d12]">
      {/* Fixed Top Controls: Vault + Search + Actions */}
      <div className="p-3 border-b border-gray-200/80 dark:border-white/10 space-y-2.5 shrink-0">
        {vaults && vaults.length > 1 && onVaultChange && (
          <div>
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <HiArchiveBox className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Vault
              </span>
            </div>
            <select
              value={currentVault}
              onChange={(e) => onVaultChange(e.target.value)}
              className={cn(
                'w-full px-2.5 py-1.5 text-xs font-semibold rounded-md',
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

        {/* Search input */}
        <div className="relative">
          <HiMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search docs..."
            aria-label="Search files"
            className={cn(
              'w-full pl-8 pr-10 py-1.5 text-xs rounded-md',
              'bg-gray-100/90 dark:bg-white/5',
              'border border-gray-200 dark:border-white/10',
              'text-gray-800 dark:text-gray-200',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
              'transition-colors duration-200'
            )}
          />
          {isSearching ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <HiXMark className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500 bg-gray-200/70 dark:bg-white/10 rounded border border-gray-300/60 dark:border-white/10 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              ⌘K
            </kbd>
          )}
        </div>

        {/* Explorer Header + Quick Actions */}
        <div className="flex items-center justify-between px-1 pt-0.5">
          <span className="text-[11px] font-mono font-medium text-gray-500 dark:text-gray-400">
            {isSearching
              ? `${totalResults} match${totalResults !== 1 ? 'es' : ''}`
              : `${categories.length} folders · ${totalResults} docs`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              title="Expand all folders"
            >
              <HiBars3BottomLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              title="Collapse all folders"
            >
              <HiMinus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const selectedCategory = categories.find((c) =>
                  c.files.some((f) => f.slug === selectedSlug)
                );
                if (selectedCategory) {
                  setExpanded((prev) => ({
                    ...prev,
                    [selectedCategory.name]: true,
                  }));
                }
                setLocateTrigger((prev) => prev + 1);
              }}
              className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              title="Locate active file"
            >
              <HiMapPin className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable File Tree */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {isSearching && totalResults === 0 && (
          <div className="py-8 px-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              No matching documents for &ldquo;{query.trim()}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            >
              Clear search
            </button>
          </div>
        )}

        <nav className="space-y-0.5">
          {filteredCategories.map((category) => {
            const isExpanded = isSearching
              ? true
              : Boolean(expanded[category.name]);
            const hasSelected = category.files.some(
              (f) => f.slug === selectedSlug
            );

            if (filteredCategories.length === 1 && !isSearching) {
              return (
                <div key={category.name} className="space-y-0.5">
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
                  type="button"
                  onClick={() => toggleCategory(category.name)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-md flex items-center gap-1.5 transition-colors duration-150',
                    'text-xs font-medium',
                    hasSelected
                      ? 'text-accent font-semibold bg-accent/5'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/70 dark:hover:bg-white/5'
                  )}
                >
                  {isExpanded ? (
                    <HiChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                  ) : (
                    <HiChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                  )}
                  {isExpanded ? (
                    <HiFolderOpen className="w-3.5 h-3.5 shrink-0 text-accent" />
                  ) : (
                    <HiFolder className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                  )}
                  <span className="truncate">{category.label}</span>
                  <span className="ml-auto text-[10px] font-mono font-normal text-gray-400 dark:text-gray-500">
                    {category.files.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-3.5 mt-0.5 mb-1 space-y-0.5 border-l border-gray-200 dark:border-white/10 pl-1.5">
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
    </div>
  );
}
