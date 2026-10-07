import { DEFAULT_HANDLING } from '../core/game.js';
import { BINDING_ORDER, DEFAULT_BINDINGS } from '../input/input.js';

function safeGet(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function safeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    }
    catch {
        // Alguns navegadores/modos privados podem bloquear o localStorage; o jogo continua sem persistência.
    }
}
function readJSON(key, fallback) {
    try {
        const v = JSON.parse(safeGet(key) ?? 'null');
        return v ?? fallback;
    }
    catch {
        return fallback;
    }
}
function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const TIME_MODES = ['sprint', 'daily'];
const SETTINGS_KEY = 'stack10:settings:v5';
const DEFAULT_SETTINGS = { music: true, sfx: true, shake: true, effects: 'full', ghost: true, skin: 'classic' };
function getSettings() {
    const raw = readJSON(SETTINGS_KEY, {});
    return { ...DEFAULT_SETTINGS, ...raw };
}
function setSettings(s) { safeSet(SETTINGS_KEY, JSON.stringify(s)); }
function getHandling() {
    const raw = readJSON('stack10:handling:v1', null);
    if (!raw)
        return { ...DEFAULT_HANDLING };
    return { das: clampInt(raw.das, 0, 300, DEFAULT_HANDLING.das), arr: clampInt(raw.arr, 0, 100, DEFAULT_HANDLING.arr), sdf: clampInt(raw.sdf, 0, 40, DEFAULT_HANDLING.sdf) };
}
function setHandling(h) { safeSet('stack10:handling:v1', JSON.stringify(h)); }
function getBindings() {
    const raw = readJSON('stack10:keys:v1', null);
    const result = {};
    for (const action of BINDING_ORDER) {
        const list = raw && Array.isArray(raw[action]) ? raw[action].filter(c => typeof c === 'string').slice(0, 2) : null;
        result[action] = list ?? DEFAULT_BINDINGS[action].slice();
    }
    return result;
}
function setBindings(b) { safeSet('stack10:keys:v1', JSON.stringify(b)); }
function defaultBindings() {
    const b = {};
    for (const a of BINDING_ORDER)
        b[a] = DEFAULT_BINDINGS[a].slice();
    return b;
}
function scopedKey(prefix, mode) { return `${prefix}:${mode}${mode === 'daily' ? ':' + dayKey() : ''}`; }
function getPB(mode) {
    const n = Number(safeGet(scopedKey('stack10:pb:v5', mode)));
    return safeGet(scopedKey('stack10:pb:v5', mode)) != null && Number.isFinite(n) ? n : null;
}
function getReplayCode(mode) { return safeGet(scopedKey('stack10:replay:v2', mode)); }
function setReplayCode(mode, code) { safeSet(scopedKey('stack10:replay:v2', mode), code); }
function getSplits(mode) {
    const a = readJSON(scopedKey('stack10:splits:v2', mode), null);
    return Array.isArray(a) ? a : null;
}
function setSplits(mode, splits) { safeSet(scopedKey('stack10:splits:v2', mode), JSON.stringify(splits.slice(0, 41).map(v => Math.round(v ?? 0)))); }
// Recorde + ranking pessoal (as 10 melhores partidas de cada modo).
function recordRun(mode, stats, completed) {
    const timeMode = TIME_MODES.includes(mode);
    if (timeMode && !completed)
        return { isRecord: false, rank: null, pb: getPB(mode), value: null };
    const value = timeMode ? Math.round(stats.elapsedMs) : stats.score;
    const key = scopedKey('stack10:top:v5', mode);
    const top = readJSON(key, []);
    const better = (a, b) => timeMode ? a < b : a > b;
    const pb = getPB(mode);
    const isRecord = pb == null || better(value, pb);
    if (isRecord)
        safeSet(scopedKey('stack10:pb:v5', mode), String(value));
    const entry = { v: value, d: Date.now() };
    top.push(entry);
    top.sort((a, b) => timeMode ? a.v - b.v : b.v - a.v);
    const rank = top.indexOf(entry) + 1;
    safeSet(key, JSON.stringify(top.slice(0, 10)));
    return { isRecord, rank: rank <= 10 ? rank : null, pb, value };
}
function getTop(mode) { return readJSON(scopedKey('stack10:top:v5', mode), []); }
const LIFE_KEY = 'stack10:lifetime:v2';
function getLifetime() {
    return { runs: 0, lines: 0, pieces: 0, tetrises: 0, tspins: 0, bestCombo: 0, perfects: 0, fevers: 0, ...readJSON(LIFE_KEY, {}) };
}
function addLifetime(stats) {
    const s = getLifetime();
    s.runs++;
    s.lines += stats.lines;
    s.pieces += stats.pieces;
    s.tetrises += stats.tetrises;
    s.tspins += stats.tspins;
    s.perfects += stats.perfects;
    s.fevers += stats.fevers;
    s.bestCombo = Math.max(s.bestCombo, stats.bestCombo);
    safeSet(LIFE_KEY, JSON.stringify(s));
    return s;
}

export { safeGet, safeSet, readJSON, dayKey, TIME_MODES, getSettings, setSettings, getHandling, setHandling, getBindings, setBindings, defaultBindings, getPB, getReplayCode, setReplayCode, getSplits, setSplits, recordRun, getTop, getLifetime, addLifetime };
