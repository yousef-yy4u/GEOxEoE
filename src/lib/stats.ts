/* Client + server statistics — ported from the scipy-validated stats.js.
   Pure functions; the Student-t tail (p-value) was cross-checked to 1e-6. */

export interface Pearson {
  n: number;
  r: number | null;
  p: number | null;
  ci: [number | null, number | null];
  partial?: boolean;
}

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}

// Regularized incomplete beta — Numerical Recipes betacf (Lentz).
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300,
    EPS = 3e-12;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function gammaln(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student-t with df degrees of freedom. */
export function tTwoSided(t: number, df: number): number {
  if (!isFinite(t)) return 0;
  const x = df / (df + t * t);
  return ibeta(x, df / 2, 0.5);
}

export function pearson(x: number[], y: number[]): Pearson {
  const n = x.length;
  if (n < 3 || n !== y.length) return { n, r: null, p: null, ci: [null, null] };
  const mx = mean(x),
    my = mean(y);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx,
      dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { n, r: 0, p: 1, ci: [null, null] };
  let r = sxy / Math.sqrt(sxx * syy);
  r = Math.max(-1, Math.min(1, r));
  const df = n - 2;
  const t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r));
  const p = tTwoSided(t, df);
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r)));
  const se = 1 / Math.sqrt(n - 3);
  return { n, r, p, ci: [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)] };
}

export interface Ols {
  slope: number;
  intercept: number;
  r2: number;
}
export function ols(x: number[], y: number[]): Ols {
  const n = x.length,
    mx = mean(x),
    my = mean(y);
  let sxy = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r = pearson(x, y).r || 0;
  return { slope, intercept, r2: r * r };
}

export interface MultiReg {
  coef: number[];   // one coefficient per predictor column (standardized betas if inputs z-scored)
  intercept: number;
  r2: number;
  n: number;
  k: number;        // number of predictors
}

/** Invert a square matrix via Gauss-Jordan elimination with partial pivoting.
 *  Returns null if the matrix is singular. Sized for tiny systems (k+1 ≤ ~10). */
function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/** Ordinary-least-squares multiple regression of y on the columns of X via the
 *  normal equations β = (XᵀX)⁻¹ Xᵀy. `X` is row-major: X[i] is the predictor row
 *  for observation i. With z-scored inputs the intercept ≈ 0 and coef are
 *  standardized betas; for k = 1 this reduces to simple regression (β = Pearson r). */
export function multipleRegression(X: number[][], y: number[]): MultiReg {
  const n = X.length;
  const k = n ? X[0].length : 0;
  if (n === 0 || k === 0 || n !== y.length) return { coef: Array(k).fill(0), intercept: 0, r2: 0, n, k };
  // Design matrix with leading intercept column of 1s → p = k + 1 columns.
  const p = k + 1;
  const D = X.map((row) => [1, ...row]);
  // XᵀX (p×p) and Xᵀy (p).
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += D[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += D[i][a] * D[i][b];
    }
  }
  const inv = invert(XtX);
  if (!inv) return { coef: Array(k).fill(0), intercept: 0, r2: 0, n, k };
  const beta = Array(p).fill(0);
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) beta[a] += inv[a][b] * Xty[b];
  // R² from residual vs total sum of squares.
  const my = mean(y);
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let a = 0; a < p; a++) yhat += beta[a] * D[i][a];
    ssRes += (y[i] - yhat) ** 2;
    ssTot += (y[i] - my) ** 2;
  }
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;
  return { coef: beta.slice(1), intercept: beta[0], r2, n, k };
}

/** Partial correlation of x and y controlling for confounder z. */
export function partial(x: number[], y: number[], z: number[]): Pearson {
  const rxy = pearson(x, y).r ?? 0;
  const rxz = pearson(x, z).r ?? 0;
  const ryz = pearson(y, z).r ?? 0;
  const denom = Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz));
  if (!denom) return { n: x.length, r: null, p: null, ci: [null, null], partial: true };
  const rp = (rxy - rxz * ryz) / denom;
  const df = x.length - 3;
  const t = rp * Math.sqrt(df / Math.max(1e-12, 1 - rp * rp));
  return { n: x.length, r: rp, p: tTwoSided(t, df), ci: [null, null], partial: true };
}
