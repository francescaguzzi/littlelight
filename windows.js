import * as THREE from "three";
import { setWindowFocusTarget, restoreInteractiveFromWindowFocus } from './littlestar.js';

/* ---------------------------------------------- */

const FADE_SPEED = 0.05;
const LIGHT_MAX_INTENSITY = 10; // "abbastanza intensa" come richiesto — tarala a occhio
const LIGHT_DISTANCE = 6;
const LIGHT_DECAY = 3;
const FOCUS_DISTANCE = 5;       // distanza della camera dalla finestra quando inquadrata frontalmente
const STAR_FOCUS_DISTANCE = 1.6; // distanza della stellina dalla finestra durante il focus
const CAMERA_LERP_SPEED = 2;    // velocità della transizione di camera verso la finestra

// Stessa idea usata per il vecchio diorama: l'asse più sottile della geometria
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

function activateAt(controller, idx) {
    controller.currentIndex = idx;
    const w = controller.windows[idx];
    w.state = "active";
    w.targetOpacity = 0.5;
    if (w.lightAnchor) {
        controller.light.position.copy(w.lightAnchor);
    }
}

function advanceToNext(controller) {
    activateAt(controller, (controller.currentIndex + 1) % controller.windows.length);
}

/**
 * Costruisce il controller delle finestre. `sequence` è l'array ORDINATO dei
 * nomi mesh esatti (es. ["window-front", "window-back", "window-right", ...]) —
 * l'ordine qui è l'ordine di attivazione nel gioco, non l'ordine di traverse.
 */
export function setupWindows(model, scene, sequence) {
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

    const light = new THREE.PointLight(0xffaa55, 0, LIGHT_DISTANCE, LIGHT_DECAY);
    scene.add(light);

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

            return {
                name,
                mesh,
                material: mesh.material,
                lightAnchor,
                targetOpacity: 1,
                state: "idle", // idle | active | focusing | framed | returning
            };
        })
        .filter(Boolean);

    const controller = {
        windows,
        light,
        currentIndex: -1,
        cameraTarget: null,
        raycaster: new THREE.Raycaster(),
    };

    if (windows.length > 0) advanceToNext(controller);
    return controller;
}

// Da chiamare dal listener di click del renderer — ndcX/ndcY in [-1, 1] (coordinate
// normalizzate del device, standard Three.js per il raycasting).
export function handleWindowClick(controller, camera, ndcX, ndcY) {
    const active = controller.windows[controller.currentIndex];
    if (!active || active.state !== "active") return false;

    controller.raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hits = controller.raycaster.intersectObject(active.mesh);
    if (hits.length > 0) {
        active.state = "focusing";

        const worldCenter = new THREE.Box3().setFromObject(active.mesh).getCenter(new THREE.Vector3());

        const normal = getWorldNormal(active.mesh);
        const sideSign = Math.sign(camera.position.clone().sub(worldCenter).dot(normal)) || 1;
        const focusDirection = normal.clone().multiplyScalar(sideSign);
        const targetPos = worldCenter.clone().add(focusDirection.clone().multiplyScalar(FOCUS_DISTANCE));

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

    active.state = "active";
    controller.cameraTarget = null;
    if (controller.onWindowFocusCleared) {
        controller.onWindowFocusCleared(active.name);
    }
    restoreInteractiveFromWindowFocus();
}

export function updateWindows(controller, delta, camera, controls) {
    for (const w of controller.windows) {
        w.material.opacity += (w.targetOpacity - w.material.opacity) * FADE_SPEED;
    }

    const active = controller.windows[controller.currentIndex];
    if (!active) return;

    if (active.state === "active") {
        const activeness = 1 - active.material.opacity;
        controller.light.intensity = activeness * LIGHT_MAX_INTENSITY;
    } else if (active.state === "focusing") {
        controls.enabled = false;
        camera.position.lerp(controller.cameraTarget.position, delta * CAMERA_LERP_SPEED);
        controls.target.lerp(controller.cameraTarget.lookAt, delta * CAMERA_LERP_SPEED);
        controls.update();
        if (camera.position.distanceTo(controller.cameraTarget.position) < 0.05) {
            active.state = "framed";
            if (controller.onWindowFramed) {
                controller.onWindowFramed(active.name);
            }
            // Punto di aggancio: qui puoi far partire la vignetta/storia vera e propria.
        }
    } else if (active.state === "framed") {
        
        

    } else if (active.state === "returning") {
        controller.light.intensity += (0 - controller.light.intensity) * FADE_SPEED;
        active.targetOpacity = 1;
        controls.enabled = true;
        if (active.material.opacity > 0.98) {
            advanceToNext(controller);
        }
    }
}