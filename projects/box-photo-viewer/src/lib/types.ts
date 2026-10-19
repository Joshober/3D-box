export const BOX_FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
export type BoxFace = typeof BOX_FACES[number];
export interface Point { x: number; y: number; }
/** Normalized source coordinates, clockwise: top-left, top-right, bottom-right, bottom-left. */
export type FaceCorners = [Point, Point, Point, Point];
export interface FacePhoto { src: string | Blob; name?: string; corners?: FaceCorners; rotation?: 0 | 90 | 180 | 270; }
export type BoxPhotos = Partial<Record<BoxFace, FacePhoto>>;
export interface BoxDimensions { width: number; height: number; depth: number; }
export interface BoxProportionEstimate {
  /** Relative dimensions, normalized to height=1. Not physical measurements. */
  dimensions: BoxDimensions;
  faces: BoxFace[];
  inconsistent: boolean;
}
export type PhotoErrorCode = 'invalid-input' | 'blocked-source' | 'too-large' | 'unsupported-image' | 'load-failed' | 'timeout';
export interface FaceImageError { face: BoxFace; message: string; code?: PhotoErrorCode; }
export const DEFAULT_CORNERS: FaceCorners = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
/** Three.js BoxGeometry material order. */
export const MATERIAL_FACES: BoxFace[] = ['right', 'left', 'top', 'bottom', 'front', 'back'];
export const FACE_VECTORS: Record<BoxFace, [number, number, number]> = {
  front:[0,0,1], back:[0,0,-1], left:[-1,0,0], right:[1,0,0], top:[0,1,0], bottom:[0,-1,0]
};
export function validDimensions(d: BoxDimensions): boolean {
  return !!d && [d.width, d.height, d.depth].every(n => Number.isFinite(n) && n > 0) &&
    Math.min(d.width,d.height,d.depth)/Math.max(d.width,d.height,d.depth) >= .001;
}
