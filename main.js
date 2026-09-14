import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createStarrySky, updateStarrySkyVisibility } from './stars.js';
import { initLittleStar, updateStarLogic, isWindowFocusActive } from './littlestar.js';
import { createWater } from './water.js';
import { setupWindows, updateWindows, handleWindowClick, isPointerOverCurrentWindow, cancelWindowFocus } from './windows.js';
import { createNarrativeManager } from './story.js';

/* ----------------------------------------------- */

let camera, scene, renderer, controls, composer, mixer;
let water, model, moon, waterNormalMap, starrySky;
let windowsController;
let audioContext = null;
let musicGainNode = null;
let appStarted = false;
let STORY_MODE = true;

const narrativeElement = document.getElementById('narrative-text');
const blackoutElement = document.getElementById('story-blackout');
const storyNarrator = createNarrativeManager(narrativeElement, blackoutElement);

const WINDOW_SEQUENCE = [
    'window-1',
    'window-2',
    'window-3-front',
    'window-4-clothes',
    'window-5-fan',
];

let clock = new THREE.Clock();
let mixerClock = new THREE.Clock();

const graphicsSettings = {
    toneMappingEnabled: true,
    toneMappingExposure: 1.0,
    bloomEnabled: true,
    bloomIntensity: 0.9,
    bloomRadius: 1.0,
    bloomThreshold: 0.7,
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

    if (water && water.material && water.material.uniforms && water.material.uniforms.waterColor) {
        water.material.uniforms.waterColor.value.set(graphicsSettings.waterColor);
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

    const waterFolder = graphicsGui.addFolder('Water');
    waterFolder.addColor(graphicsSettings, 'waterColor').name('Water color').onChange((value) => {
        graphicsSettings.waterColor = value;
        if (water && water.material && water.material.uniforms && water.material.uniforms.waterColor) {
            water.material.uniforms.waterColor.value.set(value);
        }
    });
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

window.toggleMusic = function () {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;

    if (!audioContext) {
        audioContext = new AudioCtor();
        musicGainNode = audioContext.createGain();
        musicGainNode.gain.value = 0.0;
        musicGainNode.connect(audioContext.destination);
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const button = document.getElementById('music-toggle');
    if (button) {
        const isOn = !button.dataset.musicOn || button.dataset.musicOn === 'false';
        button.dataset.musicOn = String(isOn);
        button.textContent = isOn ? 'Music: On' : 'Music: Off';

        if (musicGainNode) {
            musicGainNode.gain.value = 0.0; // MUSIC MUTED
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

    if (controls) {
        controls.enabled = !STORY_MODE;
    }

    if (STORY_MODE) {
        destroyGraphicsGui();
    } else {
        createGraphicsGui();
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

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 1000);
    if (!STORY_MODE) camera.position.set(20, 15, 30); 

    /* ---------------------------------------------- */
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio, 1.5);
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

    /* ---------------------------------------------- */

    scene.add(new THREE.AmbientLight(0xfcf6ca, 1));

    moon = new THREE.DirectionalLight(0x88bbff, 0.5);
    moon.position.set(10, 40, -10);
    scene.add(moon);

    /* ---------------------------------------------- */

    if (STORY_MODE) initLittleStar(scene);

    starrySky = createStarrySky(graphicsSettings.starCount, 250);
    scene.add(starrySky);

    water = createWater(moon, scene.fog !== undefined);
    water.material.uniforms.waterColor.value.set(graphicsSettings.waterColor);
    scene.add(water);

    /* ---------------------------------------------- */

    const loader = new GLTFLoader();
    loader.load('./assets/finalbuilding.gltf', function (gltf) {
        model = gltf.scene;

        model.traverse((child) => {

            // if (child.isMesh) console.log(child.material.name);

            if (child.isMesh && child.material.name.includes("Street") && child.material.name.includes("Emission")) {

                child.material = child.material.clone();
                child.material.emissive = new THREE.Color(0xffaa00);
                child.material.emissiveIntensity = 2.0;
            }
        });
        scene.add(model);

        windowsController = setupWindows(model, scene, WINDOW_SEQUENCE);
        windowsController.onWindowFramed = storyNarrator.playWindowVignette;
        windowsController.onWindowFocusCleared = storyNarrator.clear;

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

        if (isWindowFocusActive()) {
            if (!isPointerOverCurrentWindow(windowsController, camera, ndcX, ndcY)) {
                cancelWindowFocus(windowsController);
            }
            return;
        }

        handleWindowClick(windowsController, camera, ndcX, ndcY);
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

    if (water && water.material) {
        water.material.uniforms['time'].value += 0.004;
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