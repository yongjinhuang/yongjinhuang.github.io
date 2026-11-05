import React from 'react';
import {
  Text,
  Link,
  Svg,
  Path,
  Circle,
  Rect,
  Line,
  Polyline,
  Polygon,
} from '@react-pdf/renderer';
import type { IconType } from 'react-icons';

interface IconVNode {
  type: string;
  props: Record<string, unknown> & {
    attr?: Record<string, string>;
    children?: IconVNode[];
  };
}

export function renderPdfIcon(
  Icon: IconType,
  size: number,
  color: string
): React.ReactElement | null {
  const vnode = Icon({}) as unknown as IconVNode;
  if (!vnode || !vnode.props) return null;

  const attr = vnode.props.attr ?? {};
  const viewBox = attr.viewBox || '0 0 24 24';
  const isStrokeIcon = attr.fill === 'none' || Boolean(attr.strokeWidth);

  const children = (vnode.props.children ?? []).map((child, idx) => {
    const p = child.props ?? {};
    const strokeProps = {
      fill: isStrokeIcon ? 'none' : color,
      stroke: isStrokeIcon ? color : undefined,
      strokeWidth: isStrokeIcon ? Number(attr.strokeWidth || 2) : undefined,
      strokeLinecap:
        (attr.strokeLinecap as 'round' | 'butt' | 'square') || undefined,
      strokeLinejoin:
        (attr.strokeLinejoin as 'round' | 'bevel' | 'miter') || undefined,
    };

    if (child.type === 'path' && typeof p.d === 'string') {
      return <Path key={idx} {...strokeProps} d={p.d} />;
    }
    if (child.type === 'circle') {
      return (
        <Circle
          key={idx}
          {...strokeProps}
          cx={String(p.cx ?? 0)}
          cy={String(p.cy ?? 0)}
          r={String(p.r ?? 0)}
        />
      );
    }
    if (child.type === 'rect') {
      return (
        <Rect
          key={idx}
          {...strokeProps}
          x={String(p.x ?? 0)}
          y={String(p.y ?? 0)}
          width={String(p.width ?? 0)}
          height={String(p.height ?? 0)}
          rx={p.rx ? String(p.rx) : undefined}
          ry={p.ry ? String(p.ry) : undefined}
        />
      );
    }
    if (child.type === 'line') {
      return (
        <Line
          key={idx}
          {...strokeProps}
          x1={String(p.x1 ?? 0)}
          y1={String(p.y1 ?? 0)}
          x2={String(p.x2 ?? 0)}
          y2={String(p.y2 ?? 0)}
        />
      );
    }
    if (child.type === 'polyline' && typeof p.points === 'string') {
      return <Polyline key={idx} {...strokeProps} points={p.points} />;
    }
    if (child.type === 'polygon' && typeof p.points === 'string') {
      return <Polygon key={idx} {...strokeProps} points={p.points} />;
    }
    return null;
  });

  return (
    <Svg width={size} height={size} viewBox={viewBox}>
      {children}
    </Svg>
  );
}

export function renderMarkdownText(
  text: string,
  accentColor: string,
  monoFont: string
): React.ReactNode[] {
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);

  return parts.filter(Boolean).map((part, i) => {
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <Link
          key={i}
          src={linkMatch[2]}
          style={{
            color: accentColor,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {linkMatch[1]}
        </Link>
      );
    }
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    if (boldMatch) {
      return (
        <Text key={i} style={{ color: accentColor, fontWeight: 700 }}>
          {boldMatch[1]}
        </Text>
      );
    }
    const codeMatch = /^`([^`]+)`$/.exec(part);
    if (codeMatch) {
      return (
        <Text
          key={i}
          style={{
            fontFamily: monoFont,
            fontSize: 7.2,
            backgroundColor: '#f1f5f9',
            color: '#0f172a',
          }}
        >
          {` ${codeMatch[1]} `}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}
