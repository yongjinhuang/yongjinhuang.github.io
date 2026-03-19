'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { HiCodeBracket } from 'react-icons/hi2';

export const CODE_THEMES = [
  { id: 'github', label: 'GitHub', type: 'light' },
  { id: 'github-dark', label: 'GitHub Dark', type: 'dark' },
  { id: 'monokai', label: 'Monokai', type: 'dark' },
  { id: 'dracula', label: 'Dracula', type: 'dark' },
  { id: 'one-dark', label: 'One Dark', type: 'dark' },
  { id: 'nord', label: 'Nord', type: 'dark' },
  { id: 'solarized-light', label: 'Solarized Light', type: 'light' },
] as const;

export type CodeThemeId = (typeof CODE_THEMES)[number]['id'];

interface CodeThemePickerProps {
  readonly value: CodeThemeId;
  readonly onChange: (theme: CodeThemeId) => void;
}

export function CodeThemePicker({ value, onChange }: CodeThemePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = CODE_THEMES.find((t) => t.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors"
        title="Code theme"
      >
        <HiCodeBracket className="w-4 h-4" />
        <span className="hidden sm:inline">{current?.label ?? 'Theme'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 py-1 rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-lg">
          {CODE_THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                onChange(theme.id);
                setOpen(false);
              }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between',
                theme.id === value
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
              )}
            >
              <span>{theme.label}</span>
              <span className="text-[10px] opacity-50">{theme.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
