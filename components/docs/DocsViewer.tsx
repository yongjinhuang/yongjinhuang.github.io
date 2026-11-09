'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { HiChevronDown, HiListBullet } from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import type { InterviewFile, InterviewCategory, VaultInfo } from '@/types';
import { useFileSelection, printArticleHtml } from '@/lib/docs';
import { useTheme } from '@/components/theme';
import { DocsHeader } from './DocsHeader';
import { Sidebar } from './Sidebar';
import { MarkdownContent } from './MarkdownContent';
import { TableOfContents, parseTocItems } from './TableOfContents';
import { TabBar } from './TabBar';
import { SplitPaneViewer } from './SplitPaneViewer';
import type { CodeThemeId } from './CodeThemePicker';

const MAX_TABS = 10;
const DEFAULT_VAULT = 'interviews';
const EMPTY_FILES: readonly InterviewFile[] = [];
const EMPTY_CATEGORIES: readonly InterviewCategory[] = [];

interface VaultData {
  readonly categories: readonly InterviewCategory[];
  readonly files: readonly InterviewFile[];
}

export interface DocsViewerProps {
  readonly vaults: readonly VaultInfo[];
  readonly vaultData: Record<string, VaultData>;
}

export function DocsViewer({ vaults, vaultData }: DocsViewerProps) {
  usePathname();

  const firstVault =
    vaults.find((v) => v.name === DEFAULT_VAULT)?.name ??
    vaults[0]?.name ??
    DEFAULT_VAULT;
  const defaultSlug = vaultData[firstVault]?.files[0]?.slug ?? '';

  const sel = useFileSelection({ defaultSlug, defaultVault: firstVault });
  const { activeTab, splitSlug, vault, setActiveTab, setSplitSlug, setVault } =
    sel;

  const files = vaultData[vault]?.files ?? EMPTY_FILES;
  const categories = vaultData[vault]?.categories ?? EMPTY_CATEGORIES;

  const [openTabs, setOpenTabs] = useState<string[]>([defaultSlug]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});

  const { resolvedTheme } = useTheme();
  const [codeTheme, setCodeTheme] = useState<CodeThemeId>('github-dark');
  const [userPickedCodeTheme, setUserPickedCodeTheme] = useState(false);

  useEffect(() => {
    if (!userPickedCodeTheme && resolvedTheme) {
      setCodeTheme(resolvedTheme === 'dark' ? 'github-dark' : 'github');
    }
  }, [resolvedTheme, userPickedCodeTheme]);

  useEffect(() => {
    const firstSlug = files[0]?.slug ?? '';
    if (firstSlug && !files.some((f) => f.slug === activeTab)) {
      setActiveTab(firstSlug);
      setOpenTabs([firstSlug]);
    }
  }, [files, activeTab, setActiveTab]);

  const selectedIdx = files.findIndex((f) => f.slug === activeTab);
  const selectedFile = selectedIdx >= 0 ? files[selectedIdx] : null;
  const activeCategoryLabel = selectedFile
    ? (categories.find((c) => c.name === selectedFile.category)?.label ??
      selectedFile.category)
    : '';
  const prevFile = selectedIdx > 0 ? files[selectedIdx - 1] : null;
  const nextFile =
    selectedIdx >= 0 && selectedIdx < files.length - 1
      ? files[selectedIdx + 1]
      : null;
  const hasTocItems = useMemo(
    () =>
      selectedFile ? parseTocItems(selectedFile.content).length > 0 : false,
    [selectedFile]
  );
  const splitFile = splitSlug
    ? (files.find((f) => f.slug === splitSlug) ?? null)
    : null;

  useEffect(() => {
    if (activeTab && selectedFile && !openTabs.includes(activeTab)) {
      setOpenTabs((prev) => [...prev, activeTab]);
    }
  }, [activeTab, selectedFile, openTabs]);

  useEffect(() => {
    setMobileTocOpen(false);
    contentRef.current?.scrollTo({
      top: scrollPositionsRef.current[activeTab] ?? 0,
      behavior: 'instant',
    });
  }, [activeTab]);

  useEffect(() => {
    if (window.innerWidth < 1440) setRightPanelOpen(false);
    if (window.innerWidth < 1024) setLeftPanelOpen(false);
  }, []);

  const handleFileSelect = useCallback(
    (slug: string) => {
      if (contentRef.current && activeTab) {
        scrollPositionsRef.current[activeTab] = contentRef.current.scrollTop;
      }
      setActiveTab(slug);
      setOpenTabs((prev) => {
        if (prev.includes(slug)) return prev;
        const next = [...prev, slug];
        if (next.length <= MAX_TABS) return next;
        const idx = next.findIndex((s) => s !== slug);
        return idx >= 0
          ? [...next.slice(0, idx), ...next.slice(idx + 1)]
          : next;
      });
      setMobileSidebarOpen(false);
    },
    [activeTab, setActiveTab]
  );

  const handleCloseTab = useCallback(
    (slug: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((s) => s !== slug);
        if (next.length === 0) return prev;
        if (slug === activeTab) {
          setActiveTab(next[Math.min(prev.indexOf(slug), next.length - 1)]);
        }
        return next;
      });
      if (slug === splitSlug) setSplitSlug(null);
    },
    [activeTab, splitSlug, setActiveTab, setSplitSlug]
  );

  const sidebarProps = {
    categories,
    selectedSlug: activeTab,
    onSelect: handleFileSelect,
    vaults,
    currentVault: vault,
    onVaultChange: (vaultName: string) => {
      const firstSlug = vaultData[vaultName]?.files[0]?.slug ?? '';
      setVault(vaultName, firstSlug);
      setOpenTabs(firstSlug ? [firstSlug] : []);
    },
  };

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0a0a0f] text-gray-900 dark:text-gray-100">
      <a
        href="#docs-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3.5 focus:py-1.5 focus:rounded-lg focus:bg-accent focus:text-[var(--accent-foreground,#000)] focus:font-bold focus:text-xs focus:shadow-lg focus:outline-none"
      >
        Skip to document content
      </a>
      <DocsHeader
        mobileSidebarOpen={mobileSidebarOpen}
        onToggleMobileSidebar={() => setMobileSidebarOpen((p) => !p)}
        leftPanelOpen={leftPanelOpen}
        onToggleLeftPanel={() => setLeftPanelOpen((p) => !p)}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={() => setRightPanelOpen((p) => !p)}
        activeCategoryLabel={activeCategoryLabel}
        activeFileTitle={selectedFile?.title}
        codeTheme={codeTheme}
        onCodeThemeChange={(theme) => {
          setUserPickedCodeTheme(true);
          setCodeTheme(theme);
        }}
        onExportPdf={() => {
          const article = contentRef.current?.querySelector('article');
          if (article && selectedFile) {
            printArticleHtml(selectedFile.title, article.innerHTML);
          }
        }}
      />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {mobileSidebarOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 top-12 z-30 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <aside
          aria-label="Documentation navigation"
          className={cn(
            'fixed top-12 left-0 bottom-0 z-40 w-72 lg:hidden border-r border-gray-200 dark:border-white/10 transition-transform duration-200 overscroll-contain',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar {...sidebarProps} />
        </aside>

        {leftPanelOpen && (
          <aside
            aria-label="Documentation navigation"
            className="hidden lg:block w-68 xl:w-72 shrink-0 h-full border-r border-gray-200/80 dark:border-white/10"
          >
            <Sidebar {...sidebarProps} />
          </aside>
        )}

        <div className="flex-1 min-w-0 flex flex-col h-full bg-white dark:bg-[#121218]">
          <TabBar
            tabs={openTabs}
            activeTab={activeTab}
            splitSlug={splitSlug}
            files={files}
            onSelectTab={handleFileSelect}
            onCloseTab={handleCloseTab}
            onSplitTab={(slug) =>
              setSplitSlug(splitSlug === slug ? null : slug)
            }
          />

          {selectedFile && hasTocItems && (
            <div className="lg:hidden border-b border-gray-200/80 dark:border-white/10 bg-gray-50 dark:bg-[#0d0d12] px-3 py-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileTocOpen((p) => !p)}
                aria-expanded={mobileTocOpen}
                className="w-full flex items-center justify-between text-xs font-mono font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                <span className="flex items-center gap-1.5">
                  <HiListBullet aria-hidden="true" className="w-3.5 h-3.5" />
                  On this page
                </span>
                <HiChevronDown
                  aria-hidden="true"
                  className={cn(
                    'w-3.5 h-3.5 transition-transform duration-200',
                    mobileTocOpen && 'rotate-180'
                  )}
                />
              </button>
              {mobileTocOpen && (
                <div className="mt-1.5 max-h-56 overflow-y-auto overscroll-contain border-t border-gray-200/70 dark:border-white/10 pt-1">
                  <TableOfContents
                    content={selectedFile.content}
                    scrollContainerRef={contentRef}
                    onItemSelect={() => setMobileTocOpen(false)}
                    hideHeader
                  />
                </div>
              )}
            </div>
          )}

          <main
            id="docs-main-content"
            tabIndex={-1}
            className="flex-1 min-h-0 relative focus:outline-none"
          >
            {files.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                No files found in this vault.
              </div>
            ) : splitFile && selectedFile ? (
              <SplitPaneViewer
                mainFile={selectedFile}
                splitFile={splitFile}
                onFileSelect={handleFileSelect}
                onCloseSplit={() => setSplitSlug(null)}
                codeTheme={codeTheme}
                vaultName={vault}
              />
            ) : selectedFile ? (
              <div
                ref={contentRef}
                onScroll={() => {
                  if (contentRef.current && activeTab) {
                    scrollPositionsRef.current[activeTab] =
                      contentRef.current.scrollTop;
                  }
                }}
                className="h-full overflow-y-auto scrollbar-thin"
              >
                <MarkdownContent
                  file={selectedFile}
                  onFileSelect={handleFileSelect}
                  codeTheme={codeTheme}
                  vaultName={vault}
                  prevFile={prevFile}
                  nextFile={nextFile}
                />
              </div>
            ) : (
              <div className="p-12 text-center">
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">
                  Document not found
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  The requested document &ldquo;{activeTab}&rdquo; does not
                  exist in this vault.
                </p>
                <button
                  type="button"
                  onClick={() => handleFileSelect(files[0].slug)}
                  className="brutal-btn px-3.5 py-1.5 text-xs font-bold"
                >
                  Open first document
                </button>
              </div>
            )}
          </main>
        </div>

        {rightPanelOpen && selectedFile && hasTocItems && (
          <aside
            aria-label="Table of contents"
            className="hidden lg:block w-56 2xl:w-64 shrink-0 h-full border-l border-gray-200/80 dark:border-white/10 bg-gray-50/60 dark:bg-[#0d0d12]"
          >
            <TableOfContents
              content={selectedFile.content}
              scrollContainerRef={contentRef}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
