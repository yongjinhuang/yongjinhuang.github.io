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
    <div ref={containerRef} className="flex h-full w-full">
      {/* Left pane */}
      <div
        className="h-full overflow-y-auto scrollbar-thin"
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
        onDoubleClick={() => setLeftPct(DEFAULT_PCT)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setLeftPct((p) => Math.max(MIN_PANE_PCT, p - 5));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setLeftPct((p) => Math.min(MAX_PANE_PCT, p + 5));
          } else if (e.key === 'Home') {
            e.preventDefault();
            setLeftPct(MIN_PANE_PCT);
          } else if (e.key === 'End') {
            e.preventDefault();
            setLeftPct(MAX_PANE_PCT);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            setLeftPct(DEFAULT_PCT);
          }
        }}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-valuemin={MIN_PANE_PCT}
        aria-valuemax={MAX_PANE_PCT}
        aria-valuenow={Math.round(leftPct)}
        aria-label="Resize split panes (use Left/Right arrow keys or double-click to reset)"
        title="Drag or use Left/Right arrow keys to resize (double-click to reset)"
        className={cn(
          'w-1.5 shrink-0 cursor-col-resize flex flex-col items-center justify-center',
          'bg-gray-200/80 dark:bg-white/10 hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-accent transition-colors'
        )}
      >
        <div
          aria-hidden="true"
          className="w-0.5 h-8 bg-gray-400 dark:bg-gray-500 rounded-full"
        />
      </div>

      {/* Right pane */}
      <div
        className="h-full overflow-y-auto scrollbar-thin relative"
        style={{ width: `${100 - leftPct}%` }}
      >
        <div className="sticky top-2 z-10 flex justify-end px-3 pointer-events-none">
          <button
            type="button"
            onClick={onCloseSplit}
            className="pointer-events-auto p-1.5 rounded-md bg-gray-200/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300 dark:border-white/10 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors shadow-sm"
            title="Close split view"
            aria-label="Close split view"
          >
            <HiXMark aria-hidden="true" className="w-4 h-4" />
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
