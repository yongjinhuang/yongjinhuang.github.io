'use client';

import { useState, useEffect } from 'react';
import { FaArrowUp } from 'react-icons/fa';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    toggleVisibility();
    window.addEventListener('scroll', toggleVisibility, { passive: true });
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          type="button"
          initial={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }
          }
          animate={{ opacity: 1, scale: 1 }}
          exit={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }
          }
          onClick={scrollToTop}
          className="fixed bottom-5 right-5 md:bottom-8 md:right-8 w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center bg-white dark:bg-surface-dark border-3 border-black dark:border-white/20 shadow-[4px_4px_0_#000] dark:shadow-[4px_4px_0_rgba(255,255,255,0.1)] text-gray-900 dark:text-white hover:bg-accent hover:border-black hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#000] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-[transform,box-shadow,background-color,border-color,color] duration-300 z-50"
          aria-label="Scroll to top"
        >
          <FaArrowUp aria-hidden="true" className="text-base md:text-lg" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
