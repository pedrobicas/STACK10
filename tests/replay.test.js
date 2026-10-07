import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeReplay, encodeReplay } from '../src/core/replay.js';

test('replay faz round-trip sem perder seed, handling ou eventos', () => {
  const replay = {
    mode: 'sprint',
    seed: 0xdecafbad,
    handling: { das: 133, arr: 25, sdf: 20 },
    ticks: 900,
    events: [[10, 0], [16, 8], [20, 4], [30, 3], [44, 1], [48, 9]],
  };
  assert.deepEqual(decodeReplay(encodeReplay(replay)), replay);
});

test('replay rejeita código inválido', () => {
  assert.throws(() => decodeReplay('isso-nao-e-replay'));
});
