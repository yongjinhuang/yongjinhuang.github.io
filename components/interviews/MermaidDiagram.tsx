'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { useTheme } from 'next-themes';

interface MermaidDiagramProps {
  readonly chart: string;
}

const darkThemeVariables = {
  primaryColor: '#f59e0b',
  primaryTextColor: '#f3f4f6',
  primaryBorderColor: '#d97706',
  lineColor: '#9ca3af',
  secondaryColor: '#1f2937',
  tertiaryColor: '#111827',
  background: '#0d1117',
  mainBkg: '#1f2937',
  nodeBorder: '#d97706',
  clusterBkg: '#111827',
  edgeLabelBackground: '#1f2937',
  fontSize: '14px',
};

const lightThemeVariables = {
  primaryColor: '#f59e0b',
  primaryTextColor: '#1f2937',
  primaryBorderColor: '#d97706',
  lineColor: '#4b5563',
  secondaryColor: '#f3f4f6',
  tertiaryColor: '#e5e7eb',
  background: '#ffffff',
  mainBkg: '#fffbeb',
  nodeBorder: '#d97706',
  clusterBkg: '#f9fafb',
  edgeLabelBackground: '#f3f4f6',
  fontSize: '14px',
};

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const uniqueId = useId().replace(/:/g, '-');
  const renderCountRef = useRef(0);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    renderCountRef.current += 1;
    const renderId = renderCountRef.current;

    async function renderChart() {
      try {
        const mermaid = (await import('mermaid')).default;
        const isDark = resolvedTheme === 'dark';

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'ui-monospace, monospace',
          flowchart: { curve: 'basis', padding: 16 },
          sequence: { actorMargin: 50, messageMargin: 40 },
          themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
        });

        const { svg: rendered } = await mermaid.render(
          `mermaid-${uniqueId}-${renderId}`,
          chart.trim()
        );

        if (!cancelled) {
          setSvg(rendered);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to render diagram'
          );
          setSvg('');
        }
      }
    }

    renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart, uniqueId, resolvedTheme]);

  if (error) {
    return (
      <div className="my-5 rounded-lg border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
        <p className="text-sm text-red-600 dark:text-red-400 font-mono mb-2">
          Diagram render error:
        </p>
        <pre className="text-xs text-red-500 dark:text-red-400 overflow-x-auto">
          {error}
        </pre>
        <details className="mt-3">
          <summary className="text-xs text-red-400 cursor-pointer">
            Show source
          </summary>
          <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-5 rounded-lg border-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1117] p-8 flex items-center justify-center">
        <div className="animate-pulse text-sm text-gray-400">
          Rendering diagram...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-5 rounded-lg border-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1117] p-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
