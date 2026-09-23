import * as THREE from 'three';

function createStarChunk(count, baseIndex = 0) {
    const starGeometry = new THREE.PlaneGeometry(1.5, 1.5, 1, 1);

    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        phases[i] = Math.random() * Math.PI * 2;
    }

    starGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

    const textureLoader = new THREE.TextureLoader();
    const starTexture = textureLoader.load('./assets/other-textures/star.png');

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uTexture: { value: starTexture }
        },
        vertexShader: `
            attribute float aPhase;

            varying vec3 vColor;
            varying vec2 vUv;
            varying float vAlpha;

            uniform float uTime;

            void main() {
                vColor = instanceColor;
                vUv = uv;

                float twinkle = sin(uTime * 2.0 + aPhase) * 0.5 + 0.5;
                vAlpha = mix(0.1, 1.0, twinkle);

                vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D uTexture;

            varying vec3 vColor;
            varying vec2 vUv;
            varying float vAlpha;

            void main() {
                vec4 texColor = texture2D(uTexture, vUv);
                gl_FragColor = vec4(texColor.rgb * vColor, texColor.a * vAlpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    });

    const chunkMesh = new THREE.InstancedMesh(starGeometry, starMaterial, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const localPositions = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 600;
        const y = Math.random() * 300 + 20;
        const z = (Math.random() - 0.5) * 600;

        localPositions.push(new THREE.Vector3(x, y, z));
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);

        dummy.position.set(x, y, z);
        dummy.lookAt(0, 0, 0);
        dummy.rotateZ(Math.random() * Math.PI * 2);
        dummy.updateMatrix();

        chunkMesh.setMatrixAt(i, dummy.matrix);

        const randomColor = Math.random();
        if (randomColor > 0.7) color.setHex(0xffffff);
        else if (randomColor > 0.4) color.setHex(0xaaccff);
        else color.setHex(0xffddaa);

        chunkMesh.setColorAt(i, color);
    }

    const center = new THREE.Vector3(
        (minX + maxX) * 0.5,
        (minY + maxY) * 0.5,
        (minZ + maxZ) * 0.5
    );

    let radius = 0;
    for (const point of localPositions) {
        radius = Math.max(radius, center.distanceTo(point));
    }

    chunkMesh.userData.frustumSphere = new THREE.Sphere(center, radius + 4);
    chunkMesh.userData.baseIndex = baseIndex;
    chunkMesh.instanceMatrix.needsUpdate = true;
    chunkMesh.instanceColor.needsUpdate = true;

    return chunkMesh;
}

/**
 * Creates a starry sky by splitting the field into smaller chunks so each chunk can be
 * individually frustum-culled without forcing the whole sky to remain visible.
 * @param {number} starsCount - Total number of stars.
 * @param {number} chunkSize - How many stars each instanced batch should contain.
 * @returns {THREE.Group} The star field container.
 */
export function createStarrySky(starsCount = 2000, chunkSize = 250) {
    const starField = new THREE.Group();
    const chunkCount = Math.ceil(starsCount / chunkSize);

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
        const currentCount = Math.min(chunkSize, starsCount - (chunkIndex * chunkSize));
        const chunk = createStarChunk(currentCount, chunkIndex * chunkSize);
        starField.add(chunk);
    }

    return starField;
}

export function updateStarrySkyVisibility(starField, camera) {
    if (!starField || !camera) return;

    const projectionViewMatrix = new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
    );
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(projectionViewMatrix);

    starField.traverse((child) => {
        if (!child.isInstancedMesh || !child.userData.frustumSphere) return;

        const worldSphere = child.userData.frustumSphere.clone();
        worldSphere.applyMatrix4(child.matrixWorld);
        child.visible = frustum.intersectsSphere(worldSphere);
    });
}
