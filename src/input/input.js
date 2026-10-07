// O teclado só traduz teclas em ações. DAS/ARR agora são calculados dentro do Game, por tick.
const DEFAULT_BINDINGS = {
    left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Space'],
    cw: ['ArrowUp', 'KeyX'], ccw: ['KeyZ'], r180: ['KeyA'], hold: ['KeyC', 'ShiftLeft'],
    pause: ['KeyP', 'Escape'], restart: ['KeyR']
};
const BINDING_ORDER = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold', 'pause', 'restart'];
const BINDING_LABELS = {
    left: 'Mover para a esquerda', right: 'Mover para a direita', soft: 'Descer mais rápido', hard: 'Soltar a peça', cw: 'Girar ↻',
    ccw: 'Girar ↺', r180: 'Girar 180°', hold: 'Guardar na reserva', pause: 'Pausar', restart: 'Recomeçar'
};
function keyName(code) {
    if (!code)
        return '—';
    const special = {
        ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Espaço', Escape: 'Esc', Enter: 'Enter',
        ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.', AltLeft: 'Alt', AltRight: 'Alt dir.',
        Tab: 'Tab', Backspace: 'Backspace', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']'
    };
    if (special[code])
        return special[code];
    if (code.startsWith('Key'))
        return code.slice(3);
    if (code.startsWith('Digit'))
        return code.slice(5);
    if (code.startsWith('Numpad'))
        return 'NUM ' + code.slice(6);
    return code.toUpperCase();
}
class KeyboardInput {
    app;
    down = new Set();
    constructor(app) {
        this.app = app;
        window.addEventListener('keydown', this.onKeyDown, { passive: false });
        window.addEventListener('keyup', this.onKeyUp, { passive: false });
        window.addEventListener('blur', this.releaseAll);
    }
    actionFor(code) {
        for (const action of BINDING_ORDER)
            if (this.app.bindings[action]?.includes(code))
                return action;
        return null;
    }
    onKeyDown = (e) => {
        if (this.app.captureBinding(e))
            return;
        if (document.querySelector('dialog[open]'))
            return;
        const action = this.actionFor(e.code);
        if (!action) {
            if (e.code === 'Enter' || e.code === 'NumpadEnter') {
                e.preventDefault();
                if (!e.repeat)
                    this.app.dispatch('start', true);
            }
            return;
        }
        e.preventDefault();
        if (e.repeat || this.down.has(e.code))
            return;
        this.down.add(e.code);
        this.app.dispatch(action, true);
    };
    onKeyUp = (e) => {
        if (!this.down.has(e.code))
            return;
        this.down.delete(e.code);
        const action = this.actionFor(e.code);
        if (action)
            this.app.dispatch(action, false);
    };
    releaseAll = () => {
        for (const code of this.down) {
            const action = this.actionFor(code);
            if (action)
                this.app.dispatch(action, false);
        }
        this.down.clear();
    };
}
// Controle padrão (layout "standard" da Gamepad API).
const PAD_MAP = { 14: 'left', 15: 'right', 13: 'soft', 12: 'hard', 0: 'cw', 1: 'ccw', 2: 'r180', 3: 'hold', 4: 'hold', 5: 'hold', 9: 'padstart', 8: 'restart' };
class GamepadInput {
    prev = {};
    poll(app) {
        if (!navigator.getGamepads)
            return;
        let pad = null;
        for (const p of navigator.getGamepads())
            if (p) {
                pad = p;
                break;
            }
        if (!pad)
            return;
        for (const [index, action] of Object.entries(PAD_MAP)) {
            const pressed = !!pad.buttons[index]?.pressed;
            if (pressed !== !!this.prev[index]) {
                this.prev[index] = pressed;
                app.dispatch(action, pressed);
            }
        }
    }
}


export { DEFAULT_BINDINGS, BINDING_ORDER, BINDING_LABELS, keyName, KeyboardInput, GamepadInput };
