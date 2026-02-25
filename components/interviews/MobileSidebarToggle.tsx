'use client';

import { HiBars3, HiXMark } from 'react-icons/hi2';

interface MobileSidebarToggleProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}

export function MobileSidebarToggle({
  isOpen,
  onToggle,
}: MobileSidebarToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="lg:hidden brutal-btn px-3 py-2 self-start flex items-center gap-2 text-sm font-bold"
      aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
    >
      {isOpen ? (
        <HiXMark className="w-5 h-5" />
      ) : (
        <HiBars3 className="w-5 h-5" />
      )}
      <span>{isOpen ? 'Close' : 'Files'}</span>
    </button>
  );
}
