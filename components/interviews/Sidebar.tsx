'use client';

import { cn } from '@/lib/utils';
import type { InterviewFile } from '@/types';
import { SidebarItem } from './SidebarItem';

interface SidebarProps {
  readonly files: readonly InterviewFile[];
  readonly selectedSlug: string;
  readonly onSelect: (slug: string) => void;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function Sidebar({
  files,
  selectedSlug,
  onSelect,
  isOpen,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 top-24 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'lg:w-72 xl:w-80 shrink-0',
          'fixed lg:static top-24 left-0 bottom-0 z-40 lg:z-auto',
          'transition-transform duration-300 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="glass-card p-4 h-full lg:h-auto lg:sticky lg:top-28 overflow-y-auto max-h-[calc(100vh-8rem)]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-accent mb-4 px-3">
            Files
          </h3>
          <nav className="space-y-1">
            {files.map((file) => (
              <SidebarItem
                key={file.slug}
                file={file}
                isSelected={file.slug === selectedSlug}
                onSelect={onSelect}
              />
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
