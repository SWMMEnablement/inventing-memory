import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

import { SHAPES, SHAPE_IDS, type ShapeId } from "@/lib/swmm/shapes";
import { XSection, N_GRID } from "@/lib/swmm/xsect";

export const Route = createFileRoute("/xsect")({
  head: () => ({
    meta: [
      { title: "SWMM5 Property Explorer — A(y), R(y), W(y), AR²ᐟ³" },
      {
        name: "description",
        content:
          "Normalized hydraulic property curves for SWMM5 cross-sections. The R-peak at y/D≈0.81 and conveyance peak at y/D≈0.94 visible on every closed conduit.",
      },
      { property: "og:title", content: "SWMM5 Property Explorer" },
      {
        property: "og:description",
        content: "Engine-first cross-section geometry: A/A_full, R/R_full, W/W_max, AR^(2/3) vs y/y_full.",
      },
    ],
  }),
  component: XSectPage,
});

interface CurveRow {
  y: number;
  A: number;
  R: number;
  W: number;
  S: number;
}

function buildRows(shapeId: ShapeId): CurveRow[] {
  const xs = new XSection({ shapeId, yFull: 1 });
  const t = xs.table;
  const rows: CurveRow[] = [];
  for (let k = 0; k < N_GRID; k++) {
    rows.push({
      y: t.y[k],
      A: t.a[k],
      R: t.r[k],
      W: t.w[k],
      S: t.s[k],
    });
  }
  return rows;
}

function findPeak(rows: CurveRow[], key: keyof CurveRow): { y: number; v: number } {
  let best = { y: 0, v: -Infinity };
  for (const r of rows) {
    const v = r[key] as number;
    if (v > best.v) best = { y: r.y, v };
  }
  return best;
}

function XSectPage() {
  const [shapeId, setShapeId] = useState<ShapeId>("CIRCULAR");
  const rows = useMemo(() => buildRows(shapeId), [shapeId]);
  const rPeak = useMemo(() => findPeak(rows, "R"), [rows]);
  const sPeak = useMemo(() => findPeak(rows, "S"), [rows]);
  const shape = SHAPES[shapeId];

  return (
    <div className="min-h-screen bg-background text-foreground paper-grain">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              inventing-memory · phase 1
            </p>
            <h1 className="mt-2 font-serif text-4xl leading-tight">
              The cross-section is a triple of curves, not a picture
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              SWMM5 stores every shape as a dimensionless lookup of{" "}
              <span className="font-mono">A/A_full</span>,{" "}
              <span className="font-mono">R/R_full</span>,{" "}
              <span className="font-mono">W/W_max</span> on a 51-point relative-depth
              grid, then scales per conduit. This page is the engine{" "}
              <span className="font-mono">src/lib/swmm/xsect.ts</span> exposed directly —
              same tables a solver would call, plotted.
            </p>
          </div>
          <Link
            to="/"
            className="shrink-0 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← forgetting machine
          </Link>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-[260px_1fr]">
          <div className="rounded-lg border border-border bg-card p-4">
            <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Shape
            </label>
            <select
              value={shapeId}
              onChange={(e) => setShapeId(e.target.value as ShapeId)}
              className="mt-2 w-full rounded-md border border-input bg-background px-2 py-2 font-mono text-sm"
            >
              {SHAPE_IDS.map((id) => (
                <option key={id} value={id}>
                  {SHAPES[id].label}
                </option>
              ))}
            </select>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {shape.notes}
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wider">
              <span
                className={
                  shape.verified === "exact"
                    ? "text-emerald-500"
                    : "text-amber-500"
                }
              >
                {shape.verified}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {shape.closed ? "closed" : "open"}
              </span>
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Critical depths
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="font-mono text-muted-foreground">R peak</dt>
              <dd className="font-mono">
                y/D = {rPeak.y.toFixed(2)} → R/R_full = {rPeak.v.toFixed(3)}
              </dd>
              <dt className="font-mono text-muted-foreground">Q peak (S)</dt>
              <dd className="font-mono">
                y/D = {sPeak.y.toFixed(2)} → S/S_full = {sPeak.v.toFixed(3)}
              </dd>
              <dt className="font-mono text-muted-foreground">Surcharge gain</dt>
              <dd className="font-mono">
                {((sPeak.v - 1) * 100).toFixed(1)}% over full-pipe flow
              </dd>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              For circular pipe the canonical numbers are R-peak at y/D ≈ 0.81 and
              Q-peak at y/D ≈ 0.94 — a pipe carries roughly 8% more flow at 94% full
              than at 100%. That non-monotone behavior is why the section factor table
              exists in the first place.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-serif text-lg">Normalized property curves</h2>
            <p className="font-mono text-xs text-muted-foreground">
              x = y/y_full · y = ratio of full value
            </p>
          </div>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="y"
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(v) => v.toFixed(2)}
                  stroke="var(--ink-soft)"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />
                <YAxis
                  domain={[0, 1.25]}
                  stroke="var(--ink-soft)"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--paper)",
                    border: "1px solid var(--border)",
                    fontFamily: "JetBrains Mono",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => v.toFixed(3)}
                  labelFormatter={(l) => `y/y_full = ${Number(l).toFixed(2)}`}
                />
                <Legend
                  wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11 }}
                />
                <ReferenceLine
                  x={rPeak.y}
                  stroke="var(--ink-soft)"
                  strokeDasharray="3 3"
                  label={{ value: "R peak", position: "top", fontSize: 10 }}
                />
                <ReferenceLine
                  x={sPeak.y}
                  stroke="var(--ink-soft)"
                  strokeDasharray="3 3"
                  label={{ value: "Q peak", position: "top", fontSize: 10 }}
                />
                <ReferenceLine y={1} stroke="var(--border)" />
                <Line dataKey="A" name="A / A_full" stroke="#60a5fa" dot={false} strokeWidth={2} />
                <Line dataKey="R" name="R / R_full" stroke="#f59e0b" dot={false} strokeWidth={2} />
                <Line dataKey="W" name="W / W_max" stroke="#a78bfa" dot={false} strokeWidth={2} />
                <Line dataKey="S" name="AR²ᐟ³ / full" stroke="#ef4444" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-8 grid gap-4 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono uppercase tracking-wider text-foreground">01 · Engine, not drawer</p>
            <p className="mt-2">
              The kernel exposes <span className="font-mono">getAofY</span>,{" "}
              <span className="font-mono">getWofY</span>,{" "}
              <span className="font-mono">getRofY</span>,{" "}
              <span className="font-mono">getYofA</span>,{" "}
              <span className="font-mono">getAofS</span>,{" "}
              <span className="font-mono">getdSdA</span>,{" "}
              <span className="font-mono">getYcrit</span> — the same surface SWMM5's{" "}
              <span className="font-mono">xsect.c</span> hands to its dynamic-wave
              solver.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono uppercase tracking-wider text-foreground">02 · Dimensionless first</p>
            <p className="mt-2">
              Each shape is integrated once on a 51-point grid. Per-conduit{" "}
              <span className="font-mono">aFull</span>,{" "}
              <span className="font-mono">rFull</span>,{" "}
              <span className="font-mono">sFull</span>,{" "}
              <span className="font-mono">yFull</span> scale the tables — no shape
              branching at solve time.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono uppercase tracking-wider text-foreground">03 · Verification pending</p>
            <p className="mt-2">
              Closed-form shapes are marked <span className="text-emerald-500">exact</span>.
              Table-based shapes (egg, horseshoe, basket-handle, gothic, catenary,
              semi-elliptical) are <span className="text-amber-500">derived</span> from
              outline parameterizations and must be diffed against EPA SWMM5's{" "}
              <span className="font-mono">shape.c</span> tables in phase 5.
            </p>
          </div>
        </section>

        <footer className="mt-12 border-t border-border pt-6 font-mono text-[11px] text-muted-foreground">
          <p>
            phases: <span className="text-foreground">01 kernel + curves</span> ·
            02 transects · 03 street + inlets · 04 .inp round-trip ·
            05 EPA verification + Preissmann slot
          </p>
        </footer>
      </div>
    </div>
  );
}
