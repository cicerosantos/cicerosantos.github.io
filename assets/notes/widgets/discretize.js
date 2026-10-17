// {{widget discretize}}: the continuous compensator C(s) = K(1 + s/ωz1)(1 + s/ωz2) / [s(1 + s/ωp)]
// against four discretizations: backward Euler, Tustin, Tustin prewarped at fc, and matched pole-zero
// (the site's 2p2z). It plots each one's magnitude and phase error up to fs/2 and lists the
// coefficients of (b0 + b1 z⁻¹ + b2 z⁻²) / (1 + a1 z⁻¹ + a2 z⁻²).
// Options: fc, fz1, fz2, fp (Hz; default the buck's 2p2z design), fs (Hz; default 200e3).
// K is the gain that gives the buck's loop this crossover at its own 200 kHz (the site's design), held
// fixed as fs changes: only the discretization moves.
import { retune, pidEquivalent } from "../../pcl/loop.js";
import { cx, cadd, cmul, cdiv, cexpj } from "/power-labs/complex.js";
import { loadConverter, num, sig, hz, decade, el, canvasPlot, panel, line, hline, vline, legend, slider, frame, rich } from "./common.js";

const TEXT = {
  en: { fs: "Sampling rate", mag: "magnitude error", phase: "phase error", method: "method", atFc: "error at fc",
        names: { euler: "Backward Euler", tustin: "Tustin", prewarp: "Tustin, prewarped at fc", matched: "Matched pole-zero (2p2z)" },
        aria: (fs, list) => `Errors of four discretizations of C(s) up to fs/2, with fs = ${fs}. At the crossover: ${list}.`,
        K: k => `K = ${k} 1/(V·s), the buck's design gain.` },
  pt: { fs: "Taxa de amostragem", mag: "erro de módulo", phase: "erro de fase", method: "método", atFc: "erro em fc",
        names: { euler: "Euler para trás", tustin: "Tustin", prewarp: "Tustin com pré-distorção em fc", matched: "Casamento de polos e zeros (2p2z)" },
        aria: (fs, list) => `Erros de quatro discretizações de C(s) até fs/2, com fs = ${fs}. No cruzamento: ${list}.`,
        K: k => `K = ${k} 1/(V·s), o ganho do projeto do *buck*.` },
};
const COLORS = { euler: "--alt2", tustin: "--alt1", prewarp: "--loop", matched: "--alt3" };
const RULES = {
  euler: "\\(s = \\frac{1 - z^{-1}}{T_s}\\)",
  tustin: "\\(s = \\frac{2}{T_s}\\,\\frac{1 - z^{-1}}{1 + z^{-1}}\\)",
  prewarp: "\\(s = \\frac{\\omega_c}{\\tan(\\omega_c T_s/2)}\\,\\frac{1 - z^{-1}}{1 + z^{-1}}\\)",
  matched: "\\(z_i = e^{-\\omega_i T_s}\\)",
};

// polynomials in w = z⁻¹, lowest power first
const mul = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
const pow = (p, n) => { let o = [1]; for (let i = 0; i < n; i++) o = mul(o, p); return o; };
const add = (a, b) => { const o = new Array(Math.max(a.length, b.length)).fill(0); a.forEach((x, i) => { o[i] += x; }); b.forEach((x, i) => { o[i] += x; }); return o; };
// s-polynomial (lowest power first, degree ≤ 2) through the bilinear map s = c(1 − w)/(1 + w), times (1 + w)²
const bilinear = (p, c) => p.reduce((acc, pi, i) => add(acc, mul(pow([1, -1], i), pow([1, 1], 2 - i)).map(v => v * pi * c ** i)), [0]);
const euler = (p, T) => p.reduce((acc, pi, i) => add(acc, pow([1, -1], i).map(v => v * pi / T ** i)), [0]);

export function discretizations({ K, fz1, fz2, fp, fc }, T) {
  const wz1 = 2 * Math.PI * fz1, wz2 = 2 * Math.PI * fz2, wp = 2 * Math.PI * fp, wc = 2 * Math.PI * fc;
  const N = [K, K * (1 / wz1 + 1 / wz2), K / (wz1 * wz2)], D = [0, 1, 1 / wp];
  const z1 = Math.exp(-wz1 * T), z2 = Math.exp(-wz2 * T), p = Math.exp(-wp * T);
  const b0 = K * T * (1 - p) / ((1 - z1) * (1 - z2));
  const raw = {
    euler: [euler(N, T), euler(D, T)],
    tustin: [bilinear(N, 2 / T), bilinear(D, 2 / T)],
    prewarp: [bilinear(N, wc / Math.tan(wc * T / 2)), bilinear(D, wc / Math.tan(wc * T / 2))],
    matched: [mul([b0], mul([1, -z1], [1, -z2])), mul([1, -1], [1, -p])],
  };
  const out = {};
  for (const [key, [n, d]] of Object.entries(raw)) {
    const pad = q => [...q, 0, 0, 0].slice(0, 3);
    out[key] = { b: pad(n).map(v => v / d[0]), a: pad(d).map(v => v / d[0]) };
  }
  return out;
}
export function continuous({ K, fz1, fz2, fp }, f) {
  const s = cx(0, 2 * Math.PI * f);
  const n = cmul(cadd(cx(1), cdiv(s, cx(2 * Math.PI * fz1))), cadd(cx(1), cdiv(s, cx(2 * Math.PI * fz2))));
  return cdiv(cmul(cx(K), n), cmul(s, cadd(cx(1), cdiv(s, cx(2 * Math.PI * fp)))));
}
export function discrete({ b, a }, f, T) {
  const w = cexpj(-2 * Math.PI * f * T), w2 = cmul(w, w);
  const poly = q => cadd(cadd(cx(q[0]), cmul(cx(q[1]), w)), cmul(cx(q[2]), w2));
  return cdiv(poly(b), poly(a));
}

export default async function mount(body, options, { lang, typeset }) {
  const s = TEXT[lang];
  const info = await loadConverter("buck");
  const base = info.spec.controllers.find(c => c.id === "2p2z")?.design || info.converter.design;
  const d = { form: "2p2z", fc: +options.fc || base.fc, fz1: +options.fz1 || base.fz1, fz2: +options.fz2 || base.fz2, fp: +options.fp || base.fp, k: null };
  const Tb = info.converter.T;
  d.k = retune(d, Tb, f => info.converter.plant(f, info.op));
  const K = pidEquivalent(d, Tb)[1];  // the continuous integral gain
  const ctl = { K, fz1: d.fz1, fz2: d.fz2, fp: d.fp, fc: d.fc };
  let fs = +options.fs || 200e3, data = null;

  const ui = frame(body);
  const plot = canvasPlot(ui.plots, { height: 340, draw });
  ui.plots.append(legend(Object.keys(COLORS).map(k => [COLORS[k], s.names[k], k === "tustin" ? "dashed" : "solid"])));
  const formula = el("p", { class: "w-formula", text: "\\(C(z) = \\dfrac{b_0 + b_1 z^{-1} + b_2 z^{-2}}{1 + a_1 z^{-1} + a_2 z^{-2}}\\)" });
  const table = el("div", { class: "w-table-wrap" });
  const note = el("p", { class: "w-note" });
  ui.readout.append(formula, table, note);
  typeset(formula);
  slider(ui.controls, { label: s.fs, min: 20e3, max: 1e6, value: fs, log: true, format: f => hz(f, lang), oninput: v => { fs = v; update(); } });

  function update() {
    const T = 1 / fs, methods = discretizations(ctl, T);
    const n = 300, fmax = fs / 2, fmin = Math.min(fmax / 1000, ctl.fz1 / 5);
    const freqs = Array.from({ length: n }, (_, i) => fmin * (fmax / fmin) ** (i / (n - 1)));
    const errors = {};
    for (const [key, m] of Object.entries(methods)) {
      const db = [], ph = [];
      for (const f of freqs) {
        const r = cdiv(discrete(m, f, T), continuous(ctl, f));
        db.push(20 * Math.log10(Math.hypot(r.re, r.im))); ph.push(Math.atan2(r.im, r.re) * 180 / Math.PI);
      }
      const r = cdiv(discrete(m, ctl.fc, T), continuous(ctl, ctl.fc));
      errors[key] = { db, ph, fc: [20 * Math.log10(Math.hypot(r.re, r.im)), Math.atan2(r.im, r.re) * 180 / Math.PI] };
    }
    data = { freqs, errors, T };
    const c = v => sig(v, 4, lang);
    table.innerHTML = `<table class="w-table w-coeffs"><thead><tr><th>${s.method}</th><th>\\(b_0\\)</th><th>\\(b_1\\)</th><th>\\(b_2\\)</th>` +
      `<th>\\(a_1\\)</th><th>\\(a_2\\)</th><th>${s.atFc}</th></tr></thead><tbody>` +
      Object.entries(methods).map(([key, m]) => `<tr><td>${s.names[key]}<br><span class="w-rule">${RULES[key]}</span></td>${m.b.map(v => `<td>${c(v)}</td>`).join("")}` +
        `<td>${c(m.a[1])}</td><td>${c(m.a[2])}</td><td>${num(errors[key].fc[0], 2, lang)} dB, ${num(errors[key].fc[1], 1, lang)}°</td></tr>`).join("") +
      "</tbody></table>";
    typeset(table);
    note.replaceChildren(...rich(s.K(sig(K, 4, lang)) + ` fc = ${hz(ctl.fc, lang)}, fz1 = ${hz(ctl.fz1, lang)}, fz2 = ${hz(ctl.fz2, lang)}, fp = ${hz(ctl.fp, lang)}, Tₛ = ${num(T * 1e6, 2, lang)} µs.`));
    plot.label(s.aria(hz(fs, lang), Object.keys(methods).map(k => `${s.names[k]} ${num(errors[k].fc[0], 2, lang)} dB, ${num(errors[k].fc[1], 1, lang)}°`).join("; ")));
    plot.render();
  }

  function draw(g, w, h) {
    if (!data) return;
    const { freqs, errors } = data;
    const x = { min: freqs[0], max: freqs[freqs.length - 1], log: true, format: f => decade(f, lang) };
    const clampRange = (vals, limit, step) => {
      const all = vals.flat().filter(Number.isFinite);
      const hi = Math.min(limit, Math.max(step, Math.ceil(Math.max(...all) / step) * step));
      const lo = Math.max(-limit, Math.min(-step, Math.floor(Math.min(...all) / step) * step));
      return [lo, hi];
    };
    const [m0, m1] = clampRange(Object.values(errors).map(e => e.db), 12, 3);
    const [p0, p1] = clampRange(Object.values(errors).map(e => e.ph), 90, 15);
    const left = 46, top = 24, gap = 28, half = (h - top - gap - 20) / 2;
    const pm = panel(g, { left, top, width: w - left - 8, height: half }, x, { min: m0, max: m1, format: v => num(v, undefined, lang) + " dB", label: s.mag }, { xLabels: false });
    const pp = panel(g, { left, top: top + half + gap, width: w - left - 8, height: half }, x, { min: p0, max: p1, format: v => num(v, undefined, lang) + "°", label: s.phase });
    hline(g, pm, 0); hline(g, pp, 0);
    vline(g, pm, ctl.fc, "--margin"); vline(g, pp, ctl.fc, "--margin");
    for (const [key, e] of Object.entries(errors)) {
      const style = { color: COLORS[key], width: key === "tustin" ? 2.4 : 1.6, dash: key === "tustin" ? [6, 4] : [] };
      line(g, pm, freqs, e.db, style);
      line(g, pp, freqs, e.ph, style);
    }
  }
  update();
}
