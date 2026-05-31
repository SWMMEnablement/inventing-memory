// Bipolar Hopfield network with decaying weights.
// Patterns are flattened bitmaps of -1 / +1.

export type Pattern = Int8Array;

export class Hopfield {
  readonly n: number;
  W: Float32Array; // n*n weight matrix, symmetric, zero diagonal
  readonly W0: Float32Array; // pristine weights for reference

  constructor(patterns: Pattern[]) {
    const n = patterns[0].length;
    this.n = n;
    const W = new Float32Array(n * n);
    // Hebbian rule: W_ij = (1/N) * sum_p x_i x_j
    for (const p of patterns) {
      for (let i = 0; i < n; i++) {
        const pi = p[i];
        