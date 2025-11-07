'use client';

import { useEffect, useRef } from 'react';

export function AnimatedBackground() {
  const orbsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const mouseX = e.clientX / window.innerWidth;
      const mouseY = e.clientY / window.innerHeight;

      orbsRef.current.forEach((orb, index) => {
        if (orb) {
          const speed = (index + 1) * 30;
          const x = (mouseX - 0.5) * speed;
          const y = (mouseY - 0.5) * speed;
          orb.style.transform = `translate(${x}px, ${y}px)`;
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none">
      {/* Gradient Orb 1 */}
      <div
        ref={(el) => {
          if (el) orbsRef.current[0] = el;
        }}
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 dark:opacity-30 -top-[200px] -left-[200px]"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          animation: 'float 20s infinite ease-in-out',
        }}
      />

      {/* Gradient Orb 2 */}
      <div
        ref={(el) => {
          if (el) orbsRef.current[1] = el;
        }}
        className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20 dark:opacity-30 -bottom-[150px] -right-[150px]"
        style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          animation: 'float 20s infinite ease-in-out 5s',
        }}
      />

      {/* Gradient Orb 3 */}
      <div
        ref={(el) => {
          if (el) orbsRef.current[2] = el;
        }}
        className="absolute w-[600px] h-[600px] rounded-full blur-[100px] opacity-20 dark:opacity-30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          animation: 'float 20s infinite ease-in-out 10s',
        }}
      />
    </div>
  );
}
