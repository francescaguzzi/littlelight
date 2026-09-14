import * as THREE from 'three';
import { SCENE_DURATIONS } from './story.js';

// Variabili di stato "private" (visibili solo in questo file)
let sceneState = 'PANORAMIC_VIEW';
let stateTimer = 0;
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let littleStar = null;

let starAngle = Math.atan2(12, 8); 
let starRadius = Math.sqrt(8*8 + 12*12); 
let starBaseY = 10;
let starSpin = 0;
let windowFocusTarget = null;
let savedInteractiveState = null;

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

// Funzione per inizializzare la stella e i controlli
export function initLittleStar(scene) {
    const starTexture = new THREE.TextureLoader().load('/assets/stella.png');
    const littleGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const littleMat = new THREE.MeshBasicMaterial({
        map: starTexture,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true
    });
    
    littleStar = new THREE.Mesh(littleGeo, littleMat);
    littleStar.position.set(30, 100, 0); 
    scene.add(littleStar);

    // Inizializziamo i controlli della tastiera qui, così il main resta pulito!
    window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
    window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

    // mobile support: touch events for up/down/left/right
    window.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];troika-three-text
        if (!touch) return;
        const x = touch.clientX / window.innerWidth;
        const y = touch.clientY / window.innerHeight;

        keys.w = y < 0.3; // Top 30% of the screen
        keys.s = y > 0.7; // Bottom 30% of the screen
        keys.a = x < 0.3; // Left 30% of the screen
        keys.d = x > 0.7; // Right 30% of the screen
    });

    window.addEventListener('touchend', () => {
        keys.w = false;
        keys.s = false;
        keys.a = false;
        keys.d = false;
    });

    return littleStar;
}

// Funzione da chiamare nel ciclo animate() del main.js
// Riceve la telecamera, il tempo (clock) e il delta per fare i calcoli
export function updateStarLogic(camera, clock, delta) {
    if (!littleStar) return sceneState;

    if (windowFocusTarget) {
        const bobOffset = Math.sin(clock.getElapsedTime() * 2) * 0.2;
        const targetPosition = windowFocusTarget.clone().addScaledVector(new THREE.Vector3(0, 1, 0), bobOffset);
        littleStar.position.lerp(targetPosition, 4 * delta);
        return sceneState;
    }

    littleStar.lookAt(camera.position);
    littleStar.rotateZ(starSpin);

    if (sceneState === 'PANORAMIC_VIEW') {
        // Incrementiamo il nostro cronometro
        stateTimer += delta;
        
        // Posizioniamo la telecamera alta in cielo che inquadra la stella tra le altre
        const startCamPos = new THREE.Vector3(littleStar.position.x, littleStar.position.y - 5, littleStar.position.z + 5);
        camera.position.lerp(startCamPos, 2 * delta);
        camera.lookAt(littleStar.position);

        // Dopo 4 secondi (puoi modificare questo valore), inizia la caduta
        if (stateTimer > SCENE_DURATIONS.PANORAMIC_VIEW) {
            sceneState = 'CINEMATIC_FALL';
            stateTimer = 0; // Resettiamo il cronometro per le prossime fasi
        }
    }
    else if (sceneState === 'CINEMATIC_FALL') {
        littleStar.position.y -= 25 * delta;
        littleStar.material.opacity = Math.max(0.3, littleStar.material.opacity - 0.2 * delta);

// 1. Calcoliamo la "percentuale" della caduta. 
        // Inizia a 100 di altezza (0% di caduta) e finisce a 0 (100% di caduta, valore 1.0)
        let fallProgress = 1.0 - (littleStar.position.y / 100.0);
        
        // Ci assicuriamo che il valore rimanga bloccato tra 0 e 1
        fallProgress = THREE.MathUtils.clamp(fallProgress, 0, 1);

        // 2. Calcoliamo la distanza della telecamera (Offset) in base alla caduta
        // Offset X: Inizia a 40 (telecamera molto di lato), finisce a 0 (centrata)
        const offsetX = THREE.MathUtils.lerp(15, 0, fallProgress); 
        
        // Offset Y: Inizia a 0 (altezza occhi rispetto alla stella), finisce a 35 (inquadratura dall'alto)
        const offsetY = THREE.MathUtils.lerp(0, 10, fallProgress); 
        
        // Offset Z: Leggerissimo spostamento (da 0 a 1). 
        // È FONDAMENTALE quando si guarda dall'alto verso il basso (0, -1, 0) 
        // per evitare che la telecamera si capovolga su se stessa (Gimbal Lock)
        const offsetZ = THREE.MathUtils.lerp(0, 2, fallProgress); 

        // 3. Applichiamo la posizione target e muoviamo la telecamera
        const targetCamPos = new THREE.Vector3(
            littleStar.position.x + offsetX, 
            littleStar.position.y + offsetY, 
            littleStar.position.z + offsetZ
        );
        
        // Ho aumentato leggermente la velocità del lerp (da 2 a 3) 
        // per far sì che la telecamera reagisca bene alla rotazione
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
            littleStar.position.y + 8, // Vicinissima dall'alto
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
        // littleStar.material.opacity = Math.min(1.0, littleStar.material.opacity + 0.5 * delta);

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

        const rotSpeed = 1.5 * delta; // Velocità di rotazione (Destra/Sinistra)
        const moveSpeed = 15 * delta; // Velocità di ascesa (Su/Giù)
    
        let targetSpin = 0; // se non si preme nulla sta dritta

        // 1. ROTAZIONE (A/D o Frecce Destra/Sinistra)
        if (keys.a || keys.ArrowLeft) {
            starAngle += rotSpeed;
            targetSpin = -0.8;
        }
        if (keys.d || keys.ArrowRight) {
            starAngle -= rotSpeed;
            targetSpin = 0.8;
        } 

        starSpin = THREE.MathUtils.lerp(starSpin, targetSpin, 6 * delta);

        // 2. MOVIMENTO VERTICALE (W/S o Frecce Su/Giù)
        if (keys.w || keys.ArrowUp) starBaseY += moveSpeed;
        if (keys.s || keys.ArrowDown) starBaseY -= moveSpeed;
        
        // Limitiamo l'altezza per evitare che voli via o entri nell'acqua
        starBaseY = THREE.MathUtils.clamp(starBaseY, 2, 80);

        // 3. APPLICHIAMO LA MATEMATICA ORBITALE ALLA STELLA
        // Il coseno definisce la X sul cerchio, il seno definisce la Z sul cerchio
        littleStar.position.x = Math.cos(starAngle) * starRadius;
        littleStar.position.z = Math.sin(starAngle) * starRadius;

        // Manteniamo il galleggiamento fluido basato sulla nuova altezza
        const targetY = starBaseY + Math.sin(clock.getElapsedTime() * 2) * 0.3;
        littleStar.position.y = THREE.MathUtils.lerp(littleStar.position.y, targetY, 4 * delta);

        // 4. TELECAMERA IN TERZA PERSONA ORBITALE
        const camOffsetX = Math.cos(starAngle) * (starRadius + 12);
        const camOffsetZ = Math.sin(starAngle) * (starRadius + 12);
        
        const targetCamPos = new THREE.Vector3(camOffsetX, littleStar.position.y + 6, camOffsetZ);
        camera.position.lerp(targetCamPos, 3 * delta);
        camera.lookAt(littleStar.position);
    }

    return sceneState;
}