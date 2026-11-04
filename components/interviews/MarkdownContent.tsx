'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  HiClipboardDocument,
  HiCheck,
  HiChevronLeft,
  HiChevronRight,
} from 'react-icons/hi2';
import './hljs-themes.css';
import type { InterviewFile } from '@/types';
import type { Components } from 'react-markdown';
import { MermaidDiagram } from './MermaidDiagram';

const DEFAULT_VAULT = 'interviews';

type FileSelectHandler = (slug: string) => void;

export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function slugify(text: string): string {
  return stripMarkdownFormatting(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export function createHeadingSlugger(): (text: string) => string {
  const counts = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text) || 'heading';
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (
    children &&
    typeof children === 'object' &&
    'props' in children &&
    (children as React.ReactElement).props
  ) {
    return getTextContent(
      (children as React.ReactElement<{ children?: React.ReactNode }>).props
        .children
    );
  }
  return '';
}

function resolveImageSrc(src: string | undefined, vaultName: string): string {
  if (!src) return '';
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('/')
  ) {
    return src;
  }
  return `/vaults/${vaultName}/${src}`;
}

interface CodeBlockProps {
  readonly language: string;
  readonly rawCode: string;
  readonly children: React.ReactNode;
}

function CodeBlock({ language, rawCode, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawCode.replace(/\n$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback if clipboard API fails
    }
  }, [rawCode]);

  return (
    <div className="my-5 rounded-lg border-2 border-gray-200 dark:border-white/10 overflow-hidden bg-gray-50/80 dark:bg-black/20">
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

function createMarkdownComponents(
  onFileSelect?: FileSelectHandler,
  fileCategory?: string,
  vaultName: string = DEFAULT_VAULT
): Components {
  const getHeadingId = createHeadingSlugger();

  return {
    h1: ({ children }) => (
      <h1
        id={getHeadingId(getTextContent(children))}
        className="text-3xl font-black text-accent mb-6 scroll-mt-28"
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        id={getHeadingId(getTextContent(children))}
        className="text-2xl font-bold mt-10 mb-4 border-b-2 border-accent/30 pb-2 text-gray-900 dark:text-white scroll-mt-28"
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        id={getHeadingId(getTextContent(children))}
        className="text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-white scroll-mt-28"
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4
        id={getHeadingId(getTextContent(children))}
        className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white scroll-mt-28"
      >
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="mb-4 leading-relaxed text-[15px] text-gray-700 dark:text-gray-300">
        {children}
      </p>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-accent bg-accent/5 rounded-r-lg py-2 px-4 my-4 text-gray-700 dark:text-gray-300">
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isBlock =
        className?.includes('hljs') || className?.includes('language-');
      if (isBlock) {
        return <code className={`${className} font-mono`}>{children}</code>;
      }
      return (
        <code className="bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-accent">
          {children}
        </code>
      );
    },
    pre: ({ children }) => {
      const child = Array.isArray(children) ? children[0] : children;
      let language = '';
      let rawCode = '';

      if (child && typeof child === 'object' && 'props' in child) {
        const codeElement = child as React.ReactElement<{
          className?: string;
          children?: React.ReactNode;
        }>;
        const className = codeElement.props.className || '';
        const isMermaid =
          className.includes('language-mermaid') ||
          className.includes('language-sequence') ||
          className.includes('language-flowchart') ||
          className.includes('language-graph');
        rawCode = getTextContent(codeElement.props.children);
        if (isMermaid) {
          return <MermaidDiagram chart={rawCode} />;
        }
        const langMatch = /language-([\w-]+)/.exec(className);
        if (langMatch) {
          language = langMatch[1];
        }
      } else {
        rawCode = getTextContent(children);
      }

      return (
        <CodeBlock language={language} rawCode={rawCode}>
          {children}
        </CodeBlock>
      );
    },
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveImageSrc(
          typeof src === 'string' ? src : undefined,
          vaultName
        )}
        alt={alt || ''}
        className="max-w-full h-auto rounded-lg my-4 border-2 border-gray-200 dark:border-white/10"
        loading="lazy"
      />
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-6 mb-4 space-y-1 text-[15px]">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 mb-4 space-y-1 text-[15px]">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-gray-700 dark:text-gray-300 marker:text-accent leading-relaxed">
        {children}
      </li>
    ),
    hr: () => <hr className="border-gray-200 dark:border-white/10 my-8" />,
    a: ({ href, children }) => {
      const isInternalMd =
        href && href.endsWith('.md') && !href.startsWith('http');
      if (isInternalMd && onFileSelect) {
        const mdFilename = href.replace(/^\.\//, '');
        const slug = mdFilename.replace(/\.md$/, '');
        const fullSlug =
          fileCategory && fileCategory !== 'general'
            ? `${fileCategory}/${slug}`
            : slug;
        return (
          <button
            onClick={() => onFileSelect(fullSlug)}
            className="text-accent hover:underline underline-offset-2 cursor-pointer"
          >
            {children}
          </button>
        );
      }
      return (
        <a
          href={href}
          className="text-accent hover:underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => (
      <strong className="font-bold text-gray-900 dark:text-white">
        {children}
      </strong>
    ),
    input: (props) => (
      <input {...props} className="mr-2 accent-amber-500" disabled />
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-5">
        <table className="min-w-full border-2 border-gray-200 dark:border-white/10 rounded-lg text-[14px]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-100 dark:bg-white/5">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2.5 text-left text-[13px] font-bold text-gray-900 dark:text-white border-b-2 border-gray-200 dark:border-white/10 whitespace-nowrap">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2 text-[13px] text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-white/5">
        {children}
      </td>
    ),
  };
}

interface MarkdownContentProps {
  readonly file: InterviewFile;
  readonly onFileSelect?: FileSelectHandler;
  readonly codeTheme?: string;
  readonly vaultName?: string;
  readonly prevFile?: InterviewFile | null;
  readonly nextFile?: InterviewFile | null;
}

export function MarkdownContent({
  file,
  onFileSelect,
  codeTheme = 'github',
  vaultName = DEFAULT_VAULT,
  prevFile,
  nextFile,
}: MarkdownContentProps) {
  const components = createMarkdownComponents(
    onFileSelect,
    file.category,
    vaultName
  );

  return (
    <article
      className="glass-card p-6 md:p-8 lg:p-10 max-w-none"
      data-code-theme={codeTheme}
    >
      <div className="max-w-4xl mx-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
          components={components}
        >
          {file.content}
        </ReactMarkdown>

        {(prevFile || nextFile) && onFileSelect && (
          <nav
            aria-label="Document navigation"
            className="mt-12 pt-6 border-t-2 border-gray-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {prevFile ? (
              <button
                type="button"
                onClick={() => onFileSelect(prevFile.slug)}
                className="group text-left p-4 rounded-xl border-2 border-gray-200 dark:border-white/10 hover:border-accent/60 hover:bg-accent/5 transition-all duration-200"
              >
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 group-hover:text-accent mb-1">
                  <HiChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </span>
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-accent truncate">
                  {prevFile.title}
                </span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            {nextFile ? (
              <button
                type="button"
                onClick={() => onFileSelect(nextFile.slug)}
                className="group text-right p-4 rounded-xl border-2 border-gray-200 dark:border-white/10 hover:border-accent/60 hover:bg-accent/5 transition-all duration-200"
              >
                <span className="flex items-center justify-end gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 group-hover:text-accent mb-1">
                  Next
                  <HiChevronRight className="w-3.5 h-3.5" />
                </span>
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-accent truncate">
                  {nextFile.title}
                </span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}
          </nav>
        )}
      </div>
    </article>
  );
}
