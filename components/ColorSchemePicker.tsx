'use client';

import { useState, useRef, useEffect } from 'react';
import { useColorScheme } from './ColorSchemeProvider';
import {
  COLOR_SCHEME_NAMES,
  SCHEME_DISPLAY_COLORS,
  type ColorSchemeName,
} from '@/lib/color-schemes';

function SchemeOption({
  name,
  color,
  isActive,
  onClick,
}: {
  readonly name: string;
  readonly color: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-white/10"
      aria-label={`Set color scheme to ${name}`}
    >
      <span
        className="w-4 h-4 rounded-full border-2 shrink-0"
        style={{
          backgroundColor: color,
          borderColor: isActive ? 'currentColor' : 'transparent',
          boxShadow: isActive ? `0 0 0 2px ${color}` : 'none',
        }}
      />
      <span className="capitalize">{name}</span>
    </button>
  );
}

export default function ColorSchemePicker() {
  const { scheme, isAuto, setScheme, setAuto } = useColorScheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-surface-dark border-2 border-gray-300 dark:border-white/20 shadow-[2px_2px_0_rgba(0,0,0,0.1)] dark:shadow-[2px_2px_0_rgba(255,255,255,0.05)] hover:border-accent hover:shadow-[3px_3px_0_var(--accent)] transition-all duration-300"
        aria-label="Change color scheme"
      >
        <span
          className="w-5 h-5 rounded-full"
          style={{ backgroundColor: SCHEME_DISPLAY_COLORS[scheme] }}
        />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-12 w-44 rounded-lg border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-surface-dark shadow-[4px_4px_0_rgba(0,0,0,0.1)] dark:shadow-[4px_4px_0_rgba(255,255,255,0.05)] p-2 z-50"
        >
          {/* Auto option */}
          <button
            onClick={() => {
              setAuto();
              setIsOpen(false);
            }}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-white/10 ${
              isAuto ? 'text-accent' : ''
            }`}
          >
            <span className="w-4 h-4 rounded-full shrink-0 border-2 border-dashed border-gray-400 dark:border-white/40" />
            <span>Auto</span>
            {isAuto && (
              <span className="ml-auto text-xs text-accent">&#10003;</span>
            )}
          </button>

          <div className="h-px bg-gray-200 dark:bg-white/10 my-1" />

          {/* Scheme options */}
          {COLOR_SCHEME_NAMES.map((name: ColorSchemeName) => (
            <SchemeOption
              key={name}
              name={name}
              color={SCHEME_DISPLAY_COLORS[name]}
              isActive={!isAuto && scheme === name}
              onClick={() => {
                setScheme(name);
                setIsOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
