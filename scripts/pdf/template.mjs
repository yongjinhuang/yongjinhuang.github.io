import { toDataUri } from './schemes.mjs';
import {
  ICONS,
  SKILL_ICONS,
  iconSvg,
  escapeHtml,
  renderInlineMarkdown,
  isCJK,
} from './icons.mjs';
import { buildResumeStyles } from './styles.mjs';

export function buildResumeHtml(t, locale, scheme) {
  const hasCJK = isCJK(t.intro.name.first) || isCJK(t.intro.name.last);
  const fullName = hasCJK
    ? `${t.intro.name.last}${t.intro.name.first}`
    : `${t.intro.name.first} ${t.intro.name.last}`;
  const schoolBadge = locale === 'zh' ? '985 / 双一流' : '985';
  const currentLabel = locale === 'zh' ? '在职' : 'Current';
  const selfieUri = toDataUri('/selfie.png');
  const schoolLogoUri = toDataUri('/logo/school.png');

  const experiences = Object.entries(t.experience.company).map(([id, exp]) => ({
    id,
    ...exp,
    logoDataUri: toDataUri(exp.logoUrl),
    isCurrent: /present|至今/i.test(exp.period),
  }));

  const skillCategories = [
    { ...t.skills.languages, icon: ICONS.FaCode },
    { ...t.skills.frameworks, icon: ICONS.FaLayerGroup },
    { ...t.skills.tools, icon: ICONS.FaTools },
  ];

  const socialItems = [
    { icon: ICONS.FaGithub, label: 'GitHub', href: t.intro.links.github },
    { icon: ICONS.FaLinkedin, label: 'LinkedIn', href: t.intro.links.linkedin },
    { icon: ICONS.SiLeetcode, label: 'LeetCode', href: t.intro.links.leetcode },
  ];

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(fullName)} — ${escapeHtml(t.intro.tagline)}</title>
  <style>${buildResumeStyles(scheme)}</style>
</head>
<body class="resume-root">
  <div class="page">
    <!-- Hero Dossier -->
    <section class="card hero">
      <div class="hero-top">
        <div class="hero-left">
          <div class="hero-name-row">
            <h1 class="hero-name">${escapeHtml(fullName)}</h1>
            <span class="hero-tagline">${escapeHtml(t.intro.tagline)}</span>
          </div>
          <p class="hero-bio">${escapeHtml(t.intro.introduction)}</p>
          <div class="social-links">
            ${socialItems
              .map(
                (item) => `
              <a class="social-icon-btn" href="${escapeHtml(item.href)}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}" target="_blank" rel="noopener noreferrer">
                ${iconSvg(item.icon)}
              </a>`
              )
              .join('')}
          </div>
        </div>

        <div class="hero-right">
          <dl class="dossier-dl">
            <div class="dossier-row">
              <dt class="dossier-dt">${iconSvg(ICONS.FaGraduationCap)}<span>${escapeHtml(t.education.title)}</span></dt>
              <dd class="dossier-dd">
                <div class="edu-main">
                  <img class="edu-logo" src="${schoolLogoUri}" alt="" />
                  <span>${escapeHtml(t.education.university)}</span>
                  <span class="badge-accent">${escapeHtml(schoolBadge)}</span>
                </div>
                <span class="edu-sub">${escapeHtml(t.education.major)} (${escapeHtml(t.education.period)})</span>
              </dd>
            </div>
            <div class="dossier-row">
              <dt class="dossier-dt">${iconSvg(ICONS.FiMail)}<span>${escapeHtml(t.details.email.label)}</span></dt>
              <dd class="dossier-dd"><a href="mailto:${escapeHtml(t.details.email.value)}">${escapeHtml(t.details.email.value)}</a></dd>
            </div>
            <div class="dossier-row">
              <dt class="dossier-dt">${iconSvg(ICONS.FiPhone)}<span>${escapeHtml(t.details.phone.label)}</span></dt>
              <dd class="dossier-dd"><a href="tel:${escapeHtml(t.details.phone.value)}">${escapeHtml(t.details.phone.value)}</a></dd>
            </div>
            <div class="dossier-row">
              <dt class="dossier-dt">${iconSvg(ICONS.FiMessageSquare)}<span>${escapeHtml(t.details.wechat.label)}</span></dt>
              <dd class="dossier-dd">${escapeHtml(t.details.wechat.value)}</dd>
            </div>
            <div class="dossier-row">
              <dt class="dossier-dt">${iconSvg(ICONS.FiMapPin)}<span>${escapeHtml(t.details.address.label)}</span></dt>
              <dd class="dossier-dd">${escapeHtml(t.details.address.value)}</dd>
            </div>
          </dl>
          <div class="avatar-wrap">
            <div class="avatar-offset"></div>
            <img class="avatar-img" src="${selfieUri}" alt="${escapeHtml(fullName)}" />
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

    <!-- Experience Section -->
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
                <img class="exp-logo" src="${exp.logoDataUri}" alt="" />
                <div>
                  <div class="exp-company-name">
                    <a class="exp-company-link" href="${escapeHtml(exp.linkUrl)}" target="_blank" rel="noopener noreferrer">
                      <span>${escapeHtml(exp.name)}</span>
                      ${iconSvg(ICONS.FiExternalLink)}
                    </a>
                  </div>
                  <div class="exp-position">${escapeHtml(exp.position)}</div>
                </div>
              </div>
              <div class="exp-tech-list">
                ${exp.techStack
                  .split(',')
                  .map((tech) => `<span class="tech-pill">${escapeHtml(tech.trim())}</span>`)
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

    <!-- Skills Section -->
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
                    SKILL_ICONS[s.trim().toLowerCase()] || ICONS.FaCode;
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
</body>
</html>`;
}
