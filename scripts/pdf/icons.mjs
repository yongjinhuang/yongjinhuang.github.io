import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FaGithub,
  FaLinkedin,
  FaGlobe,
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

export const ICONS = {
  FaGithub,
  FaLinkedin,
  FaGlobe,
  FaGraduationCap,
  FaCode,
  FaTools,
  FaLayerGroup,
  FiPhone,
  FiMail,
  FiMapPin,
  FiMessageSquare,
  FiExternalLink,
  SiLeetcode,
};

export const SKILL_ICONS = {
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

export function iconSvg(IconComponent, className = '') {
  return renderToStaticMarkup(
    React.createElement(IconComponent, { className })
  );
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function isCJK(text) {
  return /[一-鿿]/.test(text);
}
