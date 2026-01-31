'use client';

import Link from 'next/link';
import { FaDownload, FaGithub, FaLinkedin, FaArrowRight } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { SiLeetcode } from 'react-icons/si';
import { useState, useEffect } from 'react';

interface IntroProps {
  title: string;
  introduction: string;
  resumeFile: string;
  links: LinksProp;
  greeting?: string;
  name?: {
    first: string;
    last: string;
  };
  tagline?: string;
  viewResume?: string;
  hireMe?: string;
}
interface LinksProp {
  github: string;
  linkedin: string;
  leetcode: string;
}

export function Intro({
  resumeFile,
  title,
  introduction,
  links,
  greeting = "Hello, I'm",
  name = { first: 'Yongjin', last: 'Huang' },
  tagline = 'Software Developer | Full-Stack Engineer',
  viewResume = 'View Resume',
  hireMe = 'Get In Touch',
}: IntroProps) {
  const [mounted, setMounted] = useState(false);
  const [typedText, setTypedText] = useState('');
  const fullText = tagline;

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
            {greeting}
          </motion.span>

          {/* Name - Extra Large with Subtle Hover Effect */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black mb-6 tracking-tight"
          >
            <span className="inline-block text-gray-900 dark:text-white hover:text-amber-600 dark:hover:text-accent transition-all duration-300 cursor-default">
              {name.first}
            </span>{' '}
            <span className="inline-block text-gray-900 dark:text-white hover:text-amber-600 dark:hover:text-accent transition-all duration-300 cursor-default">
              {name.last}
            </span>
          </motion.h1>

          {/* Tagline with Typing Animation + Cursor */}
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

          {/* Buttons - Brutal Style */}
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
              <span>{hireMe}</span>
              <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href={resumeFile}
              className="brutal-btn px-6 py-3 md:px-8 md:py-4 text-sm md:text-base bg-white dark:bg-surface-dark text-gray-900 dark:text-white border-gray-900 dark:border-white/30 inline-flex items-center gap-2 group"
              style={{
                boxShadow: '4px 4px 0 rgba(0,0,0,0.8)',
              }}
              download
            >
              <FaDownload className="group-hover:animate-bounce" />
              <span>{viewResume}</span>
            </Link>
          </motion.div>

          {/* Social Icons - Square Brutal Cards */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex justify-center gap-3 md:gap-4"
          >
            {[
              { icon: SiLeetcode, href: links.leetcode },
              { icon: FaGithub, href: links.github },
              { icon: FaLinkedin, href: links.linkedin },
            ].map(({ icon: Icon, href }, index) => (
              <motion.a
                key={index}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-white dark:bg-surface-dark border-2 border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:border-accent hover:text-accent hover:shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all duration-300"
              >
                <Icon className="text-xl md:text-2xl" />
              </motion.a>
            ))}
          </motion.div>
        </div>

        {/* About Me Card - Brutal Style with Gradient Border Animation */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="max-w-3xl mx-auto"
        >
          <div className="glass-card p-6 md:p-8 text-center group hover:border-accent">
            {/* Icon Container */}
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full mx-auto mb-4 md:mb-6 flex items-center justify-center bg-accent border-3 border-black shadow-[4px_4px_0_#000] group-hover:shadow-[6px_6px_0_#000] transition-all duration-300">
              <svg
                className="w-10 h-10 text-black"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4 gradient-text">
              {title}
            </h2>
            <p className="text-gray-700 dark:text-gray-100 text-base md:text-lg leading-relaxed">
              {introduction}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
