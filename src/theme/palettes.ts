import type { PaletteId } from '../model/types';

/**
 * Accent color schemes. Each accent is validated (lightness band + 3:1 contrast)
 * against the light and dark surfaces it sits on; gradients keep white text readable.
 * Everything else (backgrounds, soft fills, lines) is mixed from the accent in CSS.
 */
export interface Palette {
  id: PaletteId;
  name: string;
  light: string; // accent on light surfaces
  dark: string; // accent on dark surfaces
  gradient: [string, string, string];
}

export const PALETTES: Palette[] = [
  { id: 'ocean', name: 'Ocean', light: '#2563eb', dark: '#3b82f6', gradient: ['#1d4ed8', '#2563eb', '#0891b2'] },
  { id: 'ember', name: 'Ember', light: '#ea580c', dark: '#e8641c', gradient: ['#c2410c', '#ea580c', '#d97706'] },
  { id: 'forest', name: 'Forest', light: '#059669', dark: '#14a374', gradient: ['#065f46', '#047857', '#4d7c0f'] },
  { id: 'rose', name: 'Rose', light: '#e11d48', dark: '#f43f5e', gradient: ['#be123c', '#e11d48', '#ea580c'] },
  { id: 'graphite', name: 'Graphite', light: '#475569', dark: '#8090a6', gradient: ['#0f172a', '#334155', '#475569'] },
  { id: 'violet', name: 'Original', light: '#6d4aff', dark: '#8b74ff', gradient: ['#6d4aff', '#b04bff', '#ff6a88'] },
];

export function palette(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export type ResolvedMode = 'light' | 'dark';

/** Write the palette and mode onto <html> as CSS variables. */
export function applyTheme(id: PaletteId, mode: ResolvedMode, root: HTMLElement = document.documentElement): void {
  const p = palette(id);
  root.dataset.mode = mode;
  root.dataset.palette = p.id;
  root.style.setProperty('--accent', mode === 'dark' ? p.dark : p.light);
  root.style.setProperty('--grad', `linear-gradient(135deg, ${p.gradient[0]} 0%, ${p.gradient[1]} 55%, ${p.gradient[2]} 100%)`);
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0b0c12' : '#f6f7fa');
}
