// Efeitos sonoros sintetizados na hora e um sequenciador para a música.
// Tema original do STACK10: composição curta em Mi menor, criada para o projeto.
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
// [nota MIDI ou null para pausa, duração em colcheias]
const STACK10_THEME = [
    [76, 1], [79, 1], [83, 2], [81, 1], [79, 1], [76, 2],
    [74, 1], [76, 1], [79, 2], [83, 1], [86, 1], [83, 2],
    [81, 1], [79, 1], [76, 1], [74, 1], [71, 2], [74, 2],
    [76, 1], [79, 1], [83, 1], [88, 1], [86, 2], [83, 2],
    [79, 1], [81, 1], [83, 2], [79, 1], [76, 1], [74, 2],
    [71, 1], [74, 1], [76, 2], [79, 2], [76, 1], [74, 1],
    [71, 2], [null, 1], [71, 1], [76, 2]
];
const BASS_ROOTS = [40, 43, 45, 47, 40, 38, 43, 35]; // uma tônica por compasso (8 colcheias)
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

class AudioEngine {
    ctx = null;
    sfxOn = true;
    musicOn = true;
    musicPlaying = false;
    step = 0;
    nextTime = 0;
    bpm = 144;
    targetBpm = 144;
    octave = 0;
    timer = null;
    melody = [];
    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended')
                void this.ctx.resume();
            return;
        }
        try {
            this.ctx = new AudioContext();
            this.master = this.ctx.createGain();
            this.master.gain.value = .8;
            this.master.connect(this.ctx.destination);
            this.sfx = this.ctx.createGain();
            this.sfx.gain.value = .9;
            this.sfx.connect(this.master);
            this.music = this.ctx.createGain();
            this.music.gain.value = .55;
            this.music.connect(this.master);
            // Desenrola a melodia numa grade de colcheias: cada passo diz se começa uma nota e quanto dura.
            this.melody = [];
            for (const [note, len] of STACK10_THEME) {
                this.melody.push({ note, len });
                for (let i = 1; i < len; i++)
                    this.melody.push(null);
            }
        }
        catch {
            this.ctx = null;
        }
    }
    setSfx(on) { this.sfxOn = on; }
    setMusic(on) {
        this.musicOn = on;
        if (!on)
            this.stopMusic();
    }
    // ---- síntese ----
    tone(freq, dur, type = 'square', vol = .05, delay = 0, slideTo = 0, bus = this.sfx) {
        if (!this.ctx)
            return;
        const t = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slideTo)
            o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + .005);
        g.gain.setValueAtTime(vol, t + dur * .6);
        g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + dur + .02);
    }
    noise(dur, vol, cutoff = 2000, delay = 0) {
        if (!this.ctx)
            return;
        const t = this.ctx.currentTime + delay;
        const len = Math.ceil(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(f).connect(g).connect(this.sfx);
        src.start(t);
    }
    arp(notes, gap, dur, type, vol, delay = 0) {
        notes.forEach((m, i) => this.tone(midiHz(m), dur, type, vol, delay + i * gap));
    }
    // ---- efeitos ----
    event(e) {
        if (!this.sfxOn || !this.ctx)
            return;
        switch (e.name) {
            case 'move':
                if (!e.auto)
                    this.tone(midiHz(84), .025, 'square', .018);
                break;
            case 'rotate':
                this.tone(midiHz(79), .04, 'square', .025, 0, midiHz(86));
                break;
            case 'hold':
                this.arp([72, 79], .04, .05, 'triangle', .05);
                break;
            case 'lock':
                this.tone(110, .06, 'triangle', .09);
                this.noise(.04, .05, 900);
                break;
            case 'hardDrop':
                this.noise(.09, .1, 1400);
                this.tone(220, .1, 'square', .04, 0, 70);
                break;
            case 'count':
                this.tone(midiHz(69), .08, 'square', .045);
                break;
            case 'go':
                this.arp([81, 88], .05, .12, 'square', .05);
                break;
            case 'line': {
                const sets = [[], [72, 76], [72, 76, 79], [72, 76, 79, 84]];
                this.arp(sets[e.value] || [72], .045, .09, 'square', .05);
                break;
            }
            case 'quad':
                this.arp([72, 76, 79, 84, 88, 91], .045, .12, 'square', .055);
                this.arp([48, 55, 60], .09, .2, 'triangle', .12);
                this.noise(.35, .08, 3500, .05);
                break;
            case 'tspin':
                this.arp([79, 83, 86, 91, 95], .035, .1, 'triangle', .07);
                this.tone(midiHz(103), .25, 'sine', .03, .2);
                break;
            case 'combo': {
                // Cada combo seguido toca uma nota mais aguda da escala: a recompensa sobe junto.
                const step = PENTA[Math.min(PENTA.length - 1, e.value - 2)];
                this.tone(midiHz(76 + step), .14, 'square', .05, .06);
                this.tone(midiHz(88 + step), .1, 'triangle', .03, .1);
                break;
            }
            case 'b2b':
                this.arp([91, 96], .05, .08, 'square', .035, .12);
                break;
            case 'perfect':
                this.arp([72, 76, 79, 84, 79, 84, 88, 96], .07, .16, 'square', .06);
                this.noise(.5, .09, 5000, .1);
                break;
            case 'level':
                this.arp([67, 72, 76, 79, 84], .06, .14, 'square', .05, .15);
                break;
            case 'fever':
                this.tone(160, .6, 'sawtooth', .05, 0, 1400);
                this.arp([84, 88, 91, 96], .06, .16, 'square', .055, .45);
                break;
            case 'feverEnd':
                this.tone(midiHz(84), .3, 'triangle', .05, 0, midiHz(60));
                break;
            case 'gameover':
                this.arp([76, 72, 69, 64, 60, 57], .11, .2, 'square', .05);
                break;
            case 'complete':
                this.arp([72, 76, 79, 84], .09, .2, 'square', .055);
                break;
        }
    }
    chime(kind) {
        if (!this.sfxOn)
            return;
        this.init();
        if (!this.ctx)
            return;
        if (kind === 'achievement') {
            this.arp([84, 91, 96], .07, .18, 'triangle', .07);
            this.tone(midiHz(103), .3, 'sine', .03, .21);
        }
        else if (kind === 'record')
            this.arp([72, 72, 72, 79, 84, 79, 84, 88], .09, .14, 'square', .055);
        else if (kind === 'levelup')
            this.arp([60, 64, 67, 72, 76, 79, 84], .06, .14, 'square', .055);
        else if (kind === 'xp')
            this.tone(midiHz(96), .03, 'square', .012);
        else if (kind === 'click')
            this.tone(midiHz(88), .03, 'square', .02);
    }
    // ---- música ----
    startMusic() {
        if (!this.musicOn || !this.ctx || this.musicPlaying)
            return;
        this.musicPlaying = true;
        this.step = 0;
        this.nextTime = this.ctx.currentTime + .08;
        this.timer = setInterval(() => this.schedule(), 25);
    }
    stopMusic() {
        this.musicPlaying = false;
        clearInterval(this.timer);
        this.timer = null;
    }
    schedule() {
        if (!this.ctx)
            return;
        // A cada passo o andamento se aproxima do alvo: acelera aos poucos quando a pilha sobe.
        while (this.nextTime < this.ctx.currentTime + .15) {
            this.bpm += (this.targetBpm - this.bpm) * .25;
            const eighth = 60 / this.bpm / 2;
            const i = this.step % this.melody.length;
            const ev = this.melody[i];
            const delay = Math.max(0, this.nextTime - this.ctx.currentTime);
            if (ev && ev.note)
                this.tone(midiHz(ev.note + this.octave), eighth * ev.len * .92, 'square', .045, delay, 0, this.music);
            const bar = Math.floor(i / 8) % BASS_ROOTS.length;
            const root = BASS_ROOTS[bar] + (i % 2 ? 12 : 0);
            this.tone(midiHz(root), eighth * .85, 'triangle', .11, delay, 0, this.music);
            if (this.octave && i % 2 === 0)
                this.noise(.03, .025, 6000, delay);
            this.step++;
            this.nextTime += eighth;
        }
    }
    // Chamado a cada quadro: decide se a música toca e em que andamento.
    update(game) {
        if (!this.ctx)
            return;
        const active = game.state === 'playing' || game.state === 'clearing' || game.state === 'countdown';
        if (active && this.musicOn && !this.musicPlaying && game.state !== 'countdown')
            this.startMusic();
        if (!active && this.musicPlaying)
            this.stopMusic();
        this.targetBpm = game.inFever ? 176 : game.danger ? 168 : 144;
        this.octave = game.inFever ? 12 : 0;
    }
}


export { AudioEngine, STACK10_THEME };
