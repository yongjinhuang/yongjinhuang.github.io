import fs from 'fs';
import path from 'path';
import type { InterviewFile, InterviewCategory, VaultInfo } from '@/types';

const VAULTS_DIR = path.join(process.cwd(), 'public', 'vaults');

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  'system-design': 'System Design',
  'web-business': 'Web Business',
  'system-design-zh': 'System Design (中文)',
  'web-business-zh': 'Web Business (中文)',
  frontend: 'Frontend',
  fullstack: 'Full-Stack',
  behavioral: 'Behavioral',
  'cloud/aws': 'Cloud - AWS',
  'cloud/terraform': 'Cloud - Terraform',
  'cloud/cloudflare': 'Cloud - Cloudflare',
  'cloud/databases': 'Cloud - Databases',
  'cloud/caching': 'Cloud - Caching',
  'cloud/message-queues': 'Cloud - Message Queues',
  'cloud/gcp': 'Cloud - GCP',
  'cloud/azure': 'Cloud - Azure',
  'cloud/operations': 'Cloud - Operations',
  dsa: 'DSA (Python)',
  'ai-engineering': 'AI/ML Engineering',
  'low-level-design': 'Low-Level Design',
  'modern-frontend': 'Modern Frontend 2026',
  'staff-leadership': 'Staff+ Leadership',
  concurrency: 'Concurrency & Multithreading',
  'cloud/docker': 'Cloud - Docker',
  'cloud/kubernetes': 'Cloud - Kubernetes',
  'modern-backend': 'Modern Backend 2026',
  'quant-trading': 'Quantitative Trading',
  'cpu-gpu-programming': 'CPU/GPU Programming',
  web3: 'Web3 Development',
  lifestyle: 'Lifestyle & Content Creation',
  'doc-processing': 'Document Processing',
  robotics: 'Robotics & Control Systems',
  'embedded-iot': 'Embedded Systems & IoT',
  'data-model': 'Data Model',
  'web-game-dev': 'Web Game Development',
  'agentic-engineering': 'Agentic Engineering',
  'audio-video-rtc': 'Audio/Video/RTC',
  'leetcode-hot-100': 'LeetCode Hot 100',
  'ui-ux-design': 'UI/UX Design',
  shopback: 'ShopBack',
  whatnot: 'Whatnot',
};

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

function readMarkdownFiles(
  dir: string,
  category: string
): readonly InterviewFile[] {
  try {
    const filenames = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort();

    return filenames.map((filename) => {
      const filePath = path.join(dir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const slugBase = filename.replace(/\.md$/, '');
      const slug = `${category}/${slugBase}`;
      const title = extractTitle(content, filename);

      return { slug, filename, title, content, category };
    });
  } catch {
    return [];
  }
}

export function getAvailableVaults(): readonly VaultInfo[] {
  try {
    const entries = fs.readdirSync(VAULTS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        label: e.name
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

export function getVaultFiles(vaultName: string): readonly InterviewFile[] {
  const vaultDir = path.join(VAULTS_DIR, vaultName);

  try {
    // Top-level .md files (flat vault structure)
    const topLevelFiles = readMarkdownFiles(vaultDir, vaultName);

    const entries = fs.readdirSync(vaultDir, { withFileTypes: true });
    const subdirFiles = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'imgs')
      .flatMap((entry) => {
        const subDir = path.join(vaultDir, entry.name);
        const mdFiles = readMarkdownFiles(subDir, entry.name);

        const nestedEntries = fs
          .readdirSync(subDir, { withFileTypes: true })
          .filter((e) => e.isDirectory());
        const nestedFiles = nestedEntries.flatMap((nested) => {
          const nestedDir = path.join(subDir, nested.name);
          const category = `${entry.name}/${nested.name}`;
          return readMarkdownFiles(nestedDir, category);
        });

        return [...mdFiles, ...nestedFiles];
      });

    return [...topLevelFiles, ...subdirFiles];
  } catch (error) {
    console.error(`Failed to read vault "${vaultName}":`, error);
    return [];
  }
}

export function getVaultCategories(
  vaultName: string
): readonly InterviewCategory[] {
  const files = getVaultFiles(vaultName);
  const categoryMap = new Map<string, InterviewFile[]>();

  for (const file of files) {
    const existing = categoryMap.get(file.category) ?? [];
    categoryMap.set(file.category, [...existing, file]);
  }

  return Array.from(categoryMap.entries()).map(([name, catFiles]) => ({
    name,
    label:
      CATEGORY_LABELS[name] ??
      name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    files: catFiles,
  }));
}
