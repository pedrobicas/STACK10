import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixFor, kickTests } from '../src/core/pieces.js';

test('todas as rotações preservam quatro células', () => {
  for (const type of ['I', 'J', 'L', 'O', 'S', 'T', 'Z']) {
    for (let r = 0; r < 4; r++) {
      const cells = matrixFor(type, r).flat().filter(Boolean);
      assert.equal(cells.length, 4, `${type} rotação ${r}`);
    }
  }
});

test('wall kicks existem para peças SRS e O permanece estável', () => {
  assert.equal(kickTests('T', 0, 1).length, 5);
  assert.equal(kickTests('I', 0, 1).length, 5);
  assert.deepEqual(kickTests('O', 0, 1), [[0, 0]]);
});
