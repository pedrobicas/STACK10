import { hashSeed, mulberry32 } from '../core/randomizer.js';
import { TIME_MODES, dayKey, readJSON, safeSet } from './storage.js';

const PROFILE_KEY = 'stack10:profile:v1';
function xpToNext(level) { return 120 + (level - 1) * 80; }
function levelInfo(xp) {
    let level = 1, rest = xp;
    while (rest >= xpToNext(level)) {
        rest -= xpToNext(level);
        level++;
    }
    return { level, into: rest, need: xpToNext(level) };
}
function getProfile() {
    const p = readJSON(PROFILE_KEY, {});
    return { xp: 0, ach: {}, streak: { last: null, count: 0, best: 0 }, missions: null, ...p };
}
function saveProfile(p) { safeSet(PROFILE_KEY, JSON.stringify(p)); }

const ACHIEVEMENTS = [
    { id: 'quad', name: 'Primeira quadra', desc: 'Limpe 4 linhas de uma vez.', xp: 50, live: e => e.name === 'quad' },
    { id: 'tspin', name: 'Giro esperto', desc: 'Faça um T-spin.', xp: 50, live: e => e.name === 'tspin' },
    { id: 'tsd', name: 'T-spin dupla', desc: 'Limpe 2 linhas de uma vez com um T-spin.', xp: 100, live: e => e.name === 'tspin' && !e.mini && e.value >= 2 },
    { id: 'combo5', name: 'Embalado', desc: 'Faça um combo ×5.', xp: 60, live: e => e.name === 'combo' && e.value >= 5 },
    { id: 'combo10', name: 'Imparável', desc: 'Faça um combo ×10.', xp: 150, live: e => e.name === 'combo' && e.value >= 10 },
    { id: 'b2b3', name: 'Em sequência', desc: 'Faça quatro quadras ou T-spins seguidos (B2B ×3).', xp: 100, live: e => e.name === 'b2b' && e.value >= 3 },
    { id: 'fever', name: 'Frenesi', desc: 'Encha a barra de frenesi.', xp: 60, live: e => e.name === 'fever' },
    { id: 'fever3', name: 'Em chamas', desc: 'Ative o frenesi 3 vezes na mesma partida.', xp: 120, live: (e, g) => e.name === 'fever' && g.fevers >= 3 },
    { id: 'perfect', name: 'Tudo limpo', desc: 'Deixe o tabuleiro completamente vazio.', xp: 150, live: e => e.name === 'perfect' },
    { id: 'quad5', name: 'Colecionador', desc: 'Faça 5 quadras na mesma partida.', xp: 100, live: (e, g) => e.name === 'quad' && g.tetrises >= 5 },
    { id: 'level10', name: 'Maratonista', desc: 'Chegue ao nível 10 na maratona.', xp: 120, live: (e, g) => e.name === 'level' && g.mode === 'marathon' && e.value >= 10 },
    { id: 'lines100', name: 'Centenário', desc: 'Limpe 100 linhas na mesma partida.', xp: 120, live: (e, g) => g.lines >= 100 },
    { id: 'sprint', name: 'Corredor', desc: 'Termine um sprint de 40 linhas.', xp: 80, end: r => r.mode === 'sprint' && r.completed },
    { id: 'sprint90', name: 'Pé no acelerador', desc: 'Termine o sprint em menos de 1min30.', xp: 120, end: r => r.mode === 'sprint' && r.completed && r.stats.elapsedMs < 90000 },
    { id: 'sprint60', name: 'Menos de 1 minuto', desc: 'Termine o sprint em menos de 60 segundos.', xp: 250, end: r => r.mode === 'sprint' && r.completed && r.stats.elapsedMs < 60000 },
    { id: 'blitz30', name: 'Relâmpago', desc: 'Faça 30.000 pontos no blitz.', xp: 150, end: r => r.mode === 'ultra' && r.stats.score >= 30000 },
    { id: 'daily', name: 'Compromisso', desc: 'Complete um desafio diário.', xp: 80, end: r => r.mode === 'daily' && r.completed },
    { id: 'streak3', name: 'Hábito', desc: 'Jogue 3 dias seguidos.', xp: 100, end: r => r.streak >= 3 },
    { id: 'streak7', name: 'Uma semana inteira', desc: 'Jogue 7 dias seguidos.', xp: 250, end: r => r.streak >= 7 },
    { id: 'life1000', name: 'Mil linhas', desc: 'Limpe 1.000 linhas somando todas as partidas.', xp: 200, end: r => r.lifetime.lines >= 1000 }
];

const nf = n => n.toLocaleString('pt-BR');
const MISSION_POOL = [
    { id: 'lines', targets: [40, 60, 100], stat: 'lines', kind: 'sum', xp: 60, text: n => `Limpe ${n} linhas` },
    { id: 'quads', targets: [2, 3, 5], stat: 'tetrises', kind: 'sum', xp: 70, text: n => `Faça ${n} quadras` },
    { id: 'tspins', targets: [1, 2, 3], stat: 'tspins', kind: 'sum', xp: 80, text: n => n === 1 ? 'Faça um T-spin' : `Faça ${n} T-spins` },
    { id: 'combo', targets: [3, 4, 6], stat: 'bestCombo', kind: 'max', xp: 70, text: n => `Faça um combo ×${n}` },
    { id: 'runs', targets: [3, 5], stat: 'runs', kind: 'sum', xp: 50, text: n => `Jogue ${n} partidas` },
    { id: 'fever', targets: [1, 2], stat: 'fevers', kind: 'sum', xp: 70, text: n => n === 1 ? 'Ative o frenesi' : `Ative o frenesi ${n} vezes` },
    { id: 'score', targets: [8000, 15000, 30000], stat: 'score', kind: 'max', xp: 70, text: n => `Faça ${nf(n)} pontos numa partida` },
    { id: 'sprint', targets: [1], stat: 'sprints', kind: 'sum', xp: 60, text: () => 'Termine um sprint de 40 linhas' },
    { id: 'pieces', targets: [150, 300], stat: 'pieces', kind: 'sum', xp: 50, text: n => `Coloque ${n} peças` }
];
// As 3 missões do dia saem de um sorteio com a data como semente: iguais o dia todo, novas amanhã.
function missionsFor(day) {
    const rng = mulberry32(hashSeed('missoes:' + day));
    const pool = MISSION_POOL.slice();
    const out = [];
    while (out.length < 3) {
        const m = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        const target = m.targets[Math.floor(rng() * m.targets.length)];
        out.push({ id: m.id, target, progress: 0, done: false });
    }
    return { day, items: out, bonus: false };
}
function missionDef(id) { return MISSION_POOL.find(m => m.id === id); }
function currentMissions(profile) {
    const day = dayKey();
    if (!profile.missions || profile.missions.day !== day)
        profile.missions = missionsFor(day);
    return profile.missions;
}
function updateStreak(profile) {
    const today = dayKey();
    const s = profile.streak;
    if (s.last === today)
        return false;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    s.count = s.last === dayKey(y) ? s.count + 1 : 1;
    s.best = Math.max(s.best, s.count);
    s.last = today;
    return true;
}
// XP de uma partida, com a conta aberta para mostrar na tela de resultado.
function runXp(stats, mode, completed, isRecord) {
    const parts = [];
    const add = (label, v) => { if (v > 0) parts.push({ label, v }); };
    add('Partida', 10);
    add(`Linhas (${stats.lines})`, stats.lines * 2);
    add(`Quadras (${stats.tetrises})`, stats.tetrises * 15);
    add(`T-spins (${stats.tspins})`, stats.tspins * 15);
    add('Tudo limpo', stats.perfects * 60);
    if (stats.bestCombo >= 3)
        add(`Combo ×${stats.bestCombo}`, stats.bestCombo * 4);
    add('Frenesi', stats.fevers * 25);
    if (TIME_MODES.includes(mode) && completed)
        add('40 linhas completas', 40);
    if (isRecord)
        add('Novo recorde', 60);
    return parts;
}


export { levelInfo, getProfile, saveProfile, ACHIEVEMENTS, missionDef, currentMissions, updateStreak, runXp };
