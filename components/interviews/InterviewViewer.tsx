'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import {
  HiBars3,
  HiXMark,
  HiChevronLeft,
  HiChevronRight,
  HiChevronDown,
  HiArrowDownTray,
  HiListBullet,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import type { InterviewFile, InterviewCategory, VaultInfo } from '@/types';
import { useFileSelection } from '@/lib/useFileSelection';
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
    if (width < 1536) setRightPanelOpen(false);
    if (width < 1280) setLeftPanelOpen(false);
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

  if (files.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No files found in this vault.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh]">
      {/* ===== Mobile Sidebar Overlay ===== */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 top-24 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <div
        className={cn(
          'fixed top-24 left-0 bottom-0 z-40 w-72 lg:hidden',
          'transition-transform duration-300',
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
      </div>

      {/* ===== Desktop Left Panel (collapsible, sticky) ===== */}
      <div
        className={cn(
          'hidden lg:block shrink-0 transition-[width,margin] duration-300',
          leftPanelOpen ? 'w-72 xl:w-80 mr-6' : 'w-0 mr-0'
        )}
      >
        <div
          className={cn(
            'w-72 xl:w-80 sticky top-28 transition-opacity duration-300',
            leftPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Toggle bar */}
        <div className="flex items-center gap-2 mb-2">
          {/* Mobile: hamburger toggle */}
          <button
            onClick={() => setMobileSidebarOpen((prev) => !prev)}
            className="lg:hidden brutal-btn px-3 py-2 flex items-center gap-2 text-sm font-bold"
            aria-label={mobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {mobileSidebarOpen ? (
              <HiXMark className="w-5 h-5" />
            ) : (
              <HiBars3 className="w-5 h-5" />
            )}
            <span>{mobileSidebarOpen ? 'Close' : 'Files'}</span>
          </button>

          {/* Desktop: left panel arrow toggle */}
          <button
            onClick={() => setLeftPanelOpen((prev) => !prev)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full border-2 border-gray-300 dark:border-white/20 hover:border-accent hover:text-accent text-gray-400 dark:text-gray-500 transition-colors"
            title={leftPanelOpen ? 'Hide file list' : 'Show file list'}
          >
            {leftPanelOpen ? (
              <HiChevronLeft className="w-3.5 h-3.5" />
            ) : (
              <HiChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="flex-1" />

          {/* Code theme picker */}
          <CodeThemePicker value={codeTheme} onChange={handleCodeThemeChange} />

          {/* PDF export */}
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors"
            title="Download as PDF"
          >
            <HiArrowDownTray className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Desktop: right panel arrow toggle */}
          <button
            onClick={() => setRightPanelOpen((prev) => !prev)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full border-2 border-gray-300 dark:border-white/20 hover:border-accent hover:text-accent text-gray-400 dark:text-gray-500 transition-colors"
            title={
              rightPanelOpen
                ? 'Hide table of contents'
                : 'Show table of contents'
            }
          >
            {rightPanelOpen ? (
              <HiChevronRight className="w-3.5 h-3.5" />
            ) : (
              <HiChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Tab Bar */}
        <TabBar
          tabs={openTabs}
          activeTab={activeTab}
          splitSlug={splitSlug}
          files={files}
          onSelectTab={handleFileSelect}
          onCloseTab={handleCloseTab}
          onSplitTab={handleSplitTab}
        />

        {/* Mobile / Tablet Collapsible TOC Bar */}
        {selectedFile && hasTocItems && (
          <div className="lg:hidden mt-2">
            <button
              type="button"
              onClick={() => setMobileTocOpen((prev) => !prev)}
              aria-expanded={mobileTocOpen}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-accent"
            >
              <span className="flex items-center gap-2">
                <HiListBullet className="w-4 h-4" />
                On this page
              </span>
              <HiChevronDown
                className={cn(
                  'w-4 h-4 transition-transform duration-200',
                  mobileTocOpen && 'rotate-180'
                )}
              />
            </button>
            {mobileTocOpen && (
              <div className="mt-1 p-3 rounded-lg bg-white/95 dark:bg-surface-dark/95 border border-gray-200 dark:border-white/10 max-h-64 overflow-y-auto shadow-md">
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

        {/* Content */}
        <div className="mt-2 relative">
          {splitFile && selectedFile ? (
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
              className="h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin"
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
            <div className="glass-card p-10 text-center my-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Document not found
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                The requested document &ldquo;{activeTab}&rdquo; does not exist
                in this vault.
              </p>
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleFileSelect(files[0].slug)}
                  className="brutal-btn px-4 py-2 text-xs font-bold"
                >
                  Open first document
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Desktop Right Panel (collapsible, sticky TOC) ===== */}
      <div
        className={cn(
          'hidden lg:block shrink-0 transition-[width,margin] duration-300',
          rightPanelOpen ? 'w-56 2xl:w-64 ml-6' : 'w-0 ml-0'
        )}
      >
        <div
          className={cn(
            'w-56 2xl:w-64 sticky top-28 transition-opacity duration-300',
            rightPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          {selectedFile && (
            <TableOfContents
              content={selectedFile.content}
              scrollContainerRef={contentRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}
