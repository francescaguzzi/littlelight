import * as THREE from "three";
import { setWindowFocusTarget, restoreInteractiveFromWindowFocus } from './littlestar.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

/* ---------------------------------------------- */

const FADE_SPEED = 0.05;
const FOCUS_DISTANCE = 5;
const STAR_FOCUS_DISTANCE = 1.6;
const CAMERA_LERP_SPEED = 2;
const BACKLIGHT_INSET = 0.5; // distanza dal vetro, verso l'interno dell'edificio

const DEFAULT_WINDOW_EMISSIVE = { color: 0xffaa55, intensity: 3.0 };

const WINDOW_STATES = {
    IDLE: 'idle',
    ACTIVE: 'active',
    FOCUSING: 'focusing',
    FRAMED: 'framed',
    CLOSING: 'closing',
    COMPLETED: 'completed',
};

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

/**
 * Direzione "fuori" affidabile per una finestra. L'asse sottile del vetro
 * (getWorldNormal) ha segno arbitrario nel modello, quindi si usa il centro
 * dell'edificio come riferimento: la direzione verso l'esterno è quella che si
 * allontana dal centro del building. Coerente per backlight, inquadratura
 * camera e posizionamento stella (niente più plane fuori o camera interna).
 */
function getOutward(mesh, modelCenter) {
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const normal = getWorldNormal(mesh);
    const sign = Math.sign(center.clone().sub(modelCenter).dot(normal)) || 1;
    const outward = normal.clone().multiplyScalar(sign);
    return { center, normal, outward };
}

// Stessa identica formula usata da handleWindowClick per calcolare dove si
// sposterà la camera al click su questa finestra. Centralizzata qui così i due
// calcoli non possono disallinearsi in futuro.
function computeWindowFocusTarget(mesh, modelCenter) {
    const { center: worldCenter, outward } = getOutward(mesh, modelCenter);
    const focusDirection = outward.clone();
    const targetPos = worldCenter.clone().add(outward.clone().multiplyScalar(FOCUS_DISTANCE));
    return { worldCenter, focusDirection, targetPos };
}

/**
 * RectAreaLight dietro la finestra, orientata verso l'esterno dell'edificio:
 * emette attraverso il vetro nella direzione del target di `lookAt`
 * (per le Light .lookAt() allinea -Z verso il punto). Intensità da 0
 * (fade-in all'attivazione della finestra).
 */
function makeBacklight(windowMesh, color, outward, center) {
    const size = new THREE.Box3().setFromObject(windowMesh).getSize(new THREE.Vector3());
    const width = Math.max((size.x || size.z) + BACKLIGHT_INSET, 0.1);
    const height = Math.max(size.y + BACKLIGHT_INSET, 0.1);

    const backlight = new THREE.RectAreaLight(color, 0, width, height);
    // Posizionata poco dentro la finestra (verso il centro edificio), mai fuori.
    backlight.position.copy(center).addScaledVector(outward, -BACKLIGHT_INSET);
    backlight.lookAt(center.clone().add(outward));

    // Plane luminoso coincidente con la RectAreaLight. MeshBasicMaterial è
    // unlit: non esistono proprietà emissive
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(geometry, material);

    glowMesh.position.copy(backlight.position);
    glowMesh.quaternion.copy(backlight.quaternion);
    backlight.userData.glowMesh = glowMesh;

    return backlight;
}

function disposeBacklight(windowEntry) {
    if (!windowEntry.backlight) return;
    const backlight = windowEntry.backlight;
    windowEntry.backlight = null;
    if (backlight.parent) {
        backlight.parent.remove(backlight);
    }
    // Anche il glow plane associato: fuori dalla scena e disposato.
    const glow = backlight.userData.glowMesh;
    if (glow) {
        if (glow.parent) {
            glow.parent.remove(glow);
        }
        glow.geometry.dispose();
        glow.material.dispose();
    }
}

function activateAt(controller, index) {
    const entry = controller.windows[index];
    if (!entry) return;

    controller.currentIndex = index;
    entry.state = WINDOW_STATES.ACTIVE;
    entry.revealed = false;
    entry.targetOpacity = 0.5;
    entry.backlightTargetIntensity = entry.backlightIntensity; // fade-in dal 0
    entry.material.opacity = 0.5;
}

/**
 * Costruisce il controller delle finestre. `windowDefs` è `STORY.windows`:
 * array ORDINATO di definizioni { id, activationDelay, backlight, steps } —
 * l'ordine qui è l'ordine di attivazione delle vignette.
 *
 * Ogni definizione porta con sé la propria configurazione (delay random
 * prima dell'attivazione, colore/intensità del backlight, step della vignetta
 * e oggetti reveal), quindi non serve più alcuna tabella parallela.
 */
export function setupWindows(model, scene, windowDefs, camera) {
    // Fondamentale: se il modello è stato appena caricato/aggiunto alla scena
    // e non è ancora passato un render, le matrixWorld sono ancora quelle di
    // default e getWorldPosition() più sotto restituirebbe coordinate sbagliate.
    model.updateMatrixWorld(true);
    RectAreaLightUniformsLib.init();

    // Centro dell'edificio: riferimento per il lato outward di ogni finestra.
    const modelCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());

    const byName = new Map();

    model.traverse((child) => {
        if (child.isMesh) {
            byName.set(child.name, child);
            if (child.name.includes("window")) {
                child.material = child.material.clone();
                child.material.transparent = true;
            }
        }
    });

    // Oggetti reveal raccolti dagli step dichiarativi: nascosti all'avvio
    // (niente lista duplicata: il setup li deriva dagli step).
    const revealNames = new Set();
    for (const def of windowDefs) {
        for (const step of def.steps) {
            if (step.type === 'reveal' && Array.isArray(step.objects)) {
                step.objects.forEach((name) => revealNames.add(name));
            }
        }
    }

    const windows = windowDefs
        .map((def) => {
            const mesh = byName.get(def.id);
            if (!mesh) {
                console.warn(`Finestra "${def.id}" non trovata nel modello.`);
                return null;
            }

            const cfg = def.backlight ?? DEFAULT_WINDOW_EMISSIVE;
            const { center, outward } = getOutward(mesh, modelCenter);
            const backlight = makeBacklight(mesh, cfg.color, outward, center);
            scene.add(backlight);
            scene.add(backlight.userData.glowMesh);

            return {
                id: def.id,
                activationDelay: def.activationDelay ?? [2, 8],
                mesh,
                outward,
                material: mesh.material,
                backlight,
                backlightIntensity: cfg.intensity ?? 1,
                backlightTargetIntensity: 0,
                glowOpacity: 0, // alpha del glow plane (lerp, mai NaN)
                targetOpacity: 1,
                state: WINDOW_STATES.IDLE,
                revealed: false,
            };
        })
        .filter(Boolean);

    const controller = {
        windows,
        byName,
        modelCenter,
        currentIndex: -1,
        cameraTarget: null,
        raycaster: new THREE.Raycaster(),
        sequenceStarted: false,
        sequenceComplete: false,
        pendingWindowActivation: false,
        sequenceDelay: 0,
        onWindowFramed: null,
        onWindowFocusCleared: null,
        onSequenceComplete: null,
    };

    controller.activateNext = function () {
        const nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.windows.length) {
            this.sequenceComplete = true;
            this.pendingWindowActivation = false;
            if (typeof this.onSequenceComplete === 'function') {
                this.onSequenceComplete();
            }
            return;
        }
        activateAt(this, nextIndex);
    };

    controller.finishWindowSequenceStep = function (windowName) {
        if (!this.sequenceStarted || this.sequenceComplete) return;

        const activeWindow = this.windows[this.currentIndex];
        if (!activeWindow || activeWindow.id !== windowName) return;
        if (activeWindow.state !== WINDOW_STATES.FRAMED) return;

        // Vignetta completata: spegni il backlight e riporta la finestra a
        // piena visibilità (opacity 1, vetro nuovamente pienamente opaco).
        // La transizione a COMPLETED (con dispose e scheduling della
        // successiva) avviene in updateWindows quando il fade-out finisce.
        activeWindow.state = WINDOW_STATES.CLOSING;
        activeWindow.revealed = true;
        activeWindow.targetOpacity = 1;
        activeWindow.backlightTargetIntensity = 0;
    };

    revealNames.forEach((name) => {
        const mesh = byName.get(name);
        if (mesh) {
            mesh.visible = false;
            mesh.userData.isWindowReveal = true;
        }
    });

    return controller;
}

export function startInteractiveWindowSequence(controller) {
    if (!controller || controller.sequenceStarted || controller.sequenceComplete) return;

    controller.sequenceStarted = true;
    controller.pendingWindowActivation = true;
    controller.currentIndex = -1;

    const first = controller.windows[0];
    controller.sequenceDelay = first
        ? randomBetween(first.activationDelay[0], first.activationDelay[1])
        : 10;
}

export function triggerCurrentWindowReveal(controller, revealNames) {
    if (!controller || !Array.isArray(revealNames)) return;
    revealNames.forEach((name) => {
        const target = controller.byName.get(name);
        if (target) {
            target.visible = true;
        }
    });
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

        const { worldCenter, focusDirection, targetPos } = computeWindowFocusTarget(active.mesh, controller.modelCenter);

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

export function cancelWindowFocus(controller) {
    const active = controller.windows[controller.currentIndex];
    if (!active) return;

    // Solo una finestra ancora interattiva torna ACTIVE: una finestra già
    // chiusa/completata non va riattivata da un semplice annullamento.
    if ([WINDOW_STATES.ACTIVE, WINDOW_STATES.FOCUSING, WINDOW_STATES.FRAMED].includes(active.state)) {
        active.state = WINDOW_STATES.ACTIVE;
    }
    controller.cameraTarget = null;
    if (controller.onWindowFocusCleared) {
        controller.onWindowFocusCleared(active.id);
    }
    restoreInteractiveFromWindowFocus();
}

export function updateWindows(controller, delta, camera, controls) {
    if (!controller || !controller.windows) return;

    if (controller.sequenceStarted && controller.pendingWindowActivation && !controller.sequenceComplete) {
        controller.sequenceDelay -= delta;
        if (controller.sequenceDelay <= 0) {
            controller.pendingWindowActivation = false;
            controller.activateNext();
        }
    }

    for (const w of controller.windows) {
        w.material.opacity += (w.targetOpacity - w.material.opacity) * FADE_SPEED;

        if (w.backlight) {
            w.backlight.intensity += (w.backlightTargetIntensity - w.backlight.intensity) * FADE_SPEED;

            // Fade del glow plane con lo stesso lerp, MA senza divisioni:
            // `intensity / target = Infinity|NaN` su finestre idle o in
            // chiusura (target 0) corrompeva alpha e faceva lo schermo nero.
            const glow = w.backlight.userData.glowMesh;
            if (glow) {
                const glowTarget = w.backlightTargetIntensity > 0 ? 1 : 0;
                const current = w.glowOpacity ?? 0;
                w.glowOpacity = THREE.MathUtils.clamp(
                    current + (glowTarget - current) * FADE_SPEED,
                    0, 1
                );
                glow.material.opacity = w.glowOpacity;
            }
        }
    }

    const active = controller.windows[controller.currentIndex];
    if (!active) return;

    if (active.state === WINDOW_STATES.FOCUSING) {
        controls.enabled = false;
        camera.position.lerp(controller.cameraTarget.position, delta * CAMERA_LERP_SPEED);
        controls.target.lerp(controller.cameraTarget.lookAt, delta * CAMERA_LERP_SPEED);
        controls.update();
        if (camera.position.distanceTo(controller.cameraTarget.position) < 0.05) {
            active.state = WINDOW_STATES.FRAMED;
            if (typeof controller.onWindowFramed === 'function') {
                controller.onWindowFramed(active.id);
            }
        }
    } else if (active.state === WINDOW_STATES.CLOSING) {
        // La finestra torna a piena opacità; si spegne solo il backlight.
        active.targetOpacity = 1;

        // Fade-out completo del backlight, poi rimozione.
        if (!active.backlight || active.backlight.intensity < 0.02) {
            disposeBacklight(active);
            active.state = WINDOW_STATES.COMPLETED;
            controller.pendingWindowActivation = true;

            const next = controller.windows[controller.currentIndex + 1];
            controller.sequenceDelay = next
                ? randomBetween(next.activationDelay[0], next.activationDelay[1])
                : 0;

            // Nota: NON ripristinare il focus qui. La camera resta inquadrata
            // sulla finestra appena completata finché l'utente non clicca su
            // altro punto (annullamento esplicito in cancelWindowFocus).
        }
    }
}