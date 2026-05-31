// Bipolar Hopfield network with decaying weights, inhibition, and
// online retraining ("self-rewriting") — feed spurious attractors back in.

export type Pattern = Int8Array;

export class Hopfield {
  readonly n: number;
  W: Float32Array;
  readonly W0: Float32Array;
  /** Effective # of stored patterns (grows when we retrain on hallucinations) */
  m: number;


  constructor(patterns: Pattern[]) {
    const n = patterns[0].length;
    this.n = n;
    const W = new Float32Array(n * n);
    for (const p of patterns) {
      for (let i = 0; i < n; i++) {
        const pi = p[i];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          W[i * n + j] += (pi * p[j]) / patterns.length;
        }
      }
    }
    this.W = W;
    this.W0 = new Float32Array(W);
  }

  /** Asynchronous (random order) recall. Mutates and returns `state`. */
  recall(state: Int8Array, steps = 4): Int8Array {
    const { n, W } = this;
    const order = new Uint16Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    for (let s = 0; s < steps; s++) {
      // Fisher–Yates
      for (let i = n - 1; i > 0; i--) {
        const k = (Math.random() * (i + 1)) | 0;
        const t = order[i];
        order[i] = order[k];
        order[k] = t;
      }
      for (let k = 0; k < n; k++) {
        const i = order[k];
        let h = 0;
        const row = i * n;
        for (let j = 0; j < n; j++) h += W[row + j] * state[j];
        state[i] = h >= 0 ? 1 : -1;
      }
    }
    return state;
  }

  /** Inject Gaussian noise into the weight matrix (irreversible decay). */
  decay(sigma: number) {
    const W = this.W;
    for (let i = 0; i < W.length; i++) {
      // Box–Muller
      const u1 = Math.random() || 1e-9;
      const u2 = Math.random();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      W[i] += g * sigma;
    }
    // keep symmetric-ish + zero diagonal
    const n = this.n;
    for (let i = 0; i < n; i++) {
      W[i * n + i] = 0;
      for (let j = i + 1; j < n; j++) {
        const a = W[i * n + j];
        const b = W[j * n + i];
        const m = (a + b) * 0.5;
        W[i * n + j] = m;
        W[j * n + i] = m;
      }
    }
  }

  /** Restore pristine weights. */
  reset() {
    this.W.set(this.W0);
  }

  /** Mean abs deviation from original weights — a "forgetting" scalar. */
  drift(): number {
    let s = 0;
    for (let i = 0; i < this.W.length; i++) s += Math.abs(this.W[i] - this.W0[i]);
    return s / this.W.length;
  }
}

/** Hamming distance between two ±1 vectors. */
export function hamming(a: Int8Array, b: Int8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/** Closest taught pattern + its distance. */
export function nearest(state: Int8Array, patterns: Pattern[]): { idx: number; dist: number } {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < patterns.length; i++) {
    // also consider inverted attractor (Hopfield symmetry)
    let d = 0;
    let di = 0;
    const p = patterns[i];
    for (let j = 0; j < p.length; j++) {
      if (p[j] !== state[j]) d++;
      if (-p[j] !== state[j]) di++;
    }
    const m = Math.min(d, di);
    if (m < bd) {
      bd = m;
      best = i;
    }
  }
  return { idx: best, dist: bd };
}
