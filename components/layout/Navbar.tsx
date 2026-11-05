'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { ThemeToggle, ColorSchemePicker } from '@/components/theme';
import { LanguageSelector } from './LanguageSelector';
import type { NavTranslations } from '@/types';

interface NavbarProps {
  nav: NavTranslations;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  isRoute?: boolean;
}

export function Navbar({ nav }: NavbarProps) {
  const pathname = usePathname() || '/en';
  const segments = pathname.split('/').filter(Boolean);
  const lang = segments[0] === 'zh' ? 'zh' : 'en';
  const isHomePage = segments.length <= 1;
  const isDocsPage = segments[1] === 'docs';

  const [activeSection, setActiveSection] = useState<string>('');
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const navRef = useRef<HTMLDivElement>(null);

  const sectionPrefix = isHomePage ? '' : `/${lang}`;
  const docsLabel = lang === 'zh' ? '文档' : 'Docs';

  const navItems: NavItem[] = [
    {
      id: 'experience',
      label: nav.experience,
      href: `${sectionPrefix}#experience`,
    },
    {
      id: 'skills',
      label: nav.skills,
      href: `${sectionPrefix}#skills`,
    },
    {
      id: 'education',
      label: nav.education,
      href: `${sectionPrefix}#education`,
    },
    {
      id: 'contact',
      label: nav.contact,
      href: `${sectionPrefix}#contact`,
    },
    {
      id: 'docs',
      label: docsLabel,
      href: '/docs',
      isRoute: true,
    },
  ];

  // Track top scroll progress bar
  useEffect(() => {
    const updateScrollProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        docHeight > 0
          ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100))
          : 0;
      setScrollProgress(progress);
    };

    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollProgress);
  }, []);

  // Scroll-spy for home page sections
  useEffect(() => {
    if (!isHomePage) {
      setActiveSection(isDocsPage ? 'docs' : '');
      return;
    }

    const sectionIds = ['experience', 'skills', 'education', 'contact'];
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0.1, 0.25, 0.5],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isHomePage, isDocsPage, pathname]);

  // Close mobile menu on Escape or outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <nav className="fixed w-full top-0 z-50 transition-all duration-300">
      <div ref={navRef} className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 md:pt-4">
        <div className="glass-card glass-card-static rounded-xl hover:!translate-x-0 hover:!translate-y-0 relative px-4 py-2.5 md:px-5 md:py-3">
          {/* Top Scroll Progress Bar */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] rounded-t-xl overflow-hidden"
          >
            <div
              className="h-full bg-accent transition-[width] duration-150 ease-out"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>

          <div className="flex justify-between items-center">
            {/* Logo + Language */}
            <div className="flex items-center gap-3 md:gap-4">
              <Link
                href={`/${lang}`}
                className="brutal-btn brutal-btn-accent rounded-lg px-3 py-1 text-base md:text-lg font-extrabold tracking-tight"
              >
                YH
              </Link>
              <LanguageSelector />
            </div>

            {/* Desktop Nav Links + Actions */}
            <div className="flex items-center gap-2 md:gap-5">
              <div className="hidden md:flex items-center gap-1 lg:gap-2">
                {navItems.map((item) => {
                  const isActive =
                    (item.isRoute && isDocsPage) ||
                    (!item.isRoute && isHomePage && activeSection === item.id);

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative px-3 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${
                        isActive
                          ? 'text-accent bg-accent/10'
                          : 'text-gray-800 dark:text-gray-100 hover:text-accent hover:bg-gray-100/70 dark:hover:bg-white/5'
                      }`}
                    >
                      {item.label}
                      {isActive && (
                        <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
                      )}
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <ColorSchemePicker />
                <ThemeToggle />

                {/* Mobile Menu Button */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-surface-dark border-2 border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-200 hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all duration-200"
                  aria-label={
                    mobileMenuOpen
                      ? 'Close navigation menu'
                      : 'Open navigation menu'
                  }
                  aria-expanded={mobileMenuOpen}
                >
                  {mobileMenuOpen ? (
                    <XMarkIcon className="h-5 w-5" />
                  ) : (
                    <Bars3Icon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Dropdown Menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="md:hidden overflow-hidden"
              >
                <div className="pt-3 mt-3 border-t border-gray-200 dark:border-white/10 flex flex-col gap-1">
                  {navItems.map((item) => {
                    const isActive =
                      (item.isRoute && isDocsPage) ||
                      (!item.isRoute &&
                        isHomePage &&
                        activeSection === item.id);

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                          isActive
                            ? 'bg-accent/15 text-accent'
                            : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-accent'
                        }`}
                      >
                        <span>{item.label}</span>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-accent" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
}
