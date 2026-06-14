// SWMM5 cross-section shape definitions.
//
// Each shape exposes a single function: halfWidth(yRel) where yRel ∈ [0, 1]
// is the relative depth from invert (0) to crown (1). The kernel integrates
// half-width to produce the canonical SWMM5 dimensionless tables A/A_full,
// R/R_full, W/W_full on a 51-point grid (matching xsect.dat resolution).
//
// Closed-form shapes (circular, rect, trapezoid, triangle, parabolic) are
// exact. The table-based shapes (egg, horseshoe, basket-handle, gothic,
// catenary, semi-elliptical, arch, semi-circular) are derived from outline
// parameterizations and must be verified against EPA SWMM5's shape.c tables
// in Phase 5 before any solver uses them downstream.
//
// Zero React. Pure functions. This module is the geometry kernel.

export type ShapeId =
  | "CIRCULAR"
  | "FILLED_CIRCULAR"
  | "RECT_CLOSED"
  | "RECT_OPEN"
  | "TRAPEZOIDAL"
  | "TRIANGULAR"
  | "PARABOLIC"
  | "POWER"
  | "HORIZ_ELLIPSE"
  | "VERT_ELLIPSE"
  | "ARCH"
  | "EGG"
  | "HORSESHOE"
  | "GOTHIC"
  | "CATENARY"
  | "SEMI_ELLIPTICAL"
  | "BASKETHANDLE"
  | "MOD_BASKETHANDLE"
  | "SEMI_CIRCULAR";

export interface ShapeDef {
  id: ShapeId;
  label: string;
  /** Closed at the crown (true) or open-topped channel (false). */
  closed: boolean;
  /** Half-width (normalized by full depth) at relative depth yRel ∈ [0, 1]. */
  halfWidth(yRel: number, params?: ShapeParams): number;
  /** SWMM5 verification status — does this match xsect.dat / shape.c? */
  verified: "exact" | "derived";
  /** Brief geometric notes shown in the UI. */
  notes: string;
}

export interface ShapeParams {
  /** TRAPEZOIDAL side slope (horiz : vert). Default 1. */
  sideSlope?: number;
  /** TRAPEZOIDAL bottom width / full depth. Default 0.5. */
  bottomRatio?: number;
  /** POWER exponent. Default 2 (parabolic). */
  power?: number;
  /** FILLED_CIRCULAR sediment-fill ratio h_sed / D. Default 0.2. */
  fill?: number;
  /** Ellipse width / height ratio. */
  aspect?: number;
}

// ---------- closed-form shapes ----------

const CIRCULAR: ShapeDef = {
  id: "CIRCULAR",
  label: "Circular",
  closed: true,
  verified: "exact",
  notes: "r(y) = √(y(1−y)). Reference shape; R peak at y/D≈0.81, Q peak at y/D≈0.94.",
  halfWidth: (y) => Math.sqrt(Math.max(0, y * (1 - y))),
};

const FILLED_CIRCULAR: ShapeDef = {
  id: "FILLED_CIRCULAR",
  label: "Filled circular",
  closed: true,
  verified: "derived",
  notes: "Circular with sediment fill h_sed/D. Water depth measured above sediment.",
  halfWidth: (y, p) => {
    const f = p?.fill ?? 0.2;
    // y is depth above sediment, normalized by full water-depth (1−f).
    // Absolute height in the circle: f + y*(1−f).
    const yc = f + y * (1 - f);
    return Math.sqrt(Math.max(0, yc * (1 - yc)));
  },
};

const RECT_CLOSED: ShapeDef = {
  id: "RECT_CLOSED",
  label: "Closed rectangular",
  closed: true,
  verified: "exact",
  notes: "Width / depth = 1. A_full = W·D, P_full = 2(W+D).",
  halfWidth: () => 0.5,
};

const RECT_OPEN: ShapeDef = {
  id: "RECT_OPEN",
  label: "Open rectangular",
  closed: false,
  verified: "exact",
  notes: "Same wetted geometry as closed below the crown; no top closure.",
  halfWidth: () => 0.5,
};

const TRAPEZOIDAL: ShapeDef = {
  id: "TRAPEZOIDAL",
  label: "Trapezoidal",
  closed: false,
  verified: "exact",
  notes: "Bottom width b, side slope z:1. r(y) = b/2 + z·y.",
  halfWidth: (y, p) => {
    const b = p?.bottomRatio ?? 0.5;
    const z = p?.sideSlope ?? 1;
    return b / 2 + z * y;
  },
};

const TRIANGULAR: ShapeDef = {
  id: "TRIANGULAR",
  label: "Triangular",
  closed: false,
  verified: "exact",
  notes: "r(y) = y/2 · (W_full / D_full). Default W_full = D_full.",
  halfWidth: (y) => 0.5 * y,
};

const PARABOLIC: ShapeDef = {
  id: "PARABOLIC",
  label: "Parabolic",
  closed: false,
  verified: "exact",
  notes: "y = (2x)². r(y) = 0.5·√y.",
  halfWidth: (y) => 0.5 * Math.sqrt(Math.max(0, y)),
};

const POWER: ShapeDef = {
  id: "POWER",
  label: "Power",
  closed: false,
  verified: "exact",
  notes: "r(y) = 0.5·y^(1/n). n=2 → parabolic; n=1 → triangular.",
  halfWidth: (y, p) => 0.5 * Math.pow(Math.max(0, y), 1 / (p?.power ?? 2)),
};

// ---------- table-based / derived shapes ----------

const HORIZ_ELLIPSE: ShapeDef = {
  id: "HORIZ_ELLIPSE",
  label: "Horizontal ellipse",
  closed: true,
  verified: "derived",
  notes: "Major axis horizontal; default aspect W/D = 1.6.",
  halfWidth: (y, p) => {
    const a = (p?.aspect ?? 1.6) / 2;
    const b = 0.5;
    const t = (y - b) / b;
    return a * Math.sqrt(Math.max(0, 1 - t * t));
  },
};

const VERT_ELLIPSE: ShapeDef = {
  id: "VERT_ELLIPSE",
  label: "Vertical ellipse",
  closed: true,
  verified: "derived",
  notes: "Major axis vertical; default aspect W/D = 0.66.",
  halfWidth: (y, p) => {
    const a = (p?.aspect ?? 0.66) / 2;
    const b = 0.5;
    const t = (y - b) / b;
    return a * Math.sqrt(Math.max(0, 1 - t * t));
  },
};

const ARCH: ShapeDef = {
  id: "ARCH",
  label: "Arch",
  closed: true,
  verified: "derived",
  notes: "Rectangular base 0–0.4·D + semi-circular crown above.",
  halfWidth: (y) => {
    if (y <= 0.4) return 0.5;
    const yc = (y - 0.4) / 0.6; // remap upper 60% to a semicircle
    return 0.5 * Math.sqrt(Math.max(0, 1 - yc * yc));
  },
};

const EGG: ShapeDef = {
  id: "EGG",
  label: "Egg-shaped",
  closed: true,
  verified: "derived",
  notes: "Narrow crown, wide invert; SWMM5 classic egg sewer.",
  halfWidth: (y) => {
    // Three circular arcs joined; approximation by a smooth profile.
    // Width peaks near y≈0.65, tapers to 0 at crown and to a small point at invert.
    if (y <= 0) return 0;
    if (y >= 1) return 0;
    const w = Math.sin(Math.PI * y) * (0.5 + 0.18 * (y - 0.5));
    return Math.max(0, w);
  },
};

const HORSESHOE: ShapeDef = {
  id: "HORSESHOE",
  label: "Horseshoe",
  closed: true,
  verified: "derived",
  notes: "Curved invert + semi-circular crown. Wider than tall in lower half.",
  halfWidth: (y) => {
    if (y >= 0.5) {
      const t = (y - 0.5) / 0.5;
      return 0.5 * Math.sqrt(Math.max(0, 1 - t * t));
    }
    // shallow elliptical invert
    const t = (0.5 - y) / 0.5;
    return 0.5 * Math.sqrt(Math.max(0, 1 - 0.55 * t * t));
  },
};

const GOTHIC: ShapeDef = {
  id: "GOTHIC",
  label: "Gothic",
  closed: true,
  verified: "derived",
  notes: "Pointed crown — two circular arcs meeting at the apex.",
  halfWidth: (y) => {
    if (y >= 1) return 0;
    const yn = y;
    // peaks low, tapers more sharply at top than circular
    return 0.5 * Math.pow(1 - yn, 0.55) * Math.pow(yn, 0.4) * 2.05;
  },
};

const CATENARY: ShapeDef = {
  id: "CATENARY",
  label: "Catenary",
  closed: true,
  verified: "derived",
  notes: "Inverted-catenary crown over a curved invert.",
  halfWidth: (y) => {
    if (y >= 1 || y <= 0) return 0;
    // y = 1 − cosh-like; invert as half-width = 0.5·sin(π y)^(0.9)
    return 0.5 * Math.pow(Math.sin(Math.PI * y), 0.9);
  },
};

const SEMI_ELLIPTICAL: ShapeDef = {
  id: "SEMI_ELLIPTICAL",
  label: "Semi-elliptical",
  closed: true,
  verified: "derived",
  notes: "Flat sides, elliptical crown and invert.",
  halfWidth: (y) => {
    if (y < 0.25) {
      const t = (0.25 - y) / 0.25;
      return 0.5 * Math.sqrt(Math.max(0, 1 - t * t));
    }
    if (y > 0.75) {
      const t = (y - 0.75) / 0.25;
      return 0.5 * Math.sqrt(Math.max(0, 1 - t * t));
    }
    return 0.5;
  },
};

const BASKETHANDLE: ShapeDef = {
  id: "BASKETHANDLE",
  label: "Basket handle",
  closed: true,
  verified: "derived",
  notes: "Flat invert, vertical sides, semi-circular crown.",
  halfWidth: (y) => {
    if (y <= 0.5) return 0.5;
    const t = (y - 0.5) / 0.5;
    return 0.5 * Math.sqrt(Math.max(0, 1 - t * t));
  },
};

const MOD_BASKETHANDLE: ShapeDef = {
  id: "MOD_BASKETHANDLE",
  label: "Modified basket handle",
  closed: true,
  verified: "derived",
  notes: "Basket handle with a flat invert chord set by the user.",
  halfWidth: (y) => {
    // narrower invert chord 0.35 wide
    if (y <= 0.15) {
      const t = (0.15 - y) / 0.15;
      return 0.35 * Math.sqrt(Math.max(0, 1 - 0.4 * t * t));
    }
    if (y <= 0.5) return 0.5;
    const t = (y - 0.5) / 0.5;
    return 0.5 * Math.sqrt(Math.max(0, 1 - t * t));
  },
};

const SEMI_CIRCULAR: ShapeDef = {
  id: "SEMI_CIRCULAR",
  label: "Semi-circular",
  closed: true,
  verified: "derived",
  notes: "Flat invert + true semicircle crown.",
  halfWidth: (y) => {
    if (y <= 0.001) return 0.5;
    const t = y;
    return 0.5 * Math.sqrt(Math.max(0, 1 - t * t));
  },
};

export const SHAPES: Record<ShapeId, ShapeDef> = {
  CIRCULAR,
  FILLED_CIRCULAR,
  RECT_CLOSED,
  RECT_OPEN,
  TRAPEZOIDAL,
  TRIANGULAR,
  PARABOLIC,
  POWER,
  HORIZ_ELLIPSE,
  VERT_ELLIPSE,
  ARCH,
  EGG,
  HORSESHOE,
  GOTHIC,
  CATENARY,
  SEMI_ELLIPTICAL,
  BASKETHANDLE,
  MOD_BASKETHANDLE,
  SEMI_CIRCULAR,
};

export const SHAPE_IDS: ShapeId[] = Object.keys(SHAPES) as ShapeId[];
