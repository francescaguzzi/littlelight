import * as THREE from "three";

/* ============================================================
   VERTEX SHADER — 6 onde di Gerstner + normale analitica
   La geometria è già ruotata su XZ (rotateX all'origine).
   ============================================================ */

const NUM_WAVES = 3;

const waterVertexShader = `

uniform float uTime;
uniform float uWaveHeight;      // moltiplicatore globale (GUI)
uniform float uWaveSpeed;       // moltiplicatore globale (GUI)
uniform vec4  uWaves[${NUM_WAVES}];   // (dirX, dirZ, steepness, wavelength)
uniform mat4  uTextureMatrix;

varying vec3  vWorldPosition;
varying vec3  vNormal;
varying vec4  vReflectCoord;
varying float vViewZ;
varying float vWaveHeightOut;

#include <fog_pars_vertex>

vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {

    float steepness  = wave.z * uWaveHeight;
    float wavelength = wave.w;

    float k = 6.28318530718 / wavelength;
    float c = sqrt(9.81 / k) * uWaveSpeed;
    vec2  d = normalize(wave.xy);
    float f = k * (dot(d, p.xz) - c * uTime);
    float a = steepness / k;

    tangent += vec3(
        -d.x * d.x * (steepness * sin(f)),
         d.x        * (steepness * cos(f)),
        -d.x * d.y * (steepness * sin(f))
    );

    binormal += vec3(
        -d.x * d.y * (steepness * sin(f)),
         d.y        * (steepness * cos(f)),
        -d.y * d.y * (steepness * sin(f))
    );

    return vec3(
        d.x * (a * cos(f)),
        a * sin(f),
        d.y * (a * cos(f))
    );
}

void main() {

    vec3 displaced = position;
    vec3 tangent   = vec3(1.0, 0.0, 0.0);
    vec3 binormal  = vec3(0.0, 0.0, 1.0);

    for (int i = 0; i < ${NUM_WAVES}; i++) {
        displaced += gerstnerWave(uWaves[i], position, tangent, binormal);
    }

    vec3 waveNormal = normalize(cross(binormal, tangent));
    vWaveHeightOut  = displaced.y - position.y;

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal        = normalize(mat3(modelMatrix) * waveNormal);

    vReflectCoord = uTextureMatrix * vec4(position, 1.0);

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewZ = mvPosition.z;

    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
}
`;

/* ============================================================
   FRAGMENT SHADER
   ============================================================ */

const waterFragmentShader = `

uniform sampler2D uReflectionTexture;
uniform sampler2D uRefractionTexture;
uniform sampler2D uDepthTexture;
uniform sampler2D uNormalMap;

uniform vec2  uResolution;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uTime;

uniform vec3  uShallowColor;
uniform vec3  uDeepColor;
uniform vec3  uFoamColor;
uniform vec3  uSunColor;
uniform vec3  uSunDirection;

uniform float uNormalStrength;
uniform float uNormalScale;
uniform float uRippleSpeed;
uniform float uDistortion;
uniform float uDepthFade;
uniform float uReflectivity;
uniform float uShininess;
uniform float uSpecularStrength;
uniform float uFoamDistance;
uniform float uFoamCrest;
uniform float uFoamCrestStrength;

varying vec3  vWorldPosition;
varying vec3  vNormal;
varying vec4  vReflectCoord;
varying float vViewZ;
varying float vWaveHeightOut;

#include <packing>
#include <fog_pars_fragment>

float sceneViewZ(vec2 uv) {
    float d = texture2D(uDepthTexture, uv).x;
    return perspectiveDepthToViewZ(d, uCameraNear, uCameraFar);
}

void main() {

    vec2 screenUV = gl_FragCoord.xy / uResolution;

    /* ---- increspature: due layer di normal map a scale diverse ---- */

    float t = uTime * uRippleSpeed;
    vec2 uv1 = vWorldPosition.xz * uNormalScale       + vec2( t * 0.020, t * 0.014);
    vec2 uv2 = vWorldPosition.xz * uNormalScale * 2.7 - vec2( t * 0.016, t * 0.031);

    vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
    vec2 detail = (n1.xy + n2.xy) * 0.5;

    vec3 normal = normalize(vNormal + vec3(detail.x, 0.0, detail.y) * uNormalStrength);

    /* ---- profondità dell'acqua sotto il pixel ---- */

    float waterDepth = max(vViewZ - sceneViewZ(screenUV), 0.0);

    /* ---- rifrazione screen-space ---- */

    vec2 distortion = normal.xz * uDistortion * clamp(waterDepth * 0.5, 0.0, 1.0);
    vec2 refractUV  = clamp(screenUV + distortion, 0.002, 0.998);

    if (vViewZ - sceneViewZ(refractUV) < 0.0) refractUV = screenUV;

    vec3 refraction = texture2D(uRefractionTexture, refractUV).rgb;

    /* ---- assorbimento ---- */

    float absorption = 1.0 - exp(-waterDepth / uDepthFade);
    vec3  bodyColor  = mix(uShallowColor, uDeepColor, absorption);
    vec3  underwater = mix(refraction, bodyColor, clamp(absorption, 0.0, 1.0));

    /* ---- riflesso planare ---- */

    vec2 reflectUV  = vReflectCoord.xy / vReflectCoord.w + distortion * 0.6;
    vec3 reflection = texture2D(uReflectionTexture, clamp(reflectUV, 0.002, 0.998)).rgb;

    /* ---- Fresnel ---- */

    vec3  viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - clamp(dot(viewDir, normal), 0.0, 1.0), 5.0);
    fresnel = mix(0.02, 1.0, fresnel) * uReflectivity;

    vec3 color = mix(underwater, reflection, clamp(fresnel, 0.0, 1.0));

    /* ---- specular ---- */

    vec3  halfVec = normalize(normalize(uSunDirection) + viewDir);
    float spec    = pow(max(dot(normal, halfVec), 0.0), uShininess);
    color += uSunColor * spec * uSpecularStrength;

    /* ---- schiuma ---- */

    float noise = texture2D(uNormalMap, vWorldPosition.xz * 0.25 + t * 0.02).r;

    float shoreFoam = 1.0 - smoothstep(0.0, uFoamDistance, waterDepth);
    shoreFoam = smoothstep(0.25, 0.75, shoreFoam * (0.55 + 0.75 * noise));

    float crestFoam = smoothstep(uFoamCrest, uFoamCrest + 0.35, vWaveHeightOut)
                    * noise * uFoamCrestStrength;

    color = mix(color, uFoamColor, clamp(shoreFoam + crestFoam, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
`;

/* ============================================================
   FACTORY
   ============================================================ */

export function createWater(light, hasFog = false, options = {}) {

    const {
        size              = 200,
        segments          = 200,
        y                 = -0.4,
        normalMapUrl      = './assets/textures/waternormals.jpg',
        renderTargetScale = 0.5,
        clipBias          = 0.003,
        shallowColor      = 0x34506C,
        deepColor         = 0x203143, // 0x0a1523,
        foamColor         = 0x728695, // 0xc7d8e4,
        sunColor          = 0x92b0bf,

        // Mare calmo notturno: ampiezze basse, lunghezze d'onda NON armoniche
        // (nessun rapporto intero fra loro) e direzioni molto sparse, così le
        // creste non si allineano mai in file parallele.
        waves = [
            // dirX,  dirZ, steepness, wavelength
            [  1.00,  0.12,   0.030,   41.3 ],
            [ -0.25,  1.00,   0.024,   27.7 ],
            [  0.72, -0.86,   0.018,   17.1 ],
            [ -0.95, -0.41,   0.013,   10.3 ],
            [  0.31,  0.94,   0.009,    6.7 ],
            [ -0.66,  0.55,   0.006,    3.9 ]
        ]
    } = options;

    /* ---------- texture ---------- */

    const normalMap = new THREE.TextureLoader().load(normalMapUrl);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.colorSpace = THREE.NoColorSpace;

    /* ---------- render target ---------- */

    const reflectionRT = new THREE.WebGLRenderTarget(512, 512, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType
    });

    const refractionRT = new THREE.WebGLRenderTarget(256, 256, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType
    });

    refractionRT.depthTexture = new THREE.DepthTexture(256, 256);
    refractionRT.depthTexture.format = THREE.DepthFormat;
    refractionRT.depthTexture.type   = THREE.UnsignedIntType;

    /* ---------- uniforms ---------- */

    const uniforms = THREE.UniformsUtils.merge([ THREE.UniformsLib.fog, {} ]);

    Object.assign(uniforms, {
        uTime:              { value: 0 },
        uWaves:             { value: waves.map(w => new THREE.Vector4(...w)) },
        uTextureMatrix:     { value: new THREE.Matrix4() },

        uReflectionTexture: { value: reflectionRT.texture },
        uRefractionTexture: { value: refractionRT.texture },
        uDepthTexture:      { value: refractionRT.depthTexture },
        uNormalMap:         { value: normalMap },

        uResolution:        { value: new THREE.Vector2(1, 1) },
        uCameraNear:        { value: 0.1 },
        uCameraFar:         { value: 1000 },

        uShallowColor:      { value: new THREE.Color(shallowColor) },
        uDeepColor:         { value: new THREE.Color(deepColor) },
        uFoamColor:         { value: new THREE.Color(foamColor) },
        uSunColor:          { value: new THREE.Color(sunColor) },
        uSunDirection:      { value: new THREE.Vector3(0, 1, 0) },

        // --- geometria delle onde ---
        uWaveHeight:        { value: 0.6 },     // 0 = specchio d'acqua piatto
        uWaveSpeed:         { value: 1.0 },    // 1.0 = velocità fisica reale

        // --- superficie ---
        uNormalStrength:    { value: 1.0 },
        uNormalScale:       { value: 0.01 },
        uRippleSpeed:       { value: 0.5 },
        uDistortion:        { value: 0.025 },

        // --- colore e luce ---
        uDepthFade:         { value: 5.0 },
        uReflectivity:      { value: 1.0 },
        uShininess:         { value: 220.0 },
        uSpecularStrength:  { value: 0.9 },

        // --- schiuma ---
        uFoamDistance:      { value: 1.2 },
        uFoamCrest:         { value: 0.2 },
        uFoamCrestStrength: { value: 0.0 }      // mare calmo: niente spuma in cresta
    });

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader:   waterVertexShader,
        fragmentShader: waterFragmentShader,
        fog: hasFog,
        side: THREE.FrontSide,
        transparent: false
    });

    /* ---------- mesh ---------- */

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const water = new THREE.Mesh(geometry, material);
    water.position.y = y;
    water.name = 'water';

    /* ---------- camera specchio ---------- */

    const mirrorCamera      = new THREE.PerspectiveCamera();
    const reflectorPlane    = new THREE.Plane();
    const normal            = new THREE.Vector3();
    const waterWorldPos     = new THREE.Vector3();
    const cameraWorldPos    = new THREE.Vector3();
    const rotationMatrix    = new THREE.Matrix4();
    const lookAtPosition    = new THREE.Vector3();
    const view              = new THREE.Vector3();
    const target            = new THREE.Vector3();
    const clipPlane         = new THREE.Vector4();
    const q                 = new THREE.Vector4();
    const drawingBufferSize = new THREE.Vector2();

    const clock = new THREE.Clock();

    function updateMirrorCamera(camera) {

        waterWorldPos.setFromMatrixPosition(water.matrixWorld);
        cameraWorldPos.setFromMatrixPosition(camera.matrixWorld);

        rotationMatrix.extractRotation(water.matrixWorld);
        normal.set(0, 1, 0).applyMatrix4(rotationMatrix);

        view.subVectors(waterWorldPos, cameraWorldPos);
        view.reflect(normal).negate().add(waterWorldPos);

        rotationMatrix.extractRotation(camera.matrixWorld);
        lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPos);

        target.subVectors(waterWorldPos, lookAtPosition);
        target.reflect(normal).negate().add(waterWorldPos);

        mirrorCamera.position.copy(view);
        mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
        mirrorCamera.lookAt(target);
        mirrorCamera.near = camera.near;
        mirrorCamera.far  = camera.far;
        mirrorCamera.updateMatrixWorld();
        mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

        uniforms.uTextureMatrix.value.set(
            0.5, 0.0, 0.0, 0.5,
            0.0, 0.5, 0.0, 0.5,
            0.0, 0.0, 0.5, 0.5,
            0.0, 0.0, 0.0, 1.0
        );
        uniforms.uTextureMatrix.value
            .multiply(mirrorCamera.projectionMatrix)
            .multiply(mirrorCamera.matrixWorldInverse)
            .multiply(water.matrixWorld);

        // oblique near-plane clipping
        reflectorPlane
            .setFromNormalAndCoplanarPoint(normal, waterWorldPos)
            .applyMatrix4(mirrorCamera.matrixWorldInverse);

        clipPlane.set(
            reflectorPlane.normal.x,
            reflectorPlane.normal.y,
            reflectorPlane.normal.z,
            reflectorPlane.constant
        );

        const p = mirrorCamera.projectionMatrix;

        q.x = (Math.sign(clipPlane.x) + p.elements[8]) / p.elements[0];
        q.y = (Math.sign(clipPlane.y) + p.elements[9]) / p.elements[5];
        q.z = -1.0;
        q.w = (1.0 + p.elements[10]) / p.elements[14];

        clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

        p.elements[2]  = clipPlane.x;
        p.elements[6]  = clipPlane.y;
        p.elements[10] = clipPlane.z + 1.0 - clipBias;
        p.elements[14] = clipPlane.w;
    }

    function resizeTargets(renderer) {
        renderer.getDrawingBufferSize(drawingBufferSize);
        uniforms.uResolution.value.copy(drawingBufferSize);

        const w = Math.max(1, Math.floor(drawingBufferSize.x * renderTargetScale));
        const h = Math.max(1, Math.floor(drawingBufferSize.y * renderTargetScale));

        if (reflectionRT.width !== w || reflectionRT.height !== h) {
            reflectionRT.setSize(w, h);
            refractionRT.setSize(w, h);
        }
    }

    /* ---------- due pass extra prima di disegnare l'acqua ---------- */

    water.onBeforeRender = function (renderer, scene, camera) {

        if (!camera.isPerspectiveCamera) return;

        uniforms.uTime.value       = clock.getElapsedTime();
        uniforms.uCameraNear.value = camera.near;
        uniforms.uCameraFar.value  = camera.far;

        if (light) uniforms.uSunDirection.value.copy(light.position).normalize();

        resizeTargets(renderer);
        updateMirrorCamera(camera);

        const currentRT     = renderer.getRenderTarget();
        const currentXr     = renderer.xr.enabled;
        const currentShadow = renderer.shadowMap.autoUpdate;

        water.visible = false;
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;

        renderer.setRenderTarget(reflectionRT);
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, mirrorCamera);

        renderer.setRenderTarget(refractionRT);
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, camera);

        water.visible = true;
        renderer.xr.enabled = currentXr;
        renderer.shadowMap.autoUpdate = currentShadow;
        renderer.setRenderTarget(currentRT);

        if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
    };

    water.dispose = function () {
        geometry.dispose();
        material.dispose();
        normalMap.dispose();
        reflectionRT.dispose();
        refractionRT.dispose();
    };

    return water;
}


export function addWaterGui(gui, water) {

    const u = water.material.uniforms;

    const colors = {
        shallow: '#' + u.uShallowColor.value.getHexString(),
        deep:    '#' + u.uDeepColor.value.getHexString(),
        foam:    '#' + u.uFoamColor.value.getHexString(),
        sun:     '#' + u.uSunColor.value.getHexString()
    };

    const folder = gui.addFolder('Water');

    folder.add(u.uWaveHeight,        'value', 0.0,  3.0,  0.01).name('Wave height');
    folder.add(u.uWaveSpeed,         'value', 0.0,  1.5,  0.01).name('Wave speed');
    folder.add(u.uNormalStrength,    'value', 0.0,  1.0,  0.01).name('Ripples');
    folder.add(u.uNormalScale,       'value', 0.01, 0.20, 0.002).name('Ripple scale');
    folder.add(u.uRippleSpeed,       'value', 0.0,  3.0,  0.01).name('Ripple speed');
    folder.add(u.uDistortion,        'value', 0.0,  0.12, 0.001).name('Distortion');
    folder.add(u.uReflectivity,      'value', 0.0,  1.0,  0.01).name('Reflectivity');
    folder.add(u.uDepthFade,         'value', 0.2, 12.0,  0.1).name('Depth fade');
    folder.add(u.uSpecularStrength,  'value', 0.0,  4.0,  0.01).name('Specular');
    folder.add(u.uShininess,         'value', 10,  600,   1).name('Shininess');
    folder.add(u.uFoamDistance,      'value', 0.0,  5.0,  0.05).name('Foam width');
    folder.add(u.uFoamCrestStrength, 'value', 0.0,  1.0,  0.01).name('Crest foam');
    folder.add(u.uFoamCrest,         'value', 0.0,  1.5,  0.01).name('Crest threshold');

    folder.addColor(colors, 'shallow').name('Shallow color')
        .onChange(v => u.uShallowColor.value.set(v));
    folder.addColor(colors, 'deep').name('Deep color')
        .onChange(v => u.uDeepColor.value.set(v));
    folder.addColor(colors, 'foam').name('Foam color')
        .onChange(v => u.uFoamColor.value.set(v));
    folder.addColor(colors, 'sun').name('Highlight color')
        .onChange(v => u.uSunColor.value.set(v));

    return folder;
}