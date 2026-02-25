'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { InterviewFile } from '@/types';
import { Sidebar } from './Sidebar';
import { MarkdownContent } from './MarkdownContent';
import { TableOfContents } from './TableOfContents';
import { MobileSidebarToggle } from './MobileSidebarToggle';

interface InterviewViewerProps {
  readonly files: readonly InterviewFile[];
}

export function InterviewViewer({ files }: InterviewViewerProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    files.length > 0 ? files[0].slug : ''
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const selectedFile = useMemo(
    () => files.find((f) => f.slug === selectedSlug) ?? null,
    [files, selectedSlug]
  );

  const handleFileSelect = (slug: string) => {
    setSelectedSlug(slug);
    setSidebarOpen(false);
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
    <div className="flex flex-col lg:flex-row gap-6 min-h-[70vh]">
      <MobileSidebarToggle
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
      />

      <Sidebar
        files={files}
        selectedSlug={selectedSlug}
        onSelect={handleFileSelect}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0">
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

      {selectedFile && <TableOfContents content={selectedFile.content} />}
    </div>
  );
}
