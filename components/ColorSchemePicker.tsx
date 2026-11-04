'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium rounded-md transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-white/10 ${
        isActive ? 'text-accent font-semibold bg-accent/10' : ''
      }`}
      aria-label={`Set color scheme to ${name}`}
    >
      <span
        className="w-3.5 h-3.5 rounded-full border-2 shrink-0"
        style={{
          backgroundColor: color,
          borderColor: isActive ? 'currentColor' : 'transparent',
          boxShadow: isActive ? `0 0 0 1.5px ${color}` : 'none',
        }}
      />
      <span className="capitalize truncate">{name}</span>
      {isActive && (
        <span className="ml-auto text-[11px] text-accent">&#10003;</span>
      )}
    </button>
  );
}

export default function ColorSchemePicker() {
  const { scheme, isAuto, setScheme, setAuto } = useColorScheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click or Escape key
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-surface-dark border-2 border-gray-200 dark:border-white/15 hover:border-accent hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all duration-200"
        aria-label="Change color scheme"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span
          className={`w-5 h-5 rounded-full transition-transform duration-200 ${
            isAuto
              ? 'ring-2 ring-offset-1 ring-dashed ring-accent/70 dark:ring-offset-surface-dark'
              : ''
          }`}
          style={{ backgroundColor: SCHEME_DISPLAY_COLORS[scheme] }}
          suppressHydrationWarning
        />
        {isAuto && (
          <span
            suppressHydrationWarning
            title="Auto color rotation active"
            className="absolute -bottom-0.5 -right-0.5 px-1 py-[1px] text-[9px] font-black leading-none rounded-full bg-accent text-black border border-black dark:border-surface-dark"
          >
            A
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            role="menu"
            aria-label="Color schemes"
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-11 w-60 rounded-xl border-2 border-gray-200 dark:border-white/20 bg-white dark:bg-surface-dark shadow-[4px_4px_0_rgba(0,0,0,0.1)] dark:shadow-[4px_4px_0_rgba(255,255,255,0.05)] p-2 z-50 origin-top-right"
          >
            {/* Auto option */}
            <button
              type="button"
              onClick={() => {
                setAuto();
                setIsOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium rounded-md transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-white/10 ${
                isAuto ? 'text-accent font-semibold bg-accent/10' : ''
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full shrink-0 border-2 border-dashed border-gray-400 dark:border-white/40" />
              <span>Auto (Hourly)</span>
              {isAuto && (
                <span className="ml-auto text-xs text-accent">&#10003;</span>
              )}
            </button>

            <div className="h-px bg-gray-200 dark:bg-white/10 my-1.5" />

            {/* Scheme options in 2-column grid */}
            <div className="grid grid-cols-2 gap-1">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
