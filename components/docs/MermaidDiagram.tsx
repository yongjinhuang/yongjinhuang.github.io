'use client';

import { useEffect, useRef, useState, useId } from 'react';
import {
  HiMagnifyingGlassPlus,
  HiMagnifyingGlassMinus,
  HiArrowsPointingOut,
  HiXMark,
} from 'react-icons/hi2';
import { useTheme } from '@/components/theme';

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
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const uniqueId = useId().replace(/:/g, '-');
  const renderCountRef = useRef(0);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    if (!resolvedTheme) return;

    let cancelled = false;
    renderCountRef.current += 1;
    const renderId = renderCountRef.current;
    const diagramId = `mermaid-${uniqueId}-${renderId}`;

    async function renderChart() {
      try {
        const mermaid = (await import('mermaid')).default;
        const isDark = resolvedTheme === 'dark';

        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'ui-monospace, monospace',
          flowchart: { curve: 'basis', padding: 16 },
          sequence: { actorMargin: 50, messageMargin: 40 },
          themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
        });

        const { svg: rendered } = await mermaid.render(diagramId, chart.trim());

        if (!cancelled) {
          setSvg(rendered);
          setError('');
        }
      } catch (err) {
        document.getElementById(`d${diagramId}`)?.remove();
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
        <div
          role="status"
          aria-live="polite"
          className="animate-pulse text-sm text-gray-400 font-mono"
        >
          Rendering diagram…
        </div>
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200/80 dark:border-white/10 bg-gray-100/80 dark:bg-white/5 text-xs text-gray-500 dark:text-gray-400">
      <span className="font-mono uppercase tracking-wider text-[11px] font-semibold">
        diagram
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(50, z - 25))}
          disabled={zoom <= 50}
          aria-label="Zoom out diagram"
          title="Zoom out"
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
        >
          <HiMagnifyingGlassMinus aria-hidden="true" className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(100)}
          aria-label="Reset diagram zoom"
          title="Reset zoom to 100%"
          className="px-1.5 py-0.5 rounded font-mono tabular-nums text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
        >
          {zoom}%
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(250, z + 25))}
          disabled={zoom >= 250}
          aria-label="Zoom in diagram"
          title="Zoom in"
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
        >
          <HiMagnifyingGlassPlus aria-hidden="true" className="w-3.5 h-3.5" />
        </button>
        <div className="h-3.5 w-px bg-gray-200 dark:bg-white/10 mx-0.5" />
        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          aria-label={
            isFullscreen
              ? 'Close fullscreen diagram'
              : 'Expand diagram fullscreen'
          }
          title={isFullscreen ? 'Close fullscreen (Esc)' : 'Expand fullscreen'}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
        >
          {isFullscreen ? (
            <HiXMark aria-hidden="true" className="w-3.5 h-3.5" />
          ) : (
            <HiArrowsPointingOut aria-hidden="true" className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="my-5 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#0d1117]">
        {toolbar}
        <div ref={containerRef} className="p-4 overflow-x-auto">
          <div
            style={{
              width: zoom === 100 ? '100%' : `${zoom}%`,
              transition: 'width 150ms ease-out',
            }}
            className="mx-auto [&_svg]:mx-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>

      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded diagram view"
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex flex-col p-3 sm:p-6 overscroll-contain"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="flex-1 flex flex-col rounded-xl border-2 border-gray-200 dark:border-white/15 bg-white dark:bg-[#0d1117] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {toolbar}
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
              <div
                style={{
                  width: zoom === 100 ? '100%' : `${zoom}%`,
                  transition: 'width 150ms ease-out',
                }}
                className="mx-auto [&_svg]:mx-auto [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
