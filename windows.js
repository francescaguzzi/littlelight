import * as THREE from "three";
import {
    setWindowFocusTarget,
    restoreInteractiveFromWindowFocus,
    setStarStoryBrightness,
} from './littlestar.js';

/* ---------------------------------------------- */

const FADE_SPEED = 0.05;
const LIGHT_MAX_INTENSITY = 10; // usata solo come fallback di default
const LIGHT_DISTANCE = 6;
const LIGHT_DECAY = 3;
const SPOT_ANGLE = Math.PI;   // cono stretto: fascio direzionato, non luce ambiente
const SPOT_PENUMBRA = 0.5;       // bordo morbido, meno "taglio netto" da cono
const FOCUS_DISTANCE = 5;
const STAR_FOCUS_DISTANCE = 1.6;
const CAMERA_LERP_SPEED = 2;

const WINDOW_STATES = {
    IDLE: 'idle',
    ACTIVE: 'active',
    FOCUSING: 'focusing',
    FRAMED: 'framed',
    CLOSING: 'closing',
    COMPLETED: 'completed',
};

const WINDOW_REVEAL_OBJECTS = {
    'window-1': ['silhouette', 'sedia2'],
    'window-2': ['cucina', 'scatola'],
    'window-3-front': ['street-light'],
    'window-4-clothes': ['clothes-1', 'clothes-2', 'clothes-3', 'clothes-4', 'clothes-5', 'clothes-6'],
    'window-5-fan': ['street-light'],
};


const WINDOW_LIGHT_CONFIG = {
    'window-1': { color: 0xffaa55, intensity: 10 },
    'window-2': { color: 0x6f8fff, intensity: 7 },
    'window-3-front': { color: 0xffe0a0, intensity: 12 },
    'window-4-clothes': { color: 0xaa88ff, intensity: 6 },
    'window-5-fan': { color: 0xff8866, intensity: 9 },
};
const DEFAULT_WINDOW_LIGHT = { color: 0xffaa55, intensity: LIGHT_MAX_INTENSITY };

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

// l'asse più sottile della geometria
// LOCALE è la normale del vetro — affidabile anche se la rotazione dell'oggetto
// non segue convenzioni prevedibili (es. dopo un Separate in Blender).
function getWorldNormal(mesh) {
    mesh.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox.getSize(size);
    const axes = ["x", "y", "z"];
    const thinAxis = axes.reduce((a, b) => (size[a] < size[b] ? a : b));
    const local = new THREE.Vector3(
        thinAxis === "x" ? 1 : 0,
        thinAxis === "y" ? 1 : 0,
        thinAxis === "z" ? 1 : 0
    );
    return local.transformDirection(mesh.matrixWorld).normalize();
}

// Stessa identica formula usata da handleWindowClick per calcolare dove si
// sposterà la camera al click su questa finestra. Centralizzata qui così la
// spotlight può puntare esattamente a quel punto, non solo verso qualcosa di
// simile, e i due calcoli non possono disallinearsi in futuro.
function computeWindowFocusTarget(mesh, camera) {
    const worldCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const normal = getWorldNormal(mesh);
    const sideSign = Math.sign(camera.position.clone().sub(worldCenter).dot(normal)) || 1;
    const focusDirection = normal.clone().multiplyScalar(sideSign);
    const targetPos = worldCenter.clone().add(focusDirection.clone().multiplyScalar(FOCUS_DISTANCE));
    return { worldCenter, focusDirection, targetPos };
}

function activateAt(controller, idx) {
    controller.currentIndex = idx;
    const w = controller.windows[idx];
    if (!w) return;

    w.state = WINDOW_STATES.ACTIVE;
    w.targetOpacity = 0.5;
    w.material.opacity = 0.5;

    if (w.lightAnchor) {
        controller.light.position.copy(w.lightAnchor);
    }
    controller.light.color.set(w.color);
    controller.light.intensity = w.intensity;
}

function advanceToNext(controller) {
    if (controller.windows.length === 0) return;
    activateAt(controller, (controller.currentIndex + 1) % controller.windows.length);
}

export function startInteractiveWindowSequence(controller) {
    if (!controller || controller.sequenceStarted || controller.sequenceComplete) return;

    controller.sequenceStarted = true;
    controller.pendingWindowActivation = true;
    controller.sequenceDelay = 10;
    controller.currentIndex = -1;
}

export function finishWindowSequenceStep(controller, windowName) {
    if (!controller || typeof controller.finishWindowSequenceStep !== 'function') return;
    controller.finishWindowSequenceStep(windowName);
}

export function triggerCurrentWindowReveal(controller, revealNamesOverride) {
    if (!controller || controller.currentIndex < 0) return;

    const activeWindow = controller.windows[controller.currentIndex];
    if (!activeWindow || activeWindow.revealed) return;

    activeWindow.revealed = true;
    const revealNames = revealNamesOverride || WINDOW_REVEAL_OBJECTS[activeWindow.name] || [];
    revealNames.forEach((name) => {
        const target = controller.byName.get(name);
        if (target) {
            target.visible = true;
        }
    });

    const hiddenRevealNames = WINDOW_REVEAL_OBJECTS[activeWindow.name] || [];
    hiddenRevealNames.forEach((name) => {
        const target = controller.byName.get(name);
        if (target) {
            target.visible = revealNames.includes(name);
        }
    });
}

/**
 * Costruisce il controller delle finestre. `sequence` è l'array ORDINATO dei
 * nomi mesh esatti (es. ["window-front", "window-back", "window-right", ...]) —
 * l'ordine qui è l'ordine di attivazione nel gioco, non l'ordine di traverse.
 *
 * Per ogni finestra `scene<N>-light-anchor` (N = indice+1 in sequence) indica
 * dove sta la luce. La direzione del fascio non è più autorabile via empty:
 * punta sempre esattamente al punto in cui si sposterà la camera quando il
 * giocatore clicca sulla finestra (stessa formula di handleWindowClick), per
 * questo `camera` è ora richiesta.
 */
export function setupWindows(model, scene, sequence, camera) {
    // Fondamentale: se il modello è stato appena caricato/aggiunto alla scena
    // e non è ancora passato un render, le matrixWorld sono ancora quelle di
    // default e getWorldPosition() più sotto restituirebbe coordinate sbagliate.
    model.updateMatrixWorld(true);

    const byName = new Map();

    model.traverse((child) => {

        if (child.isMesh && child.name.includes("window")) {
            child.material = child.material.clone();
            child.material.transparent = true;
            byName.set(child.name, child);
        }

        if (child.name.includes("light-anchor")) {
            byName.set(child.name, child);
        }

    });

    // SpotLight al posto della PointLight: fascio direzionato invece di luce
    // omnidirezionale, necessario per l'effetto controluce/silhouette.
    const light = new THREE.SpotLight(0xffaa55, 0, LIGHT_DISTANCE, SPOT_ANGLE, SPOT_PENUMBRA, LIGHT_DECAY);
    scene.add(light);
    scene.add(light.target);

    const windows = sequence
        .map((name, index) => {
            const mesh = byName.get(name);
            if (!mesh) {
                console.warn(`Finestra "${name}" non trovata nel modello.`);
                return null;
            }
            const lightAnchorName = `scene${index + 1}-light-anchor`;
            const lightAnchorMesh = byName.get(lightAnchorName);
            if (!lightAnchorMesh) {
                console.warn(`Anchor luce "${lightAnchorName}" non trovato nel modello.`);
            }
            const lightAnchor = new THREE.Vector3();
            (lightAnchorMesh ?? mesh).getWorldPosition(lightAnchor);

            const { targetPos: lightTarget } = computeWindowFocusTarget(mesh, camera);

            const cfg = WINDOW_LIGHT_CONFIG[name] ?? DEFAULT_WINDOW_LIGHT;

            return {
                name,
                mesh,
                material: mesh.material,
                lightAnchor,
                lightTarget,
                color: cfg.color,
                intensity: cfg.intensity,
                targetOpacity: 1,
                state: WINDOW_STATES.IDLE,
                revealed: false,
            };
        })
        .filter(Boolean);

    const controller = {
        windows,
        light,
        byName,
        currentIndex: -1,
        cameraTarget: null,
        raycaster: new THREE.Raycaster(),
        sequenceStarted: false,
        sequenceComplete: false,
        pendingWindowActivation: false,
        sequenceDelay: 0,
    };

    controller.finishWindowSequenceStep = function (windowName) {
        if (!this.sequenceStarted) return;

        const activeWindow = this.windows[this.currentIndex];
        if (!activeWindow || activeWindow.name !== windowName) return;

        activeWindow.state = WINDOW_STATES.CLOSING;
        activeWindow.revealed = true;
        activeWindow.targetOpacity = 0;
        this.pendingWindowActivation = true;
        this.sequenceDelay = randomBetween(2, 10);
    };

    Object.entries(WINDOW_REVEAL_OBJECTS).forEach(([windowName, names]) => {
        names.forEach((name) => {
            const mesh = byName.get(name);
            if (mesh) {
                mesh.visible = false;
                mesh.userData.isWindowReveal = true;
            }
        });
    });

    return controller;
}

// Da chiamare dal listener di click del renderer — ndcX/ndcY in [-1, 1] (coordinate
// normalizzate del device, standard Three.js per il raycasting).
export function handleWindowClick(controller, camera, ndcX, ndcY) {
    if (!controller || controller.currentIndex < 0) return false;

    const active = controller.windows[controller.currentIndex];
    if (!active || ![WINDOW_STATES.ACTIVE, WINDOW_STATES.FOCUSING, WINDOW_STATES.FRAMED].includes(active.state) || active.revealed) return false;

    controller.raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hits = controller.raycaster.intersectObject(active.mesh);
    if (hits.length > 0) {
        active.state = WINDOW_STATES.FOCUSING;

        const { worldCenter, focusDirection, targetPos } = computeWindowFocusTarget(active.mesh, camera);

        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(worldUp, focusDirection).normalize();
        if (right.lengthSq() < 1e-6) {
            right.set(1, 0, 0);
        }
        const starTarget = worldCenter.clone()
            .add(focusDirection.clone().multiplyScalar(STAR_FOCUS_DISTANCE))
            .add(right.multiplyScalar(0.85));

        controller.cameraTarget = { position: targetPos, lookAt: worldCenter };
        setWindowFocusTarget(starTarget);
        return true;
    }

    return false;
}

export function isPointerOverCurrentWindow(controller, camera, ndcX, ndcY) {
    const active = controller.windows[controller.currentIndex];
    if (!active) return false;

    controller.raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    return controller.raycaster.intersectObject(active.mesh).length > 0;
}

export function cancelWindowFocus(controller) {
    const active = controller.windows[controller.currentIndex];
    if (!active) return;

    active.state = WINDOW_STATES.ACTIVE;
    controller.cameraTarget = null;
    if (controller.onWindowFocusCleared) {
        controller.onWindowFocusCleared(active.name);
    }
    restoreInteractiveFromWindowFocus();
}

export function updateWindows(controller, delta, camera, controls) {
    if (!controller || !controller.windows) return;

    if (controller.sequenceStarted && controller.pendingWindowActivation) {
        controller.sequenceDelay -= delta;
        if (controller.sequenceDelay <= 0) {
            controller.pendingWindowActivation = false;

            if (controller.currentIndex < 0) {
                if (controller.windows.length > 0) {
                    activateAt(controller, 0);
                }
                return;
            }

            const active = controller.windows[controller.currentIndex];
            if (active && active.state === WINDOW_STATES.COMPLETED) {
                const nextIndex = controller.currentIndex + 1;
                // if (nextIndex >= controller.windows.length) {
                //     controller.sequenceStarted = false;
                //     active.state = WINDOW_STATES.IDLE;
                //     return;
                // }

                activateAt(controller, nextIndex);
            }
        }
    }

    for (const w of controller.windows) {
        w.material.opacity += (w.targetOpacity - w.material.opacity) * FADE_SPEED;
    }

    const active = controller.windows[controller.currentIndex];
    if (!active) return;

    if (active.state === WINDOW_STATES.ACTIVE) {
        controller.light.intensity = active.intensity;
    } else if (active.state === WINDOW_STATES.FOCUSING) {
        controls.enabled = false;
        camera.position.lerp(controller.cameraTarget.position, delta * CAMERA_LERP_SPEED);
        controls.target.lerp(controller.cameraTarget.lookAt, delta * CAMERA_LERP_SPEED);
        controls.update();
        if (camera.position.distanceTo(controller.cameraTarget.position) < 0.05) {
            active.state = WINDOW_STATES.FRAMED;
            if (controller.onWindowFramed) {
                controller.onWindowFramed(active.name);
            }
        }
    } else if (active.state === WINDOW_STATES.CLOSING) {
        controller.light.intensity += (0 - controller.light.intensity) * FADE_SPEED;
        active.targetOpacity = 0;
        controls.enabled = true;

        if (active.material.opacity < 0.02) {
            active.state = WINDOW_STATES.IDLE;
            active.targetOpacity = 1;
            active.material.opacity = 0;
            controller.light.intensity = 0;
        }
    }
}