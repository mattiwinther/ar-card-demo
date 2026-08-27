import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const matte = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? 0.48,
  metalness: options.metalness ?? 0.12,
  emissive: options.emissive ?? 0x000000,
  emissiveIntensity: options.emissiveIntensity ?? 0,
  transparent: options.transparent ?? false,
  opacity: options.opacity ?? 1,
});

function mesh(geometry, material, position = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  return item;
}

function normalizeModel(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('The model has no measurable height.');

  const scale = 1 / size.y;
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const normalizedBounds = new THREE.Box3().setFromObject(model);
  const center = normalizedBounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= normalizedBounds.min.y;
  model.updateMatrixWorld(true);
  // Used when the model is lifted from the marker: its visual centre, rather
  // than its ground-contact origin, should land in the user's palm.
  model.userData.visualCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  return model;
}

function createPlatform() {
  const group = new THREE.Group();
  const disk = mesh(
    new THREE.CylinderGeometry(0.36, 0.42, 0.035, 48),
    matte(0x111b18, { metalness: 0.68, roughness: 0.28 }),
    [0, 0.02, 0],
  );
  const ring = mesh(
    new THREE.TorusGeometry(0.31, 0.012, 10, 64),
    matte(0xc7f04b, { emissive: 0x9fc42f, emissiveIntensity: 1.5 }),
    [0, 0.045, 0],
  );
  ring.rotation.x = Math.PI / 2;
  group.add(disk, ring);
  return group;
}

export function createBot() {
  const group = new THREE.Group();
  const animated = new THREE.Group();
  const dark = matte(0x14201c, { metalness: 0.62, roughness: 0.3 });
  const shell = matte(0xdde3da, { metalness: 0.1, roughness: 0.3 });
  const accent = matte(0xc7f04b, { emissive: 0x8baa23, emissiveIntensity: 0.8 });
  const screen = matte(0x10231c, { emissive: 0x6ddda7, emissiveIntensity: 1.4 });

  group.add(createPlatform());

  const body = mesh(new THREE.CapsuleGeometry(0.225, 0.26, 8, 16), shell, [0, 0.48, 0]);
  body.scale.z = 0.76;
  const chest = mesh(new THREE.BoxGeometry(0.22, 0.10, 0.025), dark, [0, 0.50, 0.205]);
  const chestLight = mesh(new THREE.BoxGeometry(0.115, 0.022, 0.008), accent, [0, 0.50, 0.222]);

  const neck = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.10, 16), dark, [0, 0.72, 0]);
  const head = mesh(new THREE.SphereGeometry(0.22, 24, 18), shell, [0, 0.88, 0]);
  head.scale.y = 0.82;
  head.scale.z = 0.84;
  const face = mesh(new THREE.BoxGeometry(0.28, 0.105, 0.035), screen, [0, 0.875, 0.175]);
  face.geometry.translate(0, 0, 0);
  const eyeLeft = mesh(new THREE.SphereGeometry(0.018, 12, 8), accent, [-0.066, 0.88, 0.198]);
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.066;

  const antenna = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 10), dark, [0, 1.07, 0]);
  const antennaTip = mesh(new THREE.SphereGeometry(0.035, 12, 10), accent, [0, 1.15, 0]);

  const armGeometry = new THREE.CapsuleGeometry(0.045, 0.24, 5, 10);
  const armLeft = mesh(armGeometry, dark, [-0.29, 0.49, 0]);
  armLeft.rotation.z = -0.12;
  const armRight = mesh(armGeometry, dark, [0.29, 0.49, 0]);
  armRight.rotation.z = 0.12;

  const footGeometry = new THREE.SphereGeometry(0.105, 16, 10);
  const footLeft = mesh(footGeometry, dark, [-0.13, 0.14, 0.01]);
  footLeft.scale.set(1, 0.48, 1.28);
  const footRight = footLeft.clone();
  footRight.position.x = 0.13;

  animated.add(body, chest, chestLight, neck, head, face, eyeLeft, eyeRight, antenna, antennaTip, armLeft, armRight, footLeft, footRight);
  group.add(animated);
  group.userData.animate = (time) => {
    animated.position.y = Math.sin(time * 2.2) * 0.012;
    antennaTip.scale.setScalar(1 + Math.sin(time * 5) * 0.1);
    chestLight.material.emissiveIntensity = 0.75 + Math.sin(time * 3.5) * 0.25;
  };
  return normalizeModel(group);
}

export function createBeacon() {
  const group = new THREE.Group();
  const tower = new THREE.Group();
  const dark = matte(0x101a17, { metalness: 0.75, roughness: 0.24 });
  const white = matte(0xe4e8df, { roughness: 0.3 });
  const glow = matte(0xc7f04b, { emissive: 0xaed837, emissiveIntensity: 1.9, transparent: true, opacity: 0.9 });

  group.add(createPlatform());
  tower.add(
    mesh(new THREE.CylinderGeometry(0.20, 0.27, 0.13, 24), dark, [0, 0.14, 0]),
    mesh(new THREE.CylinderGeometry(0.115, 0.16, 0.58, 18), white, [0, 0.46, 0]),
    mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.10, 18), dark, [0, 0.80, 0]),
    mesh(new THREE.SphereGeometry(0.12, 24, 16), glow, [0, 0.92, 0]),
  );
  const bands = [0.28, 0.44, 0.60].map((y) => {
    const band = mesh(new THREE.TorusGeometry(0.137 - y * 0.035, 0.012, 8, 32), dark, [0, y, 0]);
    band.rotation.x = Math.PI / 2;
    return band;
  });
  tower.add(...bands);
  group.add(tower);

  const waveMaterial = matte(0xc7f04b, { emissive: 0xaed837, emissiveIntensity: 1, transparent: true, opacity: 0.45 });
  const waves = [0.2, 0.32, 0.44].map((radius) => {
    const wave = mesh(new THREE.TorusGeometry(radius, 0.008, 6, 48), waveMaterial.clone(), [0, 0.92, 0]);
    wave.rotation.x = Math.PI / 2;
    group.add(wave);
    return wave;
  });

  group.userData.animate = (time) => {
    tower.rotation.y = time * 0.28;
    waves.forEach((wave, index) => {
      const phase = (time * 0.7 + index / waves.length) % 1;
      const pulseScale = 0.65 + phase * 0.7;
      wave.scale.setScalar(pulseScale);
      wave.material.opacity = (1 - phase) * 0.38;
    });
  };
  return normalizeModel(group);
}

export async function loadUploadedModel(file) {
  const loader = new GLTFLoader();
  const data = await file.arrayBuffer();
  const basePath = URL.createObjectURL(new Blob([], { type: 'application/octet-stream' }));

  try {
    const gltf = await new Promise((resolve, reject) => loader.parse(data, basePath, resolve, reject));
    const model = gltf.scene || gltf.scenes?.[0];
    if (!model) throw new Error('No scene was found in this file.');

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      if (child.material) child.material.side = THREE.FrontSide;
    });

    // A supplied glTF may contain multiple clips; start the first one by
    // default so animated assets behave like the built-in procedural models.
    if (gltf.animations?.length) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
      let previousTime = null;
      model.userData.animate = (time) => {
        if (previousTime !== null) mixer.update(Math.min(0.1, time - previousTime));
        previousTime = time;
      };
    }
    return normalizeModel(model);
  } finally {
    URL.revokeObjectURL(basePath);
  }
}
