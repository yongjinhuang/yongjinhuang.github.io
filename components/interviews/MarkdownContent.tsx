'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import type { InterviewFile } from '@/types';
import type { Components } from 'react-markdown';

const INTERVIEWS_BASE = '/interviews';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
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

function resolveImageSrc(src: string | undefined): string {
  if (!src) return '';
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('/')
  ) {
    return src;
  }
  return `${INTERVIEWS_BASE}/${src}`;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1
      id={slugify(getTextContent(children))}
      className="text-3xl font-black text-accent mb-6 scroll-mt-28"
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={slugify(getTextContent(children))}
      className="text-2xl font-bold mt-10 mb-4 border-b-2 border-accent/30 pb-2 text-gray-900 dark:text-white scroll-mt-28"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={slugify(getTextContent(children))}
      className="text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-white scroll-mt-28"
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      id={slugify(getTextContent(children))}
      className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white scroll-mt-28"
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300">
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
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-accent">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="rounded-lg p-4 overflow-x-auto my-4 text-sm border-2 border-gray-200 dark:border-white/10 [&>code]:bg-transparent">
      {children}
    </pre>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolveImageSrc(src)}
      alt={alt || ''}
      className="max-w-full h-auto rounded-lg my-4 border-2 border-gray-200 dark:border-white/10"
      loading="lazy"
    />
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-gray-700 dark:text-gray-300 marker:text-accent">
      {children}
    </li>
  ),
  hr: () => <hr className="border-gray-200 dark:border-white/10 my-8" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-accent hover:underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-gray-900 dark:text-white">
      {children}
    </strong>
  ),
  input: (props) => (
    <input {...props} className="mr-2 accent-amber-500" disabled />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-2 border-gray-200 dark:border-white/10 rounded-lg">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-100 dark:bg-white/5">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 text-left text-sm font-bold text-gray-900 dark:text-white border-b-2 border-gray-200 dark:border-white/10">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-white/5">
      {children}
    </td>
  ),
};

interface MarkdownContentProps {
  readonly file: InterviewFile;
}

export function MarkdownContent({ file }: MarkdownContentProps) {
  return (
    <article className="glass-card p-6 md:p-8 lg:p-10">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {file.content}
      </ReactMarkdown>
    </article>
  );
}
