# Parcel — Angular 3D box inspection

Six-face Three.js photo viewer, perspective-alignment editor, and responsive Angular demo.

Version 1.2 adds optional automatic proportions with `[autoProportions]="true"`: aligned square, wide, or tall face photos adjust the 3D box. The demo enables this for your own uploads and lets you override it with manual dimensions. These are approximate ratios, not physical measurements; tightly crop each face and use straight-on photos.

Version 1.1 accepts your own `File` / `Blob` objects directly as `photos = { ...photos, front: { src: file } }`, or local paths and explicitly allowed HTTPS image URLs. Replace the `photos` object when updating it. Both components validate image content and size, restrict remote origins, and cancel obsolete requests. See the library guide for the full input contract and [SECURITY.md](SECURITY.md) for production hosting requirements.

```sh
npm install --legacy-peer-deps
npm run build
npm start
```

Open http://127.0.0.1:4200. Select **Load sample photos** to try the bundled real damaged-box photographs. Six illustrative faces reuse photos of two different boxes, so this preset is not a verified capture of one parcel. Upload your own six photos for a faithful view. Select four photo corners to straighten each face, rotate it as necessary, and enter measured box dimensions.

This workspace includes a local Node 24 runtime for the Angular 22 toolchain; npm scripts use its executable without changing your system Node. If installing dependencies with an older system Node, npm may report engine warnings. The legacy peer flag works around an npm 10 peer-resolver crash observed on this machine; Angular compiler compatibility is verified by the build.

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run pack:lib
npm run test:production
npm run serve:production
```

Install from npm in an Angular 22 project:

```sh
npm install box-photo-viewer three@^0.186.1
npm install --save-dev @types/three
```

See [the library integration guide](projects/box-photo-viewer/README.md) for the standalone component example and typed API. Build the library before starting the demo, which imports the built package. Rebuild the library after changing its source.

The production demo runs at http://127.0.0.1:8080 with restrictive headers and per-response CSP nonces. Browser tests use the production build on a separate port. Rebuild before running them.

The independent installation fixture is in `tests/consumer`. After packing, run `npm install --legacy-peer-deps` and `npx ng build consumer` from that directory under a supported Node runtime. Run `npm run test:consumer` from the workspace root to check its compiled production build, direct file inputs, origin restrictions, mouse rotation, zoom, and WebGL cleanup across five mount/unmount cycles.

The package contains the viewer and editor; demo assets and styling stay in the demo. The package is published to npm as [`box-photo-viewer`](https://www.npmjs.com/package/box-photo-viewer). Photos are processed locally. Remote images need CORS permission. Visible damage stays in the photographs; there is no AI classification or dent reconstruction.

Sample attribution: [Meanwell Packaging](https://meanwell-packaging.co.uk/), [original photograph](https://commons.wikimedia.org/wiki/File:Damaged_Cardboard_Box_Labelled_Fragile.jpg); Tony Webster, [original photograph](https://commons.wikimedia.org/wiki/File:Damaged_FedEx_Box_-_Corner_Smashed_In_Cardboard_Shipping_Container_(53371562280).jpg). Both [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/). Bundled photographs are 1280px Wikimedia downloads. Face views are cropped and perspective corrected in the demo.
