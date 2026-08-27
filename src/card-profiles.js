const profiles = {
  demo: {
    name: 'KPCS',
    title: 'Image-tracking demo',
    accent: '#66e3ff',
    message: 'The hologram is anchored to the printed card.',
    // To use a real model, set modelUrl to a local GLB, e.g. './models/robot.glb'.
    modelUrl: null,
  },
  john: {
    name: 'John Smith',
    title: 'Product Manager',
    accent: '#ffbc4a',
    message: 'John’s AR business card.',
    modelUrl: null,
  },
};

export function getCardProfile() {
  const id = new URLSearchParams(window.location.search).get('id') ?? 'demo';
  return profiles[id] ?? profiles.demo;
}
