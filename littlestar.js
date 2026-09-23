import * as THREE from 'three';
import { SCENE_DURATIONS } from './cutscene.js';

let sceneState = 'PANORAMIC_VIEW';
let stateTimer = 0;
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let littleStar = null;
let starFlashTimer = 0;
let starStoryBrightness = 0;

let starAngle = Math.atan2(12, 8);
let starRadius = Math.sqrt(8 * 8 + 12 * 12);
let starBaseY = 10;
let starSpin = 0;
let windowFocusTarget = null;
let savedInteractiveState = null;

const STAR_FLASH_DURATION = 0.3;

export function triggerStarFlash() {
    starFlashTimer = STAR_FLASH_DURATION;
}

export function setStarStoryBrightness(amount) {
    // Luminosità cumulativa "narrativa": non tocca direttamente la material,
    // viene applicata nella formula del twinkle in updateStarLogic.
    starStoryBrightness = THREE.MathUtils.clamp(starStoryBrightness + (amount || 0), 0, 0.6);
}

function captureWindowFocusState() {
    if (savedInteractiveState) return;

    savedInteractiveState = {
        sceneState,
        stateTimer,
        starAngle,
        starRadius,
        starBaseY,
        starSpin,
        starPosition: littleStar ? littleStar.position.clone() : null,
    };
}

export function setWindowFocusTarget(targetPosition) {
    windowFocusTarget = targetPosition.clone();
    captureWindowFocusState();
}

export function clearWindowFocusTarget() {
    windowFocusTarget = null;
    savedInteractiveState = null;
}

export function isWindowFocusActive() {
    return windowFocusTarget !== null;
}

export function restoreInteractiveFromWindowFocus() {
    if (!savedInteractiveState) {
        clearWindowFocusTarget();
        return;
    }

    sceneState = savedInteractiveState.sceneState;
    stateTimer = savedInteractiveState.stateTimer;
    starAngle = savedInteractiveState.starAngle;
    starRadius = savedInteractiveState.starRadius;
    starBaseY = savedInteractiveState.starBaseY;
    starSpin = savedInteractiveState.starSpin;

    if (littleStar && savedInteractiveState.starPosition) {
        littleStar.position.copy(savedInteractiveState.starPosition);
    }

    clearWindowFocusTarget();
}

export function initLittleStar(scene) {
    const starTexture = new THREE.TextureLoader().load('./assets/other-textures/star.png');
    const littleGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const littleMat = new THREE.MeshBasicMaterial({
        map: starTexture,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
    });

    littleStar = new THREE.Mesh(littleGeo, littleMat);
    littleStar.position.set(30, 100, 0);
    scene.add(littleStar);

    window.addEventListener('keydown', (e) => {
        if (Object.prototype.hasOwnProperty.call(keys, e.key)) {
            keys[e.key] = true;
        }
    });
    window.addEventListener('keyup', (e) => {
        if (Object.prototype.hasOwnProperty.call(keys, e.key)) {
            keys[e.key] = false;
        }
    });

    window.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        const x = touch.clientX / window.innerWidth;
        const y = touch.clientY / window.innerHeight;

        keys.w = y < 0.3;
        keys.s = y > 0.7;
        keys.a = x < 0.3;
        keys.d = x > 0.7;
    });

    window.addEventListener('touchend', () => {
        keys.w = false;
        keys.s = false;
        keys.a = false;
        keys.d = false;
    });

    return littleStar;
}

export function updateStarLogic(camera, clock, delta) {
    if (!littleStar) return sceneState;

    const flashValue = starFlashTimer > 0
        ? Math.sin((1 - (starFlashTimer / STAR_FLASH_DURATION)) * Math.PI)
        : 0;

    // Twinkling effect: oscillazione di opacità. La luminosità narrativa
    // (STORY brightness) sposta l'intera fascia verso l'alto: la stella si
    // fa via via più luminosa con l'avanzare delle vignette.
    const baseOpacity = 0.15 + starStoryBrightness;
    const maxOpacity = 0.30 + starStoryBrightness;
    littleStar.material.opacity = THREE.MathUtils.clamp(
        baseOpacity + flashValue * (maxOpacity - baseOpacity),
        baseOpacity,
        maxOpacity
    );
    starFlashTimer = Math.max(0, starFlashTimer - delta);
    
    if (windowFocusTarget) {
        const bobOffset = Math.sin(clock.getElapsedTime() * 2) * 0.2;
        const targetPosition = windowFocusTarget.clone().addScaledVector(new THREE.Vector3(0, 1, 0), bobOffset);
        littleStar.position.lerp(targetPosition, 4 * delta);
        return sceneState;
    }

    littleStar.lookAt(camera.position);
    littleStar.rotateZ(starSpin);

    if (sceneState === 'PANORAMIC_VIEW') {

        littleStar.material.opacity = 1.0;

        stateTimer += delta;
        const startCamPos = new THREE.Vector3(littleStar.position.x, littleStar.position.y - 5, littleStar.position.z + 5);
        camera.position.lerp(startCamPos, 2 * delta);
        camera.lookAt(littleStar.position);

        if (stateTimer > SCENE_DURATIONS.PANORAMIC_VIEW) {
            sceneState = 'CINEMATIC_FALL';
            stateTimer = 0;
        }
    }
    else if (sceneState === 'CINEMATIC_FALL') {

        littleStar.material.opacity = Math.max(0.15, littleStar.material.opacity - 0.22 * delta);
        littleStar.position.y -= 25 * delta;

        const fallProgress = THREE.MathUtils.clamp(1.0 - (littleStar.position.y / 100.0), 0, 1);
        const offsetX = THREE.MathUtils.lerp(15, 0, fallProgress);
        const offsetY = THREE.MathUtils.lerp(0, 10, fallProgress);
        const offsetZ = THREE.MathUtils.lerp(0, 2, fallProgress);

        const targetCamPos = new THREE.Vector3(
            littleStar.position.x + offsetX,
            littleStar.position.y + offsetY,
            littleStar.position.z + offsetZ
        );

        camera.position.lerp(targetCamPos, 3 * delta);
        camera.lookAt(littleStar.position);

        if (littleStar.position.y <= 0) {
            littleStar.position.y = 0;
            sceneState = 'ON_WATER';
            stateTimer = 0;
        }
    }
    else if (sceneState === 'ON_WATER') {
        stateTimer += delta;
        littleStar.position.y = Math.sin(clock.getElapsedTime() * 2) * 0.5;
        const targetCamPos = new THREE.Vector3(
            littleStar.position.x,
            littleStar.position.y + 8,
            littleStar.position.z + 2
        );
        camera.position.lerp(targetCamPos, 2 * delta);
        camera.lookAt(littleStar.position);

        if (stateTimer > SCENE_DURATIONS.ON_WATER) {
            sceneState = 'RISING';
            stateTimer = 0;
        }
    }
    else if (sceneState === 'RISING') {
        littleStar.position.y += 1.3 * delta;

        const camOffsetX = Math.cos(starAngle) * (starRadius + 12);
        const camOffsetZ = Math.sin(starAngle) * (starRadius + 12);
        const orbitTargetY = Math.max(littleStar.position.y + 6, SCENE_DURATIONS.RISING_TARGET_Y + 6);

        const targetCamPos = new THREE.Vector3(camOffsetX, orbitTargetY, camOffsetZ);
        camera.position.lerp(targetCamPos, 1.2 * delta);
        camera.lookAt(littleStar.position);

        const orbitTargetPos = new THREE.Vector3(camOffsetX, SCENE_DURATIONS.RISING_TARGET_Y, camOffsetZ);
        littleStar.position.lerp(orbitTargetPos, 1.6 * delta);

        if (littleStar.position.y > SCENE_DURATIONS.RISING_TARGET_Y - 0.05) {
            stateTimer += delta;
            starBaseY = SCENE_DURATIONS.RISING_TARGET_Y;
            littleStar.position.y = SCENE_DURATIONS.RISING_TARGET_Y;

            if (stateTimer > SCENE_DURATIONS.RISING_HOLD) {
                sceneState = 'INTERACTIVE';
                stateTimer = 0;
            }
        }
    }
    else if (sceneState === 'INTERACTIVE') {
        const rotSpeed = 1.5 * delta;
        const moveSpeed = 15 * delta;
        let targetSpin = 0;

        if (keys.a || keys.ArrowLeft) {
            starAngle += rotSpeed;
            targetSpin = -0.8;
        }
        if (keys.d || keys.ArrowRight) {
            starAngle -= rotSpeed;
            targetSpin = 0.8;
        }

        starSpin = THREE.MathUtils.lerp(starSpin, targetSpin, 6 * delta);

        if (keys.w || keys.ArrowUp) starBaseY += moveSpeed;
        if (keys.s || keys.ArrowDown) starBaseY -= moveSpeed;

        starBaseY = THREE.MathUtils.clamp(starBaseY, 2, 80);
        littleStar.position.x = Math.cos(starAngle) * starRadius;
        littleStar.position.z = Math.sin(starAngle) * starRadius;

        const targetY = starBaseY + Math.sin(clock.getElapsedTime() * 2) * 0.3;
        littleStar.position.y = THREE.MathUtils.lerp(littleStar.position.y, targetY, 4 * delta);

        const camOffsetX = Math.cos(starAngle) * (starRadius + 12);
        const camOffsetZ = Math.sin(starAngle) * (starRadius + 12);

        const targetCamPos = new THREE.Vector3(camOffsetX, littleStar.position.y + 6, camOffsetZ);
        camera.position.lerp(targetCamPos, 3 * delta);
        camera.lookAt(littleStar.position);
    }

    return sceneState;
}