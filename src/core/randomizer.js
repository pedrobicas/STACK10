function hashSeed(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
class BagRandomizer {
    seed;
    bag = [];
    rng;
    constructor(seed) {
        this.seed = seed;
        this.rng = mulberry32(seed);
    }
    next() {
        if (!this.bag.length)
            this.refill();
        return this.bag.pop();
    }
    refill() {
        this.bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
    }
}
function randomSeed() {
    try {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0];
    }
    catch {
        return (Math.random() * 0xffffffff) >>> 0;
    }
}
function dailySeed(date = new Date()) {
    const key = `stack10:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return hashSeed(key);
}

export { hashSeed, mulberry32, BagRandomizer, randomSeed, dailySeed };
