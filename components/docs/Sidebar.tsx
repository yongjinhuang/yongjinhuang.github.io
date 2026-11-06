'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  HiStar,
  HiOutlineStar,
} from 'react-icons/hi2';

const HIGHLIGHTED_FOLDERS_STORAGE_KEY = 'docs-highlighted-folders-v1';

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
  currentVault = 'interviews',
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
  const [highlightedMap, setHighlightedMap] = useState<Record<string, boolean>>(
    {}
  );
  const [showHighlightedOnly, setShowHighlightedOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Hydrate highlighted folders from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HIGHLIGHTED_FOLDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setHighlightedMap(parsed as Record<string, boolean>);
        }
      }
    } catch {
      // Ignore storage errors in private browsing / restricted environments
    }
  }, []);

  const makeFolderKey = useCallback(
    (categoryName: string) => `${currentVault}:${categoryName}`,
    [currentVault]
  );

  const isFolderHighlighted = useCallback(
    (categoryName: string) =>
      Boolean(
        highlightedMap[makeFolderKey(categoryName)] ||
        highlightedMap[categoryName]
      ),
    [highlightedMap, makeFolderKey]
  );

  const toggleHighlightFolder = useCallback(
    (categoryName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const key = makeFolderKey(categoryName);
      setHighlightedMap((prev) => {
        const currentlyOn = Boolean(prev[key] || prev[categoryName]);
        const next = { ...prev, [key]: !currentlyOn };
        if (categoryName in next) {
          delete next[categoryName];
        }
        try {
          window.localStorage.setItem(
            HIGHLIGHTED_FOLDERS_STORAGE_KEY,
            JSON.stringify(next)
          );
        } catch {
          // Ignore storage write errors
        }
        return next;
      });
    },
    [makeFolderKey]
  );

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

  const highlightedCount = useMemo(
    () => categories.filter((c) => isFolderHighlighted(c.name)).length,
    [categories, isFolderHighlighted]
  );

  const filteredCategories = useMemo(() => {
    const base = showHighlightedOnly
      ? categories.filter((c) => isFolderHighlighted(c.name))
      : categories;

    if (!isSearching) return base;
    const lowerQuery = query.trim().toLowerCase();
    return base
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
  }, [
    categories,
    query,
    isSearching,
    showHighlightedOnly,
    isFolderHighlighted,
  ]);

  const pinnedHighlightedCategories = useMemo(
    () =>
      !isSearching && !showHighlightedOnly
        ? categories.filter((c) => isFolderHighlighted(c.name))
        : [],
    [categories, isSearching, showHighlightedOnly, isFolderHighlighted]
  );

  const totalResults = useMemo(
    () =>
      isSearching || showHighlightedOnly
        ? filteredCategories.reduce((sum, c) => sum + c.files.length, 0)
        : categories.reduce((sum, c) => sum + c.files.length, 0),
    [filteredCategories, categories, isSearching, showHighlightedOnly]
  );

  const renderCategoryNode = (
    category: InterviewCategory,
    keyPrefix = 'main'
  ) => {
    const isExpanded = isSearching ? true : Boolean(expanded[category.name]);
    const hasSelected = category.files.some((f) => f.slug === selectedSlug);
    const isHighlighted = isFolderHighlighted(category.name);

    return (
      <div key={`${keyPrefix}-${category.name}`}>
        <div
          className={cn(
            'group w-full px-2 py-1.5 rounded-md flex items-center gap-1.5 transition-colors duration-150',
            'text-xs font-medium',
            isHighlighted
              ? hasSelected
                ? 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/35 dark:border-amber-400/30'
                : 'bg-amber-500/8 dark:bg-amber-400/8 text-amber-800 dark:text-amber-200 border border-amber-500/25 dark:border-amber-400/20 hover:bg-amber-500/15 dark:hover:bg-amber-400/15'
              : hasSelected
                ? 'text-accent font-semibold bg-accent/5'
                : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/70 dark:hover:bg-white/5'
          )}
        >
          <button
            type="button"
            onClick={() => toggleCategory(category.name)}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer"
          >
            {isExpanded ? (
              <HiChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            ) : (
              <HiChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            )}
            {isExpanded ? (
              <HiFolderOpen
                className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  isHighlighted
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'text-accent'
                )}
              />
            ) : (
              <HiFolder
                className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  isHighlighted
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'text-gray-400 dark:text-gray-500'
                )}
              />
            )}
            <span className="truncate">{category.label}</span>
          </button>

          <button
            type="button"
            onClick={(e) => toggleHighlightFolder(category.name, e)}
            aria-label={
              isHighlighted
                ? `Remove highlight from ${category.label}`
                : `Highlight ${category.label} folder`
            }
            title={
              isHighlighted
                ? 'Unpin / remove folder highlight'
                : 'Highlight & pin folder to top'
            }
            className={cn(
              'p-0.5 rounded transition-opacity cursor-pointer shrink-0',
              isHighlighted
                ? 'opacity-100 text-amber-500 dark:text-amber-400 hover:text-amber-600'
                : 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-amber-500 dark:hover:text-amber-400'
            )}
          >
            {isHighlighted ? (
              <HiStar className="w-3.5 h-3.5" />
            ) : (
              <HiOutlineStar className="w-3.5 h-3.5" />
            )}
          </button>

          <span className="text-[10px] font-mono font-normal text-gray-400 dark:text-gray-500 shrink-0 min-w-[16px] text-right">
            {category.files.length}
          </span>
        </div>

        {isExpanded && (
          <div
            className={cn(
              'ml-3.5 mt-0.5 mb-1 space-y-0.5 border-l pl-1.5',
              isHighlighted
                ? 'border-amber-500/30 dark:border-amber-400/25'
                : 'border-gray-200 dark:border-white/10'
            )}
          >
            {category.files.map((file) => (
              <SidebarItem
                key={`${keyPrefix}-${file.slug}`}
                file={file}
                isSelected={file.slug === selectedSlug}
                onSelect={onSelect}
                locateTrigger={keyPrefix === 'main' ? locateTrigger : 0}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

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
              : showHighlightedOnly
                ? `${filteredCategories.length} pinned · ${totalResults} docs`
                : `${categories.length} folders · ${totalResults} docs`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowHighlightedOnly((prev) => !prev)}
              className={cn(
                'px-1.5 py-1 rounded text-[11px] font-mono inline-flex items-center gap-1 transition-colors cursor-pointer',
                showHighlightedOnly
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                  : highlightedCount > 0
                    ? 'text-amber-500 dark:text-amber-400 hover:bg-amber-500/10'
                    : 'text-gray-400 dark:text-gray-500 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-white/5'
              )}
              title={
                showHighlightedOnly
                  ? 'Show all folders'
                  : 'Filter by highlighted folders only'
              }
              aria-label="Filter highlighted folders"
            >
              {showHighlightedOnly || highlightedCount > 0 ? (
                <HiStar className="w-3.5 h-3.5" />
              ) : (
                <HiOutlineStar className="w-3.5 h-3.5" />
              )}
              {highlightedCount > 0 && <span>{highlightedCount}</span>}
            </button>
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

        {!isSearching &&
          showHighlightedOnly &&
          filteredCategories.length === 0 && (
            <div className="py-8 px-4 text-center">
              <HiOutlineStar className="w-6 h-6 mx-auto mb-2 text-amber-500/70" />
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                No highlighted folders yet
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                Hover any folder and click the ★ icon to highlight and pin it to
                the top.
              </p>
              <button
                type="button"
                onClick={() => setShowHighlightedOnly(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
              >
                Show all folders
              </button>
            </div>
          )}

        {/* Pinned Highlighted Folders Section */}
        {pinnedHighlightedCategories.length > 0 && (
          <div className="mb-3 pb-2.5 border-b border-gray-200/80 dark:border-white/10">
            <div className="flex items-center justify-between px-1.5 mb-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <HiStar className="w-3 h-3" />
                Highlighted Folders ({pinnedHighlightedCategories.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {pinnedHighlightedCategories.map((cat) =>
                renderCategoryNode(cat, 'pinned')
              )}
            </div>
          </div>
        )}

        <nav className="space-y-0.5">
          {filteredCategories.map((category) => {
            if (
              filteredCategories.length === 1 &&
              !isSearching &&
              !showHighlightedOnly &&
              categories.length === 1
            ) {
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

            return renderCategoryNode(category, 'main');
          })}
        </nav>
      </div>
    </div>
  );
}
