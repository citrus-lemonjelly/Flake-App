import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the same build works at github.io/Flake-App/ and on any other host.
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'local/**/*.test.ts'],
  },
});
