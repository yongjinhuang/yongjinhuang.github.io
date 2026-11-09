import { isValidElement, type ReactNode } from 'react';

export const ESCAPED_DOLLAR_TOKEN = 'KATEXESCAPEDDOLLAR';

const CODE_OR_MATH_RE =
  /(```[\s\S]*?```|`[^`\n]+`)|(\$\$[\s\S]+?\$\$|(?<!\\)\$(?!\s)(?:\\.|[^$\\\n])+?(?<![\s(\[{])(?<!\\)\$(?![\d\\]))/g;

/**
 * Escapes standalone currency `$` signs outside code and valid `$...$` / `$$...$$`
 * math expressions so `remark-math` does not pair two currency amounts as LaTeX,
 * and protects `\$` inside math spans so `micromark-extension-math` does not
 * prematurely close the math span at an inner escaped dollar sign.
 */
export function normalizeMarkdownMath(markdown: string): string {
  const placeholders: string[] = [];
  const masked = markdown.replace(
    CODE_OR_MATH_RE,
    (match, _code: string | undefined, math: string | undefined) => {
      const idx = placeholders.length;
      if (math) {
        const repaired = math
          .replace(/\times\b/g, '\\times')
          .replace(/\text\{/g, '\\text{')
          .replace(/\\\$/g, ESCAPED_DOLLAR_TOKEN);
        placeholders.push(repaired);
      } else {
        placeholders.push(match);
      }
      return `\x00MATH_OR_CODE_${idx}\x00`;
    }
  );

  const escaped = masked.replace(/(?<!\\)\$/g, '\\$');
  return escaped.replace(
    /\x00MATH_OR_CODE_(\d+)\x00/g,
    (_, idx) => placeholders[Number(idx)]
  );
}

export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, '$1')
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

export function getTextContent(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return getTextContent(children.props.children);
  }
  return '';
}

export function resolveImageSrc(
  src: string | undefined,
  vaultName: string
): string {
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
