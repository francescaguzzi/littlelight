export const STORY = {
    cutscene: {
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
    },

    // Ogni finestra dichiara la lista ORDINATA delle texture della vignetta:
    // il primo elemento è la texture iniziale (scena di partenza), ogni step
    // { type: 'texture' } avanza di una posizione. Texture in
    // ./assets/textures/vignettes/ — i nomi qui sotto sono placeholder.
    windows: [
        {
            id: 'window-1',
            activationDelay: [2, 8],
            backlight: { color: 0xffaa55, intensity: 12.0 },
            vignette: [
                'tavolosedia.png',
                'window-1-revealed.png',
            ],
            steps: [
                { type: 'text', text: 'The little star was fascinated by the world of humans.', hold: 1.0 },
                { type: 'text', text: 'She saw them from afar, and she wanted to be part of their lives.', hold: 1.0 },
                { type: 'pause', duration: 0.5 },
                { type: 'flash' },
                { type: 'texture' },
                { type: 'text', text: 'A soft pulse of light made the room finally visible.', hold: 1.2 },
            ],
        },
        {
            id: 'window-2',
            activationDelay: [3, 9],
            backlight: { color: 0x6f8fff, intensity: 2.5 },
            vignette: [
                'window-2-start.png',
                'window-2-revealed.png',
            ],
            steps: [
                { type: 'text', text: 'Behind the glass, a hidden rhythm began to move in the quiet.', hold: 1.0 },
                { type: 'pause', duration: 0.5 },
                { type: 'flash' },
                { type: 'texture' },
                { type: 'text', text: 'The glow revealed a warm and human interior she had never seen before.', hold: 1.2 },
                { type: 'text', text: 'She felt the first real pull toward the world below.', hold: 1.2 },
            ],
        },
        {
            id: 'window-3-front',
            activationDelay: [4, 10],
            backlight: { color: 0xffe0a0, intensity: 3.5 },
            vignette: [
                'window-3-start.png',
                'window-3-revealed.png',
            ],
            steps: [
                { type: 'text', text: 'From the front she could see the street and the waiting sky.', hold: 1.0 },
                { type: 'pause', duration: 0.5 },
                { type: 'flash' },
                { type: 'texture' },
                { type: 'text', text: 'The flash made the city breathe again in front of her eyes.', hold: 1.2 },
                { type: 'text', text: 'For a moment, she stopped being only a distant star.', hold: 1.2 },
            ],
        },
        {
            id: 'window-4-clothes',
            activationDelay: [4, 10],
            backlight: { color: 0xaa88ff, intensity: 2.0 },
            vignette: [
                'window-4-start.png',
                'window-4-mid.png',
                'window-4-revealed.png',
            ],
            steps: [
                { type: 'text', text: 'The clothes inside the room drifted into view under the beam of light.', hold: 1.0 },
                { type: 'pause', duration: 0.5 },
                { type: 'flash' },
                { type: 'texture' },
                { type: 'text', text: 'Each fold seemed to hold a memory, a future, a promise.', hold: 1.2 },
                { type: 'texture' },
                { type: 'text', text: 'The little star realized she was not just watching life — she was almost inside it.', hold: 1.2 },
            ],
        },
        {
            id: 'window-5-fan',
            activationDelay: [5, 12],
            backlight: { color: 0xff8866, intensity: 3.0 },
            vignette: [
                'window-5-start.png',
                'window-5-revealed.png',
            ],
            steps: [
                { type: 'text', text: 'At last, the room opened fully beneath her light.', hold: 1.0 },
                { type: 'pause', duration: 0.5 },
                { type: 'flash' },
                { type: 'texture' },
                { type: 'text', text: 'The fan, the air, the stillness, all came alive in one bright gesture.', hold: 1.2 },
                { type: 'text', text: 'She understood that her glow could be a gift, not a burden.', hold: 1.2 },
            ],
        },
    ],

    ending: {
        lines: [],
    },
};