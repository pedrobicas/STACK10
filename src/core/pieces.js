const BASE = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
};
function rotateMatrix(m, dir) {
    const n = m.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
            if (dir === 1)
                r[x][n - 1 - y] = m[y][x];
            else
                r[n - 1 - x][y] = m[y][x];
        }
    return r;
}
const ROTATIONS = {};
Object.keys(BASE).forEach(type => {
    if (type === 'O') {
        ROTATIONS[type] = [BASE[type], BASE[type], BASE[type], BASE[type]].map(m => m.map(r => r.slice()));
        return;
    }
    const arr = [BASE[type].map(r => r.slice())];
    for (let i = 1; i < 4; i++)
        arr.push(rotateMatrix(arr[i - 1], 1));
    ROTATIONS[type] = arr;
});
function matrixFor(type, rotation) {
    return ROTATIONS[type][((rotation % 4) + 4) % 4].map(r => r.slice());
}
function spawnX(type) {
    return type === 'O' ? 4 : 3;
}
function spawnY(type) {
    return type === 'I' ? -1 : 0;
}
// Super Rotation System wall kicks, converted to canvas coordinates (positive Y = down).
const JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
const IKICKS = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};
function kickTests(type, from, to) {
    if (type === 'O')
        return [[0, 0]];
    const key = `${from}>${to}`;
    return (type === 'I' ? IKICKS : JLSTZ)[key] ?? [[0, 0]];
}

export { BASE, ROTATIONS, matrixFor, spawnX, spawnY, kickTests };
