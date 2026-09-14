import * as THREE from 'three';

/** 
 * Creates a starry sky with twinkling stars. Each star is a plane with a star texture, and the twinkling effect is 
 * achieved using a sine function in the vertex shader.
 * The whole sky is represented as an InstancedMesh for performance, allowing thousands of stars to be rendered efficiently.
 * @param {number} starsCount - The number of stars to create.
 * @returns {THREE.InstancedMesh} The instanced mesh representing the starry sky.
 */
export function createStarrySky(starsCount = 2000) {

    const starGeometry = new THREE.PlaneGeometry(1.5, 1.5, 1, 1); 
    
    // array for storing the phase of each star for twinkling effect
    const phases = new Float32Array(starsCount);
    for(let i = 0; i < starsCount; i++) {
        phases[i] = Math.random() * Math.PI * 2; 
    }
    
    // we use instanced buffer attributes to store the phase for each star
    starGeometry.setAttribute(
        'aPhase', 
        new THREE.InstancedBufferAttribute(phases, 1)
    );

    const textureLoader = new THREE.TextureLoader();
    const starTexture = textureLoader.load('/assets/stella.png');
    
    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }, // from main.js, we will update this uniform every frame
            uTexture: { value: starTexture } 
        },
        
        vertexShader: `
            
            attribute float aPhase;
            
            // Fragment shader variables
            varying vec3 vColor;
            varying vec2 vUv;
            varying float vAlpha;
            
            uniform float uTime;
            
            void main() {
                vColor = instanceColor;
                vUv = uv;
                
                // LA MAGIA: Calcoliamo il lampeggio usando il seno del tempo + lo sfasamento.
                // Moltiplichiamo uTime per gestire la velocità dello scintillio.
                // Il seno va da -1 a 1, mappiamolo da 0.2 (luminosità minima) a 1.0 (massima).
                float twinkle = sin(uTime * 2.0 + aPhase) * 0.5 + 0.5; 
                vAlpha = mix(0.1, 1.0, twinkle); 
                
                // Calcolo standard della posizione per un InstancedMesh
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
                // Leggiamo il pixel dalla texture
                vec4 texColor = texture2D(uTexture, vUv);
                
                // Moltiplichiamo il colore della texture per il colore della stella 
                // e applichiamo l'alpha (trasparenza) calcolata nel vertex shader
                gl_FragColor = vec4(texColor.rgb * vColor, texColor.a * vAlpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    });
    
    const starUniverse = new THREE.InstancedMesh(starGeometry, starMaterial, starsCount);
    
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    
    for (let i = 0; i < starsCount; i++) {
        const x = (Math.random() - 0.5) * 600;     
        const y = Math.random() * 300 + 20;      
        const z = (Math.random() - 0.5) * 600;   
        
        dummy.position.set(x, y, z);
        dummy.lookAt(0, 0, 0); 
        dummy.rotateZ(Math.random() * Math.PI * 2); 
        dummy.updateMatrix();
        
        starUniverse.setMatrixAt(i, dummy.matrix);
        
        const randomColor = Math.random();
        if (randomColor > 0.7) { color.setHex(0xffffff); } 
        else if (randomColor > 0.4) { color.setHex(0xaaccff); } 
        else { color.setHex(0xffddaa); }
        
        starUniverse.setColorAt(i, color);
    }
    
    starUniverse.instanceMatrix.needsUpdate = true;
    starUniverse.instanceColor.needsUpdate = true;
    
    return starUniverse;
}