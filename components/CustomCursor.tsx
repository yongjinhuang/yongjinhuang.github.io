'use client';

import { useEffect, useState, useRef } from 'react';

export function CustomCursor() {
  const [isVisible, setIsVisible] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const mouseX = useRef(0);
  const mouseY = useRef(0);
  const cursorX = useRef(0);
  const cursorY = useRef(0);

  useEffect(() => {
    // Only show on desktop
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    if (isMobile) return;

    setIsVisible(true);

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.current = e.clientX;
      mouseY.current = e.clientY;

      if (dotRef.current) {
        dotRef.current.style.left = `${mouseX.current}px`;
        dotRef.current.style.top = `${mouseY.current}px`;
      }
    };

    const animate = () => {
      const diffX = mouseX.current - cursorX.current;
      const diffY = mouseY.current - cursorY.current;

      cursorX.current += diffX * 0.1;
      cursorY.current += diffY * 0.1;

      if (outlineRef.current) {
        outlineRef.current.style.left = `${cursorX.current - 15}px`;
        outlineRef.current.style.top = `${cursorY.current - 15}px`;
      }

      requestAnimationFrame(animate);
    };

    const handleMouseEnter = () => {
      if (dotRef.current) dotRef.current.style.transform = 'scale(2)';
      if (outlineRef.current) outlineRef.current.style.transform = 'scale(1.5)';
    };

    const handleMouseLeave = () => {
      if (dotRef.current) dotRef.current.style.transform = 'scale(1)';
      if (outlineRef.current) outlineRef.current.style.transform = 'scale(1)';
    };

    window.addEventListener('mousemove', handleMouseMove);
    animate();

    // Add event listeners to interactive elements
    const interactiveElements = document.querySelectorAll(
      'a, button, [role="button"], .skill-tag, .btn'
    );
    interactiveElements.forEach((el) => {
      el.addEventListener('mouseenter', handleMouseEnter);
      el.addEventListener('mouseleave', handleMouseLeave);
    });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      interactiveElements.forEach((el) => {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
      });
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <div
        ref={dotRef}
        className="fixed w-2 h-2 rounded-full pointer-events-none z-[9999] transition-transform duration-100"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      />
      <div
        ref={outlineRef}
        className="fixed w-[30px] h-[30px] border-2 rounded-full pointer-events-none z-[9999] transition-transform duration-150"
        style={{
          borderColor: 'rgba(102, 126, 234, 0.5)',
        }}
      />
    </>
  );
}
