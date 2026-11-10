import { useRef, useState, type ReactNode } from 'react';
import { haptic } from './motion';

const TRIGGER = 72;
const MAX = 112;

/**
 * A list row you can swipe right to act on (mark a bill paid, or not paid), and
 * optionally left for a second action (delete). Up-and-down still scrolls; a tap
 * still taps. The label shows as it slides.
 */
export function SwipeRow({
  label,
  onSwipe,
  leftLabel,
  onSwipeLeft,
  children,
  className = '',
}: {
  label: string;
  onSwipe: () => void;
  leftLabel?: string;
  onSwipeLeft?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const mode = useRef<'idle' | 'swipe' | 'scroll'>('idle');
  const swiped = useRef(false);
  return (
    <li className={`swipe-row ${className}`}>
      {dx >= 0 ? (
        <div className={`swipe-bg ${dx >= TRIGGER ? 'ready' : ''}`} aria-hidden="true" style={{ opacity: Math.min(1, dx / TRIGGER) }}>
          {label}
        </div>
      ) : (
        <div className={`swipe-bg left ${-dx >= TRIGGER ? 'ready' : ''}`} aria-hidden="true" style={{ opacity: Math.min(1, -dx / TRIGGER) }}>
          {leftLabel}
        </div>
      )}
      <div
        className="swipe-fg"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: start.current ? 'none' : undefined }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          mode.current = 'idle';
          swiped.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const x = e.clientX - s.x, y = e.clientY - s.y;
          if (mode.current === 'idle') {
            if (Math.abs(x) > 8 && Math.abs(x) > Math.abs(y) * 1.4) {
              mode.current = 'swipe';
              e.currentTarget.setPointerCapture(e.pointerId);
            } else if (Math.abs(y) > 8) mode.current = 'scroll';
          }
          if (mode.current === 'swipe') {
            const next = Math.max(onSwipeLeft ? -MAX : 0, Math.min(MAX, x));
            if (Math.abs(next) >= TRIGGER && Math.abs(dx) < TRIGGER) haptic(6);
            setDx(next);
          }
        }}
        onPointerUp={() => {
          if (mode.current === 'swipe') {
            swiped.current = true;
            if (dx >= TRIGGER) onSwipe();
            else if (dx <= -TRIGGER) onSwipeLeft?.();
          }
          start.current = null;
          mode.current = 'idle';
          setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          mode.current = 'idle';
          setDx(0);
        }}
        onClickCapture={(e) => {
          // A swipe isn't a tap on whatever was under the finger.
          if (swiped.current) {
            e.stopPropagation();
            e.preventDefault();
            swiped.current = false;
          }
        }}
      >
        {children}
      </div>
    </li>
  );
}
