'use client';

import { useTheme } from '@/components/ThemeProvider';
import { useEffect, useState } from 'react';

export function AnimatedBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="fixed inset-0 -z-10" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <div
      key={resolvedTheme}
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none transition-opacity duration-300"
    >
      {/* Static Architectural Spotlight */}
      <div
        className="absolute inset-0"
        style={{
          opacity: isDark ? 0.22 : 0.14,
          background: `
            radial-gradient(ellipse 70% 45% at 15% 20%, color-mix(in srgb, var(--blob-primary) 28%, transparent), transparent),
            radial-gradient(ellipse 55% 40% at 85% 75%, color-mix(in srgb, var(--blob-secondary) 20%, transparent), transparent)
          `,
        }}
      />

      {/* Precision Blueprint Grid Overlay */}
      <div
        className="absolute inset-0 grid-pattern"
        style={{ opacity: isDark ? 0.45 : 0.35 }}
      />
    </div>
  );
}
