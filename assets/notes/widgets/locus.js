// The root locus of the notes' figure rootlocus.js: the loop gain T(s) = K·N(s)/D(s) of a converter's
// averaged plant times the 2p2z's continuous prototype (and a Padé approximation of the delay), the
// branches of D(s) + K·N(s) = 0 traced for K from 0 to ∞, the critical gain on the jω axis, and the
// exact sampled-data model's closed-loop poles for comparison. Pure functions, no page.
//
// Polynomials are arrays of coefficients, highest power first. The model's polynomials are in
// x = s/(2π·UNIT), so their roots come in units of UNIT hertz and stay well scaled (from the
// integrator at 0 to the Padé poles near 150 kHz, the coefficients span about 10¹⁰ instead of 10³⁸).
// D is monic; the sign of N's leading coefficient is the effective gain's sign in the monic form
// Π(s − zⱼ)/Π(s − pᵢ): negative with an odd number of right-half-plane zeros (the boost's, a Padé
// zero), which turns the 180° locus into the 0° one. The figure only solves D + K·N = 0, which takes
// the sign in by itself.
import { polymul, polyadd, sampledPlant, closedLoopPoles } from "./discrete.js";
import { pidEquivalent } from "../../pcl/loop.js";

const TWO_PI = 2 * Math.PI;
export const UNIT = 5e3;  // Hz: the polynomials' variable is s/(2π·5 kHz)

// e^(−sτ) ≈ P(s)/Q(s), the (n, n) Padé approximant, coefficients in s (rad/s).
export function pade(tau, n) {
  const fact = k => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
  const num = [], den = [];
  for (let k = n; k >= 0; k--) {
    const c = fact(2 * n - k) * fact(n) / (fact(2 * n) * fact(k) * fact(n - k)) * tau ** k;
    num.push(k % 2 ? -c : c); den.push(c);
  }
  return { num, den };
}

const mul = (...ps) => ps.reduce((a, b) => polymul(a, b), [1]);
const scale = (p, k) => p.map(c => c * k);
// p(s) with s = W·x: the coefficient of sⁿ⁻ⁱ times Wⁿ⁻ⁱ
const inUnits = (p, W) => p.map((c, i) => c * W ** (p.length - 1 - i));

// The averaged duty → V(out) of the converter, at op, as polynomials in s (rad/s). esrZero keeps the
// output capacitor's ESR zero, 1 + s·C·ESR; without it the ESR stays in the poles' damping only, as
// the note's sketch has it (the zero is near 680 kHz in the buck, 160 kHz in the boost).
//   buck:  Vin·r·(1 + sC·ESR) / [(sL + R)(sC(r + ESR) + 1) + r(1 + sC·ESR)]
//   boost: r(1 + sC·ESR)(D'V − I·Rl − sL·I) / [(sL + Rl)(sC(r + ESR) + 1) + r·D'²(1 + sC·ESR)]
// (converter.js's buck plant() and the boost's averaged form, without their delay; the boost's ADC
// sampling correction is left out too.)
export function averagedPlant(name, P, op, esrZero) {
  const { L, C, ESR } = P, r = op.r, esr = [C * ESR, 1];
  if (name === "buck") {
    const den = polyadd(mul([L, P.R], [C * (r + ESR), 1]), scale(esr, r));
    return { num: scale(esrZero ? esr : [1], op.vin * r), den };
  }
  if (name === "boost") {
    const dp = 1 - op.duty, I = op.current, Rl = P.RL;
    const den = polyadd(mul([L, Rl], [C * (r + ESR), 1]), scale(esr, r * dp * dp));
    return { num: scale(mul(esrZero ? esr : [1], [-I * L, dp * op.vref - I * Rl]), r), den };
  }
  throw new Error(`averagedPlant: unknown converter ${name}`);
}

// The 2p2z's continuous prototype, as the notes write it: K_I·(1 + s/ωz1)(1 + s/ωz2) / [s·(1 + s/ωp)],
// with K_I the firmware controller's integral gain (pidEquivalent: same zeros, pole and K_I).
export function prototype(design, T) {
  const KI = pidEquivalent(design, T)[1], w = f => TWO_PI * f;
  return { num: scale(mul([1 / w(design.fz1), 1], [1 / w(design.fz2), 1]), KI), den: mul([1, 0], [1 / w(design.fp), 1]), KI };
}

// The loop gain at K = 1 as monic D(x) and N(x), x = s/(2π·UNIT). order: the Padé order (0: no delay).
export function loopGain({ plant, controller, tau, order }) {
  const pd = order ? pade(tau, order) : { num: [1], den: [1] };
  const W = TWO_PI * UNIT;
  const N = inUnits(mul(plant.num, controller.num, pd.num), W), D = inUnits(mul(plant.den, controller.den, pd.den), W);
  const lead = D[0];
  return { N: N.map(c => c / lead), D: D.map(c => c / lead) };
}

// ---- roots ----
// Durand–Kerner on a monic polynomial p from the guesses z (arrays re, im, changed in place).
// Returns true when the last step moved every root less than tol (relative to its size).
function iterate(p, re, im, maxIter, tol = 1e-12) {
  const n = re.length;
  for (let it = 0; it < maxIter; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      // p(zᵢ) by Horner
      let vr = 1, vi = 0;
      for (let k = 1; k <= n; k++) { const t = vr * re[i] - vi * im[i] + p[k]; vi = vr * im[i] + vi * re[i]; vr = t; }
      // Π (zᵢ − zⱼ)
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        let ar = re[i] - re[j], ai = im[i] - im[j];
        if (ar === 0 && ai === 0) { ar = 1e-9 * (1 + Math.abs(re[i])); ai = ar; }
        const t = dr * ar - di * ai; di = dr * ai + di * ar; dr = t;
      }
      const d2 = dr * dr + di * di, sr = (vr * dr + vi * di) / d2, si = (vi * dr - vr * di) / d2;
      re[i] -= sr; im[i] -= si;
      const size = Math.hypot(sr, si) / (1e-3 + Math.hypot(re[i], im[i]));
      if (size > moved) moved = size;
    }
    if (moved < tol) return true;
  }
  return false;
}
// Every root of the monic p, from a circle of guesses; { re, im } in the polynomial's units.
export function rootsOf(p) {
  const n = p.length - 1;
  if (n < 1) return [];
  const radius = Math.max(...p.slice(1).map((c, k) => Math.abs(c) ** (1 / (k + 1)))) || 1;  // Fujiwara's bound, halved
  const re = [], im = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n + 0.4; re.push(radius * Math.cos(a)); im.push(radius * Math.sin(a)); }
  iterate(p, re, im, 800);
  return re.map((r, i) => tidy(r, im[i]));
}
const tidy = (re, im) => ({ re, im: Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re)) ? 0 : im });
// The closed-loop polynomial D + K·N, monic (deg N < deg D here).
export const closedLoop = (D, N, K) => polyadd(D, N.map(c => c * K));
// Closed-loop poles at K, in hertz (s/2π).
export function polesAt(model, K) { return rootsOf(closedLoop(model.D, model.N, K)).map(r => toHz(r)); }
const toHz = r => ({ re: r.re * UNIT, im: r.im * UNIT });

// Matches the roots cur to the roots prev, nearest pairs first: returns cur reordered.
function match(prev, cur) {
  const n = prev.length, pairs = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pairs.push([Math.hypot(prev[i].re - cur[j].re, prev[i].im - cur[j].im), i, j]);
  pairs.sort((a, b) => a[0] - b[0]);
  const out = new Array(n), usedI = new Set(), usedJ = new Set();
  for (const [, i, j] of pairs) {
    if (usedI.has(i) || usedJ.has(j)) continue;
    out[i] = cur[j]; usedI.add(i); usedJ.add(j);
    if (usedI.size === n) break;
  }
  return out;
}

// The branches for K from 0 (the open-loop poles) through kMin..kMax on a log scale, the step adapted
// so that no root jumps: a step is halved while a root moves more than about 3 % of its distance from
// the origin (with a floor, so the roots near 0 do not stall it). Each step starts Durand–Kerner from
// the previous roots, and the new roots are matched to the old ones, so each branch is continuous.
// Returns { ks: [K], branches: [[{ re, im } in Hz per K]] }; ks[0] = 0.
export function sweep(model, { kMin = 1e-4, kMax = 1e4, maxPoints = 6000 } = {}) {
  const { D, N } = model, n = D.length - 1;
  let prev = rootsOf(D);
  const floor = 0.02 * Math.max(...prev.map(r => Math.hypot(r.re, r.im)), 1e-3) / Math.sqrt(n);
  const ks = [0], branches = prev.map(r => [toHz(r)]);
  let logK = Math.log10(kMin), step = 0.02, first = true;
  while (logK <= Math.log10(kMax) + 1e-12 && ks.length < maxPoints) {
    const K = 10 ** logK, p = closedLoop(D, N, K);
    const re = prev.map(r => r.re), im = prev.map(r => r.im);
    let ok = iterate(p, re, im, 60);
    let cur = ok ? re.map((r, i) => tidy(r, im[i])) : rootsOf(p);
    cur = match(prev, cur);
    const jump = Math.max(...cur.map((r, i) => Math.hypot(r.re - prev[i].re, r.im - prev[i].im) / (Math.hypot(prev[i].re, prev[i].im) + floor)));
    if (!first && jump > 0.03 && step > 1e-4) { logK -= step; step /= 2; logK += step; continue; }
    first = false;
    ks.push(K);
    cur.forEach((r, i) => branches[i].push(toHz(r)));
    prev = cur;
    if (jump < 0.008) step = Math.min(step * 1.5, 0.05);
    logK += step;
  }
  return { ks, branches };
}

// The critical gain: the first K > 0 at which a closed-loop pole reaches the jω axis, refined by
// bisection between the sweep's points. Returns { k, f (Hz, the crossing), stableAtStart } or null
// when no branch crosses up to the sweep's end.
export function criticalGain(model, path) {
  const { ks, branches } = path;
  const worst = i => Math.max(...branches.map(b => b[i].re));
  const scaleHz = Math.max(...branches.map(b => Math.hypot(b[0].re, b[0].im)), 1);
  const tol = -1e-9 * scaleHz;
  let i = 1;
  while (i < ks.length && worst(i) >= tol) i++;          // the first stable point (the integrator starts at 0)
  if (i >= ks.length) return { k: 0, f: 0, stableAtStart: false };
  let j = i;
  while (j < ks.length && worst(j) < tol) j++;
  if (j >= ks.length) return null;
  let lo = ks[j - 1], hi = ks[j];
  const maxRe = K => Math.max(...polesAt(model, K).map(r => r.re));
  for (let it = 0; it < 60; it++) { const m = Math.sqrt(lo * hi); if (maxRe(m) < 0) lo = m; else hi = m; }
  const at = polesAt(model, hi).reduce((a, b) => (b.re > a.re ? b : a));
  return { k: Math.sqrt(lo * hi), f: Math.abs(at.im), stableAtStart: true };
}

// ---- the exact sampled-data model, for comparison ----
// The controller as the firmware runs it, its numerator scaled by K; the closed-loop poles of
// discrete.js's sampled plant, mapped to the s-plane by s = ln z / T (in hertz, s/2π). The pole at
// z = 0 of the computation latency, and any pole that lands near it, has no image and is left out.
export function exactPoles(zPlant, control, T, K) {
  const scaled = { form: "2p2z", values: control.values.map((v, i) => (i < 3 ? v * K : v)) };
  return closedLoopPoles(zPlant, scaled, T).filter(z => Math.hypot(z.re, z.im) > 1e-6).map(z => ({
    re: Math.log(Math.hypot(z.re, z.im)) / (TWO_PI * T), im: Math.atan2(z.im, z.re) / (TWO_PI * T), z }));
}
// The exact model's critical gain: the first K where a pole leaves the unit circle, and the
// frequency of that pole's angle. null when none up to kMax.
export function exactCritical(zPlant, control, T, { kMin = 0.05, kMax = 1e3 } = {}) {
  const radius = K => {
    const scaled = { form: "2p2z", values: control.values.map((v, i) => (i < 3 ? v * K : v)) };
    return closedLoopPoles(zPlant, scaled, T).reduce((a, z) => Math.max(a, Math.hypot(z.re, z.im)), 0);
  };
  let prev = kMin;
  if (radius(prev) >= 1) return { k: 0, f: 0, stableAtStart: false };
  for (let e = Math.log10(kMin) + 0.04; e <= Math.log10(kMax) + 1e-9; e += 0.04) {
    const K = 10 ** e;
    if (radius(K) >= 1) {
      let lo = prev, hi = K;
      for (let it = 0; it < 60; it++) { const m = Math.sqrt(lo * hi); if (radius(m) < 1) lo = m; else hi = m; }
      const out = exactPoles(zPlant, control, T, hi).reduce((a, b) => (Math.hypot(b.z.re, b.z.im) > Math.hypot(a.z.re, a.z.im) ? b : a));
      return { k: Math.sqrt(lo * hi), f: Math.abs(out.im), stableAtStart: true };
    }
    prev = K;
  }
  return null;
}

// Everything the figure needs for one converter, operating point, Padé order and ESR choice:
// { model (N, D), olPoles, olZeros (Hz), sign (of N's lead), path, critical, zPlant, exact }.
export function buildLocus({ name, P, op, T, design, control, order, esrZero, delayFactor }) {
  const plant = averagedPlant(name, P, op, esrZero), controller = prototype(design, T);
  const tau = (1 + delayFactor * op.duty) * T;
  const model = loopGain({ plant, controller, tau, order });
  const firstNonZero = model.N.findIndex(c => c !== 0);
  const Nlead = model.N.slice(firstNonZero);
  const olPoles = rootsOf(model.D).map(toHz), olZeros = rootsOf(Nlead.map(c => c / Nlead[0])).map(toHz);
  const path = sweep(model);
  const critical = criticalGain(model, path);
  const zPlant = sampledPlant(name, P, op, T);
  return { model, olPoles, olZeros, sign: Math.sign(Nlead[0]), tau, path, critical, zPlant, KI: controller.KI,
           exact: exactCritical(zPlant, control, T) };
}
