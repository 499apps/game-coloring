import { kitPlaywrightConfig } from './src/kit/smoke/projects';

// Standalone game, served by `vite preview` at http://localhost:4175/games/coloring/.
export default kitPlaywrightConfig({
  testDir: './e2e',
  testMatch: 'smoke.spec.ts',
  port: 4175,
  serverCommand: 'pnpm exec vite preview --port {port} --strictPort',
  readyPath: '/games/coloring/',
});
