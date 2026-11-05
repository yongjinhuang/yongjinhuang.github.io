'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { HiCheck, HiClipboard } from 'react-icons/hi2';
import { cn } from '@/lib/utils';

export interface CopyButtonProps {
  readonly value: string;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
  readonly className?: string;
}

export function CopyButton({
  value,
  copyLabel = 'Copy to clipboard',
  copiedLabel = 'Copied!',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      type="button"
      aria-label={copied ? copiedLabel : copyLabel}
      className={cn(
        'shrink-0 p-1 rounded text-gray-400 dark:text-gray-500 hover:text-accent hover:bg-accent/10 transition-colors',
        className
      )}
      title={copied ? copiedLabel : copyLabel}
    >
      {copied ? (
        <HiCheck className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <HiClipboard className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
