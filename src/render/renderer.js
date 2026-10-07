import { matrixFor } from '../core/pieces.js';
import { COLS, COUNT_STEP, LINE_CLEAR_DELAY, LOCK_DELAY, ROWS } from '../core/game.js';
import { SKINS, blockLook, mix, rgba } from '../theme/skins.js';

const CELL = 30;
const W = COLS * CELL, H = ROWS * CELL;
const PIXEL_FONT = '"Pixelify Sans", "Courier New", monospace';

class Renderer {
    particles = [];
    trails = [];
    lockFlash = null;
    clearFx = null;
    flash = 0;
    flashColor = '#ffffff';
    shake = 0;
    shakeX = 0;
    shakeY = 0;
    sheen = 0;
    curtain = -1;
    sprites = new Map();
    skin = SKINS.classic;
    opts = { shake: true, effects: 'full', ghost: true };
    constructor(board, hold, next, mini) {
        this.board = board;
        this.hold = hold;
        this.next = next;
        this.mini = mini;
        this.resize();
    }
    fit(canvas, w, h) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.imageSmoothingEnabled = false;
        return g;
    }
    resize() {
        this.ctx = this.fit(this.board, W, H);
        this.holdCtx = this.fit(this.hold, 120, 84);
        this.nextCtx = this.fit(this.next, 120, 318);
        this.miniCtx = this.mini ? this.fit(this.mini, 360, 56) : null;
        this.sprites.clear();
    }
    setSkin(skin) {
        this.skin = skin;
        this.sprites.clear();
        this.particles = [];
        this.trails = [];
    }
    setOptions(opts) { this.opts = { ...this.opts, ...opts }; }
    get full() { return this.opts.effects === 'full'; }

    // ---- blocos (cada variação é desenhada uma vez e reaproveitada) ----
    sprite(type, level, size) {
        const look = type === 'dead' ? { color: this.skin.dead, variant: this.skin.style === 'gb' ? 'Z' : 'base', key: 'dead' } : blockLook(this.skin, type, level);
        const key = `${this.skin.id}|${look.key}|${look.variant}|${size}`;
        let s = this.sprites.get(key);
        if (s)
            return s;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        s = document.createElement('canvas');
        s.width = s.height = Math.ceil(size * dpr);
        const g = s.getContext('2d');
        g.scale(dpr, dpr);
        this.paintBlock(g, look, size);
        this.sprites.set(key, s);
        return s;
    }
    paintBlock(g, look, s) {
        const style = this.skin.style, c = look.color;
        if (style === 'bevel') {
            const b = Math.max(2, Math.round(s * .15));
            g.fillStyle = c;
            g.fillRect(0, 0, s, s);
            const poly = (pts, color) => { g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
            poly([[0, 0], [s, 0], [s - b, b], [b, b]], mix(c, '#ffffff', .5));
            poly([[0, 0], [b, b], [b, s - b], [0, s]], mix(c, '#ffffff', .25));
            poly([[s, 0], [s, s], [s - b, s - b], [s - b, b]], mix(c, '#000000', .28));
            poly([[0, s], [s, s], [s - b, s - b], [b, s - b]], mix(c, '#000000', .45));
            const face = g.createLinearGradient(0, b, 0, s - b);
            face.addColorStop(0, mix(c, '#ffffff', .12));
            face.addColorStop(1, mix(c, '#000000', .06));
            g.fillStyle = face;
            g.fillRect(b, b, s - 2 * b, s - 2 * b);
            g.fillStyle = 'rgba(255,255,255,.6)';
            g.fillRect(b + 1, b + 1, Math.max(2, s * .2), Math.max(1, s * .08));
            g.strokeStyle = mix(c, '#000000', .6);
            g.lineWidth = 1;
            g.strokeRect(.5, .5, s - 1, s - 1);
        }
        else if (style === 'nes') {
            const i = Math.max(1, Math.round(s / 15));
            g.fillStyle = c;
            g.fillRect(i, i, s - 2 * i, s - 2 * i);
            const px = (s - 2 * i) / 8;
            g.fillStyle = '#FCFCFC';
            if (look.variant === 'hollow') {
                g.fillRect(i + px, i + px, px, px);
                g.fillRect(i + 2 * px, i + 2 * px, px * 4, px * 4);
            }
            else {
                g.fillRect(i + px, i + px, px, px);
                g.fillRect(i + 2 * px, i + 2 * px, px, px);
                g.fillRect(i + 2 * px, i + 3 * px, px, px);
                g.fillRect(i + 3 * px, i + 2 * px, px, px);
            }
        }
        else if (style === 'gb') {
            const [d0, d1, d2, d3] = this.skin.shades;
            const u = s / 8;
            g.fillStyle = d0;
            g.fillRect(0, 0, s, s);
            const fill = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x * u, y * u, w * u, h * u); };
            switch (look.variant) {
                case 'I': fill(1, 1, 6, 6, d1); fill(1, 3, 6, 2, d2); break;
                case 'O': fill(1, 1, 6, 6, d3); fill(2, 2, 4, 4, d0); fill(3, 3, 2, 2, d2); break;
                case 'T': fill(1, 1, 6, 6, d1); fill(3, 3, 2, 2, d3); break;
                case 'S': fill(1, 1, 6, 6, d2); fill(2, 2, 4, 4, d1); break;
                case 'Z': fill(1, 1, 6, 6, d1); fill(2, 2, 4, 4, d0); break;
                case 'J': fill(1, 1, 6, 6, d2); fill(1, 1, 6, 1, d3); fill(1, 1, 1, 6, d3); break;
                default: fill(1, 1, 6, 6, d3); fill(2, 2, 4, 4, d2); fill(3, 3, 2, 2, d0); break;
            }
        }
        else {
            const r = s * .24, i = 1.5;
            const path = () => { g.beginPath(); g.roundRect(i, i, s - 2 * i, s - 2 * i, r); };
            const grad = g.createLinearGradient(0, 0, 0, s);
            grad.addColorStop(0, mix(c, '#ffffff', .35));
            grad.addColorStop(1, mix(c, '#000000', .08));
            path();
            g.fillStyle = grad;
            g.fill();
            g.lineWidth = 1.5;
            g.strokeStyle = mix(c, '#000000', .22);
            g.stroke();
            g.fillStyle = 'rgba(255,255,255,.65)';
            g.beginPath();
            g.ellipse(s * .36, s * .3, s * .17, s * .09, -.5, 0, Math.PI * 2);
            g.fill();
        }
    }
    cell(g, type, x, y, size, level, alpha = 1) {
        const sp = this.sprite(type, level, size);
        if (alpha !== 1)
            g.globalAlpha = alpha;
        g.drawImage(sp, x, y, size, size);
        if (alpha !== 1)
            g.globalAlpha = 1;
    }
    ghostCell(g, type, x, y, level) {
        const { color } = blockLook(this.skin, type, level);
        const ink = this.skin.style === 'gb' ? this.skin.shades[0] : color;
        g.fillStyle = rgba(ink, this.skin.ghost * .55);
        g.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        g.strokeStyle = rgba(ink, .75);
        g.lineWidth = 2;
        if (this.skin.style === 'gb')
            g.setLineDash([3, 3]);
        g.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
        g.setLineDash([]);
    }

    // ---- reações a eventos do jogo ----
    trigger(e, game) {
        const full = this.full;
        if (e.name === 'lock')
            this.lockFlash = { cells: e.cells, t: .16 };
        if (e.name === 'hardDrop' && e.cells) {
            const cols = new Map();
            for (const [x, y] of e.cells)
                cols.set(x, Math.min(cols.get(x) ?? 99, y));
            for (const [x, top] of cols)
                this.trails.push({ x, y0: Math.max(0, top - e.value), y1: top, t: .22, type: e.type, level: game.level });
            this.kick(Math.min(6, 2 + e.value * .2));
            if (full)
                for (const [x, y] of e.cells)
                    this.emit((x + .5) * CELL, (y + 1) * CELL, blockLook(this.skin, e.type, game.level).color, 2, 1.2, 0);
        }
        if (e.name === 'clear') {
            this.clearFx = { rows: e.rows.slice(), n: e.rows.length };
            const per = full ? 3 : 1;
            for (const row of e.rows)
                for (let x = 0; x < COLS; x++) {
                    const type = game.grid[row]?.[x];
                    if (!type)
                        continue;
                    const delay = Math.abs(x + .5 - COLS / 2) / (COLS / 2) * (LINE_CLEAR_DELAY / 1000);
                    this.emit((x + .5) * CELL, (row + .5) * CELL, blockLook(this.skin, type, game.level).color, per, 2.2 + e.rows.length * .5, delay);
                }
            this.kick(1.5 + e.rows.length);
        }
        if (e.name === 'quad' || e.name === 'perfect') {
            this.flash = e.name === 'perfect' ? .6 : .36;
            this.flashColor = '#ffffff';
            this.kick(e.name === 'perfect' ? 12 : 8);
        }
        if (e.name === 'tspin' && e.value > 0) {
            this.flash = .2;
            this.flashColor = blockLook(this.skin, 'T', game.level).color;
            this.kick(6);
        }
        if (e.name === 'fever')
            this.sheen = 1;
        if (e.name === 'gameover')
            this.curtain = 0;
        if (e.name === 'go')
            this.curtain = -1;
    }
    kick(amount) {
        if (this.opts.shake)
            this.shake = Math.max(this.shake, amount);
    }
    emit(x, y, color, count, power, delay) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (60 + Math.random() * 140) * power;
            this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * power, life: 0, max: .55 + Math.random() * .45, size: 3 + Math.random() * 5, color, delay });
        }
        if (this.particles.length > 900)
            this.particles.splice(0, this.particles.length - 900);
    }
    update(dt) {
        const s = dt / 1000;
        for (const p of this.particles) {
            if (p.delay > 0) {
                p.delay -= s;
                continue;
            }
            p.life += s;
            p.vy += 900 * s;
            p.x += p.vx * s;
            p.y += p.vy * s;
        }
        this.particles = this.particles.filter(p => p.life < p.max);
        for (const t of this.trails)
            t.t -= s;
        this.trails = this.trails.filter(t => t.t > 0);
        if (this.lockFlash) {
            this.lockFlash.t -= s;
            if (this.lockFlash.t <= 0)
                this.lockFlash = null;
        }
        this.flash = Math.max(0, this.flash - s);
        this.sheen = Math.max(0, this.sheen - s * .8);
        this.shake = Math.max(0, this.shake - s * 40);
        this.shakeX = this.shake ? (Math.random() - .5) * this.shake : 0;
        this.shakeY = this.shake ? (Math.random() - .5) * this.shake * .7 : 0;
        if (this.curtain >= 0 && this.curtain < 1)
            this.curtain = Math.min(1, this.curtain + s / .8);
    }

    // ---- quadro ----
    render(game, dt) {
        this.update(dt);
        const g = this.ctx, sk = this.skin, lvl = game.level;
        g.fillStyle = sk.well;
        g.fillRect(0, 0, W, H);
        if (sk.grid !== 'rgba(255,255,255,0)') {
            g.strokeStyle = sk.grid;
            g.lineWidth = 1;
            g.beginPath();
            for (let x = 1; x < COLS; x++) {
                g.moveTo(x * CELL + .5, 0);
                g.lineTo(x * CELL + .5, H);
            }
            for (let y = 1; y < ROWS; y++) {
                g.moveTo(0, y * CELL + .5);
                g.lineTo(W, y * CELL + .5);
            }
            g.stroke();
        }
        const playing = game.isActive() || game.state === 'paused';
        if (game.danger && playing && game.state !== 'paused') {
            const pulse = .07 + .05 * Math.sin(performance.now() / 160);
            g.fillStyle = `rgba(255,40,60,${pulse.toFixed(3)})`;
            g.fillRect(0, 0, W, H);
        }
        // blocos travados
        for (let y = 0; y < ROWS; y++)
            for (let x = 0; x < COLS; x++) {
                const t = game.grid[y][x];
                if (t)
                    this.cell(g, t, x * CELL, y * CELL, CELL, lvl);
            }
        // limpeza de linha: os blocos somem do centro para as bordas
        if (game.state === 'clearing' && game.clearRows.length) {
            const p = 1 - Math.max(0, game.clearTimer) / LINE_CLEAR_DELAY;
            for (const row of game.clearRows) {
                const flashA = Math.max(0, .85 - p * 1.6);
                if (flashA > 0) {
                    g.fillStyle = `rgba(255,255,255,${flashA.toFixed(3)})`;
                    g.fillRect(0, row * CELL, W, CELL);
                }
                for (let x = 0; x < COLS; x++)
                    if (Math.abs(x + .5 - COLS / 2) < p * (COLS / 2 + .6)) {
                        g.fillStyle = sk.well;
                        g.fillRect(x * CELL, row * CELL, CELL, CELL);
                    }
            }
        }
        // rastro da queda rápida
        for (const t of this.trails) {
            const { color } = blockLook(sk, t.type, t.level);
            const grad = g.createLinearGradient(0, t.y0 * CELL, 0, t.y1 * CELL);
            grad.addColorStop(0, rgba(color, 0));
            grad.addColorStop(1, rgba(color, .45 * (t.t / .22)));
            g.fillStyle = grad;
            g.fillRect(t.x * CELL + 3, t.y0 * CELL, CELL - 6, (t.y1 - t.y0) * CELL);
        }
        // fantasma e peça atual
        if (game.current && game.state === 'playing') {
            const p = game.current;
            if (this.opts.ghost) {
                const gy = game.ghostY();
                if (gy !== p.y)
                    for (let y = 0; y < p.matrix.length; y++)
                        for (let x = 0; x < p.matrix[y].length; x++)
                            if (p.matrix[y][x] && gy + y >= 0)
                                this.ghostCell(g, p.type, (p.x + x) * CELL, (gy + y) * CELL, lvl);
            }
            const lockT = game.lockAcc > 0 && game.isGrounded() ? Math.min(1, game.lockAcc / LOCK_DELAY) : 0;
            for (let y = 0; y < p.matrix.length; y++)
                for (let x = 0; x < p.matrix[y].length; x++)
                    if (p.matrix[y][x] && p.y + y >= 0) {
                        const px = (p.x + x) * CELL, py = (p.y + y) * CELL;
                        this.cell(g, p.type, px, py, CELL, lvl);
                        if (lockT) {
                            g.fillStyle = `rgba(0,0,0,${(lockT * .4).toFixed(3)})`;
                            g.fillRect(px, py, CELL, CELL);
                        }
                    }
        }
        // brilho dos blocos que acabaram de travar
        if (this.lockFlash) {
            g.fillStyle = `rgba(255,255,255,${(this.lockFlash.t / .16 * .5).toFixed(3)})`;
            for (const [x, y] of this.lockFlash.cells)
                if (y >= 0)
                    g.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
        // partículas (quadradinhos, no estilo pixel)
        for (const p of this.particles) {
            if (p.delay > 0)
                continue;
            g.globalAlpha = Math.max(0, 1 - p.life / p.max);
            g.fillStyle = p.color;
            g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
        }
        g.globalAlpha = 1;
        // frenesi: uma faixa de brilho atravessa o poço
        if (game.inFever && game.state !== 'paused') {
            const now = performance.now() / 1000;
            const x = ((now * 260) % (W + 260)) - 130;
            const band = g.createLinearGradient(x - 70, 0, x + 70, H);
            band.addColorStop(0, 'rgba(255,255,255,0)');
            band.addColorStop(.5, `rgba(255,255,255,${(.09 + this.sheen * .25).toFixed(3)})`);
            band.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = band;
            g.fillRect(0, 0, W, H);
        }
        // a quadra faz a tela piscar, como no clássico
        if (this.flash > 0 && this.full) {
            if (Math.floor(this.flash / .06) % 2 === 0) {
                g.fillStyle = rgba(this.flashColor, .5);
                g.fillRect(0, 0, W, H);
            }
        }
        // fim de jogo: uma cortina de blocos sobe de baixo para cima
        if (this.curtain >= 0 && (game.state === 'over')) {
            const rows = Math.floor(this.curtain * ROWS);
            for (let y = ROWS - 1; y >= ROWS - rows; y--)
                for (let x = 0; x < COLS; x++)
                    this.cell(g, 'dead', x * CELL, y * CELL, CELL, lvl);
        }
        if (game.state === 'countdown')
            this.drawCountdown(g, game);
        this.drawSide(game);
    }
    drawCountdown(g, game) {
        const n = Math.max(1, Math.ceil(game.countdownMs / COUNT_STEP));
        const f = Math.max(0, Math.min(1, (game.countdownMs - (n - 1) * COUNT_STEP) / COUNT_STEP));
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 ${Math.round(110 + 40 * (1 - f))}px ${PIXEL_FONT}`;
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(0,0,0,.75)';
        g.globalAlpha = .35 + .65 * f;
        g.strokeText(String(n), W / 2, H * .42);
        g.fillStyle = this.skin.page.accent;
        g.fillText(String(n), W / 2, H * .42);
        g.restore();
    }
    // ---- reserva e próximas ----
    drawPiece(g, type, cx, cy, size, level, alpha = 1) {
        const m = matrixFor(type, 0);
        let minX = 9, maxX = -1, minY = 9, maxY = -1;
        m.forEach((row, y) => row.forEach((v, x) => { if (v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }));
        const w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
        m.forEach((row, y) => row.forEach((v, x) => {
            if (v)
                this.cell(g, type, Math.round(cx - w / 2 + (x - minX) * size), Math.round(cy - h / 2 + (y - minY) * size), size, level, alpha);
        }));
    }
    drawSide(game) {
        const lvl = game.level;
        const h = this.holdCtx;
        h.clearRect(0, 0, 120, 84);
        if (game.hold)
            this.drawPiece(h, game.hold, 60, 42, 22, lvl, game.canHold ? 1 : .3);
        const n = this.nextCtx;
        n.clearRect(0, 0, 120, 318);
        const ys = [44, 118, 180, 238, 292];
        for (let i = 0; i < 5 && i < game.queue.length; i++)
            this.drawPiece(n, game.queue[i], 60, ys[i], i === 0 ? 24 : 17, lvl, i === 0 ? 1 : .8);
        const m = this.miniCtx;
        if (m && this.mini.offsetParent !== null) {
            m.clearRect(0, 0, 360, 56);
            if (game.hold)
                this.drawPiece(m, game.hold, 34, 28, 13, lvl, game.canHold ? 1 : .3);
            for (let i = 0; i < 4 && i < game.queue.length; i++)
                this.drawPiece(m, game.queue[i], 128 + i * 66, 28, i === 0 ? 14 : 11, lvl, i === 0 ? 1 : .75);
        }
    }
    // Miniatura usada nos cartões de visual.
    paintPreview(canvas, skin) {
        const g = this.fit(canvas, 120, 60);
        const prev = this.skin;
        this.skin = skin;
        g.fillStyle = skin.well;
        g.fillRect(0, 0, 120, 60);
        const cells = [['L', 0, 3], ['L', 1, 3], ['L', 2, 3], ['L', 2, 2], ['O', 3, 2], ['O', 4, 2], ['O', 3, 3], ['O', 4, 3], ['T', 5, 3], ['T', 6, 3], ['T', 7, 3], ['T', 6, 2], ['I', 0, 1], ['I', 1, 1], ['I', 2, 1], ['I', 3, 1], ['S', 7, 1], ['S', 8, 1], ['S', 6, 2]];
        for (const [t, x, y] of cells)
            this.cell(g, t, 6 + x * 12, 6 + y * 12, 12, 1);
        this.skin = prev;
    }
}

export { Renderer };
