'use client';

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSelector from '@/components/LanguageSelector';
import ColorSchemePicker from '@/components/ColorSchemePicker';
import type { NavTranslations } from '@/types';

interface NavbarProps {
  nav: NavTranslations;
}

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

function NavLink({ href, children }: NavLinkProps) {
  return (
    <Link href={href} className="relative group hidden sm:block">
      <span className="text-gray-800 dark:text-gray-100 font-semibold hover:text-accent transition-colors duration-300">
        {children}
      </span>
      <span className="absolute -bottom-1 left-0 w-0 h-[3px] bg-accent group-hover:w-full transition-all duration-300" />
    </Link>
  );
}

export function Navbar({ nav }: NavbarProps) {
  return (
    <nav className="fixed w-full top-0 z-50 transition-all duration-300">
      <div className="mx-4 mt-4">
        <div className="glass-card px-4 py-3 md:px-6 md:py-4">
          <div className="container mx-auto flex justify-between items-center">
            {/* Logo + Language */}
            <div className="flex items-center gap-3 md:gap-4">
              <Link
                href="/"
                className="brutal-btn brutal-btn-accent px-3 py-1 md:px-4 md:py-2 text-lg md:text-xl font-black tracking-tight hover:scale-105 transition-transform"
              >
                YH
              </Link>
              <LanguageSelector />
            </div>

            {/* Nav Links + Theme Toggle */}
            <div className="flex items-center gap-4 md:gap-6">
              <NavLink href="#experience">{nav.experience}</NavLink>
              <NavLink href="#about">{nav.about}</NavLink>
              <NavLink href="#education">{nav.education}</NavLink>
              <NavLink href="#contact">{nav.contact}</NavLink>
              <ColorSchemePicker />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
