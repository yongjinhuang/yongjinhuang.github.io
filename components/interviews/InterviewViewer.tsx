'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  HiBars3,
  HiXMark,
  HiChevronLeft,
  HiChevronRight,
  HiArrowDownTray,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import type { InterviewFile, InterviewCategory } from '@/types';
import { useFileSelection } from '@/lib/useFileSelection';
import { Sidebar } from './Sidebar';
import { MarkdownContent } from './MarkdownContent';
import { TableOfContents } from './TableOfContents';
import { TabBar } from './TabBar';
import { SplitPaneViewer } from './SplitPaneViewer';
import { CodeThemePicker, type CodeThemeId } from './CodeThemePicker';

const MAX_TABS = 10;

interface InterviewViewerProps {
  readonly files: readonly InterviewFile[];
  readonly categories: readonly InterviewCategory[];
}

export function InterviewViewer({ files, categories }: InterviewViewerProps) {
  const defaultSlug = files.length > 0 ? files[0].slug : '';
  const { activeTab, splitSlug, setActiveTab, setSplitSlug } = useFileSelection(
    { defaultSlug }
  );

  const [openTabs, setOpenTabs] = useState<string[]>([defaultSlug]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [codeTheme, setCodeTheme] = useState<CodeThemeId>('github-dark');

  const selectedFile = useMemo(
    () => files.find((f) => f.slug === activeTab) ?? null,
    [files, activeTab]
  );

  const splitFile = useMemo(
    () =>
      splitSlug ? (files.find((f) => f.slug === splitSlug) ?? null) : null,
    [files, splitSlug]
  );

  // Sync active tab into openTabs on mount (URL may have a file not in initial tabs)
  useEffect(() => {
    if (activeTab && !openTabs.includes(activeTab)) {
      setOpenTabs((prev) => [...prev, activeTab]);
    }
  }, [activeTab, openTabs]);

  useEffect(() => {
    const width = window.innerWidth;
    if (width < 1536) setRightPanelOpen(false);
    if (width < 1280) setLeftPanelOpen(false);
  }, []);

  const handleFileSelect = useCallback(
    (slug: string) => {
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
    [setActiveTab]
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

  const handleExportPdf = useCallback(() => {
    if (!contentRef.current || !selectedFile) return;

    const article = contentRef.current.querySelector('article');
    if (!article) return;

    // Open a new window with just the article content for clean printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${selectedFile.title}</title>
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
<body>${article.innerHTML}</body>
</html>`);

    printWindow.document.close();
    // Wait for content to render before triggering print
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
    // Fallback if load doesn't fire
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }, [selectedFile]);

  if (files.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No interview files found.
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
          <CodeThemePicker value={codeTheme} onChange={setCodeTheme} />

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

        {/* Content — each tab gets its own scrollable container */}
        <div className="mt-2 relative">
          {splitFile && selectedFile ? (
            <SplitPaneViewer
              mainFile={selectedFile}
              splitFile={splitFile}
              onFileSelect={handleFileSelect}
              onCloseSplit={() => setSplitSlug(null)}
              codeTheme={codeTheme}
            />
          ) : (
            <div className="relative h-[calc(100vh-12rem)]">
              {openTabs.map((slug) => {
                const file = files.find((f) => f.slug === slug);
                if (!file) return null;
                const isActive = slug === activeTab;
                return (
                  <div
                    key={slug}
                    ref={isActive ? contentRef : undefined}
                    className={cn(
                      'absolute inset-0 overflow-y-auto scrollbar-thin',
                      isActive
                        ? 'visible z-10'
                        : 'invisible z-0 pointer-events-none'
                    )}
                  >
                    <MarkdownContent
                      file={file}
                      onFileSelect={handleFileSelect}
                      codeTheme={codeTheme}
                    />
                  </div>
                );
              })}
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
          {selectedFile && <TableOfContents content={selectedFile.content} />}
        </div>
      </div>
    </div>
  );
}
