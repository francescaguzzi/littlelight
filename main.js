import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createStarrySky, updateStarrySkyVisibility } from './stars.js';
import { initLittleStar, updateStarLogic, isWindowFocusActive, triggerStarFlash, setStarStoryBrightness,
} from './littlestar.js';
import { createWater, addWaterGui } from './water.js';
import { setupWindows, updateWindows, handleWindowClick, cancelWindowFocus, startInteractiveWindowSequence, revealCurrentWindowTexture,
} from './windows.js';
import { createNarrativeManager } from './cutscene.js';
import { STORY } from './story.js';

/* ----------------------------------------------- */

let camera, scene, renderer, controls, composer, mixer;
let water, model, moon, starrySky;
let windowsController;
let appStarted = false;

let STORY_MODE = true;

let seaAudio = null;
let songAudio = null;
let storyAudioEnabled = false;
let storyAudioStarted = false;

const narrativeElement = document.getElementById('narrative-text');
const blackoutElement = document.getElementById('story-blackout');
const storyNarrator = createNarrativeManager(narrativeElement, blackoutElement);

let clock = new THREE.Clock();
let mixerClock = new THREE.Clock();

const graphicsSettings = {
    toneMappingEnabled: true,
    toneMappingExposure: 1.0,
    bloomEnabled: true,
    bloomIntensity: 0.9,
    bloomRadius: 1.0,
    bloomThreshold: 0.7,
    waterAnimationSpeed: 1.0,
    starCount: 2000,
    waterColor: '#34506C'
};
let graphicsGui = null;

function applyGraphicsSettings() {
    if (!renderer) return;

    renderer.toneMapping = graphicsSettings.toneMappingEnabled ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = graphicsSettings.toneMappingExposure;

    if (composer) {
        const bloomPass = composer.passes.find((pass) => pass instanceof UnrealBloomPass);
        if (bloomPass) {
            bloomPass.enabled = graphicsSettings.bloomEnabled;
            bloomPass.strength = graphicsSettings.bloomIntensity;
            bloomPass.radius = graphicsSettings.bloomRadius;
            bloomPass.threshold = graphicsSettings.bloomThreshold;
        }
    }
}

function updateStarCount(newCount) {
    const count = Math.max(200, Math.min(8000, Number(newCount) || 2000));
    graphicsSettings.starCount = count;

    if (!scene || !starrySky) return;

    scene.remove(starrySky);
    starrySky = createStarrySky(count, 250);
    scene.add(starrySky);
}

function destroyGraphicsGui() {
    if (graphicsGui) {
        graphicsGui.destroy();
        graphicsGui = null;
    }
}

function createGraphicsGui() {
    if (graphicsGui || typeof dat === 'undefined') return;

    graphicsGui = new dat.GUI();

    const rendererFolder = graphicsGui.addFolder('Renderer');
    rendererFolder.add(graphicsSettings, 'toneMappingEnabled').name('Tone mapping');
    rendererFolder.add(graphicsSettings, 'toneMappingExposure', 0.1, 3.0, 0.01).name('Exposure');

    const bloomFolder = graphicsGui.addFolder('Bloom');
    bloomFolder.add(graphicsSettings, 'bloomEnabled').name('Enable bloom');
    bloomFolder.add(graphicsSettings, 'bloomIntensity', 0.0, 3.0, 0.01).name('Intensity');
    bloomFolder.add(graphicsSettings, 'bloomRadius', 0.0, 2.5, 0.01).name('Radius');
    bloomFolder.add(graphicsSettings, 'bloomThreshold', 0.0, 2.0, 0.01).name('Threshold');

    const skyFolder = graphicsGui.addFolder('Sky');
    skyFolder.add(graphicsSettings, 'starCount', 200, 6000, 50).name('Star count').onChange((value) => {
        updateStarCount(value);
    });

    if (water) addWaterGui(graphicsGui, water);
}

window.setGameMode = function (isStoryMode) {
    STORY_MODE = !!isStoryMode;
    if (controls) {
        controls.enabled = !STORY_MODE;
    }

    if (STORY_MODE) {
        destroyGraphicsGui();
    } else {
        createGraphicsGui();
    }
};

function ensureStoryAudio() {
    if (seaAudio || songAudio) return;

    seaAudio = new Audio('./assets/audio/seawaves.mp3');
    seaAudio.loop = true;
    seaAudio.preload = 'auto';
    seaAudio.volume = 0.28;

    songAudio = new Audio('./assets/audio/risesthemoon.mp3');
    songAudio.loop = true;
    songAudio.preload = 'auto';
    songAudio.volume = 0.4;
}

function pauseStoryAudio() {
    if (seaAudio) seaAudio.pause();
    if (songAudio) songAudio.pause();
}

function startStoryAudio() {
    ensureStoryAudio();
    if (!storyAudioEnabled || !seaAudio || !songAudio) return;

    if (!storyAudioStarted) {
        storyAudioStarted = true;
        songAudio.currentTime = 0;
        songAudio.volume = 0.4;
        songAudio.play().catch(() => {});
    }
}

function startSeaLoopAfterSplash() {
    ensureStoryAudio();
    if (!storyAudioEnabled || !seaAudio) return;

    if (seaAudio.paused) {
        seaAudio.currentTime = 0;
        seaAudio.play().catch(() => {});
    }
}

window.toggleMusic = function () {
    const button = document.getElementById('music-toggle');
    if (button) {
        const isOn = !button.dataset.musicOn || button.dataset.musicOn === 'false';
        button.dataset.musicOn = String(isOn);
        button.textContent = isOn ? 'Music: On' : 'Music: Off';
        storyAudioEnabled = isOn;

        if (!isOn) {
            pauseStoryAudio();
            return false;
        }

        ensureStoryAudio();
        if (appStarted && STORY_MODE && !storyAudioStarted) {
            startStoryAudio();
        }
    }

    return !!(button && button.dataset.musicOn === 'true');
};

window.startGame = function (isStoryMode) {
    STORY_MODE = !!isStoryMode;
    const menu = document.getElementById('title-screen');
    if (menu) menu.style.display = 'none';

    if (!appStarted) {
        appStarted = true;
        init();
        animate();
    }

    if (STORY_MODE) {
        if (storyAudioEnabled) {
            startStoryAudio();
        }
        destroyGraphicsGui();
    } else {
        pauseStoryAudio();
        createGraphicsGui();
    }

    if (controls) {
        controls.enabled = !STORY_MODE;
    }
};

function setupTitleScreen() {
    const musicButton = document.getElementById('music-toggle');
    const storyButton = document.getElementById('start-story');
    const graphicsButton = document.getElementById('start-graphics');

    if (musicButton) {
        musicButton.dataset.musicOn = 'false';
        musicButton.addEventListener('click', () => {
            window.toggleMusic();
        });
    }

    if (storyButton) {
        storyButton.addEventListener('click', () => {
            window.startGame(true);
        });
    }

    if (graphicsButton) {
        graphicsButton.addEventListener('click', () => {
            window.startGame(false);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTitleScreen);
} else {
    setupTitleScreen();
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1f1c38);
    scene.environment = scene.background;
    scene.fog = new THREE.Fog(0x1f1c38, 10, 100);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);
    if (!STORY_MODE) camera.position.set(20, 15, 30);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit pixel ratio for performance on high-DPI screens
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    renderer.toneMapping = graphicsSettings.toneMappingEnabled ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = graphicsSettings.toneMappingExposure;

    const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
    });
    
    composer = new EffectComposer(renderer, renderTarget);
    composer.setPixelRatio(window.devicePixelRatio);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
        graphicsSettings.bloomIntensity,
        graphicsSettings.bloomRadius,
        graphicsSettings.bloomThreshold
    );
    composer.addPass(bloomPass);
    applyGraphicsSettings();
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    /* ---------------------------------------------- */

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enabled = !STORY_MODE;

    scene.add(new THREE.AmbientLight(0xfcf6ca, 1));

    moon = new THREE.DirectionalLight(0x88bbff, 0.5);
    moon.position.set(10, 80, -10);
    scene.add(moon);

    /* ---------------------------------------------- */

    if (STORY_MODE) initLittleStar(scene);

    starrySky = createStarrySky(graphicsSettings.starCount, 250);
    scene.add(starrySky);

    water = createWater(moon, scene.fog !== undefined);
    scene.add(water);

    /* ---------------------------------------------- */

    const loader = new GLTFLoader();
    loader.load('./assets/building.gltf', function (gltf) {
        model = gltf.scene;

        model.traverse((child) => {

            if (child.isMesh && child.material.name.includes("Street") && child.material.name.includes("Emission")) {

                child.material = child.material.clone();
                child.material.emissive = new THREE.Color(0xffaa00);
                child.material.emissiveIntensity = 2.0;
            }
        });
        scene.add(model);

        // DEBUG

        // const textures = new Map();
        // model.traverse((object) => {
        //     if (!object.isMesh) return;
        //     const materials = Array.isArray(object.material)
        //         ? object.material
        //         : [object.material];
        //     materials.forEach((material) => {
        //         for (const key in material) {
        //             const texture = material[key];
        //             if (!texture || !texture.isTexture) continue;
        //             const image = texture.image;
        //             if (!image) continue;
        //             const width = image.width || image.videoWidth;
        //             const height = image.height || image.videoHeight;
        //             const keyImage =
        //                 `${width}x${height}_${texture.name}`;
        //             if (!textures.has(keyImage)) {
        //                 textures.set(keyImage, {
        //                     name: texture.name,
        //                     width,
        //                     height,
        //                     count: 0
        //                 });
        //             }
        //             textures.get(keyImage).count++;
        //         }
        //     });
        // });
        // console.table(
        //     [...textures.values()]
        //         .sort((a, b) =>
        //             (b.width * b.height) -
        //             (a.width * a.height)
        //         )
        // );
        // let total = 0;
        // for (const tex of textures.values()) {
        //     total += tex.width * tex.height * 4;
        // }
        // console.log(
        //     "Texture uniche stimate:",
        //     `${(total / 1024 / 1024).toFixed(1)} MB`
        // );

        windowsController = setupWindows(model, scene, STORY.windows, camera);
        windowsController.onWindowFramed = storyNarrator.playWindowVignette;
        windowsController.onWindowFocusCleared = storyNarrator.clear;
        windowsController.onSequenceComplete = storyNarrator.playEnding;
        storyNarrator.setOnVignetteComplete((windowName) => {
            if (windowsController) {
                setStarStoryBrightness(0.15);
                windowsController.finishWindowSequenceStep(windowName);
            }
        });
        storyNarrator.setTextureHandler(() => {
            if (windowsController) {
                revealCurrentWindowTexture(windowsController);
            }
        });
        storyNarrator.setFlashHandler(() => {
            if (windowsController) { // && windowsController.currentIndex >= 0) {
                triggerStarFlash();
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                mixer.clipAction(clip).play();
            });
        }

    }, undefined, function (error) {
        console.error(error);
    });

    /* ---------------------------------------------- */

    renderer.domElement.addEventListener('click', (event) => {
        if (!STORY_MODE || !windowsController) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Prima prova ad inquadrare la finestra attiva: funziona anche con un
        // focus precedente ancora attivo su una finestra completata (il click
        // sulla finestra nuova la rifocalizza).
        if (handleWindowClick(windowsController, camera, ndcX, ndcY)) return;

        // Qualsiasi altro click mentre un focus è attivo lo annulla: la camera
        // resta inquadrata sulla finestra finché l'utente non clicca un punto
        // diverso dello schermo.
        if (isWindowFocusActive()) {
            cancelWindowFocus(windowsController);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.code !== 'Space') return;
        if (!STORY_MODE) return;
        storyNarrator.triggerFlash();
    });

    window.addEventListener('resize', onWindowResize);


}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}


function animate() {
    requestAnimationFrame(animate);

    const t = clock.getElapsedTime();
    const delta = mixerClock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    applyGraphicsSettings();

    if (starrySky) {
        updateStarrySkyVisibility(starrySky, camera);
        starrySky.rotation.y -= 0.0003;

        starrySky.traverse((child) => {
            if (child.isInstancedMesh && child.material && child.material.uniforms) {
                child.material.uniforms.uTime.value = t;
            }
        });
    }

    if (STORY_MODE && windowsController) {
        updateWindows(windowsController, delta, camera, controls);
    }

    if (STORY_MODE) {
        const currentState = updateStarLogic(camera, mixerClock, delta);
        storyNarrator.updateCutsceneState(currentState, delta);

        if (currentState === 'INTERACTIVE' && windowsController && !windowsController.sequenceStarted) {
            startInteractiveWindowSequence(windowsController);
        }

        if (currentState === 'ON_WATER' && storyAudioEnabled) {
            startSeaLoopAfterSplash();
        }

        if (currentState === 'INTERACTIVE' && !isWindowFocusActive()) controls.enabled = true;
        if (isWindowFocusActive()) controls.enabled = false;
        if (controls.enabled) controls.update();
    }
    else {
        controls.enabled = true;
        controls.update();
    }

    composer.render();
}