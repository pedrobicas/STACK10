import test from 'node:test';
import assert from 'node:assert/strict';
import { BagRandomizer, dailySeed } from '../src/core/randomizer.js';

test('7-bag entrega as sete peças exatamente uma vez por bag', () => {
  const r = new BagRandomizer(12345);
  const bag = Array.from({ length: 7 }, () => r.next());
  assert.deepEqual(new Set(bag), new Set(['I', 'J', 'L', 'O', 'S', 'T', 'Z']));
});

test('randomizer é determinístico para a mesma seed', () => {
  const a = new BagRandomizer(42);
  const b = new BagRandomizer(42);
  assert.deepEqual(
    Array.from({ length: 50 }, () => a.next()),
    Array.from({ length: 50 }, () => b.next()),
  );
});

test('daily seed é estável para a mesma data', () => {
  assert.equal(dailySeed(new Date(2026, 9, 7)), dailySeed(new Date(2026, 9, 7)));
});
