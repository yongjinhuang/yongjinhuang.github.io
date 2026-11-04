'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { InterviewFile } from '@/types';
import { MarkdownContent } from './MarkdownContent';
import { HiXMark } from 'react-icons/hi2';

interface SplitPaneViewerProps {
  readonly mainFile: InterviewFile;
  readonly splitFile: InterviewFile;
  readonly onFileSelect: (slug: string) => void;
  readonly onCloseSplit: () => void;
  readonly codeTheme?: string;
  readonly vaultName?: string;
}

const MIN_PANE_PCT = 25;
const MAX_PANE_PCT = 75;
const DEFAULT_PCT = 50;

export function SplitPaneViewer({
  mainFile,
  splitFile,
  onFileSelect,
  onCloseSplit,
  codeTheme,
  vaultName,
}: SplitPaneViewerProps) {
  const [leftPct, setLeftPct] = useState(DEFAULT_PCT);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handlePointerDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(MIN_PANE_PCT, Math.min(MAX_PANE_PCT, pct)));
    };

    const handlePointerUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-12rem)]">
      {/* Left pane */}
      <div
        className="overflow-y-auto scrollbar-thin"
        style={{ width: `${leftPct}%` }}
      >
        <MarkdownContent
          file={mainFile}
          onFileSelect={onFileSelect}
          codeTheme={codeTheme}
          vaultName={vaultName}
        />
      </div>

      {/* Divider */}
      <div
        onPointerDown={handlePointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize split panes"
        className={cn(
          'w-2 shrink-0 cursor-col-resize flex flex-col items-center justify-center',
          'bg-gray-200 dark:bg-white/10 hover:bg-accent/30 transition-colors',
          'rounded-full mx-1'
        )}
      >
        <div className="w-0.5 h-8 bg-gray-400 dark:bg-gray-500 rounded-full" />
      </div>

      {/* Right pane */}
      <div
        className="overflow-y-auto scrollbar-thin relative"
        style={{ width: `${100 - leftPct}%` }}
      >
        <div className="sticky top-2 z-10 flex justify-end px-2 pointer-events-none">
          <button
            type="button"
            onClick={onCloseSplit}
            className="pointer-events-auto p-1.5 rounded-lg bg-gray-200/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300 dark:border-white/10 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-500 transition-colors shadow-sm"
            title="Close split view"
            aria-label="Close split view"
          >
            <HiXMark className="w-4 h-4" />
          </button>
        </div>
        <MarkdownContent
          file={splitFile}
          onFileSelect={onFileSelect}
          codeTheme={codeTheme}
          vaultName={vaultName}
        />
      </div>
    </div>
  );
}
