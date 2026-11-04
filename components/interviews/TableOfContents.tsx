'use client';

import { useState, useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { cn } from '@/lib/utils';
import {
  stripMarkdownFormatting,
  createHeadingSlugger,
} from './MarkdownContent';

interface TocItem {
  readonly level: number;
  readonly text: string;
  readonly slug: string;
}

interface TableOfContentsProps {
  readonly content: string;
  readonly scrollContainerRef?: RefObject<HTMLElement | null>;
  readonly onItemSelect?: () => void;
  readonly hideHeader?: boolean;
}

function findHeadingElement(
  root: HTMLElement | null | undefined,
  slug: string
): HTMLElement | null {
  if (!slug) return null;
  if (root) {
    try {
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(slug)
          : slug.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
      const scoped = root.querySelector<HTMLElement>(`#${escaped}`);
      if (scoped) return scoped;
    } catch {
      // Fallback to getElementById below
    }
  }
  return document.getElementById(slug);
}

export function parseTocItems(markdown: string): readonly TocItem[] {
  const lines = markdown.split('\n');
  const items: TocItem[] = [];
  const getHeadingId = createHeadingSlugger();
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (match) {
      const text = stripMarkdownFormatting(match[2]);
      items.push({
        level: match[1].length,
        text,
        slug: getHeadingId(text),
      });
    }
  }

  return items;
}

export function TableOfContents({
  content,
  scrollContainerRef,
  onItemSelect,
  hideHeader = false,
}: TableOfContentsProps) {
  const items = useMemo(() => {
    const allItems = parseTocItems(content);
    if (allItems.length === 0) return allItems;
    const topLevel = Math.min(...allItems.map((i) => i.level));
    return allItems.filter((i) => i.level <= topLevel + 1);
  }, [content]);
  const [activeSlug, setActiveSlug] = useState<string>('');

  useEffect(() => {
    if (items.length === 0) {
      setActiveSlug('');
      return;
    }

    const rootEl = scrollContainerRef?.current ?? null;
    const slugs = items.map((item) => item.slug);
    const elements = slugs
      .map((slug) => findHeadingElement(rootEl, slug))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    setActiveSlug(elements[0].id);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveSlug(visible[0].target.id);
        }
      },
      {
        root: rootEl,
        rootMargin: '-16px 0px -65% 0px',
        threshold: 0,
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, scrollContainerRef]);

  if (items.length === 0) return null;

  const minLevel = Math.min(...items.map((i) => i.level));

  const handleClick = (slug: string) => {
    const el = findHeadingElement(scrollContainerRef?.current, slug);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSlug(slug);
    }
    onItemSelect?.();
  };

  return (
    <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
      {!hideHeader && (
        <h3 className="text-sm font-bold uppercase tracking-wider text-accent mb-3">
          On this page
        </h3>
      )}
      <nav className="space-y-0.5 border-l-2 border-gray-200 dark:border-white/10">
        {items.map((item, index) => (
          <button
            key={`${item.slug}-${index}`}
            onClick={() => handleClick(item.slug)}
            className={cn(
              'block w-full text-left text-xs leading-relaxed py-1 transition-all duration-200 border-l-2 -ml-[2px]',
              activeSlug === item.slug
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-accent hover:border-accent/50'
            )}
            style={{
              paddingLeft: `${(item.level - minLevel) * 12 + 12}px`,
            }}
          >
            <span className="line-clamp-2">{item.text}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
