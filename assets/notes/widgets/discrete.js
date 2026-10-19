// Discrete-time models for the notes' figures: the exact sampled-data small-signal model of each
// converter under this firmware (sample, one period of latency, trailing-edge PWM), polynomial
// roots, and the closed loop's poles. The time simulations of the switched circuit are in switched.js.
//
// ---- the sampled-data plant: derivation ----
// The averaged power stage, linearized at converter.js's operating point, is x' = A·x + B·d with
// x = [iL, vC] (inductor current, capacitor voltage without its ESR) and d the duty. The ADC reads
// y = Cy·x at t = kT: the output node, the capacitor plus ESR times the capacitor's current, which at
// that instant (G2 on) is the whole inductor current less the load's.
// Timing of this firmware: the duty u[k] computed from the sample at kT is loaded at (k + 1)T, and
// with trailing-edge PWM a change of it moves only the falling edge, at (k + 1 + D)T. To first order
// a duty change δd is a pulse of height 1 and width δd·T there: an impulse of area T·δd at
// (1 + D)T after the sample. Integrating x' = A·x over one period with that impulse inside it
// (the modified z-transform with the input at the fraction D of the period) gives
//     x[k+1] = Φ·x[k] + Γ·u[k−1],    Φ = e^{A·T},    Γ = T·e^{A·(1 − D)·T}·B,
//     y[k]   = Cy·x[k],
// so P(z) = Cy·(zI − Φ)⁻¹·Γ·z⁻¹. This is the buck's, exact for its switched circuit too: its two
// topologies share A, and the edge's jump is B·T·δd whatever the state.
// Check: P(e^{jωT}) equals the sum of converter.js's plant() over the aliases f + m·fs (to 1e-5 dB),
// so it differs from plant() alone only by those aliases: up to fs/10 by 0.1 dB and 0.2°, at fs/4 by
// 0.7 dB and 3.6°, where the stage's response near fs is no longer negligible.
// The boost and the buck-boost switch between two different topologies, and the edge's jump depends
// on the state there. Their P(z) is the same form with the Φ, Γ and Cy of /assets/pcl/sampled.js,
// which is also their converter.js plant(): Γ = T·e^{A_off·(1 − D)·T}·b_e, with b_e the jump at the
// edge's state (the inductor current's peak, the capacitor voltage's valley). The closed-loop poles'
// stability agrees with loop.js's margins for every controller of scenarios.json. This replaces a
// zero-order hold over T times z⁻¹, which delayed the input by 1.5 T on average instead of
// (1 + D)·T (up to 7° off at the crossover).
import { cx, cadd, csub, cmul, cdiv, cscale } from "/power-labs/complex.js";
import { pidTo2p2z } from "../../pcl/loop.js";
import { expm, edgeModel } from "../../pcl/sampled.js";
export { expm };

// The buck's averaged stage linearized at converter.js's operating point op ({ vin, vref, r, duty,
// current }), from the converter.js PLANT constants, as converter.js's plant() writes it:
//   L·i' = vin·d − R·i − v,    C·vC' = i − v/r,    v = vC + ESR·(i − v/r)
// Returns { A, B, Cy } for x = [i, vC] and the ADC's y.
export function averagedStage(name, P, op) {
  if (name !== "buck") throw new Error(`averagedStage: ${name} uses sampled.js's edge model`);
  const { R, L, C, ESR } = P, r = op.r, k = r / (r + ESR);
  return { A: [[-(R + k * ESR) / L, -k / L], [k / C, -k / (r * C)]], B: [op.vin / L, 0], Cy: [k * ESR, k] };
}

const scaled = (A, t) => A.map(r => r.map(v => v * t));

// The sampled-data plant of the derivation above: P(z) = num(z)/den(z), polynomials in z, highest
// power first. Also returns Φ, Γ, Cy, the first-order delay fraction δ (the duty change acts, to
// first order, δ·T into the period: D for the buck, D/2 for the others) and the plant's poles and zeros.
export function sampledPlant(name, P, op, T) {
  let Phi, Gamma, Cy, delta;
  if (name === "buck") {
    const stage = averagedStage(name, P, op), E = expm(scaled(stage.A, (1 - op.duty) * T));
    Phi = expm(scaled(stage.A, T)); Cy = stage.Cy; delta = op.duty;
    Gamma = [T * (E[0][0] * stage.B[0] + E[0][1] * stage.B[1]), T * (E[1][0] * stage.B[0] + E[1][1] * stage.B[1])];
  } else {
    ({ Phi, Gamma, Cy } = edgeModel(name, P, op, T)); delta = op.duty / 2;
  }
  const [[a, b], [c, dd]] = Phi, [g1, g2] = Gamma, [c1, c2] = Cy;
  // Cy·adj(zI − Φ)·Γ
  const num = [c1 * g1 + c2 * g2, -c1 * dd * g1 + c1 * b * g2 + c2 * c * g1 - c2 * a * g2];
  const den2 = [1, -(a + dd), a * dd - b * c];
  return { Cy, Phi, Gamma, delta, num, den: [...den2, 0],  // the trailing 0: the latency's z⁻¹
           poles: roots(den2), zeros: Math.abs(num[0]) > 1e-15 ? [cx(-num[1] / num[0])] : [] };
}

// P(e^{jωT}) of a sampledPlant, for checks against converter.plant.
export function plantResponse(plant, f, T) {
  const z = cx(Math.cos(2 * Math.PI * f * T), Math.sin(2 * Math.PI * f * T));
  return cdiv(polyval(plant.num, z), polyval(plant.den, z));
}

// ---- polynomials (highest power first) ----
export function polyval(p, z) { let v = cx(0); for (const c of p) v = cadd(cmul(v, z), cx(c)); return v; }
export function polymul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}
export function polyadd(a, b) {
  const n = Math.max(a.length, b.length), out = new Array(n).fill(0);
  a.forEach((x, i) => { out[n - a.length + i] += x; }); b.forEach((x, i) => { out[n - b.length + i] += x; });
  return out;
}
// All the roots, by Durand–Kerner iteration, polished; complex { re, im }.
export function roots(p) {
  let q = p.slice();
  while (q.length > 1 && q[0] === 0) q.shift();
  let zeroRoots = 0;
  while (q.length > 1 && q[q.length - 1] === 0) { q.pop(); zeroRoots++; }
  const n = q.length - 1, out = Array.from({ length: zeroRoots }, () => cx(0));
  if (n < 1) return out;
  const monic = q.map(c => c / q[0]);
  const radius = 1 + Math.max(...monic.slice(1).map(Math.abs));
  let z = Array.from({ length: n }, (_, i) => cscale(cx(Math.cos(2 * Math.PI * i / n + 0.4), Math.sin(2 * Math.PI * i / n + 0.4)), radius * 0.9));
  for (let iter = 0; iter < 500; iter++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let d = cx(1);
      z.forEach((zj, j) => { if (j !== i) d = cmul(d, csub(zi, zj)); });
      const step = cdiv(polyval(monic, zi), d);
      moved = Math.max(moved, Math.hypot(step.re, step.im));
      return csub(zi, step);
    });
    if (moved < 1e-14) break;
  }
  // tidy: values within rounding of the real axis become real
  return out.concat(z.map(r => (Math.abs(r.im) < 1e-9 * Math.max(1, Math.abs(r.re)) ? cx(r.re) : r)));
}

// A controller's poles and zeros in z and its polynomials in z: C(z) = (b0 z² + b1 z + b2)/((z − 1)(z − a)).
export function controllerZ(control, T) {
  const [b0, b1, b2, a] = control.form === "pid" ? pidTo2p2z(control.values, T) : control.values;
  return { num: [b0, b1, b2], den: [1, -(1 + a), a], zeros: roots([b0, b1, b2]), poles: [cx(1), cx(a)] };
}

// Closed-loop poles of plant·controller with unity negative feedback: roots of den_p·den_c + num_p·num_c.
export function closedLoopPoles(plant, control, T) {
  const c = controllerZ(control, T);
  return roots(polyadd(polymul(plant.den, c.den), polymul(plant.num, c.num)));
}
