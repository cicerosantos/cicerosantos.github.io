// The sampled-data small-signal model of the boost and the four-switch buck-boost under this
// firmware, from the duty to the ADC sample: what their converter.js plant() returns. The buck does
// not need it: its two topologies share A, and its averaged stage with an input delayed by (1 + D)·T
// is already exact (discrete.js).
//
// ---- derivation ----
// State x = [iL, vC] (inductor current, capacitor voltage without its ESR). Each topology is affine,
// x' = A_on·x + b_on while G1 is on and x' = A_off·x + b_off while G2 is on, with Rl the inductor's
// resistance plus the Ron in the path and k = R/(R + ESR). The output is k·vC on G1 and
// k·(vC + ESR·iL) on G2, when the inductor feeds the capacitor and the load:
//   A_on  = [−Rl/L, 0; 0, −k/(R·C)]                b_on  = [Vin/L, 0]
//   A_off = [−(Rl + k·ESR)/L, −k/L; k/C, −k/(R·C)]  b_off = [Vin/L, 0] (boost), [0, 0] (buck-boost)
// On G1 the boost's inductor sees Vin; the buck-boost's (Q1 and Q4) sees Vin too. On G2 the boost's
// sees Vin − v, the buck-boost's (Q2 and Q3) −v. The duty u[k] computed from the sample at kT is
// loaded at (k + 1)T, and with trailing-edge PWM it moves only G1's falling edge, at (k + 1 + D)T.
// Over one period the state goes x(kT) → E_on·x + h_on at the edge → E_off·(…) + h_off at the end,
// with E = e^{A·t} and h the affine part over each interval (D·T, then (1 − D)·T). The periodic
// steady state x0 at the period start and X_e at the edge follow from it. A change δd moves the edge
// by δd·T: for that time the state follows A_on instead of A_off, so it gains T·b_e·δd, with
// b_e = (A_on − A_off)·X_e + (b_on − b_off), and that gain is carried to the period's end by E_off.
// With u entering one period late:
//   x[k+1] = Φ·x[k] + Γ·u[k−1],    Φ = E_off·E_on,    Γ = T·E_off·b_e,    E_off = e^{A_off·(1 − D)·T}
//   y[k]   = Cy·x[k],              Cy = [k·ESR, k]
// y is the ADC sample at the period start, G2 on: the capacitor plus ESR times its current, which is
// then the whole inductor current less the load's. P(z) = Cy·(zI − Φ)⁻¹·Γ·z⁻¹. This is the standard
// exact sampled-data model of a PWM converter (trailing edge, sample in the G2 interval, modulator
// delay D·T), with the period of computation delay added as z⁻¹. With Φ ≈ e^{A·T} (the averaged A)
// and X_e from the averaged point plus half an on-time of ripple (peak iL, valley vC) it differs by
// under 0.11 dB and 0.3°.
// To first order this is the averaged stage delayed by (1 + D/2)·T, not (1 + D)·T: the edge's state
// is half an on-time of ripple away from the average, and the perturbation acts as if at the middle
// of G1's pulse. Fitted to QSPICE before this model, the delay was (1 + 0.6·D)·T.
// Checks: against an exact model of the switched circuit (also with the 100 ns dead times and the
// body diodes, the operating point solved period by period), within 0.13 dB and 1.0° from 300 Hz to
// 7 kHz and 0.6 dB and 2.0° up to fs/2, at 12 V with 48 and 24 Ω (boost) and at 12 V/6 Ω and
// 9 V/4 Ω (buck-boost); nearly all of the difference is the dead time. Against the QSPICE loop checks
// (tools/qspice_loop_check.py, every point linear at half amplitude), from 300 Hz to 7 kHz: boost
// 12 V with 12, 24 and 48 Ω (4, 2 and 1 A), within 0.09 dB and 0.4°, 0.15 dB and 1.4°, 0.18 dB and
// 1.1°; buck-boost 9 V/4 Ω, 12 V/6 Ω and 12 V/12 Ω (3, 2 and 1 A), within 0.08 dB and 0.4°, 0.12 dB
// and 0.5°, 0.19 dB and 0.7°. Hence 0.2 dB and 1.4° (boost) and 0.2 dB and 0.7° (buck-boost).
import { cx, cadd, cmul, cdiv, cscale } from "/power-labs/complex.js";

// e^A of a small matrix: scaling and squaring of the Taylor series.
const matmul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
export function expm(A) {
  const norm = Math.max(...A.map(r => r.reduce((s, v) => s + Math.abs(v), 0)));
  const squarings = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1);
  const As = A.map(r => r.map(v => v / 2 ** squarings));
  let E = As.map((r, i) => r.map((_, j) => (i === j ? 1 : 0))), term = E;
  for (let k = 1; k <= 16; k++) { term = matmul(term, As).map(r => r.map(v => v / k)); E = E.map((r, i) => r.map((v, j) => v + term[i][j])); }
  for (let i = 0; i < squarings; i++) E = matmul(E, E);
  return E;
}
const apply = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];

// e^{A·t} and the affine part h of x' = A·x + b over t: x(t) = E·x(0) + h, from the 3×3 exponential.
function interval(A, b, t) {
  const E = expm([[A[0][0] * t, A[0][1] * t, b[0] * t], [A[1][0] * t, A[1][1] * t, b[1] * t], [0, 0, 0]]);
  return { E: [[E[0][0], E[0][1]], [E[1][0], E[1][1]]], h: [E[0][2], E[1][2]] };
}

// The model of the derivation above for name "boost" or "buckboost", from converter.js's PLANT
// ({ L, RL, C, ESR }) and operating point op ({ vin, r, duty }). Returns { Phi, Gamma, Cy, x0, xe }
// for x[k+1] = Φ·x[k] + Γ·u[k−1], y = Cy·x, with the steady state at the period start and at the edge.
export function edgeModel(name, P, op, T) {
  const { L, RL, C, ESR } = P, r = op.r, k = r / (r + ESR), D = op.duty;
  const Aon = [[-RL / L, 0], [0, -k / (r * C)]], bon = [op.vin / L, 0];
  const Aoff = [[-(RL + k * ESR) / L, -k / L], [k / C, -k / (r * C)]], boff = [name === "boost" ? op.vin / L : 0, 0];
  const on = interval(Aon, bon, D * T), off = interval(Aoff, boff, (1 - D) * T);
  const Phi = matmul(off.E, on.E);
  // x0 = Φ·x0 + E_off·h_on + h_off
  const w = apply(off.E, on.h).map((v, i) => v + off.h[i]);
  const det = (1 - Phi[0][0]) * (1 - Phi[1][1]) - Phi[0][1] * Phi[1][0];
  const x0 = [((1 - Phi[1][1]) * w[0] + Phi[0][1] * w[1]) / det, (Phi[1][0] * w[0] + (1 - Phi[0][0]) * w[1]) / det];
  const xe = apply(on.E, x0).map((v, i) => v + on.h[i]);
  const be = [0, 1].map(i => (Aon[i][0] - Aoff[i][0]) * xe[0] + (Aon[i][1] - Aoff[i][1]) * xe[1] + bon[i] - boff[i]);
  return { Phi, Gamma: apply(off.E, be).map(v => v * T), Cy: [k * ESR, k], x0, xe };
}

// P(e^{jωT}) = Cy·(zI − Φ)⁻¹·Γ·z⁻¹ at f Hz, through adj(zI − Φ).
export function edgeResponse({ Phi: [[a, b], [c, d]], Gamma: [g1, g2], Cy: [c1, c2] }, f, T) {
  const z = cx(Math.cos(2 * Math.PI * f * T), Math.sin(2 * Math.PI * f * T));
  const za = cadd(z, cx(-a)), zd = cadd(z, cx(-d));
  const num = cadd(cscale(cadd(cscale(zd, g1), cx(b * g2)), c1), cscale(cadd(cx(c * g1), cscale(za, g2)), c2));
  return cdiv(num, cmul(cadd(cmul(za, zd), cx(-b * c)), z));
}

// plant(f, op, T) for converter.js: the model is rebuilt only when the operating point changes.
export function edgePlant(name, P) {
  let key = null, model = null;
  return (f, op, T) => {
    const k = `${op.vin} ${op.r} ${op.duty} ${T}`;
    if (k !== key) { key = k; model = edgeModel(name, P, op, T); }
    return edgeResponse(model, f, T);
  };
}
