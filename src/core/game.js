import { ROTATIONS, kickTests, matrixFor, spawnX, spawnY } from './pieces.js';
import { BagRandomizer, dailySeed, randomSeed } from './randomizer.js';

// A simulação roda em passos fixos: mesma seed + mesmas teclas nos mesmos passos = mesmo jogo.
// É isso que torna os replays possíveis, e é a mesma porta que um bot vai usar (press/release + tick).
const COLS = 10;
const ROWS = 20;
const TICK_MS = 1000 / 120;
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const LINE_CLEAR_DELAY = 210;
const COUNT_STEP = 400;
const COUNTDOWN_MS = COUNT_STEP * 3;
const FEVER_MS = 12000;
const ACTIONS = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold'];
const RELEASABLE = ['left', 'right', 'soft'];
const ACTIVE_STATES = ['countdown', 'playing', 'clearing'];
const DEFAULT_HANDLING = { das: 133, arr: 25, sdf: 20 }; // sdf 0 = soft drop instantâneo
// Kicks do giro de 180° (coordenadas do canvas: y positivo = para baixo).
const KICKS_180 = [[0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1]];
const LINE_NAMES = ['', 'SIMPLES', 'DUPLA', 'TRIPLA', 'QUADRA!'];

// Finesse: menor número de teclas para levar a peça do nascimento até a posição final num tabuleiro vazio.
// Movimentos: toque ←/→, segurar até a parede (1 tecla), giro horário, anti-horário e 180°.
function fitsEmpty(type, rotation, x) {
    const m = ROTATIONS[type][rotation];
    for (let yy = 0; yy < m.length; yy++)
        for (let xx = 0; xx < m[yy].length; xx++)
            if (m[yy][xx] && (x + xx < 0 || x + xx >= COLS))
                return false;
    return true;
}
function placementSig(type, rotation, x) {
    const m = ROTATIONS[type][rotation];
    const cells = [];
    let minY = 9;
    for (let yy = 0; yy < m.length; yy++)
        for (let xx = 0; xx < m[yy].length; xx++)
            if (m[yy][xx]) {
                cells.push([x + xx, yy]);
                minY = Math.min(minY, yy);
            }
    return cells.map(([cx, cy]) => cx * 8 + (cy - minY)).sort((a, b) => a - b).join(',');
}
const FINESSE_TABLES = new Map();
function finesseTable(type) {
    let table = FINESSE_TABLES.get(type);
    if (table)
        return table;
    table = new Map();
    const dist = new Map();
    const start = [spawnX(type), 0];
    const queue = [start];
    dist.set(`${start[0]},0`, 0);
    while (queue.length) {
        const [x, r] = queue.shift();
        const d = dist.get(`${x},${r}`);
        const sig = placementSig(type, r, x);
        if (!table.has(sig) || table.get(sig) > d)
            table.set(sig, d);
        const next = [];
        if (fitsEmpty(type, r, x - 1))
            next.push([x - 1, r]);
        if (fitsEmpty(type, r, x + 1))
            next.push([x + 1, r]);
        let l = x;
        while (fitsEmpty(type, r, l - 1))
            l--;
        next.push([l, r]);
        let rr = x;
        while (fitsEmpty(type, r, rr + 1))
            rr++;
        next.push([rr, r]);
        if (type !== 'O')
            for (const turn of [1, 3, 2]) {
                const to = (r + turn) % 4;
                const tests = turn === 2 ? KICKS_180 : kickTests(type, r, to);
                for (const [dx] of tests)
                    if (fitsEmpty(type, to, x + dx)) {
                        next.push([x + dx, to]);
                        break;
                    }
            }
        for (const [nx, nr] of next) {
            const k = `${nx},${nr}`;
            if (!dist.has(k)) {
                dist.set(k, d + 1);
                queue.push([nx, nr]);
            }
        }
    }
    FINESSE_TABLES.set(type, table);
    return table;
}

class Game {
    grid = [];
    current = null;
    hold = null;
    queue = [];
    canHold = true;
    state = 'menu';
    mode = 'marathon';
    seed = 0;
    handling = { ...DEFAULT_HANDLING };
    tickCount = 0;
    countdownMs = 0;
    lastCount = 0;
    score = 0;
    lines = 0;
    level = 1;
    pieces = 0;
    tetrises = 0;
    tspins = 0;
    tsds = 0;
    perfects = 0;
    combo = 0;
    bestCombo = 0;
    b2b = 0;
    bestB2b = 0;
    feverMeter = 0;
    feverMs = 0;
    fevers = 0;
    elapsedMs = 0;
    keys = 0;
    splits = [0];
    onEvent = () => { };
    randomizer = new BagRandomizer(1);
    // entrada (DAS/ARR vivem dentro da simulação para serem determinísticos)
    held = { left: false, right: false };
    dir = 0;
    dasMs = 0;
    arrMs = 0;
    softHeld = false;
    // estado da peça
    dropAcc = 0;
    lockAcc = 0;
    lockResets = 0;
    lowestY = 0;
    lastActionRotate = false;
    lastKickIndex = 0;
    last180 = false;
    pieceInputs = 0;
    pieceSoft = false;
    finEval = 0;
    finFaults = 0;
    danger = false;
    clearRows = [];
    clearTimer = 0;
    clearSpin = 0;
    constructor() { this.resetGrid(); }
    get feverEnabled() { return this.mode === 'marathon' || this.mode === 'ultra'; }
    get inFever() { return this.feverMs > 0; }
    start(mode, suppliedSeed, handling = DEFAULT_HANDLING) {
        this.mode = mode;
        this.seed = suppliedSeed ?? (mode === 'daily' ? dailySeed() : randomSeed());
        this.handling = { ...DEFAULT_HANDLING, ...handling };
        this.randomizer = new BagRandomizer(this.seed);
        this.resetGrid();
        this.queue = [];
        for (let i = 0; i < 6; i++)
            this.queue.push(this.randomizer.next());
        this.current = null;
        this.hold = null;
        this.canHold = true;
        this.tickCount = 0;
        this.countdownMs = COUNTDOWN_MS;
        this.lastCount = 4;
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.pieces = 0;
        this.tetrises = 0;
        this.tspins = 0;
        this.tsds = 0;
        this.perfects = 0;
        this.combo = 0;
        this.bestCombo = 0;
        this.b2b = 0;
        this.bestB2b = 0;
        this.feverMeter = 0;
        this.feverMs = 0;
        this.fevers = 0;
        this.elapsedMs = 0;
        this.keys = 0;
        this.splits = [0];
        this.finEval = 0;
        this.finFaults = 0;
        this.danger = false;
        this.clearRows = [];
        this.clearTimer = 0;
        this.clearSpin = 0;
        this.resetInput();
        this.state = 'countdown';
    }
    resetInput() {
        this.held = { left: false, right: false };
        this.dir = 0;
        this.dasMs = 0;
        this.arrMs = 0;
        this.softHeld = false;
    }
    isActive() { return ACTIVE_STATES.includes(this.state); }
    pause() {
        if (this.state === 'playing')
            this.state = 'paused';
        else if (this.state === 'paused')
            this.state = 'playing';
    }
    // ---- um passo fixo da simulação ----
    tick() {
        if (!ACTIVE_STATES.includes(this.state))
            return;
        this.tickCount++;
        const dt = TICK_MS;
        if (this.state === 'countdown') {
            if (this.dir)
                this.dasMs += dt;
            this.countdownMs -= dt;
            const n = Math.ceil(this.countdownMs / COUNT_STEP);
            if (n > 0 && n !== this.lastCount) {
                this.lastCount = n;
                this.onEvent({ name: 'count', value: n });
            }
            if (this.countdownMs <= 0) {
                this.state = 'playing';
                this.onEvent({ name: 'go', text: 'VAI!' });
                this.spawnNext(true);
            }
            return;
        }
        this.elapsedMs += dt;
        if (this.feverMs > 0) {
            this.feverMs -= dt;
            if (this.feverMs <= 0) {
                this.feverMs = 0;
                this.onEvent({ name: 'feverEnd' });
            }
        }
        if (this.mode === 'ultra' && this.elapsedMs >= 120000) {
            this.elapsedMs = 120000;
            this.complete();
            return;
        }
        if (this.state === 'clearing') {
            if (this.dir)
                this.dasMs += dt;
            this.clearTimer -= dt;
            if (this.clearTimer <= 0)
                this.finishClear();
            return;
        }
        if (!this.current)
            return;
        this.autoShift(dt);
        const p = this.current;
        if (this.collides(p.matrix, p.x, p.y + 1)) {
            this.lockAcc += dt;
            if (this.lockAcc >= LOCK_DELAY)
                this.lockPiece();
            return;
        }
        this.lockAcc = 0;
        const gravity = this.dropInterval();
        const soft = this.softHeld;
        if (soft && this.handling.sdf === 0) {
            while (!this.collides(p.matrix, p.x, p.y + 1)) {
                p.y++;
                this.score++;
            }
            this.noteDescent();
            return;
        }
        const interval = soft ? Math.min(gravity, gravity / this.handling.sdf) : gravity;
        this.dropAcc += dt;
        while (this.dropAcc >= interval) {
            this.dropAcc -= interval;
            if (this.collides(p.matrix, p.x, p.y + 1)) {
                this.dropAcc = 0;
                break;
            }
            p.y++;
            if (soft)
                this.score++;
        }
        this.noteDescent();
    }
    autoShift(dt) {
        if (!this.dir)
            return;
        const { das, arr } = this.handling;
        const before = this.dasMs;
        this.dasMs += dt;
        if (this.dasMs < das)
            return;
        if (arr === 0) {
            while (this.shift(this.dir, false))
                ;
            return;
        }
        this.arrMs += before < das ? this.dasMs - das : dt;
        while (this.arrMs >= arr) {
            this.arrMs -= arr;
            if (!this.shift(this.dir, false)) {
                this.arrMs = 0;
                break;
            }
        }
    }
    noteDescent() {
        const p = this.current;
        if (p && p.y > this.lowestY) {
            this.lowestY = p.y;
            this.lockResets = 0;
        }
    }
    // ---- entrada: a única porta de ação do jogador (e, no futuro, do bot) ----
    press(action) {
        const acting = this.canAct();
        if (acting && action !== 'soft')
            this.keys++;
        switch (action) {
            case 'left':
            case 'right': {
                const d = action === 'left' ? -1 : 1;
                this.held[action] = true;
                this.dir = d;
                this.dasMs = 0;
                this.arrMs = 0;
                if (acting) {
                    this.pieceInputs++;
                    this.shift(d, true);
                }
                break;
            }
            case 'soft':
                this.softHeld = true;
                if (this.current)
                    this.pieceSoft = true;
                break;
            case 'hard':
                this.hardDrop();
                break;
            case 'cw':
                this.rotate(1);
                break;
            case 'ccw':
                this.rotate(-1);
                break;
            case 'r180':
                this.rotate(2);
                break;
            case 'hold':
                this.doHold();
                break;
        }
    }
    release(action) {
        if (action === 'soft') {
            this.softHeld = false;
            return;
        }
        if (action !== 'left' && action !== 'right')
            return;
        this.held[action] = false;
        const d = action === 'left' ? -1 : 1;
        if (this.dir !== d)
            return;
        const other = action === 'left' ? 'right' : 'left';
        this.dir = this.held[other] ? -d : 0;
        this.dasMs = 0;
        this.arrMs = 0;
    }
    shift(dx, manual) {
        const p = this.current;
        if (!p || this.state !== 'playing' || this.collides(p.matrix, p.x + dx, p.y))
            return false;
        p.x += dx;
        this.lastActionRotate = false;
        this.groundReset();
        this.onEvent({ name: 'move', auto: !manual });
        return true;
    }
    rotate(turn) {
        if (!this.canAct())
            return false;
        const p = this.current;
        this.pieceInputs++;
        if (p.type === 'O')
            return false;
        const from = p.rotation;
        const to = (from + (turn === 2 ? 2 : turn === 1 ? 1 : 3)) % 4;
        const next = matrixFor(p.type, to);
        const tests = turn === 2 ? KICKS_180 : kickTests(p.type, from, to);
        for (let i = 0; i < tests.length; i++) {
            const [dx, dy] = tests[i];
            if (!this.collides(next, p.x + dx, p.y + dy)) {
                p.rotation = to;
                p.matrix = next;
                p.x += dx;
                p.y += dy;
                this.lastActionRotate = true;
                this.lastKickIndex = i;
                this.last180 = turn === 2;
                this.groundReset();
                this.onEvent({ name: 'rotate', value: i });
                return true;
            }
        }
        return false;
    }
    hardDrop() {
        if (!this.canAct())
            return;
        const p = this.current;
        const fromY = p.y;
        let distance = 0;
        while (!this.collides(p.matrix, p.x, p.y + 1)) {
            p.y++;
            distance++;
        }
        this.score += distance * 2;
        this.onEvent({ name: 'hardDrop', value: distance, cells: this.cellsOf(p), fromY, type: p.type });
        this.lockPiece();
    }
    doHold() {
        if (!this.canAct() || !this.canHold)
            return;
        const outgoing = this.current.type;
        this.canHold = false;
        if (this.hold) {
            const incoming = this.hold;
            this.hold = outgoing;
            this.current = this.makePiece(incoming);
            this.resetPieceMotion();
            if (this.collides(this.current.matrix, this.current.x, this.current.y)) {
                this.current.y--;
                this.lowestY = this.current.y;
                if (this.collides(this.current.matrix, this.current.x, this.current.y)) {
                    this.gameOver();
                    return;
                }
            }
        }
        else {
            this.hold = outgoing;
            this.spawnNext(false);
        }
        this.onEvent({ name: 'hold' });
    }
    ghostY() {
        if (!this.current)
            return 0;
        let y = this.current.y;
        while (!this.collides(this.current.matrix, this.current.x, y + 1))
            y++;
        return y;
    }
    isGrounded() {
        const p = this.current;
        return !!p && this.collides(p.matrix, p.x, p.y + 1);
    }
    cellsOf(p) {
        const out = [];
        for (let y = 0; y < p.matrix.length; y++)
            for (let x = 0; x < p.matrix[y].length; x++)
                if (p.matrix[y][x])
                    out.push([p.x + x, p.y + y]);
        return out;
    }
    stats() {
        const seconds = Math.max(.001, this.elapsedMs / 1000);
        return {
            score: this.score, lines: this.lines, level: this.level, pieces: this.pieces, tetrises: this.tetrises, tspins: this.tspins,
            tsds: this.tsds, perfects: this.perfects, combo: this.combo, bestCombo: this.bestCombo, b2b: this.b2b, bestB2b: this.bestB2b,
            fevers: this.fevers, elapsedMs: this.elapsedMs, pps: this.pieces / seconds, finesse: this.finesse(),
            finesseFaults: this.finFaults, keys: this.keys, kpp: this.pieces ? this.keys / this.pieces : 0
        };
    }
    resetGrid() { this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
    canAct() { return this.state === 'playing' && !!this.current; }
    makePiece(type) { return { type, rotation: 0, matrix: matrixFor(type, 0), x: spawnX(type), y: spawnY(type) }; }
    spawnNext(resetHold) {
        const type = this.queue.shift();
        this.queue.push(this.randomizer.next());
        this.current = this.makePiece(type);
        if (resetHold)
            this.canHold = true;
        this.resetPieceMotion();
        if (this.collides(this.current.matrix, this.current.x, this.current.y)) {
            // Antes de perder, tenta nascer uma linha acima (regra do padrão moderno).
            this.current.y--;
            this.lowestY = this.current.y;
            if (this.collides(this.current.matrix, this.current.x, this.current.y))
                this.gameOver();
        }
    }
    resetPieceMotion() {
        this.dropAcc = 0;
        this.lockAcc = 0;
        this.lockResets = 0;
        this.lowestY = this.current ? this.current.y : 0;
        this.lastActionRotate = false;
        this.lastKickIndex = 0;
        this.last180 = false;
        this.pieceInputs = 0;
        this.pieceSoft = this.softHeld;
    }
    groundReset() {
        if (!this.current)
            return;
        if (this.collides(this.current.matrix, this.current.x, this.current.y + 1) && this.lockResets < MAX_LOCK_RESETS) {
            this.lockAcc = 0;
            this.lockResets++;
        }
    }
    collides(matrix, px, py) {
        for (let y = 0; y < matrix.length; y++)
            for (let x = 0; x < matrix[y].length; x++) {
                if (!matrix[y][x])
                    continue;
                const nx = px + x, ny = py + y;
                if (nx < 0 || nx >= COLS || ny >= ROWS)
                    return true;
                if (ny >= 0 && this.grid[ny][nx])
                    return true;
            }
        return false;
    }
    lockPiece() {
        if (!this.current || this.state !== 'playing')
            return;
        const p = this.current;
        const spin = this.tspinKind(p);
        this.evaluateFinesse(p);
        let above = false;
        const cells = this.cellsOf(p);
        for (const [gx, gy] of cells) {
            if (gy < 0) {
                above = true;
                continue;
            }
            this.grid[gy][gx] = p.type;
        }
        this.pieces++;
        this.onEvent({ name: 'lock', cells, type: p.type });
        this.current = null;
        if (above) {
            this.gameOver();
            return;
        }
        const full = [];
        for (let y = 0; y < ROWS; y++)
            if (this.grid[y].every(Boolean))
                full.push(y);
        if (full.length) {
            this.clearRows = full;
            this.clearSpin = spin;
            this.clearTimer = LINE_CLEAR_DELAY;
            this.state = 'clearing';
            this.onEvent({ name: 'clear', value: full.length, rows: full.slice(), spin });
            return;
        }
        this.applyScoring(0, spin);
        this.updateDanger();
        this.spawnNext(true);
    }
    finishClear() {
        if (this.state !== 'clearing')
            return;
        const rows = this.clearRows.slice(), spin = this.clearSpin;
        this.grid = this.grid.filter((_, i) => !rows.includes(i));
        while (this.grid.length < ROWS)
            this.grid.unshift(Array(COLS).fill(null));
        this.clearRows = [];
        this.clearTimer = 0;
        this.clearSpin = 0;
        this.applyScoring(rows.length, spin);
        this.updateDanger();
        if ((this.mode === 'sprint' || this.mode === 'daily') && this.lines >= 40) {
            this.complete();
            return;
        }
        this.state = 'playing';
        this.spawnNext(true);
    }
    // spin: 0 = nenhum, 1 = mini, 2 = T-spin completo
    applyScoring(n, spin) {
        const mult = this.inFever ? 2 : 1;
        const cleared = n;
        if (n === 0) {
            this.combo = 0;
            if (spin) {
                const gained = (spin === 2 ? 400 : 100) * this.level * mult;
                this.score += gained;
                this.tspins++;
                this.onEvent({ name: 'tspin', value: 0, mini: spin === 1, gained, text: spin === 1 ? 'MINI T-SPIN' : 'T-SPIN' });
                this.addFever(spin === 2 ? 15 : 5);
            }
            // Peças sem linha não quebram a sequência back-to-back.
            return;
        }
        n = Math.min(4, n); // uma peça ocupa no máximo 4 linhas; a trava protege as tabelas abaixo
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const difficult = n === 4 || spin > 0;
        let base = spin === 2 ? [0, 800, 1200, 1600][n] : spin === 1 ? [0, 200, 400, 400][n] : [0, 100, 300, 500, 800][n];
        if (difficult && this.b2b > 0)
            base = Math.floor(base * 1.5);
        if (difficult)
            this.b2b++;
        else
            this.b2b = 0;
        this.bestB2b = Math.max(this.bestB2b, this.b2b - 1);
        if (this.combo > 1)
            base += 50 * (this.combo - 1);
        const gained = base * this.level * mult;
        this.score += gained;
        const before = this.lines;
        this.lines += cleared;
        for (let l = before + 1; l <= this.lines; l++)
            this.splits[l] = this.elapsedMs;
        if (spin) {
            this.tspins++;
            if (spin === 2 && n >= 2)
                this.tsds++;
            this.onEvent({ name: 'tspin', value: n, mini: spin === 1, gained, text: `${spin === 1 ? 'MINI ' : ''}T-SPIN ${LINE_NAMES[n].replace('!', '')}` });
        }
        else if (n === 4) {
            this.tetrises++;
            this.onEvent({ name: 'quad', value: 4, gained, text: 'QUADRA!' });
        }
        else
            this.onEvent({ name: 'line', value: n, gained, text: LINE_NAMES[n] });
        if (difficult && this.b2b > 1)
            this.onEvent({ name: 'b2b', value: this.b2b - 1, text: `B2B ×${this.b2b - 1}` });
        if (this.combo > 1)
            this.onEvent({ name: 'combo', value: this.combo, text: `COMBO ×${this.combo}` });
        let feverGain = [0, 8, 18, 28, 45][n] + (spin === 2 ? 30 : spin === 1 ? 10 : 0) + Math.min(30, 5 * (this.combo - 1));
        if (difficult && this.b2b > 1)
            feverGain += 10;
        if (this.grid.every(row => row.every(cell => !cell))) {
            const bonus = 2000 * this.level * mult;
            this.score += bonus;
            this.perfects++;
            feverGain += 100;
            this.onEvent({ name: 'perfect', value: bonus, text: 'TUDO LIMPO!' });
        }
        this.addFever(feverGain);
        const nextLevel = Math.floor(this.lines / 10) + 1;
        if (nextLevel > this.level) {
            this.level = nextLevel;
            this.onEvent({ name: 'level', value: this.level, text: `NÍVEL ${this.level}` });
        }
    }
    addFever(amount) {
        if (!this.feverEnabled || this.inFever || amount <= 0)
            return;
        this.feverMeter = Math.min(100, this.feverMeter + amount);
        if (this.feverMeter >= 100) {
            this.feverMeter = 0;
            this.feverMs = FEVER_MS;
            this.fevers++;
            this.onEvent({ name: 'fever', value: this.fevers, text: 'FRENESI ×2' });
        }
    }
    // Regra dos 3 cantos: T-spin se os 2 cantos da frente estão ocupados;
    // mini se só 1 da frente (e os 2 de trás), a não ser que o giro tenha usado o 5º kick.
    tspinKind(p) {
        if (p.type !== 'T' || !this.lastActionRotate)
            return 0;
        const cx = p.x + 1, cy = p.y + 1;
        const filled = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!this.grid[y][x]);
        const tl = filled(cx - 1, cy - 1), tr = filled(cx + 1, cy - 1), bl = filled(cx - 1, cy + 1), br = filled(cx + 1, cy + 1);
        if (tl + tr + bl + br < 3)
            return 0;
        const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.rotation];
        if (front[0] && front[1])
            return 2;
        return this.lastKickIndex === 4 && !this.last180 ? 2 : 1;
    }
    evaluateFinesse(p) {
        // Peças que usaram soft drop (encaixes, spins) não têm caminho "pelo alto", então não entram na conta.
        if (this.pieceSoft)
            return;
        const ideal = finesseTable(p.type).get(placementSig(p.type, p.rotation, p.x));
        if (ideal == null)
            return;
        this.finEval++;
        if (this.pieceInputs > ideal) {
            this.finFaults++;
            this.onEvent({ name: 'finesse', value: this.pieceInputs - ideal });
        }
    }
    finesse() {
        if (!this.finEval)
            return 100;
        return ((this.finEval - this.finFaults) / this.finEval) * 100;
    }
    // Curva de velocidade padrão do gênero: (0,8 − (nível − 1) × 0,007) ^ (nível − 1) segundos por linha.
    dropInterval() {
        if (this.mode === 'sprint' || this.mode === 'daily')
            return 1000;
        const level = Math.min(this.level, 15);
        return Math.max(7, 1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1));
    }
    updateDanger() {
        const next = this.grid.slice(0, 5).some(r => r.some(Boolean));
        if (next !== this.danger) {
            this.danger = next;
            this.onEvent({ name: 'danger', value: next ? 1 : 0 });
        }
    }
    gameOver() {
        this.state = 'over';
        this.current = null;
        this.resetInput();
        this.onEvent({ name: 'gameover' });
    }
    complete() {
        this.state = 'complete';
        this.current = null;
        this.resetInput();
        this.onEvent({ name: 'complete' });
    }
}

export { COLS, ROWS, TICK_MS, LOCK_DELAY, MAX_LOCK_RESETS, LINE_CLEAR_DELAY, COUNT_STEP, COUNTDOWN_MS, FEVER_MS, ACTIONS, RELEASABLE, DEFAULT_HANDLING, placementSig, finesseTable, Game };
