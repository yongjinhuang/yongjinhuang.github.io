'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { IconType } from 'react-icons';
import {
  HiAcademicCap,
  HiArchiveBox,
  HiBeaker,
  HiBookOpen,
  HiCheck,
  HiChevronDown,
  HiCpuChip,
  HiLightBulb,
  HiRocketLaunch,
  HiServerStack,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import type { VaultInfo } from '@/types';

const VAULT_ICONS: Record<string, IconType> = {
  interviews: HiAcademicCap,
  'ai-agents': HiCpuChip,
  'backend-cloud': HiServerStack,
  'product-growth': HiRocketLaunch,
  'frontier-tech': HiBeaker,
  'sciences-and-arts': HiLightBulb,
  'life-wellness': HiSparkles,
  'creator-studio': HiVideoCamera,
  blog: HiBookOpen,
};

interface VaultPickerProps {
  readonly vaults: readonly VaultInfo[];
  readonly currentVault: string;
  readonly vaultDocCounts?: Readonly<Record<string, number>>;
  readonly onChange: (vaultName: string) => void;
}

export function VaultPicker({
  vaults,
  currentVault,
  vaultDocCounts,
  onChange,
}: VaultPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const activeVault = vaults.find((v) => v.name === currentVault) ?? vaults[0];
  const ActiveIcon =
    (activeVault ? VAULT_ICONS[activeVault.name] : undefined) ?? HiArchiveBox;
  const activeCount = activeVault ? vaultDocCounts?.[activeVault.name] : null;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <HiArchiveBox
            aria-hidden="true"
            className="w-3.5 h-3.5 text-accent"
          />
          Knowledge Vault
        </span>
        {typeof activeCount === 'number' && (
          <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-gray-500">
            {vaults.length} vaults
          </span>
        )}
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Current vault: ${activeVault?.label ?? currentVault}`}
        className={cn(
          'w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-left',
          'bg-white dark:bg-surface-dark',
          'border-2 transition-[transform,box-shadow,border-color,background-color] duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          isOpen
            ? 'border-accent -translate-x-0.5 -translate-y-0.5 shadow-[3px_3px_0_var(--accent)]'
            : 'border-gray-200 dark:border-white/15 hover:border-accent hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--accent)]'
        )}
      >
        <span
          aria-hidden="true"
          className="w-6 h-6 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center shrink-0"
        >
          <ActiveIcon className="w-3.5 h-3.5" />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
            {activeVault?.label ?? currentVault}
          </span>
        </span>

        {typeof activeCount === 'number' && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold tabular-nums bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 shrink-0">
            {activeCount}
          </span>
        )}

        <HiChevronDown
          aria-hidden="true"
          className={cn(
            'w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180 text-accent'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            aria-label="Select documentation vault"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-surface-dark shadow-[4px_4px_0_rgba(15,23,42,0.12)] dark:shadow-[4px_4px_0_color-mix(in_srgb,var(--accent)_35%,transparent)] p-1.5 max-h-80 overflow-y-auto scrollbar-thin origin-top"
          >
            <div className="space-y-0.5">
              {vaults.map((v) => {
                const isSelected = v.name === currentVault;
                const Icon = VAULT_ICONS[v.name] ?? HiArchiveBox;
                const count = vaultDocCounts?.[v.name];

                return (
                  <button
                    key={v.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(v.name);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-left text-xs transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      isSelected
                        ? 'bg-accent/15 text-accent font-bold'
                        : 'text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-colors',
                        isSelected
                          ? 'bg-accent text-[var(--accent-foreground,#000)] border-black/20 dark:border-white/25'
                          : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200/80 dark:border-white/10'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>

                    <span className="flex-1 truncate">{v.label}</span>

                    {typeof count === 'number' && (
                      <span
                        className={cn(
                          'text-[10px] font-mono tabular-nums shrink-0',
                          isSelected
                            ? 'text-accent font-semibold'
                            : 'text-gray-400 dark:text-gray-500'
                        )}
                      >
                        {count}
                      </span>
                    )}

                    {isSelected && (
                      <HiCheck
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-accent shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
