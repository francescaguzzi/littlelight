import * as THREE from "three";
import { Water } from 'three/addons/objects/Water.js';


export function createWater(light, hasFog) {

    const waterNormalMap = new THREE.TextureLoader().load(
        '/assets/waternormals.jpg',
        function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            waterNormalMap.repeat.set(20, 20);
            texture.colorSpace = THREE.NoColorSpace;
        }
    );

    const waterGeometry = new THREE.PlaneGeometry(200, 200, 128, 128);

    const water = new Water(
        waterGeometry,
        {
            textureWidth: 256,
            textureHeight: 256,
            waterNormals: waterNormalMap,
            sunDirection: light.position.clone().normalize(),
            sunColor: 0x92b0bf, // 0x004444,
            waterColor: 0x34506C,
            distortionScale: 3,
            size: 10,
            alpha: 0.5,
            fog: hasFog
        }
    );

    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.2;

    return water;
}