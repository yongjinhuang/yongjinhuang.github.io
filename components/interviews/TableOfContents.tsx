'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { slugify } from './MarkdownContent';

interface TocItem {
  readonly level: number;
  readonly text: string;
  readonly slug: string;
}

interface TableOfContentsProps {
  readonly content: string;
}

function parseTocItems(markdown: string): readonly TocItem[] {
  const lines = markdown.split('\n');
  const items: TocItem[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,4})\s+(.+)$/.exec(line);
    if (match) {
      const text = match[2]
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`(.+?)`/g, '$1');
      items.push({
        level: match[1].length,
        text,
        slug: slugify(text),
      });
    }
  }

  return items;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const items = useMemo(() => {
    const allItems = parseTocItems(content);
    if (allItems.length === 0) return allItems;
    const topLevel = Math.min(...allItems.map((i) => i.level));
    return allItems.filter((i) => i.level <= topLevel + 1);
  }, [content]);
  const [activeSlug, setActiveSlug] = useState<string>('');

  useEffect(() => {
    if (items.length === 0) return;

    const slugs = items.map((item) => item.slug);
    const elements = slugs
      .map((slug) => document.getElementById(slug))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveSlug(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const minLevel = Math.min(...items.map((i) => i.level));

  const handleClick = (slug: string) => {
    const el = document.getElementById(slug);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
      <h3 className="text-sm font-bold uppercase tracking-wider text-accent mb-3">
        On this page
      </h3>
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
