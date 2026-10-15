// Camera, height scale and cuboid faces. Pure math, no SVG strings.
//
// World axes: x = week column, y = weekday (Sun = 0 at the back), z = height. One cell = 1 unit.
// Camera: yaw YAW_DEG around the vertical axis, then looking down at PITCH_DEG from the horizon.
// Orthographic, so the image is a "dimetric" view: a city map seen from above-front, not the
// stock 30-degree isometric strip.

export const YAW_DEG = 14;
export const PITCH_DEG = 40;
export const FOOT = 0.76; // block footprint, the rest of the cell is street
export const H_MIN = 0.22; // a 1-contribution day
export const H_MAX = 3.4; // the cap height
export const H_TILE = 0.05; // a zero-contribution day: a thin flat tile

const rad = (d) => (d * Math.PI) / 180;

/** Projection for a scale `s` (px per unit). Returns [screenX, screenY]; screen Y grows downward. */
export function makeProjector(s, yawDeg = YAW_DEG, pitchDeg = PITCH_DEG) {
  const c = Math.cos(rad(yawDeg));
  const n = Math.sin(rad(yawDeg));
  const sp = Math.sin(rad(pitchDeg));
  const cp = Math.cos(rad(pitchDeg));
  return ([x, y, z]) => [(x * c - y * n) * s, ((x * n + y * c) * sp - z * cp) * s];
}

/**
 * Square-root height scale with an honest cap.
 * 0 -> flat tile; 1..cap -> H_MIN..H_MAX on sqrt; above cap -> H_MAX with `capped: true`
 * (the renderer draws a break mark, so a capped bar never pretends to be to scale).
 */
export function heightFor(count, cap) {
  if (count <= 0) return { h: H_TILE, t: 0, capped: false, zero: true };
  const t = Math.sqrt(Math.min(count, cap) / cap);
  return { h: H_MIN + (H_MAX - H_MIN) * t, t, capped: count > cap, zero: false };
}

/** Visible faces of a cuboid at cell (x, y) with height h, as world-space corner lists. */
export function cuboid(x, y, h, foot = FOOT) {
  const x0 = x + (1 - foot) / 2;
  const y0 = y + (1 - foot) / 2;
  const x1 = x0 + foot;
  const y1 = y0 + foot;
  return {
    top: [[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]],
    front: [[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]], // faces +y, toward the camera
    side: [[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], // faces +x, visible because yaw > 0
    pivot: [x1, y1, 0], // the nearest ground corner: blocks grow up from here
    box: { x0, y0, x1, y1 },
  };
}
