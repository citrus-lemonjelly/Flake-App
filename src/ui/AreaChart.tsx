import { useLayoutEffect, useRef, useState } from 'react';
import { money } from './format';

export interface ChartPoint {
  label: string; // axis label
  full: string; // tooltip label
  value: number; // cents
}

/** Single-series area chart with a hover crosshair. Sized to its container. */
export function AreaChart({ points, height = 220, ariaLabel }: { points: ChartPoint[]; height?: number; ariaLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return <div className="empty">Not enough data to chart yet.</div>;

  const H = height, W = width, padL = 56, padR = 10, padT = 12, padB = 26;
  const max = Math.max(...points.map((p) => p.value)) * 1.08 || 1;
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => (max / 1.08) * t);
  const every = Math.ceil(points.length / 6);
  const hp = hover === null ? null : points[hover]!;

  return (
    <div className="chart" ref={wrap}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink3)">
              {money(Math.round(t), true)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--ink3)">
              {p.label}
            </text>
          ) : null,
        )}
        <path d={area} fill="var(--accent)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="var(--ink3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(hp.value)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        <rect
          x={padL}
          y={0}
          width={Math.max(0, W - padL - padR)}
          height={H}
          fill="transparent"
          onMouseMove={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) * (W / r.width) - padL) / ((W - padL - padR) / (points.length - 1)));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hp && hover !== null && (
        <div className="tip" style={{ left: x(hover), top: y(hp.value) }}>
          {hp.full} · <b>{money(hp.value)}</b>
        </div>
      )}
    </div>
  );
}
