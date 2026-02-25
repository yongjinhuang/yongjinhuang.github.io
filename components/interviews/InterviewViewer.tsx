'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiBars3,
  HiXMark,
  HiChevronLeft,
  HiChevronRight,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import type { InterviewFile } from '@/types';
import { Sidebar } from './Sidebar';
import { MarkdownContent } from './MarkdownContent';
import { TableOfContents } from './TableOfContents';

interface InterviewViewerProps {
  readonly files: readonly InterviewFile[];
}

export function InterviewViewer({ files }: InterviewViewerProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    files.length > 0 ? files[0].slug : ''
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const selectedFile = useMemo(
    () => files.find((f) => f.slug === selectedSlug) ?? null,
    [files, selectedSlug]
  );

  useEffect(() => {
    const width = window.innerWidth;
    if (width < 1536) setRightPanelOpen(false);
    if (width < 1280) setLeftPanelOpen(false);
  }, []);

  const handleFileSelect = (slug: string) => {
    setSelectedSlug(slug);
    setMobileSidebarOpen(false);
  };

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
          files={files}
          selectedSlug={selectedSlug}
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
            files={files}
            selectedSlug={selectedSlug}
            onSelect={handleFileSelect}
          />
        </div>
      </div>

      {/* ===== Main Content ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Toggle bar */}
        <div className="flex items-center mb-4">
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

        {/* Content */}
        <AnimatePresence mode="wait">
          {selectedFile && (
            <motion.div
              key={selectedFile.slug}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MarkdownContent file={selectedFile} />
            </motion.div>
          )}
        </AnimatePresence>
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
