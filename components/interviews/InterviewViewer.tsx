'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import {
  HiBars3,
  HiXMark,
  HiChevronLeft,
  HiChevronRight,
  HiChevronDown,
  HiArrowDownTray,
  HiListBullet,
  HiArrowLeft,
  HiBookOpen,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import type { InterviewFile, InterviewCategory, VaultInfo } from '@/types';
import { useFileSelection } from '@/lib/useFileSelection';
import ThemeToggle from '@/components/ThemeToggle';
import ColorSchemePicker from '@/components/ColorSchemePicker';
import { Sidebar } from './Sidebar';
import { MarkdownContent } from './MarkdownContent';
import { TableOfContents, parseTocItems } from './TableOfContents';
import { TabBar } from './TabBar';
import { SplitPaneViewer } from './SplitPaneViewer';
import { CodeThemePicker, type CodeThemeId } from './CodeThemePicker';

const MAX_TABS = 10;
const DEFAULT_VAULT = 'interviews';

interface VaultData {
  readonly categories: readonly InterviewCategory[];
  readonly files: readonly InterviewFile[];
}

interface InterviewViewerProps {
  readonly vaults: readonly VaultInfo[];
  readonly vaultData: Record<string, VaultData>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printArticleHtml(title: string, bodyHtml: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
      background: white;
      line-height: 1.6;
    }
    h1 { font-size: 24px; color: #111; margin-bottom: 16px; }
    h2 { font-size: 20px; color: #111; margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h3 { font-size: 17px; color: #111; margin-top: 20px; margin-bottom: 8px; }
    h4 { font-size: 15px; color: #111; margin-top: 16px; margin-bottom: 6px; }
    p { margin-bottom: 12px; font-size: 14px; }
    code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 13px; font-family: 'SFMono-Regular', Consolas, monospace; }
    pre { background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; overflow-x: auto; margin: 16px 0; font-size: 12px; line-height: 1.6; }
    pre code { background: none; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { background: #f3f4f6; padding: 8px 12px; text-align: left; border: 1px solid #e5e7eb; font-weight: 600; }
    td { padding: 8px 12px; border: 1px solid #e5e7eb; }
    ul, ol { padding-left: 24px; margin-bottom: 12px; font-size: 14px; }
    li { margin-bottom: 4px; }
    blockquote { border-left: 4px solid #d1d5db; padding: 8px 16px; margin: 16px 0; background: #f9fafb; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    strong { color: #111; }
    a { color: #2563eb; }
    img { max-width: 100%; }
    @media print {
      body { padding: 0; }
      pre { white-space: pre-wrap; word-break: break-all; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      h2, h3 { page-break-after: avoid; }
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);

  printWindow.document.close();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.print();
  };

  printWindow.addEventListener('load', triggerPrint, { once: true });
  setTimeout(triggerPrint, 500);
}

export function InterviewViewer({ vaults, vaultData }: InterviewViewerProps) {
  usePathname();

  const firstVault =
    vaults.find((v) => v.name === DEFAULT_VAULT)?.name ??
    vaults[0]?.name ??
    DEFAULT_VAULT;
  const firstFiles = vaultData[firstVault]?.files ?? [];
  const defaultSlug = firstFiles.length > 0 ? firstFiles[0].slug : '';

  const {
    activeTab,
    splitSlug,
    vault: currentVault,
    setActiveTab,
    setSplitSlug,
    setVault,
  } = useFileSelection({ defaultSlug, defaultVault: firstVault });

  const currentData = vaultData[currentVault];
  const files = useMemo(() => currentData?.files ?? [], [currentData]);
  const categories = useMemo(
    () => currentData?.categories ?? [],
    [currentData]
  );

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

  const handleCodeThemeChange = useCallback((theme: CodeThemeId) => {
    setUserPickedCodeTheme(true);
    setCodeTheme(theme);
  }, []);

  // When vault changes, ensure activeTab belongs to the current vault
  useEffect(() => {
    const vaultFiles = vaultData[currentVault]?.files ?? [];
    const firstSlug = vaultFiles.length > 0 ? vaultFiles[0].slug : '';
    if (firstSlug && !vaultFiles.some((f) => f.slug === activeTab)) {
      setActiveTab(firstSlug);
      setOpenTabs([firstSlug]);
    }
  }, [currentVault, vaultData, activeTab, setActiveTab]);

  const selectedFileIndex = useMemo(
    () => files.findIndex((f) => f.slug === activeTab),
    [files, activeTab]
  );

  const selectedFile = selectedFileIndex >= 0 ? files[selectedFileIndex] : null;
  const activeCategoryLabel = useMemo(() => {
    if (!selectedFile) return '';
    return (
      categories.find((c) => c.name === selectedFile.category)?.label ??
      selectedFile.category
    );
  }, [categories, selectedFile]);

  const prevFile = selectedFileIndex > 0 ? files[selectedFileIndex - 1] : null;
  const nextFile =
    selectedFileIndex >= 0 && selectedFileIndex < files.length - 1
      ? files[selectedFileIndex + 1]
      : null;

  const hasTocItems = useMemo(
    () =>
      selectedFile ? parseTocItems(selectedFile.content).length > 0 : false,
    [selectedFile]
  );

  const splitFile = useMemo(
    () =>
      splitSlug ? (files.find((f) => f.slug === splitSlug) ?? null) : null,
    [files, splitSlug]
  );

  // Sync valid active tab into openTabs
  useEffect(() => {
    if (activeTab && selectedFile && !openTabs.includes(activeTab)) {
      setOpenTabs((prev) => [...prev, activeTab]);
    }
  }, [activeTab, selectedFile, openTabs]);

  // Restore saved scroll position when switching active tab
  useEffect(() => {
    setMobileTocOpen(false);
    const el = contentRef.current;
    if (!el) return;
    const savedTop = scrollPositionsRef.current[activeTab] ?? 0;
    el.scrollTo({ top: savedTop, behavior: 'instant' });
  }, [activeTab]);

  const handleContentScroll = useCallback(() => {
    if (contentRef.current && activeTab) {
      scrollPositionsRef.current[activeTab] = contentRef.current.scrollTop;
    }
  }, [activeTab]);

  useEffect(() => {
    const width = window.innerWidth;
    if (width < 1440) setRightPanelOpen(false);
    if (width < 1024) setLeftPanelOpen(false);
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
        if (next.length > MAX_TABS) {
          const evictIndex = next.findIndex((s) => s !== slug);
          if (evictIndex >= 0) {
            return [
              ...next.slice(0, evictIndex),
              ...next.slice(evictIndex + 1),
            ];
          }
        }
        return next;
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
          const closedIndex = prev.indexOf(slug);
          const newActive = next[Math.min(closedIndex, next.length - 1)];
          setActiveTab(newActive);
        }
        return next;
      });
      if (slug === splitSlug) {
        setSplitSlug(null);
      }
    },
    [activeTab, splitSlug, setActiveTab, setSplitSlug]
  );

  const handleSplitTab = useCallback(
    (slug: string) => {
      if (splitSlug === slug) {
        setSplitSlug(null);
      } else {
        setSplitSlug(slug);
      }
    },
    [splitSlug, setSplitSlug]
  );

  const handleVaultChange = useCallback(
    (vaultName: string) => {
      const vaultFiles = vaultData[vaultName]?.files ?? [];
      const firstSlug = vaultFiles.length > 0 ? vaultFiles[0].slug : '';
      setVault(vaultName, firstSlug);
      setOpenTabs(firstSlug ? [firstSlug] : []);
    },
    [vaultData, setVault]
  );

  const handleExportPdf = useCallback(() => {
    if (!contentRef.current || !selectedFile) return;

    const article = contentRef.current.querySelector('article');
    if (!article) return;

    printArticleHtml(selectedFile.title, article.innerHTML);
  }, [selectedFile]);

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0a0a0f] text-gray-900 dark:text-gray-100">
      {/* ===== Standalone Docs App Header Bar ===== */}
      <header className="h-12 shrink-0 border-b border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#0d0d12] px-3 sm:px-4 flex items-center justify-between gap-3 z-30">
        {/* Left: Mobile Drawer Toggle + Portfolio Back Link + App Brand + Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen((prev) => !prev)}
            className="lg:hidden p-1.5 rounded-md border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-accent hover:text-accent transition-colors"
            aria-label={mobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {mobileSidebarOpen ? (
              <HiXMark className="w-4 h-4" />
            ) : (
              <HiBars3 className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setLeftPanelOpen((prev) => !prev)}
            className="hidden lg:inline-flex p-1.5 rounded-md border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent transition-colors"
            title={leftPanelOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-label={leftPanelOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {leftPanelOpen ? (
              <HiChevronLeft className="w-3.5 h-3.5" />
            ) : (
              <HiChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          <Link
            href="/en"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:border-accent hover:text-accent transition-colors shrink-0"
            title="Back to Portfolio"
          >
            <HiArrowLeft className="w-3.5 h-3.5" />
            <span>Portfolio</span>
          </Link>

          <div className="h-4 w-px bg-gray-200 dark:bg-white/10 hidden sm:block" />

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-white shrink-0">
            <HiBookOpen className="w-4 h-4 text-accent" />
            <span>Docs</span>
          </div>

          {selectedFile && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 min-w-0 font-mono">
              <span>/</span>
              <span className="truncate max-w-[160px] text-gray-500 dark:text-gray-400">
                {activeCategoryLabel}
              </span>
              <span>/</span>
              <span className="truncate max-w-[240px] text-gray-800 dark:text-gray-200 font-sans font-medium">
                {selectedFile.title}
              </span>
            </div>
          )}
        </div>

        {/* Right: App Controls (Code Theme, PDF, Language, Color Scheme, Theme, TOC Toggle) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <CodeThemePicker value={codeTheme} onChange={handleCodeThemeChange} />

          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors"
            title="Export current document to PDF"
          >
            <HiArrowDownTray className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-0.5 hidden sm:block" />

          <ColorSchemePicker />
          <ThemeToggle />

          <button
            type="button"
            onClick={() => setRightPanelOpen((prev) => !prev)}
            className={cn(
              'hidden lg:inline-flex p-1.5 rounded-md border transition-colors',
              rightPanelOpen
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent'
            )}
            title={
              rightPanelOpen
                ? 'Hide table of contents'
                : 'Show table of contents'
            }
            aria-label={
              rightPanelOpen
                ? 'Hide table of contents'
                : 'Show table of contents'
            }
          >
            <HiListBullet className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ===== 3-Pane IDE Workspace Body ===== */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Mobile Sidebar Backdrop + Drawer */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 top-12 z-30 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <aside
          className={cn(
            'fixed top-12 left-0 bottom-0 z-40 w-72 lg:hidden border-r border-gray-200 dark:border-white/10',
            'transition-transform duration-200',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar
            categories={categories}
            selectedSlug={activeTab}
            onSelect={handleFileSelect}
            vaults={vaults}
            currentVault={currentVault}
            onVaultChange={handleVaultChange}
          />
        </aside>

        {/* Desktop Left Explorer Sidebar */}
        {leftPanelOpen && (
          <aside className="hidden lg:block w-68 xl:w-72 shrink-0 h-full border-r border-gray-200/80 dark:border-white/10">
            <Sidebar
              categories={categories}
              selectedSlug={activeTab}
              onSelect={handleFileSelect}
              vaults={vaults}
              currentVault={currentVault}
              onVaultChange={handleVaultChange}
            />
          </aside>
        )}

        {/* Center Document Pane */}
        <div className="flex-1 min-w-0 flex flex-col h-full bg-white dark:bg-[#121218]">
          {/* Document Tab Bar */}
          <TabBar
            tabs={openTabs}
            activeTab={activeTab}
            splitSlug={splitSlug}
            files={files}
            onSelectTab={handleFileSelect}
            onCloseTab={handleCloseTab}
            onSplitTab={handleSplitTab}
          />

          {/* Mobile Collapsible TOC Bar */}
          {selectedFile && hasTocItems && (
            <div className="lg:hidden border-b border-gray-200/80 dark:border-white/10 bg-gray-50 dark:bg-[#0d0d12] px-3 py-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileTocOpen((prev) => !prev)}
                aria-expanded={mobileTocOpen}
                className="w-full flex items-center justify-between text-xs font-mono font-semibold text-accent"
              >
                <span className="flex items-center gap-1.5">
                  <HiListBullet className="w-3.5 h-3.5" />
                  On this page
                </span>
                <HiChevronDown
                  className={cn(
                    'w-3.5 h-3.5 transition-transform duration-200',
                    mobileTocOpen && 'rotate-180'
                  )}
                />
              </button>
              {mobileTocOpen && (
                <div className="mt-1.5 max-h-56 overflow-y-auto border-t border-gray-200/70 dark:border-white/10 pt-1">
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

          {/* Scrollable Reader / Split View */}
          <div className="flex-1 min-h-0 relative">
            {files.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No files found in this vault.
                </p>
              </div>
            ) : splitFile && selectedFile ? (
              <SplitPaneViewer
                mainFile={selectedFile}
                splitFile={splitFile}
                onFileSelect={handleFileSelect}
                onCloseSplit={() => setSplitSlug(null)}
                codeTheme={codeTheme}
                vaultName={currentVault}
              />
            ) : selectedFile ? (
              <div
                ref={contentRef}
                onScroll={handleContentScroll}
                className="h-full overflow-y-auto scrollbar-thin"
              >
                <MarkdownContent
                  file={selectedFile}
                  onFileSelect={handleFileSelect}
                  codeTheme={codeTheme}
                  vaultName={currentVault}
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
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFileSelect(files[0].slug)}
                    className="brutal-btn px-3.5 py-1.5 text-xs font-bold"
                  >
                    Open first document
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Right Outline (TOC) Sidebar */}
        {rightPanelOpen && selectedFile && hasTocItems && (
          <aside className="hidden lg:block w-56 2xl:w-64 shrink-0 h-full border-l border-gray-200/80 dark:border-white/10 bg-gray-50/60 dark:bg-[#0d0d12]">
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
