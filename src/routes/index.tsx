import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Hopfield, nearest } from "@/lib/hopfield";
import { GLYPH_H, GLYPH_W, LETTERS, PATTERNS, corrupt, randomState } from "@/lib/glyphs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forgetting Machine — a self-rewriting memory" },
      {
        name: "description",
        content:
          "A Hopfield network remembers an alphabet, then forgets. As its weights decay, it begins to hallucinate glyphs it was never taught.",
      },
      { property: "og:title", content: "Forgetting Machine" },
      {
        property: "og:description",
        content: "A Hopfield network whose decay invents new letters.",
      },
    ],
  }),
  component: Index,
});

const N_CELLS = 16;
const HALLUCINATION_THRESHOLD = 8; // hamming bits away from any taught letter

// names assigned to invented glyphs as they emerge
const INVENTED = [
  "ahn", "qel", "vra", "thoss", "kreel", "smae", "nyrr", "ovum",
  "drosk", "iyth", "phael", "wend", "zhar", "ulm", "brio", "calx",
  "delv", "esh", "feyl", "gnar", "hraem", "ixil", "jeph", "kwoth",
];

function CellGlyph({ state, on, off }: { state: Int8Array; on: string; off: string }) {
  return (
    <div
      className="grid gap-px"
      style={{
        gridTemplateColumns: `repeat(${GLYPH_W}, 1fr)`,
        aspectRatio: "1 / 1",
      }}
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

type Cell = {
  state: Int8Array;
  label: string;
  isHallucination: boolean;
  inventedSeed: number;
};

function Index() {
  const net = useMemo(() => new Hopfield(PATTERNS), []);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [decay, setDecay] = useState(0.012);
  const [reseed, setReseed] = useState(0.18);
  const cellsRef = useRef<Cell[]>([]);
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
        label: LETTERS[near.idx],
        isHallucination: false,
        inventedSeed: (Math.random() * 1e9) | 0,
      });
    }
    cellsRef.current = cells;
    force((x) => x + 1);
  }, [net]);

  // animation loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const STEP_MS = 220;
    const loop = (t: number) => {
      acc += t - last;
      last = t;
      if (acc >= STEP_MS) {
        acc = 0;
        net.decay(decay);
        const cells = cellsRef.current;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          // occasionally reseed with a corrupted taught pattern or noise
          if (Math.random() < reseed) {
            const useRandom = Math.random() < 0.35;
            c.state = useRandom
              ? randomState(GLYPH_W * GLYPH_H)
              : corrupt(PATTERNS[(Math.random() * PATTERNS.length) | 0], 0.25);
          }
          net.recall(c.state, 2);
          const near = nearest(c.state, PATTERNS);
          const halluc = near.dist > HALLUCINATION_THRESHOLD;
          c.isHallucination = halluc;
          if (halluc) {
            // deterministic-ish name from state fingerprint + seed
            let h = c.inventedSeed >>> 0;
            for (let k = 0; k < c.state.length; k++) {
              h = (h * 31 + (c.state[k] + 1)) >>> 0;
            }
            c.label = INVENTED[h % INVENTED.length];
          } else {
            c.label = LETTERS[near.idx];
          }
        }
        setTick((x) => x + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, decay, reseed, net]);

  const handleReset = useCallback(() => {
    net.reset();
    const cells = cellsRef.current;
    for (let i = 0; i < cells.length; i++) {
      const p = PATTERNS[i % PATTERNS.length];
      const s = corrupt(p, 0.05);
      net.recall(s, 3);
      cells[i].state = s;
      cells[i].isHallucination = false;
      cells[i].label = LETTERS[nearest(s, PATTERNS).idx];
      cells[i].inventedSeed = (Math.random() * 1e9) | 0;
    }
    setTick((x) => x + 1);
  }, [net]);

  const drift = net.drift();
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
            <span>experiment 005 / swmm5</span>
            <span>hopfield · n={GLYPH_W * GLYPH_H} · m={PATTERNS.length}</span>
          </div>
          <h1 className="mt-6 font-display text-5xl leading-[0.95] tracking-tight md:text-7xl">
            The forgetting machine
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-soft md:text-base">
            A Hopfield network is taught the eight letters of <em className="font-display not-italic">hopfield</em>.
            Each tick, Gaussian noise erodes its weights. The attractors warp, collide,
            and drift into shapes that were never written. Forgetting becomes a way of inventing.
          </p>
        </header>

        {/* Controls */}
        <section className="mt-8 grid grid-cols-1 gap-4 text-xs md:grid-cols-4">
          <Stat label="tick" value={String(tick).padStart(4, "0")} />
          <Stat label="weight drift" value={drift.toFixed(4)} />
          <Stat label="hallucinating" value={`${hallucinating} / ${N_CELLS}`} accent={hallucinating > 0} />
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

        <section className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
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
        </section>

        {/* Grid of attractors */}
        <section className="mt-10">
          <div className="grid grid-cols-4 gap-px border border-rule bg-rule md:grid-cols-8">
            {cellsRef.current.map((c, i) => (
              <article
                key={i}
                className="group relative flex flex-col gap-2 bg-paper p-3 transition-colors"
              >
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-ink-soft">
                  <span>cell.{String(i).padStart(2, "0")}</span>
                  <span
                    className="font-mono"
                    style={{ color: c.isHallucination ? ember : undefined }}
                  >
                    {c.isHallucination ? "△" : "·"}
                  </span>
                </div>
                <CellGlyph
                  state={c.state}
                  on={c.isHallucination ? ember : ink}
                  off={paper}
                />
                <div
                  className="truncate font-display text-lg leading-none"
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
            Eight 9×9 bitmaps — H O P F I E L D — are stored via Hebbian
            superposition. Each cell is seeded with a noisy version of one letter
            and settles into the nearest attractor.
          </Note>
          <Note title="02 · the decay">
            Every tick, Gaussian noise (σ) is added to the weight matrix. The
            energy landscape erodes: basins merge, new minima open, spurious
            attractors appear where no letter was ever stored.
          </Note>
          <Note title="03 · the invention">
            When a recalled state drifts more than {HALLUCINATION_THRESHOLD} bits
            from any taught glyph, it is named — a hallucination, in ember.
            These names persist as long as the shape does.
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-rule p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink-soft">{label}</div>
      <div
        className="mt-1 font-mono text-lg tabular-nums"
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

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-ink">{title}</div>
      <p>{children}</p>
    </div>
  );
}
