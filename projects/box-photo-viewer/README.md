# Box Photo Viewer

Standalone Angular 22 components for inspecting six box photographs in Three.js. Images show surface damage; geometry remains a rectangular cuboid. All photo alignment runs in the browser.

## Install

Use Node ^22.22.3 or ^24.15.0 (or >=26) for Angular 22 tooling.

```sh
npm install box-photo-viewer three@^0.186.1
npm install --save-dev @types/three
```

```ts
import { Component } from '@angular/core';
import { BoxPhotoViewerComponent, BoxPhotoEditorComponent, type BoxPhotos, type BoxDimensions, type FacePhoto } from 'box-photo-viewer';

@Component({
  selector: 'app-inspection',
  standalone: true,
  imports: [BoxPhotoViewerComponent, BoxPhotoEditorComponent],
  template: `
    <box-photo-viewer [photos]="photos" [dimensions]="dimensions"
      (selectedFaceChange)="selected = $event"
      (imageError)="onError($event.message)" />
    <box-photo-editor [face]="selected" [photo]="photos[selected]"
      (photoChange)="update($event)" />
  `
})
export class InspectionComponent {
  selected: import('box-photo-viewer').BoxFace = 'front';
  dimensions: BoxDimensions = { width: 40, height: 30, depth: 25 };
  photos: BoxPhotos = {
    front: { src: '/assets/front.jpg' },
    back: { src: '/assets/back.jpg' },
    left: { src: '/assets/left.jpg' },
    right: { src: '/assets/right.jpg' },
    top: { src: '/assets/top.jpg' },
    bottom: { src: '/assets/bottom.jpg' }
  };
  update(photo: FacePhoto) { this.photos = { ...this.photos, [this.selected]: photo }; }
  onError(message: string) { console.error(message); }
}
```

## API

Viewer inputs: `photos: BoxPhotos`, `dimensions: BoxDimensions` (default 1 × 1 × 1), `allowedOrigins: readonly string[]` (default empty), and `autoProportions: boolean` (default false). Outputs: `selectedFaceChange: BoxFace`, `imageError: { face, code, message }`, `loadingChange: boolean`, and `proportionEstimate: BoxProportionEstimate | undefined`. Public methods: `selectFace(face)`, `reset()`. No sample photos are included or loaded by the library.

Editor inputs: `face: BoxFace`, `photo?: FacePhoto`, `allowedOrigins: readonly string[]`. Output: `photoChange: FacePhoto`. Connect it to immutable application state as above. The editor never changes the original file.

`FacePhoto` has `src: string | Blob` (including browser `File`), optional `name`, optional `corners` (four normalized `{x,y}` coordinates in clockwise top-left, top-right, bottom-right, bottom-left order), and optional clockwise `rotation: 0 | 90 | 180 | 270`. Corner coordinates refer to the browser-oriented original image, before rotation. Selecting four corners crops and straightens the face. Image rotation is applied afterward.

Use positive finite dimensions in any consistent unit, with a maximum 1000:1 aspect ratio. Width is X, height is Y, depth is Z; front is +Z, right is +X, top is +Y. Top and bottom photos should be oriented with the back edge at the top of the top image, and the front edge at the top of the bottom image. Side photos should have the physical box top at the top of the image.

Photo changes require a new `photos` object reference. Pass `File` objects directly: the library owns and releases its temporary object URLs. Existing same-origin `blob:` URLs remain supported; the host retains ownership of those URLs. Processing caps source resolution to 2048px and output to 1024px per face. Enlarged inspection shows the aligned output at its processed resolution; keep originals for forensic detail.

Angular SSR is supported: both components process images only in the browser. Rendering runs outside Angular's zone and only while the scene or controls change. Resize observers, textures, geometry, pending requests, frames, temporary URLs, and controls are released on destruction. New inputs cancel obsolete work. Each failed photo gets a placeholder and its own error event. No upload service, detection API, or model backend is required.

## Pass your own photos

### Estimate square versus rectangular proportions (v1.2)

```html
<box-photo-viewer [photos]="photos" [autoProportions]="true"
                 (proportionEstimate)="estimate = $event" />
```

`autoProportions` defaults to `false` for compatibility. When enabled, the viewer adjusts its geometry from the aligned photo aspect ratios: front/back give width:height, left/right give depth:height, and top/bottom give width:depth. A least-squares fit in log-ratio space reconciles multiple faces. It updates after uploads, cropping, or rotation. Missing relationships retain the supplied `dimensions` proportions (a cube by default). Turning the input off restores `dimensions`.

`proportionEstimate` emits `BoxProportionEstimate | undefined`: relative `dimensions` normalized to height=1, the contributing `faces`, and `inconsistent` when a fitted ratio differs from an input by more than 20%. Invalid, missing, or failed images do not contribute. You may also call the exported pure helper `estimateBoxProportions(faceRatios, fallbackDimensions)`.

This is an approximate shape estimate, not physical measurement or camera-calibrated reconstruction. The face should fill the photo; crop background with the corner editor. Straight-on images give the most useful aspect ratios. Angled photos can still distort ratios after perspective alignment, and one front image alone cannot determine depth. Use manually measured dimensions when accuracy matters. Auto mode ignores manual dimensions for observed ratios; disable it to apply manual geometry.

In the demo, your first upload replaces the illustrative sample set and enables automatic estimation. Editing a dimension switches to manual mode. The mixed-box sample preset starts in manual mode because its faces are not a consistent capture.

```ts
// In the host component. Both viewer and editor accept the same object.
onFileSelected(face: import('box-photo-viewer').BoxFace, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) this.photos = { ...this.photos, [face]: { src: file, name: file.name } };
}

// Or supply paths / URLs from an API. Assign each photo to its physical face.
this.photos = {
  front: { src: '/assets/my-box/front.jpg' },
  back: { src: '/assets/my-box/back.jpg' },
  left: { src: '/assets/my-box/left.jpg' },
  right: { src: '/assets/my-box/right.jpg' },
  top: { src: '/assets/my-box/top.jpg' },
  bottom: { src: '/assets/my-box/bottom.jpg' }
};
```

```html
<input type="file" accept="image/jpeg,image/png,image/webp"
       (change)="onFileSelected('front', $event)">
<box-photo-viewer [photos]="photos" [dimensions]="dimensions"
                 [allowedOrigins]="['https://images.example.com']"
                 (imageError)="onError($event.message)" />
```

For private images, fetch them with your application's authenticated HTTP client and pass the resulting `Blob`. The library never sends cookies or authorization headers. Signed HTTPS URLs work when their exact origin is allowed and the server permits CORS. Redirecting URLs are rejected; pass the final URL. Apply the same `allowedOrigins` list to the editor.

## Input security and limits (v1.1)

Both components enforce content-based still JPEG/PNG/WebP checks, a 25 MB encoded limit, 40 megapixels, 16,384 pixels per side, and a 15-second load timeout. Animated PNG/WebP are rejected before decoding. Remote bodies are bounded while streaming. These limits reduce resource-exhaustion risk; browser image decoders still process untrusted raster data. Use patched browsers and independently validate files if your application uploads them to a server.

Only same-origin HTTP(S), same-origin blob URLs, and explicitly allowed external HTTPS origins are accepted. SVG, GIF, data URLs, file URLs, credential-bearing URLs, and other protocols are rejected. This intentionally tightens URL behavior from v1.0. Invalid files are rejected regardless of their supplied MIME type or filename. `validatePhotoFile(file)` is available for upload UI preflight; the components always revalidate their inputs. `PHOTO_LIMITS` and `PhotoInputError` are exported. Error codes are `invalid-input`, `blocked-source`, `too-large`, `unsupported-image`, `load-failed`, and `timeout`.

No URLs, file bytes, or filenames are sent to an analytics service. Source photos are not saved by the library. The editor displays a locally generated raster preview after validation. Do not pass untrusted origins into `allowedOrigins`; it is an application configuration decision.

For hosting, use HTTPS, disable caching on private image responses, and configure CSP at the host application. Angular's `ngCspNonce` / `CSP_NONCE` supports per-response nonces for component styles. The host needs `img-src blob: data:` for local previews and `connect-src` for its approved image origins and `blob:`. See [Angular security guidance](https://angular.dev/best-practices/security) and the workspace's `SECURITY.md` for the tested demo configuration.

## Capture

Photograph all six sides of the same box with even lighting and sharp focus. Keep an entire face in each frame, then select its corners in the editor. The component can estimate relative proportions, but cannot infer physical measurements or reconstruct dents. Missing faces stay labeled. Perspective correction approximates a planar face; folds and crushed regions remain photographic evidence.
