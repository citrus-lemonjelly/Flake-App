import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts to its new value instead of jumping (from 0 on first show).
 * Skipped for people who ask for reduced motion.
 */
export function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    if (reduced()) return setShown(value);
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = Math.round(a + (value - a) * (1 - (1 - k) ** 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** A tiny tap of feedback on phones that support it. */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

/** A short burst of confetti from the middle of the screen, for a real milestone. */
export function confetti(): void {
  if (reduced() || typeof document === 'undefined') return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  const colors = ['var(--accent)', 'var(--flow-out)', 'var(--good)', '#f5c542', '#e879f9'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    const angle = (Math.PI * 2 * i) / 36 + Math.random() * 0.4;
    const dist = 90 + Math.random() * 140;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`);
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    p.style.background = colors[i % colors.length]!;
    p.style.animationDelay = `${Math.random() * 80}ms`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1400);
}
