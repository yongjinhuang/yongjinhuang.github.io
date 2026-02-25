import fs from 'fs';
import path from 'path';
import type { InterviewFile } from '@/types';

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getInterviewFiles(): readonly InterviewFile[] {
  const interviewsDir = path.join(process.cwd(), 'public', 'interviews');

  try {
    const filenames = fs
      .readdirSync(interviewsDir)
      .filter((f) => f.endsWith('.md'))
      .sort();

    return filenames.map((filename) => {
      const filePath = path.join(interviewsDir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const slug = filename.replace(/\.md$/, '');
      const title = extractTitle(content, filename);

      return { slug, filename, title, content };
    });
  } catch (error) {
    console.error('Failed to read interviews directory:', error);
    return [];
  }
}
