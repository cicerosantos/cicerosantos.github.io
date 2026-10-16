// The switched circuit and its firmware, simulated in the browser for the notes' time figures (step,
// quantization): the same circuit as converters/<name>/netlist.cir and the same firmware as
// converters/common/scenario.cpp, period by period.
//
// Circuit. State x = [iL, vC]: the inductor's current and the capacitor's voltage without its ESR.
// The load is a conductance g (the netlist's Bload), the input an ideal source. In each interval of
// the period the circuit is linear, x' = A·x + b, and is integrated exactly:
//   x(t + τ) = xe + e^{A·τ}·(x(t) − xe),  xe = −A⁻¹·b,  e^{A·τ} in closed form (2×2, Cayley–Hamilton).
// The intervals, from the period's start (the ADC's sample, at the end of G2):
//   [0, dt) dead time · [dt, D·T) G1 · [D·T, D·T + dt) dead time · [D·T + dt, T) G2.
// A closed switch is its Ron; in a dead time the inductor's current flows through the body diodes
// (Is 1 nA, N 1.5, Rs 20 mΩ, at 27 °C), whose junction drop is taken at the interval's starting
// current. If the current reaches zero in a dead time, the diodes block and it stays at zero.
//   buck:        G1: sw = vin; G2: sw = 0; dead time: the low (iL > 0) or high (iL < 0) side's diode.
//   boost:       G1 (low side): sw = 0; G2: sw = vout; dead time: the high (iL > 0) or low side's diode.
//   buck-boost:  G1: the input across L; G2: minus the output across L; dead time: two diodes.
// Firmware (scenario.cpp): at each period's start the ADC samples V(out) (12-bit code of vfs), the
// reference moves by its slew, the 2p2z (velocity form) or the PID (integrator clamped to [dmin,
// dmax], derivative with its TF filter) computes the duty, clamped to [dmin, dmax], which is used
// from the next period on; the input moves by its slew. The reference is compared in volts, not
// rounded to an ADC code (refOnCode: true rounds it, as a firmware working in counts would).
import { pidTo2p2z } from "../../pcl/loop.js";

const DIODE = { Is: 1e-9, nVt: 1.5 * 0.025865, Rs: 0.02 };
const junction = i => DIODE.nVt * Math.log1p(Math.abs(i) / DIODE.Is);

// "22u", "30m", 4.7e-6 → a number.
export function si(v) {
  if (typeof v === "number") return v;
  const m = /^\s*([-+0-9.eE]+)\s*(meg|[fpnumkMG]?)/.exec(v);
  const scale = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, "": 1, k: 1e3, meg: 1e6, M: 1e6, G: 1e9 }[m[2]];
  return parseFloat(m[1]) * scale;
}

// The circuit's constants from scenarios.json: { L, RL, C, ESR, RON, T, dt, vfs, bits, dmin, dmax }.
export function circuitOf(spec) {
  const p = spec.plant, s = spec.simulation;
  return { L: si(p.L), RL: si(p.RL), C: si(p.C), ESR: si(p.ESR), RON: si(p.RON), T: 1 / s.fsw, dt: s.dt,
           vfs: s.vfs, bits: s.bits, dmin: s.dmin, dmax: s.dmax };
}

// One topology: L·iL' = src − R·iL − ρ·vout,  vout = κ·(vC + ESR·σ·iL),  C·vC' = κ·(σ·iL − g·vC),
// κ = 1/(1 + g·ESR); σ = 1 when the inductor feeds the output node, ρ = 1 when vout is in its loop.
// Fills out with A (row by row) and b.
function system(c, g, src, R, s, out) {
  const k = 1 / (1 + g * c.ESR);
  out[0] = -(R + s * k * c.ESR) / c.L; out[1] = -s * k / c.L;
  out[2] = s * k / c.C;                 out[3] = -k * g / c.C;
  out[4] = src / c.L;                   out[5] = 0;
}

// x ← xe + e^{Aτ}(x − xe) for A = [a b; c d] and input [b0, b1].
function advance(M, tau, x) {
  const [a, b, c, d, u0, u1] = M;
  const det = a * d - b * c;
  const xe0 = -(d * u0 - b * u1) / det, xe1 = -(-c * u0 + a * u1) / det;
  const m = (a + d) / 2 * tau, q2 = ((a - d) * (a - d) / 4 + b * c) * tau * tau;
  let s1, c0;  // e^{Aτ} = e^m·(c0·I + s1·(Aτ − m·I))
  if (q2 > 1e-12) { const q = Math.sqrt(q2); s1 = Math.sinh(q) / q; c0 = Math.cosh(q); }
  else if (q2 < -1e-12) { const q = Math.sqrt(-q2); s1 = Math.sin(q) / q; c0 = Math.cos(q); }
  else { s1 = 1 + q2 / 6; c0 = 1 + q2 / 2; }
  const e = Math.exp(m), h = (a - d) / 2 * tau;
  const E00 = e * (c0 + s1 * h), E11 = e * (c0 - s1 * h), E01 = e * s1 * b * tau, E10 = e * s1 * c * tau;
  const y0 = x[0] - xe0, y1 = x[1] - xe1;
  x[0] = xe0 + E00 * y0 + E01 * y1;
  x[1] = xe1 + E10 * y0 + E11 * y1;
}

// The topologies of each converter: f(mode, iL, vin) → [src, R, σ (= ρ)]; mode 1: G1, 2: G2,
// 3: dead time with iL > 0, 4: dead time with iL < 0.
function topology(name, c) {
  const Rd = DIODE.Rs;
  if (name === "buck")
    return (mode, vj, vin) => mode === 1 ? [vin, c.RL + c.RON, 1] : mode === 2 ? [0, c.RL + c.RON, 1]
      : mode === 3 ? [-vj, c.RL + Rd, 1] : [vin + vj, c.RL + Rd, 1];
  if (name === "boost")
    return (mode, vj, vin) => mode === 1 ? [vin, c.RL + c.RON, 0] : mode === 2 ? [vin, c.RL + c.RON, 1]
      : mode === 3 ? [vin - vj, c.RL + Rd, 1] : [vin + vj, c.RL + Rd, 0];
  return (mode, vj, vin) => mode === 1 ? [vin, c.RL + 2 * c.RON, 0] : mode === 2 ? [0, c.RL + 2 * c.RON, 1]
    : mode === 3 ? [-2 * vj, c.RL + 2 * Rd, 1] : [vin + 2 * vj, c.RL + 2 * Rd, 0];
}

// The circuit over one interval of length tau in a mode; records `points` evenly spaced samples
// (the last at the interval's end) through rec(t, x, vout).
function makeStepper(name, c) {
  const topo = topology(name, c), M = new Float64Array(6), x2 = new Float64Array(2);
  const vout = (x, g, s) => (x[1] + c.ESR * s * x[0]) / (1 + g * c.ESR);
  function interval(mode, tau, x, g, vin, t0, points, rec) {
    if (tau <= 0) return;
    let dead = mode >= 3;
    if (dead) {
      // which diode: by the current's sign; at zero, by where the current would go
      mode = x[0] > 0 ? 3 : x[0] < 0 ? 4 : 0;
      if (mode === 0) {
        for (const trial of [3, 4]) {
          const [src, R, s] = topo(trial, junction(0), vin);
          const di = src - R * x[0] - s * vout(x, g, s);
          if ((trial === 3 && di > 0) || (trial === 4 && di < 0)) { mode = trial; break; }
        }
      }
    }
    if (mode === 0) return open(tau, x, g, t0, points, rec);
    const [src, R, s] = topo(mode, dead ? junction(x[0]) : 0, vin);
    system(c, g, src, R, s, M);
    const h = tau / points;
    for (let n = 1; n <= points; n++) {
      x2[0] = x[0]; x2[1] = x[1];
      advance(M, h, x);
      if (dead && (x[0] > 0) !== (x2[0] > 0) && x2[0] !== 0) {
        // the current reached zero: find when, then the diodes block
        let lo = 0, hi = h;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2; x[0] = x2[0]; x[1] = x2[1]; advance(M, mid, x);
          if ((x[0] > 0) === (x2[0] > 0)) lo = mid; else hi = mid;
        }
        x[0] = x2[0]; x[1] = x2[1]; advance(M, lo, x); x[0] = 0;
        return open(tau - (n - 1) * h - lo, x, g, t0 + (n - 1) * h + lo, points - n + 1, rec);
      }
      rec(t0 + n * h, x, vout(x, g, s));
    }
  }
  // Both diodes blocking: no inductor current; the capacitor discharges into the load.
  function open(tau, x, g, t0, points, rec) {
    const k = 1 / (1 + g * c.ESR), rate = -k * g / c.C, h = tau / Math.max(points, 1);
    for (let n = 1; n <= Math.max(points, 1); n++) { x[1] *= Math.exp(rate * h); rec(t0 + n * h, x, k * x[1]); }
  }
  return { interval, vout };
}

// options: { name, circuit (circuitOf), vin, vref, r (ohm), control ({ form, values }), slew, vinSlew (V/ms; 0: a step),
//            periods, events [{ k, key: vref | vin | load, value }] (applied at period k's start, before the sample),
//            warmup (periods run first, not recorded; default 1000), dpwmBits (0: none), refOnCode, integrator, leak,
//            points (samples per G1 and G2 interval, default 3; dead times give one) }
// Starts from the periodic steady state at the initial commands (duty found so that the sample
// equals the reference), runs warmup periods with the firmware, then records. Returns:
//   per point (Float64Array): t (s, from the record's start), vout, il, duty (in use);
//   per period (Float64Array): tk (s), y (the sample), vavg (the period's mean output), duty, vref, code;
//   n (points), periods.
export function simulateSwitched(o) {
  const c = o.circuit, T = c.T, dt = c.dt, name = o.name;
  const { interval, vout: voutOf } = makeStepper(name, c);
  const points = o.points ?? 3, perPeriod = 2 * points + 2 + 2;
  const P = o.periods, W = o.warmup ?? 1000;
  const out = { t: new Float64Array(P * perPeriod), vout: new Float64Array(P * perPeriod), il: new Float64Array(P * perPeriod),
                duty: new Float64Array(P * perPeriod), tk: new Float64Array(P), y: new Float64Array(P), vavg: new Float64Array(P),
                dutyK: new Float64Array(P), vref: new Float64Array(P), code: new Float64Array(P), n: 0, periods: P };
  const full = 2 ** c.bits - 1;
  const pid = o.control.form === "pid", [kp, ki, kd, tf] = pid ? o.control.values : [];
  const [b0, b1, b2, a0] = pid ? pidTo2p2z(o.control.values, T) : o.control.values;
  const leak = o.integrator === false ? o.leak ?? 0.99 : 1;
  const quantize = d => (o.dpwmBits ? Math.round(d * 2 ** o.dpwmBits) / 2 ** o.dpwmBits : d);
  let g = 1 / o.r, vin = o.vin, vinCmd = o.vin, vrefCmd = o.vref, vref = o.vref;

  // one period with the duty held; rec gets the points
  const x = new Float64Array(2);
  let sum = 0, last = 0, lastT = 0;
  const noRec = () => {};
  function period(d, rec) {
    const ton = d * T;
    const edges = ton > dt ? [[3, dt], [1, ton - dt], [3, dt], [2, T - ton - dt]] : [[3, ton + dt], [2, T - ton - dt]];
    let t = 0;
    for (const [mode, tau] of edges) {
      const len = Math.max(0, Math.min(tau, T - t));
      interval(mode, len, x, g, vin, t, mode >= 3 ? 1 : points, rec);
      t += len;
    }
  }
  // the periodic steady state for a fixed duty: Newton on the period map
  function periodic(d) {
    for (let it = 0; it < 6; it++) {
      const x0 = [x[0], x[1]];
      period(d, noRec); const f = [x[0] - x0[0], x[1] - x0[1]];
      const J = [[0, 0], [0, 0]];
      for (let j = 0; j < 2; j++) {
        const h = 1e-4 * Math.max(1, Math.abs(x0[j]));
        x[0] = x0[0]; x[1] = x0[1]; x[j] += h; period(d, noRec);
        J[0][j] = (x[0] - x0[0] - (j === 0 ? h : 0) - f[0]) / h;
        J[1][j] = (x[1] - x0[1] - (j === 1 ? h : 0) - f[1]) / h;
      }
      // (J)·Δ = −f, J = ∂(F(x) − x)/∂x
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      x[0] = x0[0] - (J[1][1] * f[0] - J[0][1] * f[1]) / det;
      x[1] = x0[1] - (-J[1][0] * f[0] + J[0][0] * f[1]) / det;
      if (Math.abs(f[0]) < 1e-9 && Math.abs(f[1]) < 1e-9) break;
    }
  }
  // the duty whose periodic steady state puts the sample at vref: secant from the ideal duty
  const ideal = name === "buck" ? o.vref / o.vin : name === "boost" ? 1 - o.vin / o.vref : o.vref / (o.vin + o.vref);
  x[0] = name === "buck" ? o.vref / o.r : o.vref / o.r / (1 - ideal); x[1] = o.vref;
  const sampleAt = d => { periodic(d); return voutOf(x, g, 1) - o.vref; };
  let d0 = Math.min(c.dmax, Math.max(c.dmin, ideal)), d1 = Math.min(c.dmax, d0 + 0.01), f0 = sampleAt(d0), f1 = sampleAt(d1);
  for (let i = 0; i < 30 && Math.abs(f1) > 1e-7 && f1 !== f0; i++) {
    const d2 = Math.min(c.dmax, Math.max(c.dmin, d1 - f1 * (d1 - d0) / (f1 - f0)));
    d0 = d1; f0 = f1; d1 = d2; f1 = sampleAt(d1);
  }
  const dss = d1;
  periodic(dss);
  // A small kick (0.5 % of the output), as QSPICE's start from the netlist's initial state gives: a
  // stable loop settles from it during the warm-up, an unstable one grows into its limit cycle.
  if (W > 0) x[1] *= 1.005;

  let u1 = dss, u2 = dss, e1 = 0, e2 = 0, integ = dss, deriv = 0, lastErr = 0, pending = quantize(dss), duty = pending;
  const events = (o.events || []).map(e => ({ ...e, k: e.k + W }));
  let base = 0, k0 = 0;
  const rec = (t, xs, v) => {
    const i = out.n++;
    out.t[i] = base + t; out.vout[i] = v; out.il[i] = xs[0]; out.duty[i] = duty;
    sum += (v + last) / 2 * (t - lastT); last = v; lastT = t;
  };
  for (let k = 0; k < W + P; k++) {
    for (const e of events) if (e.k === k) { if (e.key === "vref") vrefCmd = e.value; if (e.key === "vin") vinCmd = e.value; if (e.key === "load") g = 1 / e.value; }
    // sample and control
    const yk = voutOf(x, g, 1);
    const code = Math.min(full, Math.max(0, Math.floor(yk / c.vfs * full + 0.5))), vmeas = code * c.vfs / full;
    if (o.slew > 0) { const s = o.slew * 1e3 * T; vref += Math.max(-s, Math.min(s, vrefCmd - vref)); } else vref = vrefCmd;
    const err = (o.refOnCode ? Math.round(vref / c.vfs * full) * c.vfs / full : vref) - vmeas;
    let d;
    if (pid) {
      integ = Math.min(c.dmax, Math.max(c.dmin, integ + ki * T * err));
      deriv = tf > 0 ? (tf * deriv + kd * (err - lastErr)) / (tf + T) : kd * (err - lastErr) / T;
      d = kp * err + integ + deriv;
    } else if (leak === 1) {
      d = (1 + a0) * u1 - a0 * u2 + b0 * err + b1 * e1 + b2 * e2;
    } else {
      // without the integrator: its pole at z = 1 moved to z = leak, around the steady duty
      d = dss + (leak + a0) * (u1 - dss) - leak * a0 * (u2 - dss) + b0 * err + b1 * e1 + b2 * e2;
    }
    d = Math.min(c.dmax, Math.max(c.dmin, d));
    lastErr = err; u2 = u1; u1 = d; e2 = e1; e1 = err;
    duty = pending;  // one period of computation latency
    pending = quantize(d);
    if (o.vinSlew > 0) { const s = o.vinSlew * 1e3 * T; vin += Math.max(-s, Math.min(s, vinCmd - vin)); } else vin = vinCmd;
    if (k < W) { period(duty, noRec); continue; }
    const j = k - W;
    base = j * T;
    out.tk[j] = base; out.y[j] = yk; out.dutyK[j] = duty; out.vref[j] = vref; out.code[j] = code;
    // the period's first point: the sample itself
    sum = 0; last = yk; lastT = 0;
    rec(0, x, yk);
    period(duty, rec);
    out.vavg[j] = sum / T;
    if (!Number.isFinite(x[0]) || Math.abs(x[1]) > 1e4) { x[0] = x[1] = NaN; }
  }
  return out;
}
