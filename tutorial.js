/* ------------------------------------------------------------------------- */
/* UI di gioco:                                                                 */
/*  - tutorial iniziale mostrato all'inizio della parte interattiva;            */
/*  - bottone di sfarfallio per i dispositivi touch (su PC resta la SPACE).     */
/* ------------------------------------------------------------------------- */

const TUTORIAL_VISIBLE_MS = 10000;
const TUTORIAL_FADE_MS = 800;

let onFlash = null;
let tutorialTimerId = null;

export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/**
 * Collega il bottone di sfarfallio all'azione passata (in main.js è
 * `storyNarrator.triggerFlash`, la stessa invocata dalla barra spaziatrice).
 */
export function setupGameUI({ onFlash: flashHandler } = {}) {
    if (typeof flashHandler === 'function') {
        onFlash = flashHandler;
    }

    const button = document.getElementById('flash-button');
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';

    // touchstart: preventDefault evita il click sintetico che seguirebbe al
    // tap; stopPropagation evita che il listener globale in littlestar.js
    // interpreti il tocco sul bottone come input di movimento.
    button.addEventListener('touchstart', (event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerFlash();
    }, { passive: false });

    // Fallback desktop/test: il clic su mouse.
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerFlash();
    });
}

function triggerFlash() {
    if (typeof onFlash === 'function') onFlash();
}

export function setFlashButtonVisible(visible) {
    const button = document.getElementById('flash-button');
    if (!button) return;
    button.style.display = visible ? 'flex' : 'none';
}

/**
 * Mostra le istruzioni di gioco per pochi secondi, con fade-in/out automatico.
 * Il testo cambia in base al dispositivo (touch o tastiera).
 */
export function showTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;

    const touch = isTouchDevice();

    const moveLine = document.createElement('div');
    moveLine.textContent = touch
        ? 'Move: touch the edges of the screen'
        : 'Move: WASD / Arrow keys';

    const twinkleLine = document.createElement('div');
    twinkleLine.textContent = touch
        ? 'Twinkle: tap the star'
        : 'Twinkle: SPACEBAR';

    overlay.innerHTML = '';
    overlay.appendChild(moveLine);
    overlay.appendChild(twinkleLine);

    overlay.style.transition = `opacity ${TUTORIAL_FADE_MS}ms ease`;
    overlay.style.opacity = '1';

    if (tutorialTimerId) clearTimeout(tutorialTimerId);
    tutorialTimerId = setTimeout(() => {
        tutorialTimerId = null;
        overlay.style.opacity = '0';
    }, TUTORIAL_VISIBLE_MS);
}
