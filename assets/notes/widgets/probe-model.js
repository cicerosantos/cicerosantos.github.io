// The math of the probe figure (probe.js), without the page: a ×10 passive probe as two R∥C impedances
// in series, the tip's R1∥C1 over the oscilloscope side's R2∥C2 (input, cable and trimmer in C2):
//   G(s) = Z2/(Z1 + Z2) = G0 (1 + s/ωz)/(1 + s/ωp),  G0 = R2/(R1 + R2),  ωz = 1/(R1 C1),
//   ωp = 1/((R1∥R2)(C1 + C2)),  and at high frequency G∞ = G0 ωp/ωz = C1/(C1 + C2).
// At DC the resistors divide (G0), at an edge the capacitors do (G∞); R1 C1 = R2 C2 makes them equal,
// the zero falls on the pole, and G is flat. No DOM here, so node can test it.
import { model, polylines, exactCurve } from "./asymptote-model.js";

export const DEFAULTS = { R1: 9e6, R2: 1e6, C1: 22e-12, C2: 198e-12, f: 1e3, U: 1 };
export const C2_RANGE = [100e-12, 300e-12];

export function probe({ R1, R2, C1, C2 } = DEFAULTS) {
  const G0 = R2 / (R1 + R2), Ginf = C1 / (C1 + C2), Rp = R1 * R2 / (R1 + R2);
  const tau = Rp * (C1 + C2);
  return { R1, R2, C1, C2, G0, Ginf, Rp, tau, fz: 1 / (2 * Math.PI * R1 * C1), fp: 1 / (2 * Math.PI * tau), C2c: R1 * C1 / R2 };
}

// "over" (C2 too small: zero below pole, overshoot), "under" (C2 too large: pole below zero, rounded
// edges) or "ok", within tol (relative) of C2 = R1 C1/R2.
export function verdict(p, tol = 0.01) {
  const rel = (p.C2 - p.C2c) / p.C2c;
  return Math.abs(rel) <= tol ? "ok" : rel < 0 ? "over" : "under";
}

// The exact response at f (Hz): [dB, degrees].
export function exact(p, f) {
  const a = f / p.fz, b = f / p.fp;
  const db = 20 * Math.log10(p.G0) + 10 * Math.log10(1 + a * a) - 10 * Math.log10(1 + b * b);
  return [db, (Math.atan(a) - Math.atan(b)) * 180 / Math.PI];
}

// The asymptotes and the exact curve over [fmin, fmax], with the course's convention (asymptote-model.js).
export function bode(p, fmin, fmax, n = 400) {
  const m = model({ gain: p.G0, factors: [{ kind: "zero", f: p.fz }, { kind: "pole", f: p.fp }] });
  return { ...polylines(m, fmin, fmax), exact: exactCurve(m, fmin, fmax, n) };
}

// The step from rest (u from 0 to U at t = 0): y(t) = U·G0·[1 + (ωp/ωz − 1) e^(−t/τ)], which starts at
// U·G∞ and ends at U·G0.
export function step(p, t, U = 1) {
  return t < 0 ? 0 : U * (p.G0 + (p.Ginf - p.G0) * Math.exp(-t / p.tau));
}

// The periodic steady state under a square wave of frequency f between 0 and U, high for the first half
// of each period: y = G0·u + e, where e jumps by ±(G∞ − G0)·U at each edge and decays with τ. Periodic:
// e just after a rising edge is a = d/(1 + r), with d = (G∞ − G0)·U and r = e^(−T/(2τ)); after a
// falling edge, −a.
export function square(p, t, f = 1e3, U = 1) {
  const T = 1 / f, half = T / 2, d = (p.Ginf - p.G0) * U, r = Math.exp(-half / p.tau), a = d / (1 + r);
  const x = ((t % T) + T) % T;
  return x < half ? p.G0 * U + a * Math.exp(-x / p.tau) : -a * Math.exp(-(x - half) / p.tau);
}
// The square wave's levels at the edges: just after the rising edge, just before the falling one.
export function squareLevels(p, f = 1e3, U = 1) {
  const half = 0.5 / f;
  return { afterRise: square(p, 0, f, U), beforeFall: square(p, half * (1 - 1e-12), f, U) };
}
