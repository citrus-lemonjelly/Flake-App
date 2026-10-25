import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [
    react(),
    {
      // version.json lets an open app notice that a newer release is live and offer to update.
      name: 'flake-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version }) });
      },
    },
  ],
  // Relative paths so the same build works at github.io/Flake-App/ and on any other host.
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'local/**/*.test.ts'],
  },
});
