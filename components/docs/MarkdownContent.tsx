'use client';

import {
  useMemo,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2';
import 'katex/dist/katex.min.css';
import './hljs-themes.css';
import type { InterviewFile } from '@/types';
import * as md from '@/lib/docs';
import type { CodeThemeId } from './CodeThemePicker';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';

interface MathAstNode {
  type?: string;
  value?: string;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
  data?: {
    hProperties?: { className?: string[] };
    hChildren?: Array<{ type?: string; value?: string }>;
  };
  children?: MathAstNode[];
}

function remarkMathNormalize() {
  const walk = (node: MathAstNode) => {
    if (
      (node.type === 'math' || node.type === 'inlineMath') &&
      typeof node.value === 'string'
    ) {
      const rawLen = node.value.length;
      const spanLen =
        (node.position?.end?.offset ?? 0) - (node.position?.start?.offset ?? 0);
      const isDisplay = node.type === 'math' || spanLen - rawLen >= 4;

      if (node.value.includes(md.ESCAPED_DOLLAR_TOKEN)) {
        node.value = node.value.replaceAll(md.ESCAPED_DOLLAR_TOKEN, '\\$');
        if (node.data?.hChildren?.[0]?.type === 'text') {
          node.data.hChildren[0].value = node.value;
        }
      }

      if (isDisplay && node.data?.hProperties) {
        node.data.hProperties.className = ['language-math', 'math-display'];
      }
    }
    node.children?.forEach(walk);
  };

  return (tree: MathAstNode) => {
    walk(tree);
  };
}

type RemarkPlugins = ComponentProps<typeof ReactMarkdown>['remarkPlugins'];
type RehypePlugins = ComponentProps<typeof ReactMarkdown>['rehypePlugins'];

const REMARK_PLUGINS: RemarkPlugins = [
  remarkGfm,
  remarkMath,
  remarkMathNormalize,
];
const REHYPE_PLUGINS: RehypePlugins = [
  [rehypeKatex, { strict: false }],
  [rehypeHighlight, { ignoreMissing: true }],
];

type CodeChildProps = { className?: string; children?: ReactNode };
type HeadingNode = { position?: { start?: { line?: number } } };
type HeadingProps = { node?: HeadingNode; children?: ReactNode };

const HEADING_CLASSES = {
  h1: 'text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6 scroll-mt-20',
  h2: 'text-2xl font-bold mt-10 mb-4 border-b border-gray-200 dark:border-white/10 pb-2 text-gray-900 dark:text-white tracking-tight scroll-mt-20',
  h3: 'text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-white scroll-mt-20',
  h4: 'text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white scroll-mt-20',
} as const;

const STYLED_TAGS = {
  p: 'mb-4 leading-relaxed text-[15px] text-gray-700 dark:text-gray-300',
  blockquote:
    'border-l-4 border-accent bg-accent/5 rounded-r-lg py-2 px-4 my-4 text-gray-700 dark:text-gray-300',
  ul: 'list-disc pl-6 mb-4 space-y-1 text-[15px]',
  ol: 'list-decimal pl-6 mb-4 space-y-1 text-[15px]',
  li: 'text-gray-700 dark:text-gray-300 marker:text-accent leading-relaxed',
  strong: 'font-bold text-gray-900 dark:text-white',
  thead: 'bg-gray-100 dark:bg-white/5',
  th: 'px-4 py-2.5 text-left text-[13px] font-bold text-gray-900 dark:text-white border-b-2 border-gray-200 dark:border-white/10 whitespace-nowrap',
  td: 'px-4 py-2 text-[13px] text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-white/5',
} as const;

const BASE_COMPONENTS: Partial<Components> = {
  ...Object.fromEntries(
    (Object.keys(STYLED_TAGS) as Array<keyof typeof STYLED_TAGS>).map((Tag) => [
      Tag,
      ({ children }: { children?: ReactNode }) => (
        <Tag className={STYLED_TAGS[Tag]}>{children}</Tag>
      ),
    ])
  ),
  code: ({ children, className }) =>
    className?.includes('hljs') || className?.includes('language-') ? (
      <code className={`${className} font-mono`}>{children}</code>
    ) : (
      <code className="bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-accent">
        {children}
      </code>
    ),
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const el = isValidElement<CodeChildProps>(child) ? child : null;
    const cls = el?.props.className || '';
    const rawCode = md.getTextContent(el ? el.props.children : children);
    if (/language-(mermaid|sequence|flowchart|graph)/.test(cls)) {
      return <MermaidDiagram chart={rawCode} />;
    }
    const language = /language-([\w-]+)/.exec(cls)?.[1] ?? '';
    return (
      <CodeBlock language={language} rawCode={rawCode}>
        {children}
      </CodeBlock>
    );
  },
  hr: () => <hr className="border-gray-200 dark:border-white/10 my-8" />,
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
};

function createMarkdownComponents(
  headingIdMap: ReadonlyMap<number, string>,
  onFileSelect?: (slug: string) => void,
  fileCategory?: string,
  vaultName = 'interviews'
): Components {
  const headings = Object.fromEntries(
    (['h1', 'h2', 'h3', 'h4'] as const).map((Tag) => [
      Tag,
      ({ node, children }: HeadingProps) => {
        const line = node?.position?.start?.line;
        const fallback = md.slugify(md.getTextContent(children)) || 'heading';
        const id = (line ? headingIdMap.get(line) : undefined) ?? fallback;
        return (
          <Tag id={id} className={HEADING_CLASSES[Tag]}>
            {children}
          </Tag>
        );
      },
    ])
  );

  return {
    ...BASE_COMPONENTS,
    ...headings,
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={md.resolveImageSrc(
          typeof src === 'string' ? src : undefined,
          vaultName
        )}
        alt={alt || ''}
        className="max-w-full h-auto rounded-lg my-4 border-2 border-gray-200 dark:border-white/10"
        loading="lazy"
      />
    ),
    a: ({ href, children }) => {
      if (href?.endsWith('.md') && !href.startsWith('http') && onFileSelect) {
        const slug = href.replace(/^\.\//, '').replace(/\.md$/, '');
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
  };
}

interface MarkdownContentProps {
  readonly file: InterviewFile;
  readonly onFileSelect?: (slug: string) => void;
  readonly codeTheme?: CodeThemeId | string;
  readonly vaultName?: string;
  readonly prevFile?: InterviewFile | null;
  readonly nextFile?: InterviewFile | null;
}

export function MarkdownContent({
  file,
  onFileSelect,
  codeTheme = 'github',
  vaultName = 'interviews',
  prevFile,
  nextFile,
}: MarkdownContentProps) {
  const normalizedContent = useMemo(
    () => md.normalizeMarkdownMath(file.content),
    [file.content]
  );

  const components = useMemo(
    () =>
      createMarkdownComponents(
        md.buildHeadingIdMap(file.content),
        onFileSelect,
        file.category,
        vaultName
      ),
    [file.content, onFileSelect, file.category, vaultName]
  );

  const renderNavBtn = (item?: InterviewFile | null, isNext = false) =>
    item ? (
      <button
        type="button"
        onClick={() => onFileSelect?.(item.slug)}
        className={`group p-4 rounded-xl border border-gray-200 dark:border-white/10 hover:border-accent/60 hover:bg-accent/5 transition-all duration-200 ${isNext ? 'text-right' : 'text-left'}`}
      >
        <span
          className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 group-hover:text-accent mb-1 ${isNext ? 'justify-end' : ''}`}
        >
          {!isNext && <HiChevronLeft className="w-3.5 h-3.5" />}
          {isNext ? 'Next' : 'Previous'}
          {isNext && <HiChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-accent truncate">
          {item.title}
        </span>
      </button>
    ) : (
      <div className="hidden sm:block" />
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
          {normalizedContent}
        </ReactMarkdown>
        {(prevFile || nextFile) && onFileSelect && (
          <nav
            aria-label="Document navigation"
            className="mt-12 pt-6 border-t border-gray-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {renderNavBtn(prevFile, false)}
            {renderNavBtn(nextFile, true)}
          </nav>
        )}
      </div>
    </article>
  );
}
