'use client';

import Link from 'next/link';
import {
  HiBars3,
  HiXMark,
  HiChevronLeft,
  HiChevronRight,
  HiArrowDownTray,
  HiListBullet,
  HiArrowLeft,
  HiBookOpen,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { ThemeToggle, ColorSchemePicker } from '@/components/theme';
import { CodeThemePicker, type CodeThemeId } from './CodeThemePicker';

interface DocsHeaderProps {
  readonly mobileSidebarOpen: boolean;
  readonly onToggleMobileSidebar: () => void;
  readonly leftPanelOpen: boolean;
  readonly onToggleLeftPanel: () => void;
  readonly rightPanelOpen: boolean;
  readonly onToggleRightPanel: () => void;
  readonly activeCategoryLabel: string;
  readonly activeFileTitle?: string;
  readonly codeTheme: CodeThemeId;
  readonly onCodeThemeChange: (theme: CodeThemeId) => void;
  readonly onExportPdf: () => void;
}

export function DocsHeader({
  mobileSidebarOpen,
  onToggleMobileSidebar,
  leftPanelOpen,
  onToggleLeftPanel,
  rightPanelOpen,
  onToggleRightPanel,
  activeCategoryLabel,
  activeFileTitle,
  codeTheme,
  onCodeThemeChange,
  onExportPdf,
}: DocsHeaderProps) {
  return (
    <header className="h-12 shrink-0 border-b border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#0d0d12] px-3 sm:px-4 flex items-center justify-between gap-3 z-30">
      {/* Left: Mobile Drawer Toggle + Portfolio Back Link + App Brand + Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
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
          onClick={onToggleLeftPanel}
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

        {activeFileTitle && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 min-w-0 font-mono">
            <span>/</span>
            <span className="truncate max-w-[160px] text-gray-500 dark:text-gray-400">
              {activeCategoryLabel}
            </span>
            <span>/</span>
            <span className="truncate max-w-[240px] text-gray-800 dark:text-gray-200 font-sans font-medium">
              {activeFileTitle}
            </span>
          </div>
        )}
      </div>

      {/* Right: App Controls (Code Theme, PDF, Color Scheme, Theme, TOC Toggle) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <CodeThemePicker value={codeTheme} onChange={onCodeThemeChange} />

        <button
          type="button"
          onClick={onExportPdf}
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
          onClick={onToggleRightPanel}
          className={cn(
            'hidden lg:inline-flex p-1.5 rounded-md border transition-colors',
            rightPanelOpen
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-accent hover:text-accent'
          )}
          title={
            rightPanelOpen ? 'Hide table of contents' : 'Show table of contents'
          }
          aria-label={
            rightPanelOpen ? 'Hide table of contents' : 'Show table of contents'
          }
        >
          <HiListBullet className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
