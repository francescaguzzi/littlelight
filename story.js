const DEFAULT_TYPING_SPEED = 100;
const DEFAULT_LINE_HOLD = 1.0;

export const SCENE_DURATIONS = {
	PANORAMIC_VIEW: 25,
	CINEMATIC_FALL: 6,
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

export const CUTSCENE_SCRIPT = {
	PANORAMIC_VIEW: [
		'There was once a little star...',
		'hers and every other star\'s purpose', 'was to make people\'s dreams come true',
		'but where every other star succeeded...', 
        'she could not make it work',
	],
	CINEMATIC_FALL: ['so she fell'],
	ON_WATER: ['watched her friends from far below'],
	RISING: ['and stumbled upon a building'],
	INTERACTIVE: [],
};

export const WINDOW_VIGNETTE_TEXTS = {
    'window-front': [
        'The little star was fascinated by the world of humans.',
        'She saw them from afar, and she wanted to be part of their lives.',
        'She wanted to make their dreams come true, just like the other stars did.',
    ]

};
export const DROP_SOUND_SRC = '/assets/audio/splash.mp3';

function normalizeSequence(sequenceDefinition, defaultHold) {
	if (!sequenceDefinition) return [];

	if (Array.isArray(sequenceDefinition)) {
		return sequenceDefinition
			.map((entry) => (typeof entry === 'string' ? { text: entry, hold: defaultHold } : entry))
			.filter((entry) => entry && entry.text);troika-three-text
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
	cutsceneScripts = CUTSCENE_SCRIPT,
	windowVignetteTexts = WINDOW_VIGNETTE_TEXTS,
	typingSpeed = DEFAULT_TYPING_SPEED,
	lineHold = DEFAULT_LINE_HOLD,
	blackout = NARRATIVE_TIMINGS.blackout,
	dropSoundSrc = DROP_SOUND_SRC,
} = {}) {
	let currentState = '';
	let previousState = '';
	let activeSequenceKind = null;
	let activeSequence = [];
	let activeLineIndex = -1;
	let activeLineHold = lineHold;
	let holdTimer = 0;
	let waitingForNextLine = false;
	let typeTimeout = null;
	let transition = null;
	const dropSound = createDropSoundPlayer(dropSoundSrc);

	function stopTyping() {
		if (typeTimeout) {
			clearTimeout(typeTimeout);
			typeTimeout = null;
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
			typeTimeout = setTimeout(() => typeWriterEffect(text, index + 1, onComplete), typingSpeed);
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
		activeSequenceKind = kind;
		activeSequence = normalizeSequence(sequenceDefinition, lineHold);
		activeLineIndex = 0;
		holdTimer = 0;
		waitingForNextLine = false;

		if (activeSequence.length === 0) {
			clearText();
			return;
		}

		const firstLine = activeSequence[0];
		activeLineHold = firstLine.hold ?? lineHold;
		showText(firstLine.text, () => {
			waitingForNextLine = true;
			holdTimer = 0;
		});
	}

	function advanceLine() {
		activeLineIndex += 1;
		if (activeLineIndex >= activeSequence.length) {
			activeSequence = [];
			activeSequenceKind = null;
			clearText();
			return;
		}

		const nextLine = activeSequence[activeLineIndex];
		activeLineHold = nextLine.hold ?? lineHold;
		waitingForNextLine = false;
		holdTimer = 0;
		showText(nextLine.text, () => {
			waitingForNextLine = true;
			holdTimer = 0;
		});
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

		if (waitingForNextLine) {
			holdTimer += delta;
			if (holdTimer >= activeLineHold) {
				advanceLine();
			}
		}
	}

	function updateCutsceneState(state, delta = 0) {
		if (state !== currentState) {
			previousState = currentState;
			currentState = state;
			stopTyping();
			holdTimer = 0;
			waitingForNextLine = false;

			if (activeSequenceKind === 'vignette') {
				return;
			}

			if (currentState === 'ON_WATER' && previousState === 'CINEMATIC_FALL') {
				startBlackoutTransition();
				return;
			}

			startSequence(cutsceneScripts[currentState], 'cutscene');
		}

		if (activeSequenceKind === 'vignette') {
			updateSequence(delta);
			return;
		}

		if (updateBlackoutTransition(delta)) {
			return;
		}

		updateSequence(delta);
	}

	function playWindowVignette(windowName) {
		const sequence = windowVignetteTexts[windowName];
		if (sequence) {
			startSequence(sequence, 'vignette');
			return;
		}

		clear();
	}

	function clear() {
		stopTyping();
		transition = null;
		activeSequence = [];
		activeSequenceKind = null;
		activeLineIndex = -1;
		waitingForNextLine = false;
		holdTimer = 0;
		setBlackoutOpacity(0);
		clearText();
	}

	return {
		updateCutsceneState,
		playWindowVignette,
		clear,
	};
}
