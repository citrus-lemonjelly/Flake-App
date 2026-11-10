import { useLayoutEffect, useRef, useState } from 'react';
import type { MonthFlow } from '../engine';
import { money, monthOnly, shortDate } from './format';

/** Money in against money out, one pair of bars per month. Tap a month to read it. */
export function MonthBars({ months, today, selected, onSelect }: { months: MonthFlow[]; today: string; selected: number; onSelect: (i: number) => void }) {
  const top = niceMax(Math.max(1, ...months.flatMap((m) => [m.inTotal, m.outTotal])));
  const H = 120;
  const h = (v: number) => Math.max(2, Math.round((v / top) * H));
  return (
    <div className="mbars" role="group" aria-label="Money in and out by month">
      <div className="mbars-grid" aria-hidden="true">
        {[1, 0.5, 0].map((t) => (
          <div key={t} style={{ bottom: 24 + t * H }}>
            <span>{money(top * t, true).replace(',000', 'k')}</span>
          </div>
        ))}
      </div>
      <div className="mbars-cols">
        {months.map((m, i) => {
          const planned = m.end >= today;
          return (
            <button
              key={m.start}
              className={`mbar ${i === selected ? 'on' : ''} ${planned ? 'planned' : ''}`}
              onClick={() => onSelect(i)}
              aria-pressed={i === selected}
              aria-label={`${monthOnly(m.start)}${planned ? ' (planned)' : ''}: in ${money(m.inTotal, true)}, out ${money(m.outTotal, true)}`}
            >
              <span className="pair">
                <i className="in" style={{ height: h(m.inTotal) }} />
                <i className="out" style={{ height: h(m.outTotal) }} />
              </span>
              <span className="lbl">{m.start.slice(0, 7) === today.slice(0, 7) ? 'Now' : monthOnly(m.start)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A round number just above `v`, for the top of a chart. */
function niceMax(v: number): number {
  const step = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * step >= v) return m * step;
  return 10 * step;
}

/**
 * This month, day by day: money in and money out added up as the month goes.
 * Solid up to today, dashed for what's planned. Point at a day to read it.
 */
export function MonthLines({ flow, today, day, onDay }: { flow: MonthFlow; today: string; day: number | null; onDay: (i: number | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ins: number[] = [], outs: number[] = [];
  let runIn = 0, runOut = 0;
  for (const d of flow.days) ins.push((runIn += d.in)), outs.push((runOut += d.out));
  const n = flow.days.length;
  const W = width, H = 170, padL = 4, padR = 70, padT = 10, padB = 24;
  const top = niceMax(Math.max(1, ins[n - 1]!, outs[n - 1]!, ...outs));
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const t = flow.days.findIndex((d) => d.date > today);
  const cut = t < 0 ? n - 1 : Math.max(0, t - 1); // last day that has happened
  const step = (vals: number[], a: number, b: number) => {
    let p = `M${x(a)},${y(vals[a]!)}`;
    for (let i = a + 1; i <= b; i++) p += `H${x(i)}V${y(vals[i]!)}`;
    return p;
  };
  const path = (vals: number[], a: number, b: number) => vals.slice(a, b + 1).map((v, k) => `${k ? 'L' : 'M'}${x(a + k)},${y(v)}`).join('');
  const hasPast = flow.days[0]!.date <= today;
  const hasFuture = t >= 0;
  const labelY = (v: number, other: number) => Math.min(H - padB - 14, Math.max(padT + 12, y(v) + (Math.abs(y(v) - y(other)) < 30 ? (v >= other ? -8 : 22) : 4)));

  return (
    <div className="chart flow-lines" ref={wrap}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Money in and out through ${monthOnly(flow.start)}: ${money(ins[n - 1]!, true)} in, ${money(outs[n - 1]!, true)} out`}
        style={{ touchAction: 'pan-y' }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round((((e.clientX - r.left) * (W / r.width) - padL) / (W - padL - padR)) * (n - 1));
          onDay(i < 0 || i > n - 1 ? null : i);
        }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onDay(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" strokeDasharray={f ? '3 4' : undefined} />
        ))}
        {hasPast && hasFuture && <line x1={x(cut)} x2={x(cut)} y1={padT} y2={y(0)} stroke="var(--ink3)" strokeDasharray="3 3" />}
        {hasPast && <path d={step(ins, 0, cut)} fill="none" stroke="var(--flow-in)" strokeWidth={2.5} strokeLinejoin="round" />}
        {hasFuture && <path d={step(ins, cut, n - 1)} fill="none" stroke="var(--flow-in)" strokeWidth={2} strokeDasharray="4 4" opacity={0.8} />}
        {hasPast && <path d={path(outs, 0, cut)} fill="none" stroke="var(--flow-out)" strokeWidth={2.5} strokeLinejoin="round" />}
        {hasFuture && <path d={path(outs, cut, n - 1)} fill="none" stroke="var(--flow-out)" strokeWidth={2} strokeDasharray="4 4" opacity={0.8} />}
        <text x={W - padR + 8} y={labelY(ins[n - 1]!, outs[n - 1]!)} fontSize="12" fill="var(--ink)">
          <tspan fontWeight="700">In</tspan>
          <tspan x={W - padR + 8} dy="14" fill="var(--ink2)">{money(ins[n - 1]!, true)}</tspan>
        </text>
        <text x={W - padR + 8} y={labelY(outs[n - 1]!, ins[n - 1]!)} fontSize="12" fill="var(--ink)">
          <tspan fontWeight="700">Out</tspan>
          <tspan x={W - padR + 8} dy="14" fill="var(--ink2)">{money(outs[n - 1]!, true)}</tspan>
        </text>
        <text x={padL} y={H - 6} fontSize="11" fill="var(--ink3)">{shortDate(flow.start)}</text>
        {hasPast && hasFuture && (
          <text x={x(cut)} y={H - 6} fontSize="11" fontWeight="700" fill="var(--ink)" textAnchor="middle">
            Today
          </text>
        )}
        <text x={W - padR} y={H - 6} fontSize="11" fill="var(--ink3)" textAnchor="end">{shortDate(flow.end)}</text>
        {day !== null && (
          <>
            <line x1={x(day)} x2={x(day)} y1={padT} y2={y(0)} stroke="var(--ink)" />
            <circle cx={x(day)} cy={y(ins[day]!)} r={5} fill="var(--flow-in)" stroke="var(--surface)" strokeWidth={2} />
            <circle cx={x(day)} cy={y(outs[day]!)} r={5} fill="var(--flow-out)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
    </div>
  );
}

/** Running totals for a day of the month (0-based), for the readout above the lines. */
export function totalsTo(flow: MonthFlow, i: number): { in: number; out: number } {
  let a = 0, b = 0;
  for (let k = 0; k <= i; k++) (a += flow.days[k]!.in), (b += flow.days[k]!.out);
  return { in: a, out: b };
}

/**
 * The checking balance from today forward, a day at a time. The lowest point is
 * marked; below $0 gets a warning line. Point at a day to read it.
 */
export function BalanceLine({ days, lowIndex, day, onDay }: { days: { date: string; balance: number }[]; lowIndex: number; day: number | null; onDay: (i: number | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = days.length;
  const W = width, H = 150, padL = 4, padR = 52, padT = 12, padB = 22;
  const vals = days.map((d) => d.balance);
  const hi = niceMax(Math.max(1, ...vals));
  const lo = Math.min(0, ...vals);
  const bottom = lo < 0 ? -niceMax(-lo) : 0;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - bottom) / (hi - bottom)) * (H - padT - padB);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1)},${y(Math.max(0, bottom))}L${x(0)},${y(Math.max(0, bottom))}Z`;
  const low = days[lowIndex]!;
  const lowRight = x(lowIndex) > W - padR - 60;
  return (
    <div className="chart" ref={wrap}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Checking balance over the next ${n - 1} days: from ${money(vals[0]!, true)} to ${money(vals[n - 1]!, true)}, lowest ${money(low.balance, true)} on ${shortDate(low.date)}`}
        style={{ touchAction: 'pan-y' }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round((((e.clientX - r.left) * (W / r.width) - padL) / (W - padL - padR)) * (n - 1));
          onDay(i < 0 || i > n - 1 ? null : i);
        }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onDay(null)}
      >
        {[hi, hi / 2, 0, ...(bottom < 0 ? [bottom] : [])].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 && bottom < 0 ? 'var(--bad)' : 'var(--line)'} strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={W - padR + 6} y={y(t) + 4} fontSize="11" fill={t === 0 && bottom < 0 ? 'var(--bad)' : 'var(--ink3)'}>
              {money(t, true).replace(',000', 'k')}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(lowIndex)} cy={y(low.balance)} r={4.5} fill={low.balance < 0 ? 'var(--bad)' : 'var(--surface)'} stroke={low.balance < 0 ? 'var(--surface)' : 'var(--accent)'} strokeWidth={2} />
        <text x={x(lowIndex) + (lowRight ? -6 : 6)} y={y(low.balance) + (y(low.balance) > H - padB - 14 ? -8 : 16)} fontSize="11" fontWeight="600" fill={low.balance < 0 ? 'var(--bad)' : 'var(--ink2)'} textAnchor={lowRight ? 'end' : 'start'}>
          Low {money(low.balance, true)}
        </text>
        <circle cx={x(0)} cy={y(vals[0]!)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        <text x={padL} y={H - 5} fontSize="11" fontWeight="700" fill="var(--ink)">Today</text>
        <text x={W - padR} y={H - 5} fontSize="11" fill="var(--ink3)" textAnchor="end">{shortDate(days[n - 1]!.date)}</text>
        {day !== null && (
          <>
            <line x1={x(day)} x2={x(day)} y1={padT} y2={H - padB} stroke="var(--ink)" />
            <circle cx={x(day)} cy={y(vals[day]!)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
    </div>
  );
}
