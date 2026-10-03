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
            backlight: { color: 0x352fe5, intensity: 7.0 },
            vignette: [
                '/scene1/base.png',
                '/scene1/mamma.png',
                '/scene1/base-buio.png',
                '/scene1/base.png',
                '/scene1/nanna.png'
            ],
            steps: [
                { type: 'pause', duration: 3.5 },
                { type: 'texture' },
                { type: 'text', text: '"Time for lights out, sweetheart."', hold: 1.0 },
                { type: 'pause', duration: 1.0 },
                { type: 'text', text: '"No... just two more lines."', hold: 1.0 },
                { type: 'pause', duration: 1.0 },
                { type: 'texture' },
                { type: 'text', text: '"I\'m not sleepy yet."', hold: 1.0 },
                { type: 'pause', duration: 1.0 },
                { type: 'text', text: '"I wish I could see how it ends..."', hold: 1.0 },
                { type: 'flash' },
                { type: 'texture' },
                { type: 'text', text: '"....oh.."', hold: 1.0 },
                { type: 'pause', duration: 1.0 },
                { type: 'text', text: '"I knew he wasn\'t really a dragon!"', hold: 1.2 },
                { type: 'text', text: '"Are you still awake?"', hold: 1.2 },
                { type: 'pause', duration: 1.0 },
                { type: 'texture' },
                { type: 'text', text: '"...no!"', hold: 1.2 },
                { type: 'pause', duration: 2.0 },
                { type: 'text', text: '"Just two more lines. That\'s all I needed."', hold: 1.2 },
                { type: 'pause', duration: 1.0 },
                { type: 'text', text: '"Goodnight, dragon."', hold: 1.2 },
                { type: 'pause', duration: 2.0 }
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