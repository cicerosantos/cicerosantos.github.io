// The math of the asymptote figure (asymptote.js), without the page: the factors of a transfer function
// in the course's factored form, their exact response and their asymptotes (magnitude in dB, phase in
// degrees), and the composite's. No DOM here, so node can test it.
//
// A factor is { kind, f (Hz), Q (pairs only) }, or { kind: "k", k }. With x = f/fc and s = jω:
//   pole 1/(1 + s/ω)      zero (1 + s/ω)      rpole 1/(1 − s/ω)      rzero (1 − s/ω)
//   int ω/s = 1/(s/ω)     diff s/ω
//   ipole 1/(1 + ω/s)     izero (1 + ω/s)     irpole 1/(1 − ω/s)     irzero (1 − ω/s)
//   pair 1/(1 + s/(Qω) + (s/ω)²)   zpair (…)   rpair 1/(1 − s/(Qω) + (s/ω)²)   rzpair (…)
//   ipair 1/(1 + ω/(Qs) + (ω/s)²)  izpair (…)   irpair 1/(1 − ω/(Qs) + (ω/s)²)   irzpair (…)
// A pair's Q may be infinite (undamped): the middle term drops, the exact magnitude has an infinite
// peak or notch at f0, and the phase, exact and asymptotic, is a step of ±180° at f0.
// Each factor's own phase is 0° where it tends to 1 (DC for the common forms, high frequency for the
// inverted ones), so its exact phase is continuous and its asymptote is the course's table: a straight
// line in log f from one decade below the corner to one decade above (first order ±45°/dec, a pair
// ±90°/dec), whatever Q. The integrator and the differentiator are −90° and +90° everywhere.
// The composite's phase is the plain sum of the factors' phases, each continuous from its own anchor,
// plus 180° for a negative gain (angle(−1) = +180°: −1/(1 + s/ω) goes from +180° to +90°); no
// wrapping to a principal value.

// kind → { order, side (+1 numerator, −1 denominator), inv (written in ω/s), rhp }
export const KINDS = {
  pole: { order: 1, side: -1 }, zero: { order: 1, side: 1 },
  int: { order: 1, side: -1, origin: true }, diff: { order: 1, side: 1, origin: true },
  rpole: { order: 1, side: -1, rhp: true }, rzero: { order: 1, side: 1, rhp: true },
  ipole: { order: 1, side: -1, inv: true }, izero: { order: 1, side: 1, inv: true },
  irpole: { order: 1, side: -1, inv: true, rhp: true }, irzero: { order: 1, side: 1, inv: true, rhp: true },
  pair: { order: 2, side: -1 }, zpair: { order: 2, side: 1 },
  rpair: { order: 2, side: -1, rhp: true }, rzpair: { order: 2, side: 1, rhp: true },
  ipair: { order: 2, side: -1, inv: true }, izpair: { order: 2, side: 1, inv: true },
  irpair: { order: 2, side: -1, inv: true, rhp: true }, irzpair: { order: 2, side: 1, inv: true, rhp: true },
};
export const FORMS = Object.keys(KINDS);
export const isPair = kind => KINDS[kind]?.order === 2;

// "10", "-0.5", "2.2k", "1M", "1e3": a number with an optional k or M suffix.
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?[kM]?$/i;
export function parseNumber(text) {
  const t = String(text).trim();
  if (!NUMBER.test(t)) return NaN;
  const suffix = t.slice(-1);
  if (suffix === "k") return parseFloat(t.slice(0, -1)) * 1e3;
  if (suffix === "M") return parseFloat(t.slice(0, -1)) * 1e6;
  if (/[kKmM]$/.test(t)) return NaN;  // K or m: ambiguous, refused
  return parseFloat(t);
}

// "k:10; zero:100; pole:1k; pair:5k:2" → { gain, factors }. Throws an Error with a readable message.
export function parseFactors(text) {
  const tokens = String(text).split(";").map(t => t.trim()).filter(Boolean);
  if (!tokens.length) throw new Error("empty");
  let gain = null;
  const factors = [];
  for (const token of tokens) {
    const parts = token.split(":").map(p => p.trim());
    const kind = parts[0];
    if (kind === "k") {
      if (parts.length !== 2) throw new Error(`"${token}": k:<number>`);
      const k = parseNumber(parts[1]);
      if (!Number.isFinite(k) || k === 0) throw new Error(`"${token}": the gain must be a nonzero number`);
      if (gain !== null) throw new Error(`"${token}": a second gain`);
      gain = k;
      continue;
    }
    if (!KINDS[kind]) throw new Error(`"${token}": unknown factor "${kind}" (known: k, ${FORMS.join(", ")})`);
    const pair = isPair(kind);
    if (parts.length !== (pair ? 3 : 2)) throw new Error(`"${token}": ${kind}:<f>${pair ? ":<Q>" : ""}`);
    const f = parseNumber(parts[1]);
    if (!(f > 0) || !Number.isFinite(f)) throw new Error(`"${token}": the frequency must be a positive number of hertz`);
    const factor = { kind, f };
    if (pair) {
      const Q = /^(inf|∞)$/i.test(parts[2]) ? Infinity : parseNumber(parts[2]);
      if (!(Q > 0)) throw new Error(`"${token}": Q must be a positive number or inf`);
      factor.Q = Q;
    }
    factors.push(factor);
  }
  return { gain: gain ?? 1, hasGain: gain !== null, factors };
}

// ---- one factor ----
// The exact value as [magnitude in dB, phase in degrees], the phase continuous (0° where the factor
// tends to 1). With u = s/ω (common forms) or ω/s (inverted), the factor is P(u) = 1 + σu or
// 1 + σu/Q + u² (σ = −1 in the right half-plane), or 1/P(u) for a pole; P's imaginary part never
// changes sign along jω, so atan2 is continuous.
export function factorExact(factor, f) {
  const d = KINDS[factor.kind], x = f / factor.f;
  if (d.origin) return [d.side * 20 * Math.log10(x), d.side * 90];
  const sigma = d.rhp ? -1 : 1;
  const uIm = d.inv ? -1 / x : x;  // u = j·uIm
  let re, im;
  if (d.order === 1) { re = 1; im = sigma * uIm; }
  else { re = 1 - uIm * uIm; im = sigma * uIm / factor.Q; }
  const db = Math.max(-999, Math.min(999, 10 * Math.log10(re * re + im * im))), ph = Math.atan2(im, re) * 180 / Math.PI;
  return [d.side * db, d.side * ph];
}
// The asymptotes: magnitude 0 dB on the side where the factor tends to 1, ±20·order dB/dec on the
// other; phase from its low-frequency value at fc/10 to its high-frequency value at 10·fc.
export function factorEnds(factor) {
  const d = KINDS[factor.kind];
  if (d.origin) return [d.side * 90, d.side * 90];
  const far = d.side * (d.rhp ? -1 : 1) * 90 * d.order;  // the common form's phase at high frequency
  return d.inv ? [-far, 0] : [0, far];
}
export function factorAsymptote(factor, f) {
  const d = KINDS[factor.kind], lx = Math.log10(f / factor.f);
  const slope = d.side * 20 * d.order;
  const db = d.origin ? slope * lx : d.inv ? slope * Math.max(0, -lx) : slope * Math.max(0, lx);
  const [lo, hi] = factorEnds(factor);
  const t = factor.Q === Infinity ? (lx < 0 ? 0 : lx > 0 ? 1 : 0.5) : Math.min(1, Math.max(0, (lx + 1) / 2));
  return [db, lo + (hi - lo) * t];
}

// ---- the composite ----
export function model({ gain = 1, factors }) {
  const K = gain;
  const corners = [...new Set(factors.map(c => c.f))].sort((a, b) => a - b);
  const sign = K < 0 ? 180 : 0;
  const rawAsym = f => factors.reduce((acc, c) => { const [m, p] = factorAsymptote(c, f); return [acc[0] + m, acc[1] + p]; }, [20 * Math.log10(Math.abs(K)), sign]);
  const rawExact = f => factors.reduce((acc, c) => { const [m, p] = factorExact(c, f); return [acc[0] + m, acc[1] + p]; }, [20 * Math.log10(Math.abs(K)), sign]);
  return { K, factors, corners, rawAsym, rawExact };
}
// The plotted span: two decades beyond the extreme corners, rounded out to decades.
export function span(corners) {
  if (!corners.length) return [10, 1e4];
  const lo = Math.log10(corners[0]), hi = Math.log10(corners[corners.length - 1]);
  return [10 ** (Math.floor(lo + 1e-9) - 2), 10 ** (Math.ceil(hi - 1e-9) + 2)];
}
// The asymptotes as polylines: the breakpoints in log f (the corners for the magnitude; fc/10 and
// 10·fc for the phase, the integrator's and differentiator's none) with fmin and fmax, each point
// [f, value], consecutive collinear points merged. Exact at the breakpoints, since both are piecewise
// linear in log f.
export function polylines(m, fmin, fmax) {
  const inside = f => f > fmin * (1 + 1e-9) && f < fmax * (1 - 1e-9);
  const magX = [fmin, ...m.factors.filter(c => !KINDS[c.kind].origin).map(c => c.f).filter(inside), fmax];
  // an undamped pair's phase steps at f0: two breakpoints a hair apart
  const phX = [fmin, ...m.factors.filter(c => !KINDS[c.kind].origin)
    .flatMap(c => (c.Q === Infinity ? [c.f * (1 - 1e-9), c.f * (1 + 1e-9)] : [c.f / 10, c.f * 10])).filter(inside), fmax];
  const build = (xs, idx) => {
    const sorted = [...new Set(xs)].sort((a, b) => a - b);
    const pts = sorted.map(f => [f, m.rawAsym(f)[idx]]);
    return mergeCollinear(pts);
  };
  return { mag: build(magX, 0), phase: build(phX, 1) };
}
function mergeCollinear(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const s1 = (b[1] - a[1]) / Math.log10(b[0] / a[0]), s2 = (p[1] - b[1]) / Math.log10(p[0] / b[0]);
      if (Math.abs(s1 - s2) < 1e-6) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}
// The polyline's segments with their slope (per decade).
export function segments(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [f0, v0] = pts[i - 1], [f1, v1] = pts[i];
    out.push({ f0, f1, v0, v1, slope: (v1 - v0) / Math.log10(f1 / f0) });
  }
  return out;
}
// The exact curve on n log-spaced points.
export function exactCurve(m, fmin, fmax, n = 500) {
  const fs = [], mag = [], ph = [];
  // log-spaced points, and points close around an undamped pair's f0, where |G| goes to 0 or ∞
  const grid = Array.from({ length: n }, (_, i) => fmin * (fmax / fmin) ** (i / (n - 1)));
  for (const c of m.factors) if (c.Q === Infinity) grid.push(...[0.999, 0.99999, 1.00001, 1.001].map(r => c.f * r));
  grid.sort((a, b) => a - b);
  for (const f of grid) {
    if (f < fmin || f > fmax) continue;
    const [db, p] = m.rawExact(f);
    fs.push(f); mag.push(db); ph.push(p);
  }
  return { fs, mag, ph };
}

// A factor's poles and zeros in units of its own ω (s/ω): { poles, zeros }, each a list of { re, im }.
// The polynomial in s/ω is 1 + σ·s/ω (first order) or (s/ω)² + σ·(s/ω)/Q + 1 (a pair, σ = −1 in the
// right half-plane); written in ω/s it has the same roots over s or s², a pole or a double pole at the
// origin for a zero, a zero or a double zero there for a pole.
export function rootsOf(factor) {
  const d = KINDS[factor.kind];
  const sigma = d.rhp ? -1 : 1;
  let roots;
  if (d.origin) roots = [];
  else if (d.order === 1) roots = [{ re: -sigma, im: 0 }];
  else {
    const b = sigma / factor.Q, disc = b * b - 4;  // s² + b·s + 1 = 0
    roots = disc >= 0 ? [{ re: (-b + Math.sqrt(disc)) / 2, im: 0 }, { re: (-b - Math.sqrt(disc)) / 2, im: 0 }]
                      : [{ re: -b / 2, im: Math.sqrt(-disc) / 2 }, { re: -b / 2, im: -Math.sqrt(-disc) / 2 }];
  }
  const origin = Array.from({ length: d.origin ? 1 : d.inv ? d.order : 0 }, () => ({ re: 0, im: 0 }));
  // the roots of the polynomial are zeros of a numerator factor; the origin's roots go the other way
  const top = d.side > 0 ? roots : origin, bottom = d.side > 0 ? origin : roots;
  if (d.origin) return d.side > 0 ? { zeros: origin, poles: [] } : { zeros: [], poles: origin };
  return { zeros: top, poles: bottom };
}
