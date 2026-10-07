export function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || import.meta.env?.DEV) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
}

export function setupInstallPrompt(button) {
    if (!button) return;
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        button.hidden = false;
    });
    button.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        button.hidden = true;
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        button.hidden = true;
    });
}
