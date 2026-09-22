const DEFAULT_TYPING_SPEED = 100;
const DEFAULT_LINE_HOLD = 1.0;

const NARRATIVE_TYPES = {
    CUTSCENE: 'cutscene',
    VIGNETTE: 'vignette',
};

import { STORY } from './story.js';

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

export const DROP_SOUND_SRC = './assets/audio/splash.mp3';

// Normalizza una sequenza dichiarativa in step tipizzati.
// Supporta:
//   - stringhe                    -> { type: 'text' }
//   - { type: 'text', hold }      -> typewriter + hold
//   - { type: 'pause', duration } -> attesa di `duration` secondi
//   - { type: 'flash' }           -> attesa input (Space) con flash handler
//   - { type: 'reveal', objects } -> reveal handler, avanza subito
// Fallback retro-compatibili: { text }, { flash }, { reveal: [...] }.
function normalizeSequence(sequenceDefinition, defaultHold) {
    if (!sequenceDefinition) return [];

    if (Array.isArray(sequenceDefinition)) {
        return sequenceDefinition
            .map((entry) => {
                if (typeof entry === 'string') {
                    return { type: 'text', text: entry, hold: defaultHold };
                }
                if (!entry) return null;

                const type = (entry.type)
                    || (entry.text ? 'text' : null)
                    || (entry.flash ? 'flash' : null)
                    || (entry.reveal ? 'reveal' : null);
                if (!type) return null;

                if (type === 'reveal') {
                    return {
                        type: 'reveal',
                        objects: Array.isArray(entry.objects) ? entry.objects : entry.reveal || [],
                    };
                }

                return { ...entry, type, hold: entry.hold ?? defaultHold };
            })
            .filter(Boolean);
    }

    if (typeof sequenceDefinition === 'string') {
        return [{ type: 'text', text: sequenceDefinition, hold: defaultHold }];
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
    cutsceneScripts = STORY.cutscene,
    windowVignettes = STORY.windows,
    endingSequence = STORY.ending,
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
    let pauseElapsed = 0;
    let pauseDuration = 0;
    let isWaitingForPause = false;
    let typingTimerId = null;
    let transition = null;
    let activeVignetteName = null;
    let isEndingPlaying = false;
    let onVignetteComplete = null;
    let onSequenceComplete = null;
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
        isWaitingForPause = false;
        isWaitingForFlashInput = false;

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
            const finishedEnding = isEndingPlaying;

            activeSequence = [];
            activeNarrativeType = null;
            isWaitingForLineHold = false;
            isWaitingForPause = false;
            isWaitingForFlashInput = false;
            activeVignetteName = null;
            isEndingPlaying = false;
            clearText();

            if (finishedVignetteName && typeof onVignetteComplete === 'function') {
                onVignetteComplete(finishedVignetteName);
            }
            if (finishedEnding && typeof onSequenceComplete === 'function') {
                onSequenceComplete();
            }
            return;
        }

        const currentStep = activeSequence[currentStepIndex];

        switch (currentStep.type) {
            case 'text': {
                currentLineHold = currentStep.hold ?? lineHold;
                isWaitingForLineHold = false;
                isWaitingForPause = false;
                isWaitingForFlashInput = false;
                lineHoldElapsed = 0;
                showText(currentStep.text, () => {
                    isWaitingForLineHold = true;
                    lineHoldElapsed = 0;
                });
                break;
            }

            case 'pause': {
                isWaitingForLineHold = false;
                isWaitingForPause = true;
                isWaitingForFlashInput = false;
                pauseElapsed = 0;
                pauseDuration = Math.max(0, currentStep.duration ?? 0);
                clearText();
                break;
            }

            case 'flash': {
                // Resetta i flag di attesa precedenti: arrivando qui da una
                // pausa o da un text con hold, senza questo reset il loop
                // continuerebbe ad avanzare saltando lo stato di input.
                isWaitingForLineHold = false;
                isWaitingForPause = false;
                isWaitingForFlashInput = true;
                break;
            }

            case 'reveal': {
                if (typeof vignetteRevealHandler === 'function' && Array.isArray(currentStep.objects)) {
                    vignetteRevealHandler(currentStep.objects);
                }
                currentStepIndex += 1;
                processSequenceStep();
                break;
            }

            default: {
                // Step sconosciuto: ignora e avanza, così la sequenza non si blocca.
                currentStepIndex += 1;
                processSequenceStep();
                break;
            }
        }
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
        } else if (isWaitingForPause) {
            pauseElapsed += delta;
            if (pauseElapsed >= pauseDuration) {
                advanceLine();
            }
        }
    }

    function updateCutsceneState(state, delta = 0) {
        if (state !== currentState) {
            previousState = currentState;
            currentState = state;

            // Una vignette in corso non va toccata: niente reset di stati
            // interni né avvio di nuove sequenze cutscene.
            if (activeNarrativeType === NARRATIVE_TYPES.VIGNETTE) {
                return;
            }
            // Nemmeno la cutscene conclusiva (playEnding).
            if (isEndingPlaying) {
                return;
            }

            stopTyping();
            lineHoldElapsed = 0;
            isWaitingForLineHold = false;
            isWaitingForPause = false;

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
        const vignette = windowVignettes.find((w) => w.id === windowName);
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

    // Cutscene conclusiva: contenuto definito in STORY.ending.
    function playEnding() {
        const lines = (endingSequence && Array.isArray(endingSequence.lines))
            ? endingSequence.lines
            : [];

        if (lines.length === 0) {
            clear();
            if (typeof onSequenceComplete === 'function') {
                onSequenceComplete();
            }
            return;
        }

        isEndingPlaying = true;
        startSequence(lines, NARRATIVE_TYPES.CUTSCENE);
    }

    function clear() {
        stopTyping();
        transition = null;
        activeSequence = [];
        activeNarrativeType = null;
        currentStepIndex = -1;
        activeVignetteName = null;
        isEndingPlaying = false;
        isWaitingForLineHold = false;
        isWaitingForPause = false;
        isWaitingForFlashInput = false;
        pauseElapsed = 0;
        pauseDuration = 0;
        lineHoldElapsed = 0;
        setBlackoutOpacity(0);
        clearText();
    }

    return {
        updateCutsceneState,
        playWindowVignette,
        playEnding,
        clear,
        triggerFlash() {
            if (typeof vignetteFlashHandler === 'function') {
                vignetteFlashHandler();
            }

            if (!isWaitingForFlashInput || activeNarrativeType === null) {
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
        setOnSequenceComplete(callback) {
            onSequenceComplete = callback;
        },
        setRevealHandler(handler) {
            vignetteRevealHandler = handler;
        },
        setFlashHandler(handler) {
            vignetteFlashHandler = handler;
        },
    };
}