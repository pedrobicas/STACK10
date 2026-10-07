class Confetti {
    parts = [];
    running = false;
    constructor(canvas) {
        this.canvas = canvas;
        this.g = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.w = innerWidth;
        this.h = innerHeight;
        this.canvas.width = this.w * dpr;
        this.canvas.height = this.h * dpr;
        this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    burst(x, y, count, colors, power = 1) {
        for (let i = 0; i < count; i++) {
            const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.1;
            const sp = (300 + Math.random() * 500) * power;
            this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - .5) * 12,
                w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, color: colors[i % colors.length], life: 0, max: 1.6 + Math.random() * 1.2 });
        }
        this.start();
    }
    rain(count, colors) {
        for (let i = 0; i < count; i++)
            this.parts.push({ x: Math.random() * this.w, y: -20 - Math.random() * this.h * .4, vx: (Math.random() - .5) * 80, vy: 80 + Math.random() * 160,
                r: Math.random() * 6, vr: (Math.random() - .5) * 10, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, color: colors[i % colors.length], life: 0, max: 3 + Math.random() * 1.5 });
        this.start();
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        let last = performance.now();
        const step = now => {
            const s = Math.min(.05, (now - last) / 1000);
            last = now;
            this.g.clearRect(0, 0, this.w, this.h);
            for (const p of this.parts) {
                p.life += s;
                p.vy += 700 * s;
                p.vx *= 1 - 1.4 * s;
                p.vy = Math.min(p.vy, 420);
                p.x += p.vx * s;
                p.y += p.vy * s;
                p.r += p.vr * s;
                this.g.save();
                this.g.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) * 2));
                this.g.translate(p.x, p.y);
                this.g.rotate(p.r);
                this.g.fillStyle = p.color;
                this.g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 1.7)), p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 1);
                this.g.restore();
            }
            this.parts = this.parts.filter(p => p.life < p.max && p.y < this.h + 40);
            if (this.parts.length)
                requestAnimationFrame(step);
            else {
                this.running = false;
                this.g.clearRect(0, 0, this.w, this.h);
            }
        };
        requestAnimationFrame(step);
    }
}


export { Confetti };
