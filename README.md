# Anchor — aruco-rs WebAR demo

**Live demo:** https://mattiwinther.github.io/ar-card-demo/

A browser-based fiducial AR demo using:

- [`@ar-js-org/aruco-rs`](https://github.com/AR-js-org/aruco-rs) for WebAssembly ArUco detection
- A planar square pose solver with adaptive temporal stabilization and outlier rejection
- MediaPipe Hand Landmarker (GPU delegate) for local hand landmarks and gestures
- Three.js for 3D rendering

## Run locally

```bash
npm install
npm run dev
```

Open the printed LAN URL on your phone. Camera access requires a **secure context** (`https://`) except on `localhost`; use an HTTPS tunnel when testing from a separate mobile device.

Click **Print marker** to print the bundled legacy **ARUCO 5×5 dictionary marker, ID 23**. The black outer marker square is 50 mm wide and is surrounded by a white quiet zone. Print at 100% / actual size, without “fit to page.” Keep the printed-size control matched to the black square for physically accurate model scale.

## Tracking stability

The single ArUco marker supplies four corners—the minimum needed to solve a calibrated planar pose. The app maintains a continuous cyclic corner order, requires a sufficiently large, convex marker, rejects near-edge-on views and implausible one-frame pose jumps, confirms a new anchor over two frames, and uses an adaptive temporal filter: it heavily damps stationary jitter but responds faster to deliberate movement. During a short detection loss it holds the last good pose rather than snapping away.

For the most stable result, keep the marker well lit and in focus, fill at least a few dozen pixels per side, and avoid viewing it almost edge-on. A single marker cannot provide additional spatial landmarks; moving to a board/Charuco target is the next step if redundancy beyond these safeguards is required. Physical metric accuracy also depends on camera calibration—the browser camera API does not expose calibrated intrinsics, so this demo uses a FOV-based estimate.

The default object is **Anchor bot**, a procedural Three.js robot assembled from geometric primitives. The app also includes an animated **Signal beacon** and supports self-contained `.glb` uploads.

## Hand controls

The model begins on the marker. Once the marker is locked, show an open hand to lift its visual centre into the middle of the palm; the marker pose is then frozen and the marker detector is no longer used. Thumb, index finger, and wrist define the model's full 3D rotation. Use the lower-right `−` / `+` touch controls to set the model size. The hand model is bundled in `public/models/` and all landmark processing stays in the browser.

For mobile performance, the hand task uses MediaPipe's GPU delegate, consumes the same downscaled 640px working frame as the marker detector, and samples one hand at an adaptive 7–12fps. The ArUco detector retains its 30fps budget until transfer. Uploaded glTF models automatically play their first animation clip when one is available.

## Build

```bash
npm run build
npm run preview
```

## Custom models

Use the in-app upload control to load a self-contained `.glb`. Models are centered, placed on the marker plane, and normalized to fit the marker automatically.
