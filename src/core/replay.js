import { ACTIONS, RELEASABLE } from './game.js';

// Formato compacto: cabeçalho (versão, modo, seed, handling) + eventos [delta de passo, código].
// Códigos 0..7 = apertar ACTIONS[i]; 8..10 = soltar RELEASABLE[i - 8].
const REPLAY_VERSION = 2;
const MODE_IDS = ['marathon', 'sprint', 'ultra', 'daily'];
function encodeReplay(r) {
    const out = [];
    const varint = n => {
        n = Math.max(0, Math.floor(n));
        while (n >= 128) {
            out.push((n % 128) | 128);
            n = Math.floor(n / 128);
        }
        out.push(n);
    };
    out.push(REPLAY_VERSION, MODE_IDS.indexOf(r.mode));
    const s = r.seed >>> 0;
    out.push(s & 255, (s >>> 8) & 255, (s >>> 16) & 255, (s >>> 24) & 255);
    varint(r.handling.das);
    varint(r.handling.arr);
    varint(r.handling.sdf);
    varint(r.ticks);
    varint(r.events.length);
    let last = 0;
    for (const [t, c] of r.events) {
        varint(t - last);
        out.push(c);
        last = t;
    }
    let bin = '';
    for (const b of out)
        bin += String.fromCharCode(b);
    return 'S10.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeReplay(code) {
    let s = String(code).trim().replace(/^#?r=/, '').replace(/^S10\./, '').replace(/\s+/g, '');
    if (!s)
        throw new Error('O código está vazio.');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4)
        s += '=';
    let bin;
    try {
        bin = atob(s);
    }
    catch {
        throw new Error('Isso não parece um código de replay do STACK10.');
    }
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    let i = 0;
    const u8 = () => {
        if (i >= bytes.length)
            throw new Error('O código está incompleto.');
        return bytes[i++];
    };
    const varint = () => {
        let n = 0, mul = 1, b;
        do {
            b = u8();
            n += (b & 127) * mul;
            mul *= 128;
        } while (b & 128);
        return n;
    };
    const version = u8();
    if (version === 1)
        throw new Error('Esse replay é de uma versão antiga do jogo e não roda nesta.');
    if (version !== REPLAY_VERSION)
        throw new Error('Versão de replay desconhecida.');
    const mode = MODE_IDS[u8()];
    if (!mode)
        throw new Error('Modo de jogo desconhecido.');
    const seed = (u8() | (u8() << 8) | (u8() << 16) | (u8() << 24)) >>> 0;
    const handling = { das: varint(), arr: varint(), sdf: varint() };
    const ticks = varint();
    const count = varint();
    const events = [];
    let t = 0;
    for (let k = 0; k < count; k++) {
        t += varint();
        const c = u8();
        if (c > 10)
            throw new Error('O código tem um evento inválido.');
        events.push([t, c]);
    }
    return { mode, seed, handling, ticks, events };
}
function applyCode(game, code) {
    if (code < ACTIONS.length)
        game.press(ACTIONS[code]);
    else
        game.release(RELEASABLE[code - ACTIONS.length]);
}


export { REPLAY_VERSION, MODE_IDS, encodeReplay, decodeReplay, applyCode };
