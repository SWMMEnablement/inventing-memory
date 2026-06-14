# inventing-memory — SWMM5 geometry engine (phased)

Engine-first rebuild of the cross-section work. The "memory" the repo name
reaches for is the normalized dimensionless lookup table SWMM5 actually uses:
`A(y)/A_full`, `R(y)/R_full`, `W(y)/W_full` on a fixed relative-depth grid.

Build the engine, not the drawer. Anything we render must come straight out
of the engine functions a solver would call.

## Phasing

**Phase 1 — xsect kernel + property explorer  (this turn)**
- `src/lib/swmm/xsect.ts` — framework-agnostic, zero React.
  - per-shape dimensionless curves on a fixed grid
  - per-conduit `aFull`, `rFull`, `sFull`, `yFull`
  - `getAofY`, `getWofY`, `getRofY`, `getYofA`, `getAofS`, `getdSdA`, `getYcrit`
- `src/lib/swmm/shapes.ts` — closed-form + dimensionless tables for the
  shapes that justify the project (egg, horseshoe, basket-handle, modified
  basket-handle, gothic, catenary, semi-elliptical, arch, filled-circular,
  parabolic, power) alongside circular / rect / trapezoid / triangle.
- `/xsect` route — property-curve explorer plotting `A/A_full`, `R/R_full`,
  `W/W_full`, and section factor `AR^(2/3)` vs `y/y_full`, with markers
  for the circular `R` peak at `y/D ≈ 0.81` and conveyance peak at
  `y/D ≈ 0.94`.
- Hopfield "Forgetting Machine" stays at `/`.

**Phase 2 — transects**  `src/lib/swmm/transect.ts`
- station-elevation parser, LOB / channel / ROB split, composite Manning's n,
  meander L-factor, integration into the same A/R/W table.
- `/transect` UI: station-elevation editor, overbank-break markers, conveyance
  curve.

**Phase 3 — STREET + inlets**
- SWMM 5.2 STREET cross-section (crown / gutter, cross-slope, curb, gutter n).
- `[INLETS]` / `[INLET_USAGE]` capture; bridge to HEC-22 Inlet Explorer work.

**Phase 4 — `.inp` round-trip**
- Parse + emit `[XSECTIONS]` (Shape, Geom1–4, Barrels, Culvert) and
  `[TRANSECTS]` (NC / X1 / GR). Validate.

**Phase 5 — Verification + Preissmann slot**
- Diff TS tables against EPA SWMM5 headless output for a battery of shapes.
- Surcharge toggle: SLOT vs EXTRAN, `T(y)` and celerity `c = √(gA/T)` near
  and above the crown.
- Commit message becomes "verified against EPA SWMM5".

## Non-negotiables

- Zero React in `src/lib/swmm/*`. UI strictly on top.
- Tables are the source of truth; outlines are derived for display only.
- Every shape produces the same `(A, R, W)` triple shape so solvers don't
  branch per geometry.
