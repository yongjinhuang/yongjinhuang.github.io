'use client';

import { useEffect, useState, useRef } from 'react';

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], .skill-tag, .btn';

export function CustomCursor() {
  const [isVisible, setIsVisible] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const mouseX = useRef(0);
  const mouseY = useRef(0);
  const cursorX = useRef(0);
  const cursorY = useRef(0);

  useEffect(() => {
    const canShowCursor = window.matchMedia(
      '(pointer: fine) and (prefers-reduced-motion: no-preference)'
    ).matches;
    if (!canShowCursor) return;

    setIsVisible(true);
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.current = e.clientX;
      mouseY.current = e.clientY;

      if (dotRef.current) {
        dotRef.current.style.left = `${mouseX.current - 4}px`;
        dotRef.current.style.top = `${mouseY.current - 4}px`;
      }
    };

    const animate = () => {
      const diffX = mouseX.current - cursorX.current;
      const diffY = mouseY.current - cursorY.current;

      cursorX.current += diffX * 0.15;
      cursorY.current += diffY * 0.15;

      if (outlineRef.current) {
        outlineRef.current.style.left = `${cursorX.current - 15}px`;
        outlineRef.current.style.top = `${cursorY.current - 15}px`;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(INTERACTIVE_SELECTOR)) {
        if (dotRef.current) dotRef.current.style.transform = 'scale(2)';
        if (outlineRef.current)
          outlineRef.current.style.transform = 'scale(1.5)';
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const related = e.relatedTarget as Element | null;
      if (
        target?.closest?.(INTERACTIVE_SELECTOR) &&
        !related?.closest?.(INTERACTIVE_SELECTOR)
      ) {
        if (dotRef.current) dotRef.current.style.transform = 'scale(1)';
        if (outlineRef.current) outlineRef.current.style.transform = 'scale(1)';
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseover', handleMouseOver, { passive: true });
    document.addEventListener('mouseout', handleMouseOut, { passive: true });
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <div
        ref={dotRef}
        className="fixed w-2 h-2 rounded-full pointer-events-none z-[9999] transition-transform duration-100"
        style={{
          background: 'var(--accent)',
        }}
      />
      <div
        ref={outlineRef}
        className="fixed w-[30px] h-[30px] border-2 rounded-full pointer-events-none z-[9999] transition-transform duration-150"
        style={{
          borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
        }}
      />
    </>
  );
}
