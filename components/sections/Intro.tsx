'use client';

import Link from 'next/link';
import { FaDownload, FaGithub, FaLinkedin, FaArrowRight } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { SiLeetcode } from 'react-icons/si';
import { useState, useEffect } from 'react';
import { Card, IconButton, IconContainer } from '@/components/ui';
import type { IntroTranslations } from '@/types';

interface IntroProps {
  intro: IntroTranslations;
}

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

  const socialLinks = [
    { icon: SiLeetcode, href: intro.links.leetcode, label: 'LeetCode' },
    { icon: FaGithub, href: intro.links.github, label: 'GitHub' },
    { icon: FaLinkedin, href: intro.links.linkedin, label: 'LinkedIn' },
  ];

  return (
    <section id="intro" className="py-12">
      <div className="w-full max-w-6xl mx-auto px-4">
        <div className="text-center mb-8 md:mb-12">
          {/* Greeting */}
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-lg md:text-xl text-gray-600 dark:text-gray-400 block mb-4"
          >
            {intro.greeting}
          </motion.span>

          {/* Name */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black mb-6 tracking-tight"
          >
            <span className="inline-block text-gray-900 dark:text-white hover:text-amber-600 dark:hover:text-accent transition-all duration-300 cursor-default">
              {intro.name.first}
            </span>{' '}
            <span className="inline-block text-gray-900 dark:text-white hover:text-amber-600 dark:hover:text-accent transition-all duration-300 cursor-default">
              {intro.name.last}
            </span>
          </motion.h1>

          {/* Tagline with Typing Animation */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg sm:text-xl md:text-2xl text-gray-700 dark:text-gray-100 mb-8 min-h-[40px] font-medium"
            suppressHydrationWarning
          >
            <span className="inline-block" suppressHydrationWarning>
              {mounted ? typedText : ''}
            </span>
            <span className="inline-block w-[3px] h-6 md:h-7 bg-accent ml-1 animate-[blink_1s_infinite]" />
          </motion.p>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex justify-center gap-3 md:gap-4 flex-wrap mb-8"
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
            className="flex justify-center gap-3 md:gap-4"
          >
            {socialLinks.map(({ icon: Icon, href, label }) => (
              <IconButton
                key={label}
                href={href}
                icon={<Icon className="text-xl md:text-2xl" />}
                aria-label={label}
              />
            ))}
          </motion.div>
        </div>

        {/* About Me Card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="max-w-3xl mx-auto"
        >
          <Card className="text-center">
            <IconContainer
              size="lg"
              variant="accent-filled"
              className="mx-auto mb-4 md:mb-6"
              icon={
                <svg
                  className="w-10 h-10 text-black"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              }
            />
            <h2 className="text-2xl md:text-3xl font-bold mb-4 gradient-text">
              {intro.title}
            </h2>
            <p className="text-gray-700 dark:text-gray-100 text-base md:text-lg leading-relaxed">
              {intro.introduction}
            </p>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
