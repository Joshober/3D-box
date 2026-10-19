# Production deployment and security boundaries

The library is browser-only photo processing and visualization. It has no upload endpoint, storage, authentication, or authorization layer. Applications own those concerns. The components accept per-face `File`, `Blob`, local image paths, and explicitly allowed HTTPS origins.

## Enforced controls

- Inspect JPEG/PNG/WebP headers before browser decoding; reject other formats and malformed headers.
- Limit encoded content to 25 MB, dimensions to 16,384 per side and 40 million pixels, and loading to 15 seconds. Reject oversized response bodies while streaming. Browser decoding is still a trust boundary; maintain patched browsers.
- Default to same-origin sources. Require exact external HTTPS origins, refuse embedded URL credentials and redirects, omit request credentials and referrers, and do not persist remote responses in the fetch cache.
- Validate coordinates, rotation, and dimension ratios. Cancel obsolete loads and yield during perspective processing. Decode faces sequentially to bound peak memory; release all owned resources.
- Render uploaded images as raster previews. Use Angular template escaping; no HTML injection or sanitizer bypasses.
- Use a native modal dialog with keyboard dismissal and focus handling. Render WebGL only when the scene changes.

## Run the production demo

```sh
npm run build
npm run serve:production
```

The server binds to `127.0.0.1:8080` by default. Configure `HOST` and `PORT` for your environment. Put it behind an HTTPS reverse proxy for public access. Configure TLS, HSTS, request/connection limits, and access controls at that proxy; this repository cannot configure your hosting infrastructure.

`scripts/serve-production.mjs` serves only recognized static asset types within the real build directory, including symlink confinement. It rejects methods other than GET and HEAD, injects a fresh cryptographic CSP nonce per HTML response, disables HTML caching, and caches only hashed JS/CSS assets immutably. It sends CSP, nosniff, frame denial, no-referrer, permissions policy, and same-origin resource policy headers. It does not expose source maps, source files, or directory listings. Production builds hash asset filenames, disable source maps and inline critical CSS, and enforce a bundle-size budget. External fonts have been removed.

The tested CSP is `default-src 'none'` with same-origin scripts and styles plus per-response nonces; images permit same-origin, blob and data; connections permit same-origin and blob. Frames, plugins and form submission are prohibited. The demo has no external image requests. If your host application uses external images, add the exact origin to BOTH the component's `allowedOrigins` and the host's `connect-src`. No wildcard or unsafe-eval is needed. Angular component style insertion uses the matching `ngCspNonce`. Never use a fixed nonce in production.

## Verify before release

```sh
npm ci --legacy-peer-deps
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:production
npm audit
npm run pack:lib
```

The independent Angular consumer checks tarball installation and resource disposal. Run `npm install --legacy-peer-deps` and `npx ng build consumer` inside `tests/consumer` after packing, then `npm run test:consumer` at the root. Use a Node runtime supported by Angular 22.

Security checks cover origin-policy bypasses, forged image content, oversized images and streams, cancellation, strict CSP behavior, static path confinement, and object lifecycle cleanup. They are automated checks, not a penetration-test certification. npm audit is time-specific; rerun it when releasing or changing the lockfile.

The package does not certify parcel condition or detect damage automatically. Use original photographs when detail beyond the processed 1024px face texture is required.
