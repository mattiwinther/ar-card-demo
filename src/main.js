import { getCardProfile } from './card-profiles.js';

const profile = getCardProfile();
const welcome = document.querySelector('#welcome');
const startButton = document.querySelector('#start-ar');
const closeButton = document.querySelector('#close-ar');
const status = document.querySelector('#ar-status');
const statusText = document.querySelector('#status-text');
const scene = document.querySelector('#ar-scene');
const anchor = document.querySelector('#card-anchor');

const setStatus = (message, found = false) => {
  status.hidden = false;
  status.classList.toggle('is-found', found);
  statusText.textContent = message;
};

function entity(tagName, attributes = {}) {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function addProceduralHologram() {
  const hologram = entity('a-entity', {
    id: 'hologram',
    position: '0 0 0.18',
    animation: 'property: rotation; to: 0 360 0; loop: true; dur: 7000; easing: linear',
  });

  // The card plane is X/Y; positive Z comes out of the card towards the camera.
  hologram.append(
    entity('a-torus', {
      position: '0 0 0', rotation: '0 0 0', radius: '0.38', 'radius-tubular': '0.012',
      color: profile.accent, material: 'shader: flat; opacity: 0.9; transparent: true',
    }),
    entity('a-cylinder', {
      position: '0 0 0.16', radius: '0.16', height: '0.32',
      color: profile.accent, material: 'shader: flat; opacity: 0.65; transparent: true',
      animation: 'property: scale; dir: alternate; dur: 900; loop: true; to: 1.08 1.08 1.08',
    }),
    entity('a-sphere', {
      position: '0 0 0.38', radius: '0.09', color: '#ffffff',
      material: `shader: flat; color: ${profile.accent}; opacity: 0.95; transparent: true`,
    }),
    entity('a-torus', {
      position: '0 0 0.39', rotation: '72 0 0', radius: '0.16', 'radius-tubular': '0.009',
      color: '#ffffff', material: 'shader: flat; opacity: 0.85; transparent: true',
    }),
  );

  anchor.append(hologram);
}

function addModel() {
  if (profile.modelUrl) {
    anchor.append(entity('a-gltf-model', {
      id: 'card-model', src: profile.modelUrl, position: '0 0 0.12',
      rotation: '90 0 0', scale: '0.25 0.25 0.25',
    }));
  } else {
    addProceduralHologram();
  }
}

function beginAR() {
  const arSystem = scene.systems['mindar-image-system'];
  if (!arSystem) {
    setStatus('AR is still loading. Please try again in a moment.');
    return;
  }

  welcome.hidden = true;
  closeButton.hidden = false;
  setStatus('Looking for the card…');
  arSystem.start();
}

function endAR() {
  scene.systems['mindar-image-system']?.stop();
  status.hidden = true;
  closeButton.hidden = true;
  welcome.hidden = false;
}

document.querySelector('#profile-copy').textContent = `${profile.message} Start the camera, then point it at the demo card.`;
document.documentElement.style.setProperty('--accent', profile.accent);
addModel();

function enableStart() {
  startButton.disabled = false;
  startButton.textContent = 'Open camera';
}

if (scene.hasLoaded) {
  enableStart();
} else {
  scene.addEventListener('loaded', enableStart, { once: true });
}

anchor.addEventListener('targetFound', () => {
  setStatus(`${profile.name} recognized`, true);
});

anchor.addEventListener('targetLost', () => {
  setStatus('Looking for the card…');
});

startButton.addEventListener('click', beginAR);
closeButton.addEventListener('click', endAR);
window.addEventListener('pagehide', () => scene.systems['mindar-image-system']?.stop());
