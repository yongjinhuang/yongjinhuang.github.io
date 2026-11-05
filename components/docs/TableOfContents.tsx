'use client';

import { useState, useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { cn } from '@/lib/utils';
import { stripMarkdownFormatting, buildHeadingIdMap } from '@/lib/docs';

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
  const headingIdMap = buildHeadingIdMap(markdown);
  const items: TocItem[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
        slug: headingIdMap.get(i + 1) ?? 'heading',
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
      .filter((el): el is HTMLElement => el !== null);

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
    <div className="h-full overflow-y-auto p-4 scrollbar-thin">
      {!hideHeader && (
        <h3 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
          On this page
        </h3>
      )}
      <nav className="space-y-0.5 border-l border-gray-200 dark:border-white/10">
        {items.map((item, index) => (
          <button
            key={`${item.slug}-${index}`}
            type="button"
            onClick={() => handleClick(item.slug)}
            className={cn(
              'block w-full text-left text-xs leading-relaxed py-1 transition-colors duration-150 border-l-2 -ml-[1px]',
              activeSlug === item.slug
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-white/20'
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
