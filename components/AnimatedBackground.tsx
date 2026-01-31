'use client';

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Subtle Warm Gradient Background */}
      <div
        className="absolute inset-0 opacity-15 dark:opacity-25"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% 40%, rgba(251, 191, 36, 0.2), transparent),
            radial-gradient(ellipse 60% 40% at 80% 60%, rgba(217, 119, 6, 0.15), transparent)
          `,
          backgroundSize: '200% 200%',
          animation: 'mesh-gradient 15s ease infinite',
        }}
      />

      {/* Large Subtle Blob - Amber (Top Left) */}
      <div
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full blur-[120px] opacity-10 dark:opacity-20"
        style={{
          background:
            'radial-gradient(circle, rgba(251, 191, 36, 0.6) 0%, transparent 70%)',
          animation: 'float 20s ease-in-out infinite',
        }}
      />

      {/* Large Subtle Blob - Amber (Bottom Right) */}
      <div
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full blur-[120px] opacity-10 dark:opacity-15"
        style={{
          background:
            'radial-gradient(circle, rgba(217, 119, 6, 0.5) 0%, transparent 70%)',
          animation: 'float 20s ease-in-out infinite 5s',
        }}
      />

      {/* Subtle Grid Overlay */}
      <div className="absolute inset-0 grid-pattern opacity-20 dark:opacity-40" />
    </div>
  );
}
