// The digital loop's frequency-domain math: the firmware's two controller forms (2p2z and PID), the
// design of a compensator from its crossover, zeros and pole, the loop gain's Bode response and its
// margins. Pure functions: the control period T, the plant and the frequencies are parameters, and
// nothing here touches the page. The oscilloscope's Bode window and the notes' figures both use it.
//
// Conventions
//   T          control (and PWM) period, s
//   plant      f => complex v/d at f Hz, digital delay included: (f) => converter.plant(f, op)
//   control    { form: "2p2z" | "pid", values }, the controller exactly as the firmware runs it:
//                2p2z values [b0, b1, b2, p]: (b0 + b1 z⁻¹ + b2 z⁻²) / ((1 − z⁻¹)(1 − p z⁻¹)),
//                  that is (b0 + b1 z⁻¹ + b2 z⁻²) / (1 + a1 z⁻¹ + a2 z⁻²) with a1 = −(1 + p), a2 = p
//                pid values  [KP, KI, KD, TF], run with Euler's rules
//   design     { form, fc, fz1, fz2, fp, k }: target crossover, zeros and pole in Hz; k is the gain
//                (2p2z: b0; pid: the integral gain KI), null until retune() sets it
//   curve      { db: [], phase: [] } over a frequency list, phase in degrees and unwrapped
import { cx, cadd, csub, cmul, cdiv, cscale, cexpj } from "/power-labs/complex.js";

// The Bode plot's range and the sliders' ranges when a converter gives none (the buck's, at 200 kHz).
export const DEFAULT_BODE = { from: 100, to: 100e3, sliders: { fc: [1e3, 30e3], fz1: [100, 20e3], fz2: [100, 20e3], fp: [5e3, 100e3] } };

// The controller's formulas, { en, pt }.
export const FORMULAS = {
  "2p2z": {
    en: "C(z) = K·(1 − z1·z⁻¹)(1 − z2·z⁻¹) / [(1 − z⁻¹)(1 − p·z⁻¹)],  zi = e^(−ωzi·Tₛ), p = e^(−ωp·Tₛ)",
    pt: "C(z) = K·(1 − z1·z⁻¹)(1 − z2·z⁻¹) / [(1 − z⁻¹)(1 − p·z⁻¹)],  zi = e^(−ωzi·Tₛ), p = e^(−ωp·Tₛ)",
  },
  pid: {
    en: "C(s) = K·(1 + s/ωz1)(1 + s/ωz2) / [s·(1 + s/ωp)] = KP + KI/s + KD·s/(1 + s·TF), run with Euler's rules",
    pt: "C(s) = K·(1 + s/ωz1)(1 + s/ωz2) / [s·(1 + s/ωp)] = KP + KI/s + KD·s/(1 + s·TF), discretizado por Euler",
  },
};

// Log-spaced frequencies over bode.from..bode.to, about perDecade per decade, ending exactly at bode.to.
export function frequencies(bode = DEFAULT_BODE, perDecade = 160) {
  const decades = Math.log10(bode.to / bode.from);
  const steps = Math.round(perDecade * decades);
  return Array.from({ length: steps + 1 }, (_, i) => bode.from * 10 ** (decades * i / steps));
}

// The PID form's transfer function as 2p2z coefficients [b0, b1, b2, p]:
// KP + KI·T/(1 − z⁻¹) + [KD/(TF + T)]·(1 − z⁻¹)/(1 − p·z⁻¹), with p = TF/(TF + T).
export function pidTo2p2z([kp, ki, kd, tf], T) {
  const a = tf / (tf + T), b = kd / (tf + T);
  return [kp + ki * T + b, -kp * (1 + a) - ki * T * a - 2 * b, kp * a + b, a];
}

// The 2p2z coefficients [b0, b1, b2, p] of a controller in either form.
export function coefficients({ form, values }, T) {
  return form === "pid" ? pidTo2p2z(values, T) : values;
}

// Duty per volt of error at f Hz, as the firmware computes it.
export function controller(f, { form, values }, T) {
  const [b0, b1, b2, a] = form === "pid" ? pidTo2p2z(values, T) : values;
  const zi = cexpj(-2 * Math.PI * f * T), zi2 = cmul(zi, zi);
  return cdiv(cadd(cadd(cx(b0), cscale(zi, b1)), cscale(zi2, b2)), cmul(csub(cx(1), zi), csub(cx(1), cscale(zi, a))));
}

// K·(1 + s/ωz1)(1 + s/ωz2) / [s·(1 + s/ωp)] = KP + KI/s + KD·s/(1 + s·TF), matching coefficients.
export function gainsOf({ k, fz1, fz2, fp }) {
  const tz1 = 1 / (2 * Math.PI * fz1), tz2 = 1 / (2 * Math.PI * fz2), tf = 1 / (2 * Math.PI * fp);
  return [k * (tz1 + tz2 - tf), k, k * (tz1 - tf) * (tz2 - tf), tf];
}

// Matched poles and zeros: each s-plane root at −ω goes to z = e^(−ω·T); the integrator to z = 1.
export function matched({ fz1, fz2, fp }, T) {
  const z = f => Math.exp(-2 * Math.PI * f * T);
  return [z(fz1), z(fz2), z(fp)];
}

// The design as the firmware runs it, in the design's form.
export function designController(d, T) {
  if (d.form === "pid") return { form: "pid", values: gainsOf(d) };
  const [z1, z2, p] = matched(d, T);
  return { form: "2p2z", values: [d.k, -d.k * (z1 + z2), d.k * z1 * z2, p] };
}

// PID gains [KP, KI, KD, TF] with the same integral gain and the same poles and zeros, in continuous time.
export function pidEquivalent(d, T) {
  if (d.form === "pid") return gainsOf(d);
  const [z1, z2, p] = matched(d, T);
  return gainsOf({ ...d, k: d.k * (1 - z1) * (1 - z2) / ((1 - p) * T) });
}

// The gain k that puts the loop's crossover at d.fc with this plant. Returns k; d is not changed.
export function retune(d, T, plant) {
  const loop = cmul(controller(d.fc, designController({ ...d, k: 1 }, T), T), plant(d.fc));
  return 1 / Math.hypot(loop.re, loop.im);
}

// Magnitude (dB) and unwrapped phase (degrees) of the plant, times the controller when control is given.
export function response(freqs, plant, control, T) {
  const db = [], phase = [];
  let previous = null;
  for (const f of freqs) {
    let v = plant(f);
    if (control) v = cmul(controller(f, control, T), v);
    db.push(20 * Math.log10(Math.hypot(v.re, v.im)));
    let p = Math.atan2(v.im, v.re) * 180 / Math.PI;
    if (previous !== null) p -= 360 * Math.round((p - previous) / 360);  // unwrapped
    phase.push(previous = p);
  }
  return { db, phase };
}

// Phase margin at the highest 0 dB crossing. Gain margin where the phase crosses −180° (mod 360°):
// the next crossing above, or, when the phase margin is negative, the last one below, where the
// loop oscillates (the gain margin is then negative).
// Returns null without a crossing, else { fc, cross: { f, db, phase }, pm, gain: { f, db, phase } | null, gm | null }.
export function margins({ db, phase }, freqs) {
  const at = (i, x) => ({ f: freqs[i] * (freqs[i + 1] / freqs[i]) ** x,
                          db: db[i] + x * (db[i + 1] - db[i]), phase: phase[i] + x * (phase[i + 1] - phase[i]) });
  let cross = null, i = freqs.length - 2;
  for (; i >= 0; i--)
    if ((db[i] >= 0) !== (db[i + 1] >= 0)) { cross = at(i, db[i] / (db[i] - db[i + 1])); break; }
  if (!cross) return null;
  let pm = 180 + cross.phase;
  pm -= 360 * Math.round(pm / 360);
  let gain = null;
  for (let j = i; j >= 0 && j + 1 < freqs.length && !gain; j += pm < 0 ? -1 : 1) {
    const level = 360 * Math.floor((phase[j] + 180) / 360) - 180;
    if (phase[j] >= level && phase[j + 1] < level) gain = at(j, (phase[j] - level) / (phase[j] - phase[j + 1]));
  }
  return { fc: cross.f, cross, pm, gain, gm: gain ? -gain.db : null };
}

// Two controllers equal to 1e-9 relative, as the scope compares the design with the simulated one.
export function sameController(a, b) {
  return a.form === b.form && a.values.every((v, i) => Math.abs(v - b.values[i]) <= 1e-9 * Math.max(Math.abs(v), Math.abs(b.values[i])));
}
