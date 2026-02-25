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
  const headingRegex = /^(#{1,4})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const text = match[2]
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1');
    items.push({
      level: match[1].length,
      text,
      slug: slugify(text),
    });
  }

  return items;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const items = useMemo(() => parseTocItems(content), [content]);
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
    <aside className="hidden xl:block w-56 2xl:w-64 shrink-0">
      <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
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
    </aside>
  );
}
