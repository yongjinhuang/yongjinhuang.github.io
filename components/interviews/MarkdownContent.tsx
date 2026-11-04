'use client';

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  isValidElement,
} from 'react';
import type { ComponentProps, ReactNode } from 'react';
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
import type { CodeThemeId } from './CodeThemePicker';
import { MermaidDiagram } from './MermaidDiagram';

const DEFAULT_VAULT = 'interviews';

type ReactMarkdownProps = ComponentProps<typeof ReactMarkdown>;

const REMARK_PLUGINS: NonNullable<ReactMarkdownProps['remarkPlugins']> = [
  remarkGfm,
];
const REHYPE_PLUGINS: NonNullable<ReactMarkdownProps['rehypePlugins']> = [
  [rehypeHighlight, { ignoreMissing: true }],
];

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

export function buildHeadingIdMap(
  markdown: string
): ReadonlyMap<number, string> {
  const lines = markdown.split('\n');
  const counts = new Map<string, number>();
  const lineToId = new Map<number, string>();
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
      const base = slugify(match[2]) || 'heading';
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);
      lineToId.set(i + 1, count === 0 ? base : `${base}-${count}`);
    }
  }

  return lineToId;
}

function getTextContent(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return getTextContent(children.props.children);
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
  readonly children: ReactNode;
}

function CodeBlock({ language, rawCode, children }: CodeBlockProps) {
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

function resolveHeadingId(
  node: { position?: { start?: { line?: number } } } | undefined,
  children: ReactNode,
  headingIdMap: ReadonlyMap<number, string>
): string {
  const line = node?.position?.start?.line;
  if (line !== undefined) {
    const mapped = headingIdMap.get(line);
    if (mapped) return mapped;
  }
  return slugify(getTextContent(children)) || 'heading';
}

function createMarkdownComponents(
  headingIdMap: ReadonlyMap<number, string>,
  onFileSelect?: FileSelectHandler,
  fileCategory?: string,
  vaultName: string = DEFAULT_VAULT
): Components {
  return {
    h1: ({ node, children }) => (
      <h1
        id={resolveHeadingId(node, children, headingIdMap)}
        className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6 scroll-mt-20"
      >
        {children}
      </h1>
    ),
    h2: ({ node, children }) => (
      <h2
        id={resolveHeadingId(node, children, headingIdMap)}
        className="text-2xl font-bold mt-10 mb-4 border-b border-gray-200 dark:border-white/10 pb-2 text-gray-900 dark:text-white tracking-tight scroll-mt-20"
      >
        {children}
      </h2>
    ),
    h3: ({ node, children }) => (
      <h3
        id={resolveHeadingId(node, children, headingIdMap)}
        className="text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-white scroll-mt-20"
      >
        {children}
      </h3>
    ),
    h4: ({ node, children }) => (
      <h4
        id={resolveHeadingId(node, children, headingIdMap)}
        className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white scroll-mt-20"
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

      if (
        isValidElement<{
          className?: string;
          children?: ReactNode;
        }>(child)
      ) {
        const className = child.props.className || '';
        const isMermaid =
          className.includes('language-mermaid') ||
          className.includes('language-sequence') ||
          className.includes('language-flowchart') ||
          className.includes('language-graph');
        rawCode = getTextContent(child.props.children);
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
            type="button"
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
      <input {...props} className="mr-2 accent-[var(--accent)]" disabled />
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-5 rounded-lg border border-gray-200 dark:border-white/10">
        <table className="min-w-full border-collapse text-[13.5px]">
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
  readonly codeTheme?: CodeThemeId | string;
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
  const headingIdMap = useMemo(
    () => buildHeadingIdMap(file.content),
    [file.content]
  );

  const components = useMemo(
    () =>
      createMarkdownComponents(
        headingIdMap,
        onFileSelect,
        file.category,
        vaultName
      ),
    [headingIdMap, onFileSelect, file.category, vaultName]
  );

  return (
    <article
      className="px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10 max-w-none"
      data-code-theme={codeTheme}
    >
      <div className="max-w-4xl mx-auto">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={components}
        >
          {file.content}
        </ReactMarkdown>

        {(prevFile || nextFile) && onFileSelect && (
          <nav
            aria-label="Document navigation"
            className="mt-12 pt-6 border-t border-gray-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {prevFile ? (
              <button
                type="button"
                onClick={() => onFileSelect(prevFile.slug)}
                className="group text-left p-4 rounded-xl border border-gray-200 dark:border-white/10 hover:border-accent/60 hover:bg-accent/5 transition-all duration-200"
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
                className="group text-right p-4 rounded-xl border border-gray-200 dark:border-white/10 hover:border-accent/60 hover:bg-accent/5 transition-all duration-200"
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
