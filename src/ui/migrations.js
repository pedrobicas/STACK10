import { readJSON, safeGet, safeSet } from './storage.js';

const SCHEMA_KEY = 'stack10:schema:v1';

function copyObjectIfMissing(from, to) {
  if (safeGet(to) != null || safeGet(from) == null) return;
  const value = readJSON(from, null);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    safeSet(to, JSON.stringify(value));
  }
}

/**
 * Migra somente formatos antigos que podem ser copiados sem adivinhar semântica.
 * O processo é idempotente: executar várias vezes produz o mesmo resultado.
 */
function runMigrations() {
  const current = Number(safeGet(SCHEMA_KEY) ?? 0);
  if (current >= 1) return;

  copyObjectIfMissing('stack10:settings', 'stack10:settings:v5');
  copyObjectIfMissing('stack10:profile', 'stack10:profile:v1');
  copyObjectIfMissing('stack10:lifetime', 'stack10:lifetime:v2');

  safeSet(SCHEMA_KEY, '1');
}

export { runMigrations };
