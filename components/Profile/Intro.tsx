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
  // resumePrompt: string;
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
  // resumePrompt,
  title,
  introduction,
  links,
  greeting = "Hello, I'm",
  name = { first: 'Yongjin', last: 'Huang' },
  tagline = 'Software Developer | Full-Stack Engineer',
  viewResume = 'View Resume',
  hireMe = 'Get In Touch',
}: IntroProps) {
  const [typedText, setTypedText] = useState('');
  const fullText = tagline;

  useEffect(() => {
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
  }, [fullText]);

  return (
    <section
      id="intro"
      className="min-h-[70vh] flex items-center py-8 md:py-12"
    >
      <div className="w-full max-w-6xl mx-auto px-4">
        <div className="text-center mb-8 md:mb-12">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-lg md:text-xl text-gray-600 dark:text-gray-300 block mb-4"
          >
            {greeting}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6"
          >
            <span className="gradient-text">{name.first}</span>{' '}
            <span className="gradient-text">{name.last}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg sm:text-xl md:text-2xl text-gray-700 dark:text-gray-100 mb-8 min-h-[40px]"
          >
            <span className="inline-block">{typedText}</span>
            <span className="animate-[blink_1s_infinite] ml-1">|</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex justify-center gap-3 md:gap-4 flex-wrap mb-6 md:mb-8"
          >
            <Link
              href="#experience"
              className="group btn-primary inline-flex items-center gap-2 px-6 py-3 md:px-8 md:py-4 rounded-full font-semibold text-sm md:text-base text-white shadow-lg transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }}
            >
              <span className="relative z-10">{hireMe}</span>
              <FaArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" />
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
            </Link>

            <Link
              href={resumeFile}
              className="group inline-flex items-center gap-2 px-6 py-3 md:px-8 md:py-4 rounded-full font-semibold text-sm md:text-base bg-white dark:bg-white/5 backdrop-blur-lg border-2 border-purple-300 dark:border-white/20 text-purple-700 dark:text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-purple-50 dark:hover:bg-white/10 hover:border-purple-400"
              download
            >
              <FaDownload className="group-hover:animate-bounce" />
              <span>{viewResume}</span>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex justify-center gap-4 md:gap-6"
          >
            <motion.a
              whileHover={{ scale: 1.2, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              href={links.leetcode}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white dark:bg-white/5 backdrop-blur-lg border-2 border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2] hover:text-white hover:border-transparent transition-all duration-300"
            >
              <SiLeetcode className="text-lg md:text-xl" />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.2, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              href={links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white dark:bg-white/5 backdrop-blur-lg border-2 border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2] hover:text-white hover:border-transparent transition-all duration-300"
            >
              <FaGithub className="text-lg md:text-xl" />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.2, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              href={links.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white dark:bg-white/5 backdrop-blur-lg border-2 border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gradient-to-r hover:from-[#667eea] hover:to-[#764ba2] hover:text-white hover:border-transparent transition-all duration-300"
            >
              <FaLinkedin className="text-lg md:text-xl" />
            </motion.a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="max-w-3xl mx-auto"
        >
          <div className="glass-card p-6 md:p-8 text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 md:mb-6 rounded-full flex items-center justify-center bg-gradient-to-r from-[#667eea] to-[#764ba2] animate-[pulse_2s_infinite]">
              <svg
                className="w-10 h-10 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-4 gradient-text">{title}</h2>
            <p className="text-gray-700 dark:text-gray-100 text-lg leading-relaxed">
              {introduction}
            </p>
          </div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="text-center mt-16"
        >
          <div className="inline-block">
            <div className="w-[30px] h-[50px] border-2 border-gray-400 dark:border-gray-600 rounded-full relative mx-auto mb-2">
              <div className="w-1 h-2 bg-gray-400 dark:bg-gray-600 rounded-full absolute top-2 left-1/2 -translate-x-1/2 animate-[scroll_2s_infinite]" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Scroll Down
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
