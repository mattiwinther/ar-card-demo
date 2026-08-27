# Run an image-tracked AR business card

This is a static MindAR + A-Frame prototype. Open the camera, point it at the included target image, and a hologram remains attached while the card moves.

## Before you begin

Use a phone with a modern browser and a camera. Camera access requires HTTPS after deployment (localhost is allowed for development).

The committed `public/targets.mind` recognizes **only** `public/assets/demo-card.png`. Display that image on another screen or print it to test the prototype.

## Run it locally

```bash
npm install
npm run dev
```

Open the displayed local URL. For a phone on the same network, use Vite's network URL and serve it through HTTPS (for example, a trusted local certificate or an HTTPS tunnel).

1. Select **Open camera**.
2. Allow camera access.
3. Point the camera at `public/assets/demo-card.png`.
4. Move or tilt the target. The hologram should stay attached to it.

Build the static site with:

```bash
npm run build
```

Deploy the contents of `dist/` to any HTTPS static host.

## Put your own business card in the experience

1. Export the final card artwork as a sharp PNG or JPG. Give it distinctive text, illustrations, and edges distributed across the card; avoid large blank areas and repeated patterns.
2. Compile that image in the [MindAR target compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile/).
3. Replace `public/targets.mind` with the downloaded `.mind` file.
4. Keep the same artwork on the physical card. The compiler output is tied to that image.
5. Replace `public/assets/demo-card.png` with a printable copy of the new target for testing.

## Use a GLB model

Place a GLB at `public/models/robot.glb`, then edit the relevant profile in `src/card-profiles.js`:

```js
modelUrl: './models/robot.glb',
```

The model is a child of `#card-anchor`, so it inherits the card's pose. Adjust `position`, `rotation`, and `scale` in `addModel()` in `src/main.js` to suit the GLB's coordinate system and size.

## Use QR codes for identity

Put a URL such as this in each card's QR code:

```text
https://your-domain.example/?id=john
```

Add the corresponding profile in `src/card-profiles.js`. The QR determines the person/content; MindAR tracks the printed artwork. This lets every card share one well-designed tracking region while serving different names, themes, or models.

## Notes

- The included target image and `.mind` file are MindAR's upstream `card-example`, included only as a test asset. Replace them before branding or publishing.
- This app uses the browser camera and image tracking rather than WebXR, which makes it practical on iPhone browsers as well as Android browsers.
