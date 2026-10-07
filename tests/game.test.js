import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, TICK_MS } from '../src/core/game.js';

function advance(game, ms) {
  const ticks = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < ticks; i++) game.tick();
}

test('Game inicia de forma determinística com a mesma seed', () => {
  const a = new Game();
  const b = new Game();
  a.start('marathon', 123);
  b.start('marathon', 123);
  advance(a, 1300);
  advance(b, 1300);
  assert.deepEqual(a.queue, b.queue);
  assert.equal(a.current?.type, b.current?.type);
  assert.deepEqual(a.grid, b.grid);
});

test('hard drop trava uma peça e avança a fila', () => {
  const g = new Game();
  g.start('marathon', 777);
  advance(g, 1300);
  const first = g.current.type;
  g.press('hard');
  assert.equal(g.pieces, 1);
  assert.ok(g.current?.type);
  assert.equal(g.grid.flat().filter(Boolean).length, 4);
  assert.equal(typeof first, 'string');
});

test('mesma seed e mesma sequência de ações produzem o mesmo estado', () => {
  const run = () => {
    const g = new Game();
    g.start('marathon', 20261007);
    advance(g, 1300);
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) g.press('cw');
      if (i % 2 === 0) g.press('left');
      g.press('hard');
      if (!g.isActive()) break;
    }
    return { grid: g.grid, queue: g.queue, stats: g.stats(), seed: g.seed };
  };
  assert.deepEqual(run(), run());
});
