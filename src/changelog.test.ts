import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, CHANGELOG } from './changelog';

describe('changelog', () => {
  it('matches the package version, so a release never ships without its entry', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('lists each version once, newest first', () => {
    const versions = CHANGELOG.map((r) => r.version.split('.').map(Number));
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [versions[i - 1]!, versions[i]!];
      const newer = a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
      expect(newer).toBeGreaterThan(0);
    }
  });
});
