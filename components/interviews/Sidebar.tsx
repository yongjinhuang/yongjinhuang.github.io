'use client';

import type { InterviewFile } from '@/types';
import { SidebarItem } from './SidebarItem';

interface SidebarProps {
  readonly files: readonly InterviewFile[];
  readonly selectedSlug: string;
  readonly onSelect: (slug: string) => void;
}

export function Sidebar({ files, selectedSlug, onSelect }: SidebarProps) {
  return (
    <div className="glass-card p-4 h-full overflow-y-auto max-h-[calc(100vh-8rem)]">
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
  );
}
