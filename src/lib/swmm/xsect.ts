// SWMM5 cross-section geometry kernel.
//
// Mirrors the architecture of EPA SWMM5's xsect.c:
//   - each shape is a dimensionless curve on a fixed relative-depth grid
//   - per-conduit scaling: aFull, rFull, sFull, yFull, wMax
//   - solver-facing functions: getAofY, getWofY, getRofY, getYofA,
//                              getAofS, getdSdA, getYcrit
//
// Linear interpolation on a 51-point grid (y/yFull = 0, 0.02, ..., 1.0).
// Inverse lookups use binary search + linear interp inside the bracketing
// segment. Section factor S = A · R^(2/3) is tabulated once per shape.
//
// Zero framework dependencies. Plug this into any solver.

import { SHAPES, type ShapeId, type ShapeParams } from "./shapes";

export const N_GRID = 51;
export const G = 9.81; // m/s²

export interface DimensionlessTable {
  shapeId: ShapeId;
  /** y/yFull at each grid index. */
  y: Float64Array;
  /** A(y) / A_full. */
  a: Float64Array;
  /** W(y) / W_max. */
  w: Float64Array;
  /** R(y) / R_full. */
  r: Float64Array;
  /** Section factor S = A·R^(2/3), normalized by A_full · R_full^(2/3). */
  s: Float64Array;
  /** dS/dA on the same normalized grid (finite-difference). */
  dsda: Float64Array;
  /** Geometry-only scalars used to convert normalized → absolute. */
  aFullNorm: number; // ∫ 2·r(y) dy over y∈[0,1]   (units of yFull²)
  pFullNorm: number; // wetted perimeter at y=yFull (units of yFull)
  wMaxNorm: number;  // max half-width × 2
}

/** Build the dimensionless tables for one shape (high-res integration). */
export function buildTable(shapeId: ShapeId, params?: ShapeParams): DimensionlessTable {
  const shape = SHAPES[shapeId];
  const SUB = 2000; // fine integration sub-grid
  const dy = 1 / SUB;

  // ---- pass 1: half-widths at every sub-grid node ----
  const rHalf = new Float64Array(SUB + 1);
  for (let i = 0; i <= SUB; i++) {
    rHalf[i] = Math.max(0, shape.halfWidth(i * dy, params));
  }

  // ---- pass 2: cumulative A, P, W via trapezoidal rule ----
  const aCum = new Float64Array(SUB + 1);
  const pCum = new Float64Array(SUB + 1);
  // bottom segment contributes width 2·r(0) to wetted perimeter
  pCum[0] = 2 * rHalf[0];
  for (let i = 1; i <= SUB; i++) {
    const w0 = 2 * rHalf[i - 1];
    const w1 = 2 * rHalf[i];
    aCum[i] = aCum[i - 1] + 0.5 * (w0 + w1) * dy;
    // arc length on each side: √(dy² + dr²) × 2 sides
    const dr = rHalf[i] - rHalf[i - 1];
    pCum[i] = pCum[i - 1] + 2 * Math.sqrt(dy * dy + dr * dr);
  }

  // ---- full-section scalars ----
  let wMaxNorm = 0;
  for (let i = 0; i <= SUB; i++) wMaxNorm = Math.max(wMaxNorm, 2 * rHalf[i]);
  const aFullNorm = aCum[SUB];
  // for closed shapes the crown is included automatically by the arc length
  // (top half-width → 0). For open channels we leave the free surface out.
  const pFullNorm = pCum[SUB];
  const rFullNorm = aFullNorm / Math.max(pFullNorm, 1e-12);

  // ---- pass 3: resample onto 51-point normalized grid ----
  const y = new Float64Array(N_GRID);
  const a = new Float64Array(N_GRID);
  const w = new Float64Array(N_GRID);
  const r = new Float64Array(N_GRID);
  const s = new Float64Array(N_GRID);
  for (let k = 0; k < N_GRID; k++) {
    const yk = k / (N_GRID - 1);
    y[k] = yk;
    const idx = yk * SUB;
    const i0 = Math.floor(idx);
    const i1 = Math.min(SUB, i0 + 1);
    const t = idx - i0;
    const aAbs = aCum[i0] * (1 - t) + aCum[i1] * t;
    const pAbs = pCum[i0] * (1 - t) + pCum[i1] * t;
    const wAbs = 2 * (rHalf[i0] * (1 - t) + rHalf[i1] * t);
    a[k] = aFullNorm > 0 ? aAbs / aFullNorm : 0;
    w[k] = wMaxNorm > 0 ? wAbs / wMaxNorm : 0;
    const rAbs = pAbs > 1e-12 ? aAbs / pAbs : 0;
    r[k] = rFullNorm > 0 ? rAbs / rFullNorm : 0;
    s[k] = a[k] * Math.pow(Math.max(0, r[k]), 2 / 3);
  }
  // normalize S so S(1) = 1 for the reference table
  const sFull = s[N_GRID - 1] || 1;
  for (let k = 0; k < N_GRID; k++) s[k] /= sFull;

  const dsda = new Float64Array(N_GRID);
  for (let k = 0; k < N_GRID; k++) {
    const km = Math.max(0, k - 1);
    const kp = Math.min(N_GRID - 1, k + 1);
    const dA = a[kp] - a[km];
    dsda[k] = dA > 1e-9 ? (s[kp] - s[km]) / dA : 0;
  }

  return {
    shapeId,
    y, a, w, r, s, dsda,
    aFullNorm,
    pFullNorm,
    wMaxNorm,
  };
}

// ---------------- XSection (per-conduit scaled instance) ----------------

export interface XSectionGeom {
  shapeId: ShapeId;
  /** Full depth (crown above invert), in project units. */
  yFull: number;
  /** Optional override of full area; otherwise yFull²·aFullNorm. */
  aFullOverride?: number;
  /** Number of parallel barrels. */
  barrels?: number;
  params?: ShapeParams;
}

export class XSection {
  readonly geom: XSectionGeom;
  readonly table: DimensionlessTable;
  readonly yFull: number;
  readonly wMax: number;
  readonly aFull: number;
  readonly pFull: number;
  readonly rFull: number;
  readonly sFull: number;

  constructor(geom: XSectionGeom) {
    this.geom = geom;
    this.table = buildTable(geom.shapeId, geom.params);
    this.yFull = geom.yFull;
    this.wMax = this.table.wMaxNorm * geom.yFull;
    const barrels = geom.barrels ?? 1;
    this.aFull = (geom.aFullOverride ?? this.table.aFullNorm * geom.yFull * geom.yFull) * barrels;
    this.pFull = this.table.pFullNorm * geom.yFull;
    this.rFull = this.aFull / Math.max(this.pFull * barrels, 1e-12);
    this.sFull = this.aFull * Math.pow(this.rFull, 2 / 3);
  }

  /** Linear interp in a monotonic 1D table. */
  private interp(yRel: number, arr: Float64Array): number {
    if (yRel <= 0) return arr[0];
    if (yRel >= 1) return arr[N_GRID - 1];
    const x = yRel * (N_GRID - 1);
    const i = Math.floor(x);
    const t = x - i;
    return arr[i] * (1 - t) + arr[i + 1] * t;
  }

  /** Inverse interp: given a target value, find yRel where arr(yRel) = v. */
  private invert(v: number, arr: Float64Array): number {
    if (v <= arr[0]) return 0;
    if (v >= arr[N_GRID - 1]) return 1;
    let lo = 0;
    let hi = N_GRID - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= v) lo = mid;
      else hi = mid;
    }
    const span = arr[hi] - arr[lo];
    const t = span > 1e-12 ? (v - arr[lo]) / span : 0;
    return (lo + t) / (N_GRID - 1);
  }

  /** Flow area at depth y (project units). */
  getAofY(y: number): number {
    return this.interp(y / this.yFull, this.table.a) * this.aFull;
  }
  /** Top width at depth y. */
  getWofY(y: number): number {
    return this.interp(y / this.yFull, this.table.w) * this.wMax;
  }
  /** Hydraulic radius at depth y. */
  getRofY(y: number): number {
    return this.interp(y / this.yFull, this.table.r) * this.rFull;
  }
  /** Depth y that produces flow area A. */
  getYofA(A: number): number {
    return this.invert(A / this.aFull, this.table.a) * this.yFull;
  }
  /** Section factor S = A·R^(2/3) at depth y. */
  getSofY(y: number): number {
    return this.interp(y / this.yFull, this.table.s) * this.sFull;
  }
  /** Depth y that produces flow area for section factor S (via tabulated S). */
  getAofS(S: number): number {
    const yRel = this.invert(S / this.sFull, this.table.s);
    return this.interp(yRel, this.table.a) * this.aFull;
  }
  /** dS/dA (normalized table, scaled). */
  getdSdA(y: number): number {
    return this.interp(y / this.yFull, this.table.dsda) * (this.sFull / this.aFull);
  }

  /**
   * Critical depth for discharge Q: solves Q²·T = g·A³.
   * Uses bisection on the bracket [ε·yFull, yFull].
   */
  getYcrit(Q: number): number {
    if (Q <= 0) return 0;
    const f = (y: number) => {
      const A = this.getAofY(y);
      const T = Math.max(this.getWofY(y), 1e-9);
      return Q * Q * T - G * A * A * A;
    };
    let lo = 1e-4 * this.yFull;
    let hi = this.yFull * 0.999;
    let fLo = f(lo);
    let fHi = f(hi);
    if (fLo * fHi > 0) return fHi < 0 ? this.yFull : lo;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      const fm = f(mid);
      if (fm * fLo < 0) {
        hi = mid;
        fHi = fm;
      } else {
        lo = mid;
        fLo = fm;
      }
      if (hi - lo < 1e-6 * this.yFull) break;
    }
    return 0.5 * (lo + hi);
  }

  /**
   * Wave celerity c = √(g·A/T) at depth y — the quantity that explains
   * why the Preissmann slot exists: as y → yFull in a closed conduit,
   * T → 0 and c → ∞, blowing up CFL. The slot keeps T bounded.
   */
  getCelerity(y: number): number {
    const A = this.getAofY(y);
    const T = Math.max(this.getWofY(y), 1e-9);
    return Math.sqrt((G * A) / T);
  }
}
