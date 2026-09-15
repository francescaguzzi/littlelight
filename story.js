const DEFAULT_TYPING_SPEED = 100;
const DEFAULT_LINE_HOLD = 1.0;

const NARRATIVE_TYPES = {
    CUTSCENE: 'cutscene',
    VIGNETTE: 'vignette',
};

import { WINDOW_VIGNETTES } from './vignette.js';

export const SCENE_DURATIONS = {
    PANORAMIC_VIEW: 25,
    CINEMATIC_FALL: 10,
    ON_WATER: 8,
    RISING_HOLD: 3.5,
    RISING_TARGET_Y: 10,
};

export const NARRATIVE_TIMINGS = {
    lineHold: DEFAULT_LINE_HOLD,
    blackout: {
        fadeIn: 0.14,
        hold: 2.0,
        fadeOut: 0.32,
    },
};

export const INITIAL_CUTSCENE_SCRIPT = {
    PANORAMIC_VIEW: [
        'There was once a little star...',
        'hers and every other star\'s purpose',
        'was to make people\'s dreams come true',
        'but where every other star succeeded...',
        'she could not make it work',
    ],
    CINEMATIC_FALL: ['so she fell'],
    ON_WATER: ['watched her friends from far below'],
    RISING: ['and stumbled upon something...'],
    INTERACTIVE: [],
};

export const DROP_SOUND_SRC = './assets/audio/splash.mp3';

function normalizeSequence(sequenceDefinition, defaultHold) {
    if (!sequenceDefinition) return [];

    if (Array.isArray(sequenceDefinition)) {
        return sequenceDefinition
            .map((entry) => (typeof entry === 'string' ? { text: entry, hold: defaultHold } : entry))
            .filter((entry) => entry && (entry.text || entry.flash || entry.reveal));
    }

    if (typeof sequenceDefinition === 'string') {
        return [{ text: sequenceDefinition, hold: defaultHold }];
    }

    return [];
}

function createDropSoundPlayer(src) {
    if (typeof Audio === 'undefined') return null;
    const audio = new Audio(src);
    audio.preload = 'auto';
    return audio;
}

export function createNarrativeManager(narrativeElement, blackoutElement = null, {
    cutsceneScripts = INITIAL_CUTSCENE_SCRIPT,
    windowVignettes = WINDOW_VIGNETTES,
    typingSpeed = DEFAULT_TYPING_SPEED,
    lineHold = DEFAULT_LINE_HOLD,
    blackout = NARRATIVE_TIMINGS.blackout,
    dropSoundSrc = DROP_SOUND_SRC,
} = {}) {
    let currentState = '';
    let previousState = '';
    let activeNarrativeType = null;
    let activeSequence = [];
    let currentStepIndex = -1;
    let currentLineHold = lineHold;
    let lineHoldElapsed = 0;
    let isWaitingForLineHold = false;
    let typingTimerId = null;
    let transition = null;
    let activeVignetteName = null;
    let onVignetteComplete = null;
    let vignetteRevealHandler = null;
    let vignetteFlashHandler = null;
    let isWaitingForFlashInput = false;
    const dropSound = createDropSoundPlayer(dropSoundSrc);

    function stopTyping() {
        if (typingTimerId) {
            clearTimeout(typingTimerId);
            typingTimerId = null;
        }
    }

    function clearText() {
        stopTyping();
        if (narrativeElement) {
            narrativeElement.innerHTML = '';
        }
    }

    function setBlackoutOpacity(value) {
        if (blackoutElement) {
            blackoutElement.style.opacity = String(value);
        }
    }

    function playDropSound() {
        if (!dropSound) return;
        dropSound.currentTime = 0;
        const result = dropSound.play();
        if (result && typeof result.catch === 'function') {
            result.catch(() => {});
        }
    }

    function typeWriterEffect(text, index, onComplete) {
        if (!narrativeElement) return;

        if (index === 0) {
            narrativeElement.innerHTML = '';
        }

        if (index < text.length) {
            narrativeElement.innerHTML += text.charAt(index);
            typingTimerId = setTimeout(() => typeWriterEffect(text, index + 1, onComplete), typingSpeed);
            return;
        }

        if (onComplete) {
            onComplete();
        }
    }

    function showText(text, onComplete) {
        if (!narrativeElement) return;
        stopTyping();
        typeWriterEffect(text, 0, onComplete);
    }

    function startSequence(sequenceDefinition, kind) {
        activeNarrativeType = kind;
        activeSequence = normalizeSequence(sequenceDefinition, lineHold);
        currentStepIndex = 0;
        lineHoldElapsed = 0;
        isWaitingForLineHold = false;

        if (activeSequence.length === 0) {
            clearText();
            activeNarrativeType = null;
            return;
        }

        processSequenceStep();
    }

    function processSequenceStep() {
        if (currentStepIndex >= activeSequence.length) {
            const finishedVignetteName = activeVignetteName;
            activeSequence = [];
            activeNarrativeType = null;
            isWaitingForFlashInput = false;
            activeVignetteName = null;
            clearText();
            if (finishedVignetteName && typeof onVignetteComplete === 'function') {
                onVignetteComplete(finishedVignetteName);
            }
            return;
        }

        const currentStep = activeSequence[currentStepIndex];
        currentLineHold = currentStep.hold ?? lineHold;
        isWaitingForLineHold = false;
        lineHoldElapsed = 0;

        if (currentStep.flash) {
            isWaitingForFlashInput = true;
            return;
        }

        if (currentStep.reveal) {
            if (typeof vignetteRevealHandler === 'function') {
                vignetteRevealHandler(currentStep.reveal);
            }
            currentStepIndex += 1;
            processSequenceStep();
            return;
        }

        showText(currentStep.text, () => {
            isWaitingForLineHold = true;
            lineHoldElapsed = 0;
        });
    }

    function advanceLine() {
        currentStepIndex += 1;
        processSequenceStep();
    }

    function startBlackoutTransition() {
        transition = {
            phase: 'fadeIn',
            elapsed: 0,
            soundPlayed: false,
        };
        clearText();
        setBlackoutOpacity(0);
    }

    function updateBlackoutTransition(delta) {
        if (!transition) return false;

        transition.elapsed += delta;

        if (transition.phase === 'fadeIn') {
            const progress = Math.min(transition.elapsed / blackout.fadeIn, 1);
            setBlackoutOpacity(progress);
            if (progress >= 1) {
                transition.phase = 'hold';
                transition.elapsed = 0;
            }
            return true;
        }

        if (transition.phase === 'hold') {
            setBlackoutOpacity(1);
            if (!transition.soundPlayed) {
                playDropSound();
                transition.soundPlayed = true;
            }
            if (transition.elapsed >= blackout.hold) {
                transition.phase = 'fadeOut';
                transition.elapsed = 0;
            }
            return true;
        }

        if (transition.phase === 'fadeOut') {
            const progress = Math.min(transition.elapsed / blackout.fadeOut, 1);
            setBlackoutOpacity(1 - progress);
            if (progress >= 1) {
                transition = null;
                setBlackoutOpacity(0);
                startSequence(cutsceneScripts[currentState], 'cutscene');
            }
            return true;
        }

        return false;
    }

    function updateSequence(delta) {
        if (!activeSequence.length) return;

        if (isWaitingForLineHold) {
            lineHoldElapsed += delta;
            if (lineHoldElapsed >= currentLineHold) {
                advanceLine();
            }
        }
    }

    function updateCutsceneState(state, delta = 0) {
        if (state !== currentState) {
            previousState = currentState;
            currentState = state;
            stopTyping();
            lineHoldElapsed = 0;
            isWaitingForLineHold = false;

            if (activeNarrativeType === NARRATIVE_TYPES.VIGNETTE) {
                return;
            }

            if (currentState === 'ON_WATER' && previousState === 'CINEMATIC_FALL') {
                startBlackoutTransition();
                return;
            }

            startSequence(cutsceneScripts[currentState], NARRATIVE_TYPES.CUTSCENE);
        }

        if (activeNarrativeType === NARRATIVE_TYPES.VIGNETTE) {
            updateSequence(delta);
            return;
        }

        if (updateBlackoutTransition(delta)) {
            return;
        }

        updateSequence(delta);
    }

    function playWindowVignette(windowName) {
        const vignette = windowVignettes[windowName];
        if (!vignette) {
            clear();
            return;
        }

        if (activeVignetteName === windowName && activeNarrativeType === NARRATIVE_TYPES.VIGNETTE) {
            return;
        }

        activeVignetteName = windowName;
        startSequence(vignette.steps, NARRATIVE_TYPES.VIGNETTE);
    }

    function clear() {
        stopTyping();
        transition = null;
        activeSequence = [];
        activeNarrativeType = null;
        currentStepIndex = -1;
        activeVignetteName = null;
        isWaitingForLineHold = false;
        isWaitingForFlashInput = false;
        lineHoldElapsed = 0;
        setBlackoutOpacity(0);
        clearText();
    }

    return {
        updateCutsceneState,
        playWindowVignette,
        clear,
        triggerFlash() {
            if (typeof vignetteFlashHandler === 'function') {
                vignetteFlashHandler();
            }

            if (!isWaitingForFlashInput || activeNarrativeType !== NARRATIVE_TYPES.VIGNETTE) {
                return false;
            }

            isWaitingForFlashInput = false;
            currentStepIndex += 1;
            processSequenceStep();
            return true;
        },
        setOnVignetteComplete(callback) {
            onVignetteComplete = callback;
        },
        setRevealHandler(handler) {
            vignetteRevealHandler = handler;
        },
        setFlashHandler(handler) {
            vignetteFlashHandler = handler;
        },
    };
}
