// SWMM5 hydraulic cross-section glyphs, rasterized as bipolar bitmaps.
// Inside the shape = +1, outside = -1.

export const GLYPH_W = 12;
export const GLYPH_H = 12;
export const N = GLYPH_W * GLYPH_H;

export type ShapeName =
  | "CIRCULAR"
  | "FILLED_CIRC"
  | "RECT_CLOSED"
  | "RECT_OPEN"
  | "TRAPEZOIDAL"
  | "TRIANGULAR"
  | "PARABOLIC"
  | "H_ELLIPSE"
  | "V_ELLIPSE"
  | "ARCH"
  | "EGG"
  | "HORSESHOE"
  | "GOTHIC"
  | "SEMICIRC";

// Sample shape membership at the center of cell (gx, gy).
// Coordinates: x in [-1, 1] (horizontal), y in [0, 1] (bottom→top of conduit).
function inside(shape: ShapeName, x: number, y: number): boolean {
  switch (shape) {
    case "CIRCULAR": {
      const dx = x;
      const dy = y - 0.5;
      return dx * dx + dy * dy <= 0.5 * 0.5;
    }
    case "FILLED_CIRC": {
      const dx = x;
      const dy = y - 0.5;
      return dx * dx + dy * dy <= 0.5 * 0.5 && y >= 0.2;
    }
    case "RECT_CLOSED":
      return Math.abs(x) <= 0.5 && y >= 0.05 && y <= 0.95;
    case "RECT_OPEN":
      // U: vertical walls + bottom, open top
      return (
        (Math.abs(x) <= 0.5 && y >= 0.05 && y <= 0.2) || // bottom
        (Math.abs(Math.abs(x) - 0.5) <= 0.08 && y <= 0.95) // walls
      );
    case "TRAPEZOIDAL": {
      // bottom width 0.5, top width 1.0, height 0..0.9
      if (y < 0.05 || y > 0.9) return false;
      const halfW = 0.25 + 0.3 * ((y - 0.05) / 0.85);
      return Math.abs(x) <= halfW;
    }
    case "TRIANGULAR": {
      if (y < 0.05 || y > 0.95) return false;
      const halfW = 0.5 * ((y - 0.05) / 0.9);
      return Math.abs(x) <= halfW;
    }
    case "PARABOLIC": {
      // y = 1.6 x^2, fill between curve and top 0.9
      if (y > 0.9) return false;
      const yc = 1.6 * x * x;
      return y >= yc;
    }
    case "H_ELLIPSE": {
      const dx = x / 0.55;
      const dy = (y - 0.5) / 0.35;
      return dx * dx + dy * dy <= 1;
    }
    case "V_ELLIPSE": {
      const dx = x / 0.32;
      const dy = (y - 0.5) / 0.48;
      return dx * dx + dy * dy <= 1;
    }
    case "ARCH": {
      // flat bottom + semicircular top
      if (y < 0.05) return false;
      if (y <= 0.4) return Math.abs(x) <= 0.5;
      const dx = x;
      const dy = y - 0.4;
      return dx * dx + dy * dy <= 0.5 * 0.5;
    }
    case "EGG": {
      // narrow top, fat bottom: r(theta) = 0.5 * (1 - 0.25 cos(theta))
      const dx = x;
      const dy = y - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx); // -PI..PI
      const rmax = 0.48 * (1 - 0.3 * Math.sin(theta)); // sin>0 = top → narrower
      return r <= rmax;
    }
    case "HORSESHOE": {
      // semicircle top + flat-ish curved bottom
      if (y >= 0.5) {
        const dx = x;
        const dy = y - 0.5;
        return dx * dx + dy * dy <= 0.5 * 0.5;
      }
      // bottom: shallow arc
      const dx = x / 0.5;
      const dy = (y - 0.5) / 0.45;
      return dx * dx + dy * dy <= 1;
    }
    case "GOTHIC": {
      // pointed arch: two circle arcs meeting at top
      if (y < 0.05) return false;
      if (y >= 0.95) return false;
      // half-width at height y
      const yn = (y - 0.05) / 0.9;
      // peaked: width tapers via sqrt then collapses near top
      let halfW: number;
      if (yn <= 0.6) halfW = 0.5 * Math.sqrt(1 - Math.pow(yn / 0.7, 2));
      else halfW = 0.5 * Math.sqrt(1 - Math.pow(yn / 0.7, 2)) * (1 - (yn - 0.6) / 0.4);
      return Math.abs(x) <= Math.max(halfW, 0);
    }
    case "SEMICIRC": {
      if (y < 0.05) return false;
      const dx = x;
      const dy = y - 0.05;
      return dx * dx + dy * dy <= 0.6 * 0.6 && y <= 0.65;
    }
  }
}

export const SHAPES: ShapeName[] = [
  "CIRCULAR",
  "FILLED_CIRC",
  "RECT_CLOSED",
  "RECT_OPEN",
  "TRAPEZOIDAL",
  "TRIANGULAR",
  "PARABOLIC",
  "H_ELLIPSE",
  "V_ELLIPSE",
  "ARCH",
  "EGG",
  "HORSESHOE",
  "GOTHIC",
  "SEMICIRC",
];

function rasterize(shape: ShapeName): Int8Array {
  const out = new Int8Array(N);
  for (let gy = 0; gy < GLYPH_H; gy++) {
    // y from bottom (0) to top (1)
    const y = 1 - (gy + 0.5) / GLYPH_H;
    for (let gx = 0; gx < GLYPH_W; gx++) {
      const x = ((gx + 0.5) / GLYPH_W) * 2 - 1;
      out[gy * GLYPH_W + gx] = inside(shape, x, y) ? 1 : -1;
    }
  }
  return out;
}

export const PATTERNS: Int8Array[] = SHAPES.map(rasterize);

export function corrupt(p: Int8Array, prob: number): Int8Array {
  const out = new Int8Array(p);
  for (let i = 0; i < out.length; i++) if (Math.random() < prob) out[i] = -out[i];
  return out;
}

export function randomState(n: number): Int8Array {
  const o = new Int8Array(n);
  for (let i = 0; i < n; i++) o[i] = Math.random() < 0.5 ? -1 : 1;
  return o;
}
