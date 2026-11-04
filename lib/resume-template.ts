import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FaGithub,
  FaLinkedin,
  FaGraduationCap,
  FaCode,
  FaTools,
  FaLayerGroup,
  FaJava,
  FaDatabase,
  FaRobot,
  FaBrain,
} from 'react-icons/fa';
import {
  FiPhone,
  FiMail,
  FiMapPin,
  FiMessageSquare,
  FiExternalLink,
} from 'react-icons/fi';
import {
  SiLeetcode,
  SiGo,
  SiPython,
  SiTypescript,
  SiFastapi,
  SiLangchain,
  SiDjango,
  SiSpringboot,
  SiReact,
  SiNextdotjs,
  SiGit,
  SiLinux,
  SiDocker,
  SiKubernetes,
  SiPostgresql,
  SiMysql,
  SiRedis,
  SiMongodb,
  SiApachekafka,
  SiHelm,
  SiOpentelemetry,
} from 'react-icons/si';
import type { IconType } from 'react-icons';
import type { Translations } from '@/types';
import { formatFullName } from './utils';
import {
  RESUME_SCHEME_PALETTES,
  buildResumeStyles,
  type ResumeSchemePalette,
} from './resume-styles';

const SKILL_ICONS: Record<string, IconType> = {
  golang: SiGo,
  go: SiGo,
  python: SiPython,
  typescript: SiTypescript,
  java: FaJava,
  sql: FaDatabase,
  gin: SiGo,
  fastapi: SiFastapi,
  langchain: SiLangchain,
  'langchain / langgraph': SiLangchain,
  'ai agents': FaRobot,
  'llm / rag': FaBrain,
  django: SiDjango,
  'spring boot': SiSpringboot,
  react: SiReact,
  'next.js': SiNextdotjs,
  git: SiGit,
  linux: SiLinux,
  docker: SiDocker,
  k8s: SiKubernetes,
  kubernetes: SiKubernetes,
  postgresql: SiPostgresql,
  mysql: SiMysql,
  redis: SiRedis,
  mongodb: SiMongodb,
  kafka: SiApachekafka,
  helm: SiHelm,
  opentelemetry: SiOpentelemetry,
};

function iconSvg(Icon: IconType): string {
  return renderToStaticMarkup(createElement(Icon));
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function buildResumeBodyHtml(
  t: Translations,
  locale: string,
  schemeName = 'amber'
): string {
  const scheme: ResumeSchemePalette =
    RESUME_SCHEME_PALETTES[schemeName] ?? RESUME_SCHEME_PALETTES.amber;
  const fullName = formatFullName(t.intro.name.first, t.intro.name.last);
  const schoolBadge = locale === 'zh' ? '985 / 双一流' : '985';
  const currentLabel = locale === 'zh' ? '在职' : 'Current';

  const experiences = Object.entries(t.experience.company).map(([id, exp]) => ({
    id,
    ...exp,
    isCurrent: /present|至今/i.test(exp.period),
  }));

  const skillCategories = [
    { ...t.skills.languages, icon: FaCode },
    { ...t.skills.frameworks, icon: FaLayerGroup },
    { ...t.skills.tools, icon: FaTools },
  ];

  const socialLinks = [
    { icon: FaGithub, label: 'GitHub', href: t.intro.links.github },
    { icon: FaLinkedin, label: 'LinkedIn', href: t.intro.links.linkedin },
    { icon: SiLeetcode, label: 'LeetCode', href: t.intro.links.leetcode },
  ];

  return `
  <style>${buildResumeStyles(scheme)}</style>
  <div class="resume-root">
    <div class="page">
      <section class="card hero">
        <div class="hero-top">
          <div class="hero-left">
            <div class="hero-name-row">
              <h1 class="hero-name">${escapeHtml(fullName)}</h1>
              <span class="hero-tagline">${escapeHtml(t.intro.tagline)}</span>
            </div>
            <p class="hero-bio">${escapeHtml(t.intro.introduction)}</p>
            <div class="social-links">
              ${socialLinks
                .map(
                  (item) => `
                <a class="social-icon-btn" href="${escapeHtml(item.href)}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">
                  ${iconSvg(item.icon)}
                </a>`
                )
                .join('')}
            </div>
          </div>

          <div class="hero-right">
            <dl class="dossier-dl">
              <div class="dossier-row">
                <dt class="dossier-dt">${iconSvg(FaGraduationCap)}<span>${escapeHtml(t.education.title)}</span></dt>
                <dd class="dossier-dd">
                  <div class="edu-main">
                    <img class="edu-logo" src="/logo/school.png" alt="" />
                    <span>${escapeHtml(t.education.university)}</span>
                    <span class="badge-accent">${escapeHtml(schoolBadge)}</span>
                  </div>
                  <span class="edu-sub">${escapeHtml(t.education.major)} (${escapeHtml(t.education.period)})</span>
                </dd>
              </div>
              <div class="dossier-row">
                <dt class="dossier-dt">${iconSvg(FiMail)}<span>${escapeHtml(t.details.email.label)}</span></dt>
                <dd class="dossier-dd"><a href="mailto:${escapeHtml(t.details.email.value)}">${escapeHtml(t.details.email.value)}</a></dd>
              </div>
              <div class="dossier-row">
                <dt class="dossier-dt">${iconSvg(FiPhone)}<span>${escapeHtml(t.details.phone.label)}</span></dt>
                <dd class="dossier-dd"><a href="tel:${escapeHtml(t.details.phone.value)}">${escapeHtml(t.details.phone.value)}</a></dd>
              </div>
              <div class="dossier-row">
                <dt class="dossier-dt">${iconSvg(FiMessageSquare)}<span>${escapeHtml(t.details.wechat.label)}</span></dt>
                <dd class="dossier-dd">${escapeHtml(t.details.wechat.value)}</dd>
              </div>
              <div class="dossier-row">
                <dt class="dossier-dt">${iconSvg(FiMapPin)}<span>${escapeHtml(t.details.address.label)}</span></dt>
                <dd class="dossier-dd">${escapeHtml(t.details.address.value)}</dd>
              </div>
            </dl>
            <div class="avatar-wrap">
              <div class="avatar-offset"></div>
              <img class="avatar-img" src="/selfie.png" alt="${escapeHtml(fullName)}" />
            </div>
          </div>
        </div>
        <div class="hero-ledger">
          ${t.intro.stats
            .map(
              (st) => `
            <div class="stat-item">
              <span class="stat-val">${escapeHtml(st.value)}</span>
              <span class="stat-lbl">${escapeHtml(st.label)}</span>
            </div>`
            )
            .join('')}
        </div>
      </section>

      <section>
        <div class="section-header">
          <h2 class="section-title">${escapeHtml(t.experience.title)}</h2>
          <span class="section-tagline">${escapeHtml(t.experience.tagline)}</span>
        </div>
        <div class="exp-list">
          ${experiences
            .map(
              (exp) => `
            <div class="card exp-card ${exp.isCurrent ? 'exp-card-current' : ''}">
              <div class="exp-meta">
                <div class="exp-period-row">
                  <span class="exp-period">${escapeHtml(exp.period)}</span>
                  ${exp.isCurrent ? `<span class="badge-accent">${escapeHtml(currentLabel)}</span>` : ''}
                </div>
                <div class="exp-company-row">
                  <img class="exp-logo" src="${escapeHtml(exp.logoUrl)}" alt="" />
                  <div>
                    <div class="exp-company-name">
                      <a class="exp-company-link" href="${escapeHtml(exp.linkUrl)}">
                        <span>${escapeHtml(exp.name)}</span>
                        ${iconSvg(FiExternalLink)}
                      </a>
                    </div>
                    <div class="exp-position">${escapeHtml(exp.position)}</div>
                  </div>
                </div>
                <div class="exp-tech-list">
                  ${exp.techStack
                    .split(',')
                    .map(
                      (tech) =>
                        `<span class="tech-pill">${escapeHtml(tech.trim())}</span>`
                    )
                    .join('')}
                </div>
              </div>
              <ul class="exp-bullets">
                ${exp.responsibilities
                  .map(
                    (r) => `
                  <li class="exp-bullet">
                    <span class="exp-dot"></span>
                    <span>${renderInlineMarkdown(r)}</span>
                  </li>`
                  )
                  .join('')}
              </ul>
            </div>`
            )
            .join('')}
        </div>
      </section>

      <section>
        <div class="section-header">
          <h2 class="section-title">${escapeHtml(t.skills.title)}</h2>
          <span class="section-tagline">${escapeHtml(t.skills.tagline)}</span>
        </div>
        <div class="card skills-card">
          ${skillCategories
            .map(
              (cat) => `
            <div class="skills-row">
              <div class="skills-dt">
                ${iconSvg(cat.icon)}
                <span>${escapeHtml(cat.title)}</span>
              </div>
              <div class="skills-dd">
                ${cat.value
                  .map((s) => {
                    const SkillIcon =
                      SKILL_ICONS[s.trim().toLowerCase()] || FaCode;
                    return `<span class="skill-badge">${iconSvg(SkillIcon)}<span>${escapeHtml(s)}</span></span>`;
                  })
                  .join('')}
              </div>
            </div>`
            )
            .join('')}
        </div>
      </section>
    </div>
  </div>`;
}
