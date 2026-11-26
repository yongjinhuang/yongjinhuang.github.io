import fs from 'fs';
import path from 'path';
import type { InterviewFile, InterviewCategory, VaultInfo } from '@/types';

const VAULTS_DIR = path.join(process.cwd(), 'public', 'vaults');

const VAULT_META: Record<string, { label: string; order: number }> = {
  interviews: { label: 'Technical Interviews', order: 1 },
  'ai-agents': { label: 'AI, LLM & Agent Systems', order: 2 },
  'backend-cloud': { label: 'Backend, Cloud & Infra', order: 3 },
  'product-growth': { label: 'Product, Frontend & Career', order: 4 },
  'frontier-tech': { label: 'Frontier & Specialized Tech', order: 5 },
  'sciences-and-arts': { label: 'Science, Math & Music Foundations', order: 6 },
  'life-wellness': { label: 'Life OS: Health, Mind & Living', order: 7 },
  'creator-studio': { label: 'Creator Studio: Camera & Vlog', order: 8 },
  blog: { label: 'Blog & Notes', order: 9 },
};

const CATEGORY_LABELS: Record<string, string> = {
  // Technical Interviews
  'ai-staff-interview-prep': '2027 AI & Staff Interview Prep',
  general: 'Project Deep-Dives & HR Prep',
  'system-design': 'System Design',
  'system-design-zh': 'System Design (中文)',
  'data-model': 'System Design Data Models',
  'low-level-design': 'Low-Level Design',
  dsa: 'DSA (Python)',
  'leetcode-hot-100': 'LeetCode Hot 100',
  behavioral: 'Behavioral (STAR)',
  'staff-leadership': 'Staff+ Leadership',
  shopback: 'Company Prep - ShopBack',
  'shopback-zh': 'Company Prep - ShopBack (中文)',
  whatnot: 'Company Prep - Whatnot',

  // AI, LLM & Agent Systems
  'llm-inference-gateway': 'LLM Inference, Gateways & FinOps',
  'agent-sandboxes-evals-security': 'Durable Agents, MCP, Sandboxes & Security',
  'agentic-engineering': 'Agentic Engineering',
  'ai-engineering': 'AI/ML Engineering',
  'ai-coding-tools': 'AI Coding Agents & Workflows',
  'doc-processing': 'Document Processing & Multimodal RAG',

  // Backend, Cloud & Infra
  'database-runtime-internals': 'DB Internals, pgvector & Runtime Perf',
  'modern-backend': 'Modern Backend Architecture',
  concurrency: 'Concurrency & Multithreading',
  'observability-monitoring': 'Observability & OpenTelemetry',
  'platform-engineering': 'Platform Engineering & IDPs',
  'data-engineering': 'Data & Streaming Engineering',
  fullstack: 'Full-Stack Foundations',
  'cloud/aws': 'Cloud - AWS',
  'cloud/terraform': 'Cloud - Terraform',
  'cloud/cloudflare': 'Cloud - Cloudflare',
  'cloud/databases': 'Cloud - Databases',
  'cloud/caching': 'Cloud - Caching',
  'cloud/message-queues': 'Cloud - Message Queues',
  'cloud/gcp': 'Cloud - GCP',
  'cloud/azure': 'Cloud - Azure',
  'cloud/operations': 'Cloud - Operations',
  'cloud/docker': 'Cloud - Docker',
  'cloud/kubernetes': 'Cloud - Kubernetes',

  // Product, Frontend & Career
  'career-global-solopreneur': '2027 Career Moat, Global & Solopreneur',
  frontend: 'Frontend Core',
  'modern-frontend': 'Modern Frontend',
  'ui-ux-design': 'UI/UX & Design Systems',
  'web-business': 'Web Business Domains',
  'web-business-zh': 'Web Business Domains (中文)',

  // Frontier & Specialized Tech
  'cpu-gpu-programming': 'CPU/GPU & CUDA Programming',
  'quant-trading': 'Quantitative Trading',
  'audio-video-rtc': 'Audio/Video & WebRTC',
  robotics: 'Robotics & Control Systems',
  'embedded-iot': 'Embedded Systems & IoT',
  web3: 'Web3 & Smart Contracts',
  'web-game-dev': 'Web Game Development',

  // Science, Math & Music Foundations
  'mathematics-for-engineers': 'Applied Mathematics & Probability',
  'physics-of-everyday-world': 'Physics of the Everyday & Digital World',
  'chemistry-of-daily-life': 'Chemistry of Materials, Food & Life',
  'biology-genetics-and-evolution': 'Biology, Genetics, Immunity & Evolution',
  'music-theory-and-hiphop-science':
    'Music Theory, Acoustics & Hip-Hop Science',
  'economics-logic-and-world-models': 'Economics, Game Theory & World Models',
  'world-history-civilizations-and-art':
    'World History, Civilizations & Art Literacy',
  'global-languages-english-french-darija':
    'Global Languages: English, French & Darija',

  // Life OS: Health, Mind & Living
  'character-ethics-and-life-philosophy':
    'Character, Kindness & Life Philosophy (修身)',
  'deep-love-and-cross-cultural-partnership':
    'Deep Love & Cross-Cultural Partnership',
  'future-marriage-pregnancy-and-parenting':
    'Cross-Border Marriage, Pregnancy & Parenting',
  'social-warmth-charisma-and-humor': 'Social Warmth, Deep Listening & Humor',
  'personal-wealth-investing-and-housing':
    'Personal Wealth, Index Investing & Housing',
  'family-stewardship-and-legal-literacy':
    'Aging Parents Care & Adult Legal Shield',
  'home-maintenance-and-living-craft':
    'Apartment Hunting, Decluttering & DIY Fixes',
  'live-younger-enjoy-life': 'Live Younger & Enjoy Life (32+ 少年感)',
  'smart-life-hacks-and-deals': 'Smart Flights, Deals & Money-Saving Apps',
  'body-health-longevity': 'Human Body, Health & Longevity (32+)',
  'lean-muscle-and-physique': 'Lean Muscle & V-Taper Physique (薄肌塑形)',
  'intimacy-and-reproductive-health': 'Intimacy, Female Anatomy & Sex Ed',
  'psychology-positive-mindset': 'Psychology, Resilience & Mindset',
  'mens-ootd-style-guide': "Men's OOTD, Hip-Hop & Style System",
  'chinese-cooking': 'Chinese Cooking Mastery (中餐烹饪)',
  'self-care-smart-buying': 'Self-Care & High-ROI Buying Guide',
  'going-abroad-guide': 'Going Abroad Guide (中国人出国全攻略)',

  // Creator Studio: Camera & Vlog
  'iphone-osmo-pocket3': 'iPhone Pro & Osmo Pocket 3 Tricks',
  'portrait-photography-for-partner':
    'Photographing Your Partner (给女友拍照指南)',
  'personal-vlog-editing': 'Personal Vlogging, Editing & Archive',
  lifestyle: 'Video Production & Creator Craft',
};

function formatLabel(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  return formatLabel(filename.replace(/\.md$/, ''));
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

function resolveSafeVaultDir(vaultName: string): string | null {
  if (
    !vaultName ||
    vaultName.includes('..') ||
    vaultName.includes('/') ||
    vaultName.includes('\\')
  ) {
    return null;
  }
  const resolved = path.resolve(VAULTS_DIR, vaultName);
  if (!resolved.startsWith(`${VAULTS_DIR}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export function getAvailableVaults(): readonly VaultInfo[] {
  try {
    const entries = fs.readdirSync(VAULTS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        label: VAULT_META[e.name]?.label ?? formatLabel(e.name),
      }))
      .sort((a, b) => {
        const orderA = VAULT_META[a.name]?.order ?? 999;
        const orderB = VAULT_META[b.name]?.order ?? 999;
        return orderA !== orderB
          ? orderA - orderB
          : a.label.localeCompare(b.label);
      });
  } catch {
    return [];
  }
}

export function getVaultFiles(vaultName: string): readonly InterviewFile[] {
  const vaultDir = resolveSafeVaultDir(vaultName);
  if (!vaultDir) {
    return [];
  }

  try {
    // Top-level .md files (flat vault structure)
    const topLevelFiles = readMarkdownFiles(vaultDir, vaultName);

    const entries = fs
      .readdirSync(vaultDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    const subdirFiles = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'imgs')
      .flatMap((entry) => {
        const subDir = path.join(vaultDir, entry.name);
        const mdFiles = readMarkdownFiles(subDir, entry.name);

        let nestedFiles: readonly InterviewFile[] = [];
        try {
          const nestedEntries = fs
            .readdirSync(subDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));
          nestedFiles = nestedEntries.flatMap((nested) => {
            const nestedDir = path.join(subDir, nested.name);
            const category = `${entry.name}/${nested.name}`;
            return readMarkdownFiles(nestedDir, category);
          });
        } catch {
          nestedFiles = [];
        }

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
    let existing = categoryMap.get(file.category);
    if (!existing) {
      existing = [];
      categoryMap.set(file.category, existing);
    }
    existing.push(file);
  }

  return Array.from(categoryMap.entries()).map(([name, catFiles]) => ({
    name,
    label: CATEGORY_LABELS[name] ?? formatLabel(name),
    files: catFiles,
  }));
}
