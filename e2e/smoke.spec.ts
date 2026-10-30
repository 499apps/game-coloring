import { defineSmokeSuite } from '../src/kit/smoke/suite';

defineSmokeSuite([
  {
    name: 'coloring',
    path: '/games/coloring/',
    webgl: true,
    swScope: '/games/coloring/',
    manifest: { scope: '/games/coloring/', startUrl: '/games/coloring/' },
    play: { keys: ['ArrowRight', 'ArrowUp', 'Space'], swipes: ['left', 'up'], tap: true },
    clearSelector: '[data-menu-id="clear"]',
  },
]);
