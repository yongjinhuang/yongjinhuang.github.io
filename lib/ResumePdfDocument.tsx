/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, View, Text, Image, Link } from '@react-pdf/renderer';
import {
  FaGithub,
  FaLinkedin,
  FaGraduationCap,
  FaCode,
  FaTools,
  FaLayerGroup,
} from 'react-icons/fa';
import {
  FiPhone,
  FiMail,
  FiMapPin,
  FiMessageSquare,
  FiExternalLink,
} from 'react-icons/fi';
import { SiLeetcode } from 'react-icons/si';
import type { Translations } from '@/types';
import { formatFullName } from './utils';
import { RESUME_SCHEMES, SKILL_ICONS, registerResumeFonts } from './pdf/config';
import { renderPdfIcon, renderMarkdownText } from './pdf/helpers';
import { createResumeStyles } from './pdf/styles';

export { registerResumeFonts };

export interface ResumePdfDocumentProps {
  readonly translations: Translations;
  readonly locale: string;
  readonly schemeName: string;
  readonly assetMap: Record<string, string>;
}

export function ResumePdfDocument({
  translations: t,
  locale,
  schemeName,
  assetMap,
}: ResumePdfDocumentProps) {
  const isZh = locale === 'zh';
  const mainFont = isZh ? 'NotoSansSC' : 'PlusJakartaSans';
  const monoFont = isZh ? 'NotoSansSC' : 'JetBrainsMono';
  const scheme = RESUME_SCHEMES[schemeName] ?? RESUME_SCHEMES.amber;
  const styles = createResumeStyles(scheme, mainFont, monoFont);

  const fullName = formatFullName(t.intro.name.first, t.intro.name.last);
  const schoolBadge = isZh ? '985 / 双一流' : '985';
  const currentLabel = isZh ? '在职' : 'Current';

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
    { icon: FaGithub, href: t.intro.links.github },
    { icon: FaLinkedin, href: t.intro.links.linkedin },
    { icon: SiLeetcode, href: t.intro.links.leetcode },
  ];

  return (
    <Document title={`${fullName} — ${t.intro.tagline}`} author={fullName}>
      <Page size="A4" style={styles.page}>
        {/* Hero Dossier */}
        <View style={[styles.card, styles.heroCard]}>
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <View style={styles.heroNameRow}>
                <Text style={styles.heroName}>{fullName}</Text>
                <Text style={styles.heroTagline}>{t.intro.tagline}</Text>
              </View>
              <Text style={styles.heroBio}>{t.intro.introduction}</Text>
              <View style={styles.socialRow}>
                {socialLinks.map((item, idx) => (
                  <Link key={idx} src={item.href} style={styles.socialIconBtn}>
                    {renderPdfIcon(item.icon, 9.5, '#0f172a')}
                  </Link>
                ))}
              </View>
            </View>

            <View style={styles.heroRight}>
              <View style={styles.dossierList}>
                <View style={styles.dossierRow}>
                  <View style={styles.dossierLabel}>
                    {renderPdfIcon(FaGraduationCap, 8.5, scheme.accentVivid)}
                    <Text>{t.education.title}</Text>
                  </View>
                  <View style={styles.eduRightCol}>
                    <View style={styles.eduMainRow}>
                      {assetMap['/logo/school.png'] && (
                        <Image
                          src={assetMap['/logo/school.png']}
                          style={styles.eduLogo}
                        />
                      )}
                      <Text style={styles.eduUniText}>
                        {t.education.university}
                      </Text>
                      <Text style={styles.badgeAccent}>{schoolBadge}</Text>
                    </View>
                    <Text style={styles.eduSubText}>
                      {t.education.major} ({t.education.period})
                    </Text>
                  </View>
                </View>

                <View style={styles.dossierRow}>
                  <View style={styles.dossierLabel}>
                    {renderPdfIcon(FiMail, 8.5, scheme.accentVivid)}
                    <Text>{t.details.email.label}</Text>
                  </View>
                  <Link
                    src={`mailto:${t.details.email.value}`}
                    style={[styles.dossierVal, { textDecoration: 'none' }]}
                  >
                    {t.details.email.value}
                  </Link>
                </View>

                <View style={styles.dossierRow}>
                  <View style={styles.dossierLabel}>
                    {renderPdfIcon(FiPhone, 8.5, scheme.accentVivid)}
                    <Text>{t.details.phone.label}</Text>
                  </View>
                  <Text style={styles.dossierVal}>{t.details.phone.value}</Text>
                </View>

                <View style={styles.dossierRow}>
                  <View style={styles.dossierLabel}>
                    {renderPdfIcon(FiMessageSquare, 8.5, scheme.accentVivid)}
                    <Text>{t.details.wechat.label}</Text>
                  </View>
                  <Text style={styles.dossierVal}>
                    {t.details.wechat.value}
                  </Text>
                </View>

                <View style={styles.dossierRowLast}>
                  <View style={styles.dossierLabel}>
                    {renderPdfIcon(FiMapPin, 8.5, scheme.accentVivid)}
                    <Text>{t.details.address.label}</Text>
                  </View>
                  <Text style={styles.dossierVal}>
                    {t.details.address.value}
                  </Text>
                </View>
              </View>

              <View style={styles.avatarWrap}>
                <View style={styles.avatarOffset} />
                {assetMap['/selfie.png'] && (
                  <Image
                    src={assetMap['/selfie.png']}
                    style={styles.avatarImg}
                  />
                )}
              </View>
            </View>
          </View>

          <View style={styles.heroLedger}>
            {t.intro.stats.map((st, idx) => (
              <View
                key={st.label}
                style={
                  idx > 0
                    ? [styles.statCell, styles.statCellDivider]
                    : styles.statCell
                }
              >
                <Text style={styles.statVal}>{st.value}</Text>
                <Text style={styles.statLbl}>{st.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Experience Section */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.experience.title}</Text>
            <Text style={styles.sectionTagline}>{t.experience.tagline}</Text>
          </View>
          <View style={styles.expList}>
            {experiences.map((exp) => (
              <View
                key={exp.id}
                style={
                  exp.isCurrent
                    ? [styles.card, styles.expCard, styles.expCardCurrent]
                    : [styles.card, styles.expCard]
                }
              >
                <View style={styles.expLeft}>
                  <View style={styles.expPeriodRow}>
                    <Text style={styles.expPeriod}>{exp.period}</Text>
                    {exp.isCurrent && (
                      <Text style={styles.badgeAccent}>{currentLabel}</Text>
                    )}
                  </View>
                  <View style={styles.expCompanyRow}>
                    {assetMap[exp.logoUrl] && (
                      <Image
                        src={assetMap[exp.logoUrl]}
                        style={styles.expLogo}
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={styles.expCompanyNameRow}>
                        <Link src={exp.linkUrl} style={styles.expCompanyName}>
                          {exp.name}
                        </Link>
                        {renderPdfIcon(FiExternalLink, 7, '#94a3b8')}
                      </View>
                      <Text style={styles.expPosition}>{exp.position}</Text>
                    </View>
                  </View>
                  <View style={styles.expTechWrap}>
                    {exp.techStack
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((tech) => (
                        <Text key={tech} style={styles.techPill}>
                          {tech}
                        </Text>
                      ))}
                  </View>
                </View>

                <View style={styles.expRight}>
                  {exp.responsibilities.map((resp, rIdx) => (
                    <View key={rIdx} style={styles.expBulletRow}>
                      <View style={styles.expDot} />
                      <Text style={styles.expBulletText}>
                        {renderMarkdownText(resp, scheme.accent, monoFont)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Skills Section */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.skills.title}</Text>
            <Text style={styles.sectionTagline}>{t.skills.tagline}</Text>
          </View>
          <View style={[styles.card, styles.skillsCard]}>
            {skillCategories.map((cat, idx) => (
              <View
                key={cat.title}
                style={
                  idx === skillCategories.length - 1
                    ? styles.skillsRowLast
                    : styles.skillsRow
                }
              >
                <View style={styles.skillsDt}>
                  {renderPdfIcon(cat.icon, 8.5, scheme.accentVivid)}
                  <Text style={styles.skillsDtText}>{cat.title}</Text>
                </View>
                <View style={styles.skillsDd}>
                  {cat.value.map((skill) => {
                    const SkillIcon =
                      SKILL_ICONS[skill.trim().toLowerCase()] ||
                      SKILL_ICONS.default;
                    return (
                      <View key={skill} style={styles.skillBadge}>
                        {renderPdfIcon(SkillIcon, 7.5, scheme.accentVivid)}
                        <Text style={styles.skillBadgeText}>{skill}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
