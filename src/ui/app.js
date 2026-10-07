import { ACTIONS, COLS, DEFAULT_HANDLING, FEVER_MS, Game, RELEASABLE, TICK_MS } from '../core/game.js';
import { applyCode, decodeReplay, encodeReplay } from '../core/replay.js';
import { SKINS, SKIN_ORDER, applySkinToPage } from '../theme/skins.js';
import { BINDING_LABELS, BINDING_ORDER, GamepadInput, KeyboardInput, keyName } from '../input/input.js';
import { Renderer } from '../render/renderer.js';
import { Confetti } from '../render/confetti.js';
import { AudioEngine } from '../audio/audio.js';
import { TIME_MODES, addLifetime, defaultBindings, getBindings, getHandling, getLifetime, getPB, getReplayCode, getSettings, getSplits, recordRun, setBindings, setHandling, setReplayCode, setSettings, setSplits } from './storage.js';
import { ACHIEVEMENTS, currentMissions, getProfile, levelInfo, missionDef, runXp, saveProfile, updateStreak } from './progress.js';

const $ = id => document.getElementById(id);
const fmtInt = n => Math.round(n).toLocaleString('pt-BR');
function fmtTime(ms, short = false) {
    const t = Math.max(0, Math.floor(ms));
    const m = Math.floor(t / 60000), s = Math.floor(t % 60000 / 1000), cs = Math.floor(t % 1000 / 10);
    return short ? `${m}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
const MODES = {
    marathon: { name: 'Maratona', desc: 'Sem fim. A velocidade sobe a cada 10 linhas e o frenesi está ligado.' },
    sprint: { name: 'Sprint 40', desc: 'Limpe 40 linhas o mais rápido que conseguir.' },
    ultra: { name: 'Blitz 2:00', desc: 'Dois minutos para fazer o máximo de pontos. O frenesi está ligado.' },
    daily: { name: 'Diário', desc: 'Sprint de 40 linhas com a mesma sequência de peças para todo mundo, só hoje.' }
};
const MODE_ORDER = ['marathon', 'sprint', 'ultra', 'daily'];
const STAR = '<svg viewBox="0 0 9 9" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 0h1v2h1v1h3v1H8v1H7v2h1v2H7V8H6V7H3v1H2v1H1V7h1V5H1V4H0V3h3V2h1z"/></svg>';

class App {
    acc = 0;
    lastFrame = 0;
    replay = null;
    recording = null;
    lastReplay = null;
    finalized = false;
    runId = 0;
    shownScore = 0;
    hudCache = new Map();
    capture = null;
    lastIdleRender = 0;
    constructor() {
        this.settings = getSettings();
        this.profile = getProfile();
        currentMissions(this.profile);
        if (!SKINS[this.settings.skin] || SKINS[this.settings.skin].unlock > this.playerLevel())
            this.settings.skin = 'classic';
        this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.game = new Game();
        this.frame = $('frame');
        this.events = $('events');
        this.renderer = new Renderer($('board'), $('hold-canvas'), $('next-canvas'), $('mini-canvas'));
        this.confetti = new Confetti($('confetti'));
        this.audio = new AudioEngine();
        this.handling = getHandling();
        this.bindings = getBindings();
        this.keyboard = new KeyboardInput(this);
        this.gamepad = new GamepadInput();
        this.game.onEvent = e => this.handleEvent(e);
        this.applySkin(this.settings.skin);
        this.applySettings();
        this.bindUI();
        this.bindTouch();
        this.selectMode('marathon');
        this.showMenu();
        this.updatePlayer();
        document.fonts?.ready.then(() => this.renderer.sprites.clear());
        this.loadReplayFromHash();
        requestAnimationFrame(this.loop);
    }
    playerLevel() { return levelInfo(this.profile.xp).level; }

    // ---- loop: desenho livre, simulação em passos fixos ----
    loop = ts => {
        requestAnimationFrame(this.loop);
        if (!this.lastFrame)
            this.lastFrame = ts;
        const dt = Math.min(250, ts - this.lastFrame);
        this.lastFrame = ts;
        this.gamepad.poll(this);
        const g = this.game;
        const running = g.isActive() && !(this.replay && this.replay.paused);
        if (running)
            this.acc += dt * (this.replay ? this.replay.speed : 1);
        else
            this.acc = 0;
        let steps = 0;
        while (this.acc >= TICK_MS && steps < 120) {
            if (this.replay)
                this.feedReplay();
            g.tick();
            this.acc -= TICK_MS;
            steps++;
            if (!g.isActive()) {
                this.acc = 0;
                break;
            }
        }
        if (steps >= 120)
            this.acc = 0;
        this.audio.update(g);
        const needsContinuousRender = running || g.state === 'clearing' || this.renderer.particles.length > 0;
        const shouldRender = needsContinuousRender || ts - this.lastIdleRender >= 250;
        if (shouldRender) {
            this.renderer.render(g, dt);
            this.lastIdleRender = ts;
        }
        const sx = this.renderer.shakeX, sy = this.renderer.shakeY;
        if (sx || sy || this.shaken) {
            this.frame.style.transform = sx || sy ? `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)` : '';
            this.shaken = !!(sx || sy);
        }
        this.updateHud(dt);
    };
    feedReplay() {
        const r = this.replay, ev = r.data.events;
        while (r.idx < ev.length && ev[r.idx][0] <= this.game.tickCount) {
            applyCode(this.game, ev[r.idx][1]);
            r.idx++;
        }
    }

    // ---- toda entrada passa por aqui (teclado, controle e toque) ----
    dispatch(action, down) {
        if (action === 'start') {
            if (down)
                this.onEnter();
            return;
        }
        if (action === 'padstart') {
            if (!down)
                return;
            if (this.replay)
                this.toggleReplayPause();
            else if (this.game.state === 'playing' || this.game.state === 'paused')
                this.togglePause();
            else
                this.onEnter();
            return;
        }
        if (!$('menu').hidden) {
            if (down && (action === 'left' || action === 'right')) {
                const i = MODE_ORDER.indexOf(this.selectedMode) + (action === 'left' ? -1 : 1);
                this.selectMode(MODE_ORDER[(i + MODE_ORDER.length) % MODE_ORDER.length]);
                this.audio.chime('click');
            }
            if (down && action === 'hard')
                this.begin();
            return;
        }
        if (this.replay) {
            if (!down)
                return;
            if (action === 'pause')
                this.toggleReplayPause();
            if (action === 'restart')
                this.watchReplay(this.replay.data);
            return;
        }
        if (action === 'pause') {
            if (down)
                this.togglePause();
            return;
        }
        if (action === 'restart') {
            if (down)
                this.begin();
            return;
        }
        if (!ACTIONS.includes(action))
            return;
        const g = this.game;
        if (down) {
            if (!g.isActive())
                return;
            this.audio.init();
            g.press(action);
            this.recording?.events.push([g.tickCount, ACTIONS.indexOf(action)]);
        }
        else {
            if (!RELEASABLE.includes(action) || (!g.isActive() && g.state !== 'paused'))
                return;
            g.release(action);
            this.recording?.events.push([g.tickCount, ACTIONS.length + RELEASABLE.indexOf(action)]);
        }
    }
    tap(action) {
        this.dispatch(action, true);
        if (RELEASABLE.includes(action))
            this.dispatch(action, false);
    }
    onEnter() {
        if (document.querySelector('dialog[open]'))
            return;
        if (!$('menu').hidden || !$('result').hidden)
            this.begin();
        else if (this.game.state === 'paused')
            this.togglePause();
    }

    // ---- partida ----
    begin() {
        this.stopReplay();
        this.closeDialogs();
        this.audio.init();
        cancelAnimationFrame(this.xpAnim);
        cancelAnimationFrame(this.countAnim);
        const p = this.profile;
        const before = p.streak.count;
        if (updateStreak(p) && p.streak.count > 1 && p.streak.count !== before)
            this.toast({ kicker: 'Sequência', title: `${p.streak.count} dias seguidos!`, text: 'Volte amanhã para manter a chama acesa.' });
        currentMissions(p);
        saveProfile(p);
        this.xpAtStart = p.xp;
        this.runAch = [];
        this.finalized = false;
        this.runId++;
        this.hideOverlays();
        this.game.start(this.selectedMode, undefined, this.handling);
        this.recording = { mode: this.selectedMode, seed: this.game.seed, handling: { ...this.game.handling }, events: [] };
        this.pb = getPB(this.selectedMode);
        this.pbSplits = getSplits(this.selectedMode);
        this.shownScore = 0;
        this.resetRunVisuals();
        this.updatePlayer();
    }
    resetRunVisuals() {
        document.body.classList.remove('is-fever', 'is-danger');
        this.renderer.curtain = -1;
        this.renderer.particles = [];
        this.events.replaceChildren();
        this.hudCache.clear();
    }
    togglePause() {
        const g = this.game;
        if (g.state !== 'playing' && g.state !== 'paused')
            return;
        this.keyboard.releaseAll();
        g.pause();
        $('pause').hidden = g.state !== 'paused';
        if (g.state === 'paused')
            $('resume-btn').focus();
    }
    hideOverlays() {
        $('menu').hidden = true;
        $('pause').hidden = true;
        $('result').hidden = true;
    }
    showMenu() {
        this.stopReplay();
        cancelAnimationFrame(this.xpAnim);
        const g = this.game;
        g.state = 'menu';
        g.current = null;
        g.resetInput();
        this.resetRunVisuals();
        this.audio.stopMusic();
        $('pause').hidden = true;
        $('result').hidden = true;
        $('menu').hidden = false;
        this.renderMenu();
        $('play-btn').focus();
    }
    selectMode(mode) {
        this.selectedMode = mode;
        this.renderModes();
        $('mode-desc').textContent = MODES[mode].desc;
        const pb = getPB(mode);
        $('best').textContent = pb == null ? '—' : TIME_MODES.includes(mode) ? fmtTime(pb) : fmtInt(pb);
        const fever = mode === 'marathon' || mode === 'ultra';
        $('fever-box').hidden = !fever;
        $('m-fever').hidden = !fever;
        $('clock-label').textContent = mode === 'ultra' ? 'RESTA' : 'TEMPO';
        this.hudCache.clear();
    }

    // ---- eventos do jogo ----
    handleEvent(e) {
        const g = this.game;
        this.audio.event(e);
        this.renderer.trigger(e, g);
        switch (e.name) {
            case 'go':
                this.pop('VAI!', 'go');
                break;
            case 'line':
                if (e.value >= 2)
                    this.pop(e.text, '', `+${fmtInt(e.gained)}`);
                this.bump('score');
                break;
            case 'quad':
                this.pop('QUADRA!', 'big', `+${fmtInt(e.gained)}`);
                this.burst(55);
                this.bump('score');
                break;
            case 'tspin':
                this.pop(e.text, 'big', e.gained ? `+${fmtInt(e.gained)}` : '');
                if (e.value)
                    this.burst(30);
                break;
            case 'b2b':
                this.pop(e.text, '', 'em sequência');
                break;
            case 'combo':
                this.pop(e.text, `combo ${e.value >= 9 ? 'c9' : e.value >= 6 ? 'c6' : ''}`);
                break;
            case 'perfect':
                this.pop('TUDO LIMPO!', 'huge', `+${fmtInt(e.value)}`);
                if (this.fxOn)
                    this.confetti.rain(170, this.pieceColors());
                break;
            case 'level':
                this.pop(e.text, 'big');
                this.bump('level');
                break;
            case 'fever':
                document.body.classList.add('is-fever');
                this.pop('FRENESI!', 'fever', 'PONTOS ×2');
                this.burst(40);
                break;
            case 'feverEnd':
                document.body.classList.remove('is-fever');
                break;
            case 'danger':
                document.body.classList.toggle('is-danger', e.value === 1);
                break;
            case 'gameover':
            case 'complete': {
                const id = this.runId, completed = e.name === 'complete';
                setTimeout(() => {
                    if (id === this.runId && (g.state === 'over' || g.state === 'complete'))
                        this.finishRun(completed);
                }, completed ? 450 : (this.reduced ? 150 : 950));
                break;
            }
        }
        if (!this.replay && this.recording)
            for (const a of ACHIEVEMENTS)
                if (a.live && !this.profile.ach[a.id] && a.live(e, g))
                    this.unlock(a);
    }
    get fxOn() { return this.settings.effects === 'full' && !this.reduced; }
    pieceColors() { return Object.values(SKINS[this.settings.skin].colors); }
    pop(text, cls = '', sub = '') {
        const n = document.createElement('div');
        n.className = `pop ${cls}`;
        n.textContent = text;
        if (sub) {
            const s = document.createElement('small');
            s.textContent = sub;
            n.append(s);
        }
        if (!cls)
            n.style.top = `${26 + Math.random() * 16}%`;
        this.events.append(n);
        n.addEventListener('animationend', () => n.remove());
        while (this.events.children.length > 5)
            this.events.firstElementChild.remove();
    }
    burst(count) {
        if (!this.fxOn)
            return;
        const r = this.frame.getBoundingClientRect();
        this.confetti.burst(r.left + r.width / 2, r.top + r.height * .35, count, this.pieceColors(), .9);
    }
    bump(id) {
        for (const el of [$(id), $(`m-${id}`)]) {
            if (!el)
                continue;
            el.classList.remove('bump');
            void el.offsetWidth;
            el.classList.add('bump');
        }
    }
    unlock(a) {
        this.profile.ach[a.id] = Date.now();
        this.profile.xp += a.xp;
        this.runAch.push(a);
        saveProfile(this.profile);
        this.toast({ kicker: 'Conquista desbloqueada', title: a.name, text: `${a.desc} +${a.xp} XP` });
        this.audio.chime('achievement');
        this.updatePlayer();
    }
    toast({ kicker, title, text, ms = 3800 }) {
        const t = document.createElement('div');
        t.className = 'toast';
        const medal = document.createElement('span');
        medal.className = 'medal';
        medal.innerHTML = STAR;
        const body = document.createElement('div');
        const k = document.createElement('small');
        k.textContent = kicker;
        const b = document.createElement('b');
        b.textContent = title;
        const s = document.createElement('span');
        s.textContent = text;
        body.append(k, b, s);
        t.append(medal, body);
        const box = $('toasts');
        box.append(t);
        while (box.children.length > 4)
            box.firstElementChild.remove();
        setTimeout(() => {
            t.classList.add('out');
            t.addEventListener('animationend', () => t.remove());
        }, ms);
    }

    // ---- fim da partida: recorde, missões, conquistas e XP ----
    finishRun(completed) {
        if (this.finalized)
            return;
        this.finalized = true;
        const g = this.game, stats = g.stats(), mode = g.mode;
        document.body.classList.remove('is-fever', 'is-danger');
        if (this.replay) {
            this.showResult({ replay: true, stats, mode, completed });
            return;
        }
        if (!this.recording)
            return;
        this.lastReplay = { ...this.recording, ticks: g.tickCount };
        this.recording = null;
        const rec = recordRun(mode, stats, completed);
        if (rec.isRecord) {
            setReplayCode(mode, encodeReplay(this.lastReplay));
            if (TIME_MODES.includes(mode))
                setSplits(mode, g.splits);
        }
        const lifetime = addLifetime(stats);
        const p = this.profile;
        const ms = currentMissions(p);
        const runStats = { ...stats, runs: 1, sprints: TIME_MODES.includes(mode) && completed ? 1 : 0 };
        const missionsDone = [];
        for (const m of ms.items) {
            if (m.done)
                continue;
            const def = missionDef(m.id);
            const v = runStats[def.stat] || 0;
            m.progress = def.kind === 'max' ? Math.max(m.progress, v) : m.progress + v;
            if (m.progress >= m.target) {
                m.progress = m.target;
                m.done = true;
                missionsDone.push({ m, def });
            }
        }
        let bonus = 0;
        if (!ms.bonus && ms.items.every(m => m.done)) {
            ms.bonus = true;
            bonus = 150;
        }
        const ctx = { mode, completed, stats, streak: p.streak.count, lifetime };
        const endAch = ACHIEVEMENTS.filter(a => a.end && !p.ach[a.id] && a.end(ctx));
        for (const a of endAch)
            p.ach[a.id] = Date.now();
        const parts = runXp(stats, mode, completed, rec.isRecord);
        for (const a of [...this.runAch, ...endAch])
            parts.push({ label: `Conquista: ${a.name}`, v: a.xp, special: true });
        for (const { m, def } of missionsDone)
            parts.push({ label: `Missão: ${def.text(m.target)}`, v: def.xp, special: true });
        if (bonus)
            parts.push({ label: 'Todas as missões de hoje', v: bonus, special: true });
        const total = parts.reduce((s, x) => s + x.v, 0);
        p.xp = this.xpAtStart + total;
        saveProfile(p);
        endAch.forEach((a, i) => setTimeout(() => {
            this.toast({ kicker: 'Conquista desbloqueada', title: a.name, text: `${a.desc} +${a.xp} XP` });
            this.audio.chime('achievement');
        }, 700 + i * 500));
        missionsDone.forEach(({ m, def }, i) => setTimeout(() => this.toast({ kicker: 'Missão concluída', title: def.text(m.target), text: `+${def.xp} XP` }), 900 + (endAch.length + i) * 500));
        this.showResult({ stats, mode, completed, rec, parts, total, fromXp: this.xpAtStart, toXp: p.xp });
        this.updatePlayer();
        this.selectMode(mode);
    }
    showResult(r) {
        const { stats, mode, completed } = r;
        const timeMode = TIME_MODES.includes(mode);
        $('result').hidden = false;
        $('res-kicker').textContent = r.replay ? 'FIM DO REPLAY'
            : timeMode && completed ? (mode === 'daily' ? 'DESAFIO COMPLETO' : 'SPRINT COMPLETO')
                : mode === 'ultra' && completed ? 'TEMPO ESGOTADO' : 'FIM DE JOGO';
        const big = $('res-big');
        const note = $('res-note');
        note.replaceChildren();
        const isRecord = !!r.rec?.isRecord;
        $('res-record').hidden = !isRecord;
        const say = (...parts) => parts.forEach(x => {
            if (typeof x === 'string')
                note.append(x);
            else {
                const b = document.createElement('b');
                b.textContent = x.b;
                note.append(b);
            }
        });
        if (timeMode && !completed) {
            big.textContent = `${stats.lines}/40`;
            say('Faltaram ', { b: `${40 - stats.lines} linhas` }, ' para terminar. Tente de novo!');
        }
        else if (timeMode) {
            this.countUp(big, stats.elapsedMs, v => fmtTime(v));
            if (!r.replay && !isRecord && r.rec?.pb != null)
                say('Ficou ', { b: `${((stats.elapsedMs - r.rec.pb) / 1000).toFixed(2).replace('.', ',')} s` }, ' atrás do seu recorde.');
            else if (isRecord && r.rec?.pb != null)
                say('Você bateu o recorde anterior por ', { b: `${((r.rec.pb - stats.elapsedMs) / 1000).toFixed(2).replace('.', ',')} s` }, '.');
        }
        else {
            this.countUp(big, stats.score, v => fmtInt(v));
            if (!r.replay && !isRecord && r.rec?.pb != null) {
                const diff = r.rec.pb - stats.score;
                if (diff <= r.rec.pb * .25)
                    say('Faltaram só ', { b: `${fmtInt(diff)} pontos` }, ' para o seu recorde!');
                else
                    say('Seu recorde: ', { b: fmtInt(r.rec.pb) }, '.');
            }
            else if (isRecord && r.rec?.pb != null)
                say('Você passou o recorde anterior por ', { b: `${fmtInt(stats.score - r.rec.pb)} pontos` }, '.');
        }
        if (!r.replay && !isRecord && r.rec?.rank && r.rec.rank > 1 && r.rec.rank <= 5)
            say(note.childNodes.length ? ' ' : '', 'É a sua ', { b: `${r.rec.rank}ª melhor` }, ' partida neste modo.');
        const cells = timeMode
            ? [['Peças/s', stats.pps.toFixed(2).replace('.', ',')], ['Quadras', stats.tetrises], ['T-spins', stats.tspins], ['Precisão', `${Math.round(stats.finesse)}%`]]
            : [['Linhas', stats.lines], ['Nível', stats.level], ['Quadras', stats.tetrises], ['Maior combo', stats.bestCombo > 1 ? `×${stats.bestCombo}` : '—']];
        $('res-stats').replaceChildren(...cells.map(([l, v]) => {
            const d = document.createElement('div');
            const s = document.createElement('span');
            s.textContent = l;
            const b = document.createElement('b');
            b.textContent = String(v);
            d.append(s, b);
            return d;
        }));
        $('res-xp').hidden = !!r.replay;
        $('result-panel').classList.toggle('solo', !!r.replay);
        $('watch-btn').textContent = r.replay ? 'Ver de novo' : 'Replay';
        $('code-btn').disabled = !this.lastReplay;
        if (r.replay)
            return;
        $('xp-list').replaceChildren(...r.parts.map(part => {
            const li = document.createElement('li');
            if (part.special)
                li.className = 'special';
            const s = document.createElement('span');
            s.textContent = part.label;
            const b = document.createElement('b');
            b.textContent = `+${part.v}`;
            li.append(s, b);
            return li;
        }));
        $('res-levelup').hidden = true;
        this.animateXp(r.fromXp, r.toXp);
        if (isRecord) {
            setTimeout(() => {
                this.audio.chime('record');
                if (this.fxOn)
                    this.confetti.burst(innerWidth / 2, innerHeight * .3, 120, this.pieceColors(), 1.1);
            }, 350);
        }
        $('again-btn').focus();
    }
    countUp(el, value, fmt) {
        cancelAnimationFrame(this.countAnim);
        if (this.reduced) {
            el.textContent = fmt(value);
            return;
        }
        const start = performance.now(), dur = 700;
        const step = now => {
            const t = Math.min(1, (now - start) / dur);
            el.textContent = fmt(value * (1 - Math.pow(1 - t, 3)));
            if (t < 1)
                this.countAnim = requestAnimationFrame(step);
        };
        this.countAnim = requestAnimationFrame(step);
    }
    animateXp(from, to) {
        cancelAnimationFrame(this.xpAnim);
        const start = performance.now() + 300, dur = this.reduced ? 1 : Math.min(2400, 800 + (to - from) * 3);
        let shownLevel = levelInfo(from).level, lastTick = 0;
        const draw = xp => {
            const li = levelInfo(Math.floor(xp));
            $('res-level').textContent = `NV ${li.level}`;
            $('res-xpbar').style.width = `${(li.into / li.need * 100).toFixed(1)}%`;
            $('res-xp-text').textContent = `${li.into}/${li.need}`;
            $('xp-gain').textContent = `+${fmtInt(xp - from)} XP`;
            if (li.level > shownLevel) {
                shownLevel = li.level;
                this.audio.chime('levelup');
                if (this.fxOn)
                    this.confetti.burst(innerWidth / 2, innerHeight * .65, 90, this.pieceColors(), 1);
                const skins = SKIN_ORDER.filter(id => SKINS[id].unlock === li.level).map(id => SKINS[id].name);
                const msg = $('res-levelup');
                msg.textContent = `Subiu para o nível ${li.level}!${skins.length ? ` Novo visual liberado: ${skins.join(', ')}.` : ''}`;
                msg.hidden = false;
            }
        };
        draw(from);
        const step = now => {
            const t = Math.max(0, Math.min(1, (now - start) / dur));
            draw(from + (to - from) * (1 - Math.pow(1 - t, 2)));
            if (t > 0 && t < 1 && now - lastTick > 70) {
                lastTick = now;
                this.audio.chime('xp');
            }
            if (t < 1)
                this.xpAnim = requestAnimationFrame(step);
        };
        this.xpAnim = requestAnimationFrame(step);
    }

    // ---- painel de informações ----
    updateHud(dt) {
        const g = this.game;
        const set = (id, v) => {
            if (this.hudCache.get(id) === v)
                return;
            this.hudCache.set(id, v);
            const el = $(id);
            if (el)
                el.textContent = v;
        };
        const diff = g.score - this.shownScore;
        this.shownScore = Math.abs(diff) < 1 ? g.score : this.shownScore + diff * Math.min(1, dt / 110);
        const score = fmtInt(this.shownScore);
        set('score', score);
        set('m-score', score);
        set('level', String(g.level));
        set('m-level', String(g.level));
        const lines = TIME_MODES.includes(g.mode) && g.state !== 'menu' ? `${g.lines}/40` : String(g.lines);
        set('lines', lines);
        set('m-lines', lines);
        const clockMs = g.mode === 'ultra' && g.state !== 'menu' ? 120000 - g.elapsedMs : g.elapsedMs;
        set('clock', fmtTime(clockMs));
        set('m-clock', fmtTime(clockMs, true));
        set('quads', String(g.tetrises));
        set('tspins', String(g.tspins));
        set('combo', g.combo > 1 ? `×${g.combo}` : '—');
        const fill = g.inFever ? g.feverMs / FEVER_MS * 100 : g.feverMeter;
        const f = `${(Math.round(fill * 2) / 2).toFixed(1)}%`;
        if (this.hudCache.get('fever') !== f) {
            this.hudCache.set('fever', f);
            $('fever-fill').style.width = f;
            $('m-fever-fill').style.width = f;
        }
        const pace = $('pace');
        const sp = this.pbSplits;
        let paceText = '', paceCls = 'pace';
        if (TIME_MODES.includes(g.mode) && sp && g.lines > 0 && sp[g.lines] != null && g.state !== 'menu') {
            const d = g.splits[g.lines] - sp[g.lines];
            paceText = `${d <= 0 ? '−' : '+'}${(Math.abs(d) / 1000).toFixed(2).replace('.', ',')}`;
            paceCls = `pace ${d <= 0 ? 'ahead' : 'behind'}`;
        }
        if (this.hudCache.get('pace') !== paceText + paceCls) {
            this.hudCache.set('pace', paceText + paceCls);
            pace.textContent = paceText;
            pace.className = paceCls;
        }
        if (this.replay)
            $('replay-progress').style.transform = `scaleX(${Math.min(1, g.tickCount / Math.max(1, this.replay.data.ticks)).toFixed(4)})`;
    }
    updatePlayer() {
        const li = levelInfo(this.profile.xp);
        const pct = `${(li.into / li.need * 100).toFixed(1)}%`;
        $('top-level').textContent = `NV ${li.level}`;
        $('top-xp').style.width = pct;
        $('top-streak-n').textContent = String(this.profile.streak.count);
        $('menu-level').textContent = `NV ${li.level}`;
        $('menu-xp').style.width = pct;
        $('menu-xp-text').textContent = `${li.into}/${li.need} XP`;
    }

    // ---- menu ----
    renderModes() {
        $('modes').replaceChildren(...MODE_ORDER.map(mode => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mode';
            b.setAttribute('aria-pressed', String(mode === this.selectedMode));
            const name = document.createElement('b');
            name.textContent = MODES[mode].name;
            const pb = getPB(mode);
            const rec = document.createElement('span');
            rec.textContent = pb == null ? (mode === 'daily' ? 'Ainda não jogado hoje' : 'Sem recorde ainda') : `Recorde ${TIME_MODES.includes(mode) ? fmtTime(pb) : fmtInt(pb)}`;
            b.append(name, rec);
            b.addEventListener('click', () => { this.selectMode(mode); this.audio.chime('click'); });
            b.addEventListener('dblclick', () => this.begin());
            return b;
        }));
    }
    renderMenu() {
        this.renderModes();
        const ms = currentMissions(this.profile);
        const left = ms.items.filter(m => !m.done).length;
        $('missions-xp').textContent = left ? `${left} de 3 para fazer` : 'Todas feitas! Novas amanhã';
        $('missions').replaceChildren(...ms.items.map(m => {
            const def = missionDef(m.id);
            const row = document.createElement('div');
            row.className = `mission${m.done ? ' done' : ''}`;
            const check = document.createElement('span');
            check.className = 'box-check';
            const text = document.createElement('span');
            text.className = 'm-text';
            text.textContent = def.text(m.target);
            const xp = document.createElement('span');
            xp.className = 'm-xp';
            xp.textContent = `+${def.xp} XP`;
            const bar = document.createElement('span');
            bar.className = 'm-bar';
            const i = document.createElement('i');
            i.style.width = `${Math.min(100, m.progress / m.target * 100)}%`;
            bar.append(i);
            const prog = document.createElement('span');
            prog.className = 'm-prog';
            prog.textContent = def.kind === 'max' && m.progress > 0 && !m.done ? `melhor: ${fmtInt(m.progress)}` : `${fmtInt(m.progress)}/${fmtInt(m.target)}`;
            row.append(check, text, xp, bar);
            if (!m.done)
                row.append(prog);
            return row;
        }));
        const k = a => this.bindings[a].map(keyName).join(' ou ') || '—';
        $('menu-hint').textContent = matchMedia('(pointer: coarse)').matches
            ? 'Arraste no poço para mover, toque para girar, deslize para baixo para soltar.'
            : `${k('left')} ${k('right')} mover · ${k('cw')} girar · ${k('hard')} soltar · ${k('hold')} reserva · ${k('pause')} pausa`;
        this.updatePlayer();
    }

    // ---- replays ----
    watchReplay(data) {
        this.closeDialogs();
        this.selectMode(data.mode);
        const speed = this.replay?.speed ?? 1;
        this.replay = { data, idx: 0, speed, paused: false };
        this.lastReplay = data;
        this.recording = null;
        this.finalized = false;
        this.runId++;
        this.hideOverlays();
        this.game.start(data.mode, data.seed, data.handling);
        this.pbSplits = getSplits(data.mode);
        this.shownScore = 0;
        this.resetRunVisuals();
        $('replay-bar').hidden = false;
        this.updateReplayBar();
    }
    stopReplay() {
        if (!this.replay)
            return;
        this.replay = null;
        $('replay-bar').hidden = true;
    }
    toggleReplayPause() {
        if (!this.replay || !this.game.isActive())
            return;
        this.replay.paused = !this.replay.paused;
        this.updateReplayBar();
    }
    updateReplayBar() {
        if (!this.replay)
            return;
        document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === this.replay.speed));
        $('replay-toggle').textContent = this.replay.paused ? 'Continuar' : 'Pausar';
    }
    loadReplayFromHash() {
        if (!location.hash.startsWith('#r='))
            return;
        try {
            this.watchReplay(decodeReplay(location.hash));
        }
        catch {
            // Hashes de replay inválidos ou incompatíveis são ignorados com segurança.
        }
    }
    openReplayDialog(mode, code = '') {
        this.replayDialogMode = mode;
        const area = $('replay-code');
        area.value = code;
        area.readOnly = mode === 'copy';
        $('replay-err').hidden = true;
        $('replay-title').textContent = mode === 'copy' ? 'Código do replay' : 'Carregar replay';
        $('replay-help').textContent = mode === 'copy'
            ? 'O código guarda a sequência de peças e cada tecla da partida. Quem colar em "Carregar replay" assiste à mesma partida.'
            : 'Cole um código de replay do STACK10 para assistir à partida.';
        $('replay-primary').textContent = mode === 'copy' ? 'COPIAR' : 'ASSISTIR';
        this.openDialog('replay-dlg');
        if (mode === 'copy')
            area.select();
        else
            area.focus();
    }
    async replayDialogAction() {
        const area = $('replay-code');
        if (this.replayDialogMode === 'copy') {
            let ok = false;
            try {
                await navigator.clipboard.writeText(area.value);
                ok = true;
            }
            catch {
                area.select();
                try {
                    ok = document.execCommand('copy');
                }
                catch {
                    // O fallback de cópia pode ser bloqueado pelo navegador; nesse caso mantemos o texto selecionado.
                }
            }
            $('replay-primary').textContent = ok ? 'COPIADO!' : 'SELECIONE E COPIE';
            return;
        }
        try {
            const data = decodeReplay(area.value);
            $('replay-dlg').close();
            this.watchReplay(data);
        }
        catch (err) {
            $('replay-err').textContent = err instanceof Error ? err.message : 'Código inválido.';
            $('replay-err').hidden = false;
        }
    }

    // ---- diálogos ----
    openDialog(id) {
        if (this.game.state === 'playing')
            this.togglePause();
        if (this.replay && !this.replay.paused && this.game.isActive())
            this.toggleReplayPause();
        const d = $(id);
        if (!d.open)
            d.showModal();
    }
    closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
    openProfile() {
        const p = this.profile, li = levelInfo(p.xp);
        $('pf-level').textContent = `NV ${li.level}`;
        $('pf-xp').style.width = `${(li.into / li.need * 100).toFixed(1)}%`;
        $('pf-xp-text').textContent = `${li.into}/${li.need} XP`;
        $('profile-sub').textContent = `${fmtInt(p.xp)} XP no total · sequência de ${p.streak.count} ${p.streak.count === 1 ? 'dia' : 'dias'} (melhor: ${p.streak.best})`;
        const got = ACHIEVEMENTS.filter(a => p.ach[a.id]).length;
        $('ach-count').textContent = `${got} de ${ACHIEVEMENTS.length}`;
        $('ach-grid').replaceChildren(...ACHIEVEMENTS.map(a => {
            const d = document.createElement('div');
            d.className = `ach${p.ach[a.id] ? ' on' : ''}`;
            const m = document.createElement('span');
            m.className = 'medal';
            m.innerHTML = p.ach[a.id] ? STAR : '?';
            const b = document.createElement('b');
            b.textContent = a.name;
            const s = document.createElement('span');
            s.textContent = `${a.desc} +${a.xp} XP`;
            d.append(m, b, s);
            return d;
        }));
        $('rec-list').replaceChildren(...MODE_ORDER.map(mode => {
            const row = document.createElement('div');
            row.className = 'rec';
            const n = document.createElement('span');
            n.textContent = MODES[mode].name;
            const pb = getPB(mode);
            const v = document.createElement('b');
            v.textContent = pb == null ? '—' : TIME_MODES.includes(mode) ? fmtTime(pb) : fmtInt(pb);
            const acts = document.createElement('span');
            const code = getReplayCode(mode);
            if (code) {
                const w = document.createElement('button');
                w.type = 'button';
                w.className = 'linkbtn';
                w.textContent = 'assistir';
                w.addEventListener('click', () => {
                    try {
                        this.watchReplay(decodeReplay(code));
                    }
                    catch {
                        // Um replay persistido de uma versão incompatível não deve quebrar a tela de perfil.
                    }
                });
                const c = document.createElement('button');
                c.type = 'button';
                c.className = 'linkbtn';
                c.style.marginLeft = '10px';
                c.textContent = 'código';
                c.addEventListener('click', () => { $('profile-dlg').close(); this.openReplayDialog('copy', code); });
                acts.append(w, c);
            }
            row.append(n, v, acts);
            return row;
        }));
        const life = getLifetime();
        $('life').replaceChildren(...[['Partidas', life.runs], ['Linhas', life.lines], ['Peças', life.pieces], ['Quadras', life.tetrises], ['T-spins', life.tspins], ['Maior combo', life.bestCombo ? `×${life.bestCombo}` : '—']].map(([l, v]) => {
            const d = document.createElement('div');
            const s = document.createElement('span');
            s.textContent = l;
            const b = document.createElement('b');
            b.textContent = typeof v === 'number' ? fmtInt(v) : v;
            d.append(s, b);
            return d;
        }));
        this.openDialog('profile-dlg');
    }
    openVisual() {
        const level = this.playerLevel();
        $('skins').replaceChildren(...SKIN_ORDER.map(id => {
            const sk = SKINS[id];
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `skin${level < sk.unlock ? ' locked' : ''}`;
            b.dataset.unlock = String(sk.unlock);
            b.setAttribute('aria-pressed', String(id === this.settings.skin));
            if (level < sk.unlock)
                b.setAttribute('aria-disabled', 'true');
            const c = document.createElement('canvas');
            this.renderer.paintPreview(c, sk);
            const name = document.createElement('b');
            name.textContent = sk.name;
            const desc = document.createElement('span');
            desc.textContent = level < sk.unlock ? `Libera no nível ${sk.unlock}. ${sk.desc}` : sk.desc;
            b.append(c, name, desc);
            b.addEventListener('click', () => {
                if (level < sk.unlock)
                    return;
                this.settings.skin = id;
                setSettings(this.settings);
                this.applySkin(id);
                this.openVisual();
            });
            return b;
        }));
        this.syncSwitches();
        this.openDialog('visual-dlg');
    }
    applySkin(id) {
        const sk = SKINS[id];
        applySkinToPage(sk);
        this.renderer.setSkin(sk);
    }
    applySettings() {
        const s = this.settings;
        this.audio.setMusic(s.music);
        this.audio.setSfx(s.sfx);
        this.renderer.setOptions({ shake: s.shake && !this.reduced, effects: this.reduced ? 'reduced' : s.effects, ghost: s.ghost });
        $('music-btn').setAttribute('aria-pressed', String(s.music));
        $('sfx-btn').setAttribute('aria-pressed', String(s.sfx));
        this.syncSwitches();
    }
    syncSwitches() {
        document.querySelectorAll('[data-setting]').forEach(sw => {
            const k = sw.dataset.setting;
            sw.setAttribute('aria-checked', String(k === 'effects' ? this.settings.effects === 'full' : !!this.settings[k]));
        });
    }
    openControls() {
        this.renderControls();
        this.openDialog('controls-dlg');
    }
    renderControls() {
        const h = this.handling;
        $('h-das').value = String(h.das);
        $('h-arr').value = String(h.arr);
        $('h-sdf').value = String(h.sdf === 0 ? 41 : h.sdf);
        $('h-das-v').textContent = `${h.das} ms`;
        $('h-arr-v').textContent = h.arr === 0 ? 'direto' : `${h.arr} ms`;
        $('h-sdf-v').textContent = h.sdf === 0 ? 'na hora' : `${h.sdf}×`;
        $('bindings').replaceChildren(...BINDING_ORDER.map(action => {
            const row = document.createElement('div');
            row.className = 'bind';
            const label = document.createElement('span');
            label.textContent = BINDING_LABELS[action];
            row.append(label);
            for (let slot = 0; slot < 2; slot++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'key';
                const cap = this.capture && this.capture.action === action && this.capture.slot === slot;
                btn.textContent = cap ? 'aperte…' : keyName(this.bindings[action][slot]);
                btn.classList.toggle('cap', !!cap);
                btn.setAttribute('aria-label', `${BINDING_LABELS[action]}, tecla ${slot + 1}: ${keyName(this.bindings[action][slot])}`);
                btn.addEventListener('click', () => { this.capture = { action, slot }; this.renderControls(); });
                row.append(btn);
            }
            return row;
        }));
    }
    captureBinding(e) {
        if (!this.capture)
            return false;
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
            this.capture = null;
            this.renderControls();
            return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter')
            return true;
        const { action, slot } = this.capture;
        for (const a of BINDING_ORDER)
            this.bindings[a] = this.bindings[a].filter(c => c !== e.code);
        const list = this.bindings[action].slice();
        list[slot] = e.code;
        this.bindings[action] = list.filter(Boolean).slice(0, 2);
        setBindings(this.bindings);
        this.capture = null;
        this.renderControls();
        return true;
    }

    // ---- ligações da interface ----
    bindUI() {
        $('play-btn').addEventListener('click', () => this.begin());
        $('again-btn').addEventListener('click', () => this.begin());
        $('menu-btn').addEventListener('click', () => this.showMenu());
        $('watch-btn').addEventListener('click', () => { if (this.lastReplay) this.watchReplay(this.lastReplay); });
        $('code-btn').addEventListener('click', () => { if (this.lastReplay) this.openReplayDialog('copy', encodeReplay(this.lastReplay)); });
        $('resume-btn').addEventListener('click', () => this.togglePause());
        $('restart-btn').addEventListener('click', () => this.begin());
        $('quit-btn').addEventListener('click', () => this.showMenu());
        $('logo').addEventListener('click', e => { e.preventDefault(); if (this.game.state === 'playing') this.togglePause(); else if (!this.game.isActive()) this.showMenu(); });
        $('player-btn').addEventListener('click', () => this.openProfile());
        $('visual-btn').addEventListener('click', () => this.openVisual());
        $('about-btn').addEventListener('click', () => this.openDialog('about-dlg'));
        $('controls-btn').addEventListener('click', () => this.openControls());
        $('load-replay-btn').addEventListener('click', () => { $('profile-dlg').close(); this.openReplayDialog('load'); });
        $('replay-primary').addEventListener('click', () => this.replayDialogAction());
        $('music-btn').addEventListener('click', () => {
            this.settings.music = !this.settings.music;
            setSettings(this.settings);
            this.audio.init();
            this.applySettings();
        });
        $('sfx-btn').addEventListener('click', () => {
            this.settings.sfx = !this.settings.sfx;
            setSettings(this.settings);
            this.applySettings();
        });
        document.querySelectorAll('[data-setting]').forEach(sw => sw.addEventListener('click', () => {
            const k = sw.dataset.setting;
            if (k === 'effects')
                this.settings.effects = this.settings.effects === 'full' ? 'reduced' : 'full';
            else
                this.settings[k] = !this.settings[k];
            setSettings(this.settings);
            this.applySettings();
        }));
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
        document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', () => { this.capture = null; }));
        $('controls-dlg').addEventListener('cancel', e => { if (this.capture) e.preventDefault(); });
        ['das', 'arr', 'sdf'].forEach(key => $(`h-${key}`).addEventListener('input', e => {
            let value = Number(e.currentTarget.value);
            if (key === 'sdf' && value >= 41)
                value = 0;
            this.handling = { ...this.handling, [key]: value };
            setHandling(this.handling);
            this.renderControls();
        }));
        $('bindings-reset').addEventListener('click', () => {
            this.bindings = defaultBindings();
            this.handling = { ...DEFAULT_HANDLING };
            setBindings(this.bindings);
            setHandling(this.handling);
            this.renderControls();
        });
        document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
            if (!this.replay)
                return;
            this.replay.speed = Number(b.dataset.speed);
            this.updateReplayBar();
        }));
        $('replay-toggle').addEventListener('click', () => this.toggleReplayPause());
        $('replay-exit').addEventListener('click', () => this.showMenu());
        window.addEventListener('resize', () => this.renderer.resize());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden)
                return;
            this.keyboard.releaseAll();
            if (this.replay) {
                this.replay.paused = true;
                this.updateReplayBar();
            }
            else if (this.game.state === 'playing')
                this.togglePause();
        });
    }
    // Celular: botões e gestos no próprio poço (arrastar move, tocar gira, deslizar solta ou guarda).
    bindTouch() {
        document.querySelectorAll('[data-act]').forEach(btn => {
            const act = btn.dataset.act;
            let isDown = false;
            const up = () => {
                if (!isDown)
                    return;
                isDown = false;
                if (RELEASABLE.includes(act))
                    this.dispatch(act, false);
            };
            btn.addEventListener('pointerdown', e => {
                e.preventDefault();
                this.audio.init();
                if (isDown)
                    return;
                isDown = true;
                if (act === 'pause')
                    this.togglePause();
                else
                    this.dispatch(act, true);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => btn.addEventListener(n, up));
        });
        const board = $('board');
        let s = null;
        board.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse')
                return;
            e.preventDefault();
            board.setPointerCapture(e.pointerId);
            this.audio.init();
            s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lastX: e.clientX, t0: performance.now(), moved: false, soft: false, cell: board.getBoundingClientRect().width / COLS };
        });
        board.addEventListener('pointermove', e => {
            if (!s || e.pointerId !== s.id)
                return;
            s.x = e.clientX;
            s.y = e.clientY;
            const step = s.cell * .9;
            while (Math.abs(e.clientX - s.lastX) >= step) {
                const dir = e.clientX > s.lastX ? 'right' : 'left';
                this.tap(dir);
                s.lastX += dir === 'right' ? step : -step;
                s.moved = true;
            }
            const dy = e.clientY - s.y0, dt = performance.now() - s.t0;
            if (!s.soft && dy > s.cell * 1.4 && dt > 200 && dy / dt < .5 && Math.abs(e.clientX - s.x0) < s.cell * 1.5) {
                s.soft = true;
                s.moved = true;
                this.dispatch('soft', true);
            }
        });
        const end = e => {
            if (!s || e.pointerId !== s.id)
                return;
            // Usa a última posição vista no movimento: alguns navegadores mandam o fim do toque sem coordenadas.
            const dt = performance.now() - s.t0, dx = s.x - s.x0, dy = s.y - s.y0;
            if (s.soft)
                this.dispatch('soft', false);
            else if (dy > s.cell * 2 && dy / dt > .6 && Math.abs(dy) > Math.abs(dx))
                this.tap('hard');
            else if (dy < -s.cell * 2 && Math.abs(dy) > Math.abs(dx) && dt < 400)
                this.tap('hold');
            else if (!s.moved && dt < 280 && Math.hypot(dx, dy) < s.cell * .7)
                this.tap('cw');
            s = null;
        };
        board.addEventListener('pointerup', end);
        board.addEventListener('pointercancel', end);
    }
}


export { App };
