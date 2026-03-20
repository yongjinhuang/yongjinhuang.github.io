'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FaDownload, FaGithub, FaLinkedin, FaArrowRight } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { IconButton } from '@/components/ui';
import type { IntroTranslations } from '@/types';

interface IntroProps {
  intro: IntroTranslations;
}

const stats = [
  { value: '8+', label: 'Years Exp.' },
  { value: '4', label: 'Companies' },
  { value: '5+', label: 'Tech Talks' },
];

export function Intro({ intro }: IntroProps) {
  const [mounted, setMounted] = useState(false);
  const [typedText, setTypedText] = useState('');
  const fullText = intro.tagline;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let index = 0;
    const timer = setInterval(() => {
      if (index <= fullText.length) {
        setTypedText(fullText.substring(0, index));
        index++;
      } else {
        clearInterval(timer);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [fullText, mounted]);

  return (
    <section id="intro" className="py-4 md:py-6">
      <div className="w-full max-w-6xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          {/* Left: Text Content */}
          <div className="flex-1 text-center lg:text-left">
            {/* Greeting */}
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-lg md:text-xl text-gray-600 dark:text-gray-400 block mb-3"
            >
              {intro.greeting}
            </motion.span>

            {/* Name */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-4 tracking-tight"
            >
              <span className="inline-block text-gray-900 dark:text-white hover:text-accent transition-all duration-300 cursor-default">
                {intro.name.first}
              </span>{' '}
              <span className="inline-block text-gray-900 dark:text-white hover:text-accent transition-all duration-300 cursor-default">
                {intro.name.last}
              </span>
            </motion.h1>

            {/* Tagline with Typing Animation */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-lg sm:text-xl md:text-2xl text-gray-700 dark:text-gray-100 mb-4 min-h-[36px] font-medium"
              suppressHydrationWarning
            >
              <span className="inline-block" suppressHydrationWarning>
                {mounted ? typedText : ''}
              </span>
              <span className="inline-block w-[3px] h-6 md:h-7 bg-accent ml-1 animate-[blink_1s_infinite]" />
            </motion.p>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-gray-600 dark:text-gray-300 text-sm md:text-base leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0"
            >
              {intro.introduction}
            </motion.p>

            {/* Stats Row */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex justify-center lg:justify-start gap-6 md:gap-8 mb-6"
            >
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-black text-accent">
                    {stat.value}
                  </div>
                  <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="flex justify-center lg:justify-start gap-3 md:gap-4 flex-wrap"
            >
              <Link
                href="#experience"
                className="brutal-btn brutal-btn-accent px-6 py-3 md:px-8 md:py-4 text-sm md:text-base inline-flex items-center gap-2 group"
              >
                <span>{intro.hireMe}</span>
                <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href={intro.resumeFile}
                className="brutal-btn px-6 py-3 md:px-8 md:py-4 text-sm md:text-base bg-white dark:bg-surface-dark text-gray-900 dark:text-white border-gray-900 dark:border-white/30 inline-flex items-center gap-2 group"
                style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.8)' }}
                download
              >
                <FaDownload className="group-hover:animate-bounce" />
                <span>{intro.viewResume}</span>
              </Link>
            </motion.div>

            {/* Social Icons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex justify-center lg:justify-start gap-3 md:gap-4 mt-6"
            >
              {[
                { icon: SiLeetcode, href: intro.links.leetcode, label: 'LeetCode' },
                { icon: FaGithub, href: intro.links.github, label: 'GitHub' },
                { icon: FaLinkedin, href: intro.links.linkedin, label: 'LinkedIn' },
              ].map(({ icon: Icon, href, label }) => (
                <IconButton
                  key={label}
                  href={href}
                  icon={<Icon className="text-xl md:text-2xl" />}
                  aria-label={label}
                />
              ))}
            </motion.div>
          </div>

          {/* Right: Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex-shrink-0"
          >
            <div className="relative w-48 h-48 md:w-64 md:h-64 lg:w-72 lg:h-72">
              {/* Gradient border ring */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent via-accent-light to-accent opacity-80 animate-[spin_8s_linear_infinite]" />
              {/* Inner white ring */}
              <div className="absolute inset-[3px] rounded-full bg-white dark:bg-surface-darker" />
              {/* Photo */}
              <div className="absolute inset-[6px] rounded-full overflow-hidden">
                <Image
                  src="/selfie.png"
                  alt={`${intro.name.first} ${intro.name.last}`}
                  width={280}
                  height={280}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
