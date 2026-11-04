/**
 * Strongly-typed translation definitions
 * These types ensure type safety when accessing translation keys
 */

export interface NavTranslations {
  about: string;
  skills: string;
  experience: string;
  education: string;
  contact: string;
}

export interface NameTranslations {
  first: string;
  last: string;
}

export interface LinksTranslations {
  github: string;
  linkedin: string;
  leetcode: string;
}

export interface StatItemTranslations {
  value: string;
  label: string;
}

export interface IntroTranslations {
  resumeFile: string;
  title: string;
  greeting: string;
  name: NameTranslations;
  tagline: string;
  viewResume: string;
  hireMe: string;
  introduction: string;
  stats: Array<StatItemTranslations>;
  links: LinksTranslations;
}

export interface SkillCategoryTranslations {
  title: string;
  value: string[];
}

export interface SkillsTranslations {
  title: string;
  tagline: string;
  languages: SkillCategoryTranslations;
  frameworks: SkillCategoryTranslations;
  tools: SkillCategoryTranslations;
}

export interface CompanyExperienceTranslations {
  name: string;
  position: string;
  period: string;
  techStack: string;
  project?: string;
  responsibilities: string[];
  logoUrl: string;
  linkUrl: string;
}

export interface ExperienceTranslations {
  title: string;
  tagline: string;
  currentBadge?: string;
  company: Record<string, CompanyExperienceTranslations>;
}

export interface ContactDetailTranslations {
  label: string;
  value: string;
}

export interface DetailsTranslations {
  title: string;
  tagline: string;
  clickToReveal: string;
  copyToClipboard: string;
  copied: string;
  email: ContactDetailTranslations;
  phone: ContactDetailTranslations;
  wechat: ContactDetailTranslations;
  address: ContactDetailTranslations;
}

export interface EducationTranslations {
  title: string;
  tagline: string;
  university: string;
  major: string;
  period: string;
  highlights?: string[];
}

export interface FooterTranslations {
  name: string;
}

/**
 * Complete translations object type
 */
export interface Translations {
  nav: NavTranslations;
  intro: IntroTranslations;
  skills: SkillsTranslations;
  experience: ExperienceTranslations;
  details: DetailsTranslations;
  education: EducationTranslations;
  footer: FooterTranslations;
}
