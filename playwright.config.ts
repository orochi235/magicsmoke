import { createHash } from 'node:crypto';
import { defineConfig } from '@playwright/test';

// A port derived from the checkout's path keeps a second worktree's dev server from answering
// this one's run.
const digest = createHash('sha1')
  .update(import.meta.dirname)
  .digest();
const port = 5300 + ((digest[0] ?? 0) % 64);

export default defineConfig({
  testDir: './lab/test',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: `npx vite lab --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
  },
});
