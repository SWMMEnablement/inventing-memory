import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Hopfield, nearest } from "@/lib/hopfield";
import {
  GLYPH_H,
  GLYPH_W,
  N,
  PATTERNS,
  SHAPES,
  corrupt,
  randomState,
} from "@/lib/glyphs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWMM5 · Hopfield — forgetting becomes inventing" },
      {
        name: "description",
        content:
          "A Hopfield network is taught the cross-section shapes of SWMM5 conduits. As its weights decay, it hallucinates new hydraulic geometries — forgetting becomes a way of inventing.",
      },
      { property: "og:title", content: "SWMM5 · Forgetting Machine" },
      {
        property: "og:description",
        content:
          "Hydraulic cross-sections recalled, decayed, and re-invented by a Hopfield network operating in its creative regime.",
      },
    ],
  }),
  component: Index,
});

const N_CELLS = 16;
const HALL_THRESHOLD = 14; // hamming bits away from any taught shape = hallucination

// names assigned to invented cross-sections
const INVENTED = [
  "ahn-conduit", "qel-arch", "vra-section", "thoss-flume", "kreel-duct",
  "smae-bore", "nyrr-culvert", "ovum-sluice", "drosk-weir", "iyth-vault",
  "phael-pipe", "wend-trough", "zhar-channel", "ulm-pen", "brio-channel",
  "calx-bore", "delv-duct", "esh-flume", "feyl-sluice", "gnar-arch",
  "hraem-vault", "ixil-pen", "jeph-trough", "kwoth-conduit",
];

type Cell = {
  state: Int8Array;
  label: string;
  isHallucination: boolean;
  seed: number;
};

function CellGlyph({ state, on, off }: { state: Int8Array; on: string; off: string }) {
  return (
    <div
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${GLYPH_W}, 1fr)`, aspectRatio: "1 / 1" }}
    >
      {Array.from(state).map((v, i) => (
        <div
          key={i}
          style={{ backgroundColor: v === 1 ? on : off }}
          className="transition-colors duration-200"
        />
      ))}
    </div>
  );
}

function Index() {
  const net = useMemo(() => new Hopfield(PATTERNS), []);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [decay, setDecay] = useState(0.010);
  const [reseed, setReseed] = useState(0.20);
  const [selfRewrite, setSelfRewrite] = useState(false);
  const [inhibit, setInhibit] = useState(true);

  const cellsRef = useRef<Cell[]>([]);
  const energyRef = useRef<number[]>([]);
  const energyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, force] = useState(0);

  // init cells
  useEffect(() => {
    const cells: Cell[] = [];
    for (let i = 0; i < N_CELLS; i++) {
      const p = PATTERNS[i % PATTERNS.length];
      const s = corrupt(p, 0.05);
      net.recall(s, 3);
      const near = nearest(s, PATTERNS);
      cells.push({
        state: s,
        label: SHAPES[near.idx],
        isHallucination: false,
        seed: (Math.random() * 1e9) | 0,
      });
    }
    cellsRef.current = cells;
    energyRef.current = [];
    force((x) => x + 1);
  }, [net]);

  // main loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const STEP_MS = 240;
    const loop = (t: number) => {
      acc += t - last;
      last = t;
      if (acc >= STEP_MS) {
        acc = 0;
        net.decay(decay);

        const cells = cellsRef.current;
        let totalE = 0;
        const newImprints: Int8Array[] = [];

        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];

          // reseed
          if (Math.random() < reseed) {
            c.state =
              Math.random() < 0.35
                ? randomState(N)
                : corrupt(PATTERNS[(Math.random() * PATTERNS.length) | 0], 0.25);
          }

          // inhibition: nudge state away from its previous attractor
          if (inhibit && Math.random() < 0.5) {
            const flips = 6 + ((Math.random() * 8) | 0);
            for (let k = 0; k < flips; k++) {
              const j = (Math.random() * N) | 0;
              c.state[j] = -c.state[j] as -1 | 1;
            }
          }

          net.recall(c.state, 2);

          const near = nearest(c.state, PATTERNS);
          const halluc = near.dist > HALL_THRESHOLD;
          c.isHallucination = halluc;
          if (halluc) {
            let h = c.seed >>> 0;
            for (let k = 0; k < c.state.length; k++) {
              h = (h * 31 + (c.state[k] + 1)) >>> 0;
            }
            c.label = INVENTED[h % INVENTED.length];
            // queue for self-rewriting: spurious attractors fed back as memory
            if (selfRewrite && Math.random() < 0.05) {
              newImprints.push(new Int8Array(c.state));
            }
          } else {
            c.label = SHAPES[near.idx];
          }

          totalE += net.energy(c.state);
        }

        // imprint a few spurious attractors back into the weights
        for (const p of newImprints) net.imprint(p, 0.6);

        // record energy
        const avgE = totalE / cells.length;
        const buf = energyRef.current;
        buf.push(avgE);
        if (buf.length > 240) buf.shift();
        drawEnergy(energyCanvasRef.current, buf);

        setTick((x) => x + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, decay, reseed, selfRewrite, inhibit, net]);

  const handleReset = useCallback(() => {
    net.reset();
    const cells = cellsRef.current;
    for (let i = 0; i < cells.length; i++) {
      const p = PATTERNS[i % PATTERNS.length];
      const s = corrupt(p, 0.05);
      net.recall(s, 3);
      cells[i].state = s;
      cells[i].isHallucination = false;
      cells[i].label = SHAPES[nearest(s, PATTERNS).idx];
      cells[i].seed = (Math.random() * 1e9) | 0;
    }
    energyRef.current = [];
    drawEnergy(energyCanvasRef.current, []);
    setTick((x) => x + 1);
  }, [net]);

  const drift = net.drift();
  const alpha = net.m / N;
  const hallucinating = cellsRef.current.filter((c) => c.isHallucination).length;

  const ink = "oklch(0.18 0.02 60)";
  const paper = "oklch(0.965 0.012 85)";
  const ember = "oklch(0.55 0.18 35)";

  return (
    <main className="min-h-screen paper-grain">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-16">
        {/* Header */}
        <header className="border-b border-rule pb-8">
          <div className="flex items-baseline justify-between gap-6 text-[11px] uppercase tracking-[0.2em] text-ink-soft">
            <span>experiment 005 · swmm5 / hopfield</span>
            <span className="flex items-center gap-4">
              <span>
                n={N} · m={net.m} · α={alpha.toFixed(3)}
              </span>
              <Link
                to="/xsect"
                className="border-b border-dotted border-ink-soft pb-0.5 hover:text-ink"
              >
                xsect engine →
              </Link>
            </span>
          </div>
          <h1 className="mt-6 font-display text-5xl leading-[0.95] tracking-tight md:text-7xl">
            The forgetting conduit
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-soft md:text-base">
            A Hopfield network is taught the cross-section shapes of SWMM5 conduits —
            circular, gothic, horseshoe, egg. Each tick, Gaussian noise erodes its
            weights; basins flatten and merge. The recalled geometries drift into
            shapes that were never written. With <em className="font-display not-italic">self-rewriting</em> enabled, the network
            imprints its own hallucinations back as new memories — a hydraulic
            alphabet inventing itself.
          </p>
        </header>

        {/* Stats */}
        <section className="mt-8 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
          <Stat label="tick" value={String(tick).padStart(4, "0")} />
          <Stat label="weight drift" value={drift.toFixed(4)} />
          <Stat
            label="hallucinating"
            value={`${hallucinating}/${N_CELLS}`}
            accent={hallucinating > 0}
          />
          <Stat
            label="capacity α"
            value={alpha.toFixed(3)}
            accent={alpha > 0.14}
          />
          <div className="flex items-end gap-2">
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex-1 border border-ink bg-ink px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-paper transition-colors hover:bg-paper hover:text-ink"
            >
              {running ? "pause" : "resume"}
            </button>
            <button
              onClick={handleReset}
              className="flex-1 border border-ink px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              relearn
            </button>
          </div>
        </section>

        {/* Controls */}
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Slider
            label="decay σ"
            value={decay}
            min={0.001}
            max={0.04}
            step={0.001}
            onChange={setDecay}
            display={decay.toFixed(3)}
          />
          <Slider
            label="reseed rate"
            value={reseed}
            min={0}
            max={1}
            step={0.01}
            onChange={setReseed}
            display={reseed.toFixed(2)}
          />
          <Toggle
            label="self-rewriting"
            sub="imprint spurious attractors back as memories"
            on={selfRewrite}
            onChange={setSelfRewrite}
          />
          <Toggle
            label="inhibition"
            sub="nudge states out of recently-visited basins"
            on={inhibit}
            onChange={setInhibit}
          />
        </section>

        {/* Energy plot */}
        <section className="mt-6 border border-rule p-3">
          <div className="mb-2 flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            <span>energy landscape · ⟨E⟩ over time</span>
            <span>E = −½ sᵀWs · lower = deeper basin</span>
          </div>
          <canvas
            ref={energyCanvasRef}
            width={1200}
            height={140}
            className="block h-[120px] w-full"
          />
        </section>

        {/* Attractor grid */}
        <section className="mt-6">
          <div className="grid grid-cols-4 gap-px border border-rule bg-rule md:grid-cols-8">
            {cellsRef.current.map((c, i) => (
              <article
                key={i}
                className="group relative flex flex-col gap-2 bg-paper p-3"
              >
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-ink-soft">
                  <span>cell.{String(i).padStart(2, "0")}</span>
                  <span style={{ color: c.isHallucination ? ember : undefined }}>
                    {c.isHallucination ? "△" : "·"}
                  </span>
                </div>
                <CellGlyph
                  state={c.state}
                  on={c.isHallucination ? ember : ink}
                  off={paper}
                />
                <div
                  className="truncate text-[10px] uppercase tracking-[0.1em] leading-tight"
                  style={{ color: c.isHallucination ? ember : ink }}
                  title={c.label}
                >
                  {c.label}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Field notes */}
        <section className="mt-12 grid grid-cols-1 gap-8 border-t border-rule pt-10 text-sm leading-relaxed text-ink-soft md:grid-cols-3">
          <Note title="01 · the alphabet">
            Fourteen SWMM5 cross-sections — circular, egg, horseshoe, gothic,
            arch, trapezoidal, and others — are rasterized onto a {GLYPH_W}×
            {GLYPH_H} grid and stored via Hebbian superposition. The capacity
            ratio α = m/n places us inside the creative regime (≈ 0.1).
          </Note>
          <Note title="02 · the decay">
            Each tick, Gaussian noise (σ) is added symmetrically to the weight
            matrix. Energy valleys flatten; adjacent basins merge. Spurious
            attractors form between stored shapes — mixture states that are
            still simply-connected, still geometrically plausible.
          </Note>
          <Note title="03 · the rewriting">
            With <em className="font-display not-italic">self-rewriting</em> on, hallucinated states are imprinted back
            into the weights. The conduit alphabet evolves without external
            input. Inhibition prevents the loop from collapsing onto a single
            invented shape.
          </Note>
        </section>

        <footer className="mt-16 flex items-center justify-between border-t border-rule pt-6 text-[11px] uppercase tracking-[0.2em] text-ink-soft">
          <span>swmm5 · forgetting as invention</span>
          <span>{new Date().getFullYear()}</span>
        </footer>
      </div>
    </main>
  );
}

function drawEnergy(canvas: HTMLCanvasElement | null, data: number[]) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // background grid
  ctx.strokeStyle = "rgba(120, 100, 70, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  if (data.length < 2) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 1e-6) hi = lo + 1;
  const pad = 6;
  // baseline (zero or midpoint indicator)
  ctx.strokeStyle = "oklch(0.18 0.02 60)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * (W - pad * 2) + pad;
    const y = H - pad - ((data[i] - lo) / (hi - lo)) * (H - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // last-point dot
  const lx = W - pad;
  const ly =
    H - pad - ((data[data.length - 1] - lo) / (hi - lo)) * (H - pad * 2);
  ctx.fillStyle = "oklch(0.55 0.18 35)";
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fill();
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-rule p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft">{label}</div>
      <div
        className="mt-1 font-mono text-base tabular-nums"
        style={{ color: accent ? "oklch(0.55 0.18 35)" : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <label className="flex flex-col gap-2 border border-rule p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-ink-soft">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-ink">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none bg-rule accent-[oklch(0.18_0.02_60)]"
      />
    </label>
  );
}

function Toggle({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center justify-between gap-3 border border-rule p-3 text-left transition-colors hover:bg-secondary"
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {label}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-ink-soft">{sub}</div>
      </div>
      <div
        className="flex h-6 w-12 items-center border border-ink p-0.5 transition-colors"
        style={{ background: on ? "oklch(0.18 0.02 60)" : "transparent" }}
      >
        <div
          className="h-full w-1/2 transition-transform"
          style={{
            background: on ? "oklch(0.965 0.012 85)" : "oklch(0.18 0.02 60)",
            transform: on ? "translateX(100%)" : "translateX(0)",
          }}
        />
      </div>
    </button>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-ink">{title}</div>
      <p>{children}</p>
    </div>
  );
}
