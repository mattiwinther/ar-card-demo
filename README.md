# Anchor — aruco-rs WebAR demo

**Live demo:** https://mattiwinther.github.io/ar-card-demo/

A browser-based fiducial AR demo using:

- [`@ar-js-org/aruco-rs`](https://github.com/AR-js-org/aruco-rs) for WebAssembly ArUco detection
- A planar square pose solver for the camera-space transform
- Three.js for 3D rendering

## Run locally

```bash
npm install
npm run dev
```

Open the printed LAN URL on your phone. Camera access requires a **secure context** (`https://`) except on `localhost`; use an HTTPS tunnel when testing from a separate mobile device.

Click **Print marker** to print the bundled legacy **ARUCO 5×5 dictionary marker, ID 23**. The black outer marker square is 50 mm wide and is surrounded by a white quiet zone. Print at 100% / actual size, without “fit to page.” Keep the printed-size control matched to the black square for physically accurate model scale.

The default object is **Anchor bot**, a procedural Three.js robot assembled from geometric primitives. The app also includes an animated **Signal beacon** and supports self-contained `.glb` uploads.

## Build

```bash
npm run build
npm run preview
```

## Custom models

Use the in-app upload control to load a self-contained `.glb`. Models are centered, placed on the marker plane, and normalized to fit the marker automatically.
