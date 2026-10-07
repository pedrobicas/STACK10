// Cada visual define as cores das peças, o estilo do bloco e a paleta da página.
// "unlock" é o nível de jogador que libera o visual.
const NES_PALETTES = [
    ['#0058F8', '#3CBCFC'], ['#00A800', '#B8F818'], ['#D800CC', '#F878F8'], ['#0058F8', '#58D854'],
    ['#E40058', '#58F898'], ['#58F898', '#6888FC'], ['#F83800', '#7C7C7C'], ['#6844FC', '#A80020'],
    ['#0058F8', '#F83800'], ['#F83800', '#FCA044']
];
const SKINS = {
    classic: {
        id: 'classic', name: 'Clássico', unlock: 1, style: 'bevel',
        desc: 'As cores de sempre, com blocos em relevo.',
        colors: { I: '#1FC8F0', O: '#F7D21B', T: '#A23DE8', S: '#3CC43C', Z: '#EE3540', J: '#2B5BE6', L: '#F7881E' },
        well: '#080B24', grid: 'rgba(140,160,255,.07)', ghost: .22, dead: '#5A5F7A',
        page: {
            bg: '#1C2675', bg2: '#0D1240', wallLight: '#C4C8DA', wallMid: '#9196B0', wallDark: '#535873', mortar: '#2B2F4A',
            panel: '#080B24', panelLine: '#D2D5E4', ink: '#FFFFFF', muted: '#A3ACDE', accent: '#F7D21B', accentInk: '#241A00', accentDark: '#A98400'
        }
    },
    nes: {
        id: 'nes', name: '8 bits', unlock: 3, style: 'nes',
        desc: 'Fundo preto e paleta que muda de cor a cada nível.',
        colors: { I: '#0058F8', O: '#0058F8', T: '#0058F8', S: '#3CBCFC', Z: '#0058F8', J: '#3CBCFC', L: '#0058F8' },
        well: '#000000', grid: 'rgba(255,255,255,0)', ghost: .18, dead: '#7C7C7C',
        page: {
            bg: '#3A3A3A', bg2: '#1E1E1E', wallLight: '#BCBCBC', wallMid: '#7C7C7C', wallDark: '#4A4A4A', mortar: '#000000',
            panel: '#000000', panelLine: '#FCFCFC', ink: '#FCFCFC', muted: '#BCBCBC', accent: '#F83800', accentInk: '#FCFCFC', accentDark: '#A81000'
        }
    },
    pocket: {
        id: 'pocket', name: 'Portátil', unlock: 5, style: 'gb',
        desc: 'Quatro tons de verde, como as telinhas de bolso.',
        shades: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'],
        colors: { I: '#306230', O: '#0F380F', T: '#306230', S: '#8BAC0F', Z: '#0F380F', J: '#306230', L: '#8BAC0F' },
        well: '#9BBC0F', grid: 'rgba(15,56,15,.07)', ghost: .25, dead: '#306230',
        page: {
            bg: '#C4CFA1', bg2: '#8B956D', wallLight: '#E0E8C0', wallMid: '#8BAC0F', wallDark: '#306230', mortar: '#0F380F',
            panel: '#9BBC0F', panelLine: '#0F380F', ink: '#0F380F', muted: '#306230', accent: '#306230', accentInk: '#E0F8D0', accentDark: '#0F380F'
        }
    },
    candy: {
        id: 'candy', name: 'Algodão-doce', unlock: 8, style: 'soft',
        desc: 'Tons pastel e blocos arredondados.',
        colors: { I: '#7FD6F5', O: '#FFE07A', T: '#C9A2F7', S: '#9BE3A6', Z: '#FF9CB3', J: '#8EA8FF', L: '#FFBE85' },
        well: '#FFF6FB', grid: 'rgba(200,140,180,.12)', ghost: .3, dead: '#D8C6D9',
        page: {
            bg: '#FFD9EA', bg2: '#C9C3FF', wallLight: '#FFFFFF', wallMid: '#F6C6DE', wallDark: '#D99BBE', mortar: '#B7709A',
            panel: '#FFF6FB', panelLine: '#B7709A', ink: '#5A2D4D', muted: '#9A6A8C', accent: '#FF7FA8', accentInk: '#FFFFFF', accentDark: '#D4507E'
        }
    }
};
const SKIN_ORDER = ['classic', 'nes', 'pocket', 'candy'];

function hexRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex, other, t) {
    const a = hexRgb(hex), b = hexRgb(other);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function rgba(hex, alpha) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
}
// Cor e variante de um bloco. No visual "8 bits" a paleta troca a cada nível.
function blockLook(skin, type, level = 1) {
    if (skin.style === 'nes') {
        const [c1, c2] = NES_PALETTES[(Math.max(1, level) - 1) % NES_PALETTES.length];
        if (type === 'I' || type === 'O' || type === 'T')
            return { color: c1, variant: 'hollow', key: `${c1}h` };
        return { color: type === 'J' || type === 'S' ? c2 : c1, variant: 'solid', key: `${type === 'J' || type === 'S' ? c2 : c1}s` };
    }
    if (skin.style === 'gb')
        return { color: skin.colors[type], variant: type, key: type };
    return { color: skin.colors[type], variant: 'base', key: skin.colors[type] };
}
// Padrões de fundo gerados em SVG com as cores do visual (tijolos da moldura e papel de parede de peças).
function svgUrl(svg) { return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`; }
function brickPattern(p) {
    const w = 32, h = 16;
    const brick = (x, y, bw) => `<rect x="${x + 1}" y="${y + 1}" width="${bw - 2}" height="6" fill="${p.wallMid}"/>`
        + `<rect x="${x + 1}" y="${y + 1}" width="${bw - 2}" height="1.5" fill="${p.wallLight}"/>`
        + `<rect x="${x + 1}" y="${y + 1}" width="1.5" height="6" fill="${p.wallLight}"/>`
        + `<rect x="${x + 1}" y="${y + 5.5}" width="${bw - 2}" height="1.5" fill="${p.wallDark}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${p.mortar}"/>`
        + brick(0, 0, 16) + brick(16, 0, 16) + brick(-8, 8, 16) + brick(8, 8, 16) + brick(24, 8, 16) + `</svg>`;
    return svgUrl(svg);
}
function wallpaperPattern(p) {
    const c = rgba(p.ink, .045);
    const cells = [[0, 0], [1, 0], [2, 0], [1, 1], [6, 2], [6, 3], [7, 3], [7, 4], [2, 5], [3, 5], [2, 6], [3, 6], [8, 7], [9, 7], [10, 7], [11, 7], [5, 9], [5, 10], [5, 11], [6, 11], [11, 1], [11, 2], [10, 2], [10, 3]];
    const s = 12;
    const rects = cells.map(([x, y]) => `<rect x="${x * s + 1}" y="${y * s + 1}" width="${s - 2}" height="${s - 2}" rx="1.5" fill="${c}"/>`).join('');
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${12 * s}" height="${12 * s}">${rects}</svg>`);
}
function applySkinToPage(skin) {
    const p = skin.page, st = document.documentElement.style;
    const vars = { bg: p.bg, bg2: p.bg2, 'wall-light': p.wallLight, 'wall-mid': p.wallMid, 'wall-dark': p.wallDark, mortar: p.mortar,
        panel: p.panel, 'panel-line': p.panelLine, ink: p.ink, muted: p.muted, accent: p.accent, 'accent-ink': p.accentInk, 'accent-dark': p.accentDark };
    for (const [k, v] of Object.entries(vars))
        st.setProperty(`--${k}`, v);
    st.setProperty('--bricks', brickPattern(p));
    st.setProperty('--wallpaper', wallpaperPattern(p));
    for (const [t, c] of Object.entries(skin.colors))
        st.setProperty(`--p-${t}`, c);
    document.documentElement.dataset.skin = skin.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg2);
}


export { SKINS, SKIN_ORDER, mix, rgba, blockLook, applySkinToPage };
