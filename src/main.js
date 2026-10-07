import './styles/main.css';
import { matrixFor } from './core/pieces.js';
import { ACTIONS, COLS, FEVER_MS, Game, RELEASABLE, ROWS, TICK_MS, finesseTable, placementSig } from './core/game.js';
import { applyCode, decodeReplay, encodeReplay } from './core/replay.js';
import { App } from './ui/app.js';
import { registerServiceWorker, setupInstallPrompt } from './pwa/pwa.js';
import { runMigrations } from './ui/migrations.js';

runMigrations();
const app = new App();
setupInstallPrompt(document.getElementById('install-btn'));
registerServiceWorker();

// API pública intencional para testes, bots e experimentos no console.
window.STACK10 = {
    app, Game, ACTIONS, RELEASABLE, TICK_MS, COLS, ROWS, FEVER_MS,
    encodeReplay, decodeReplay, applyCode, finesseTable, placementSig, matrixFor
};
