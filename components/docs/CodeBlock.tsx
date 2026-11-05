'use client';

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { HiClipboardDocument, HiCheck } from 'react-icons/hi2';

interface CodeBlockProps {
  readonly language: string;
  readonly rawCode: string;
  readonly children: ReactNode;
}

export function CodeBlock({ language, rawCode, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawCode.replace(/\n$/, ''));
      setCopied(true);
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 1800);
    } catch {
      // Fallback if clipboard API fails
    }
  }, [rawCode]);

  return (
    <div className="my-5 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden bg-gray-50/80 dark:bg-black/20">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-gray-100/90 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-mono uppercase tracking-wider text-[11px] font-semibold">
          {language || 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <HiCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <HiClipboardDocument className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="font-mono p-4 overflow-x-auto text-[13px] leading-[1.65] [&>code]:bg-transparent [&>code.hljs]:p-0">
        {children}
      </pre>
    </div>
  );
}
