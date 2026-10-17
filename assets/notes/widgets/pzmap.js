// {{widget pzmap preset=second-order-q}}: the s-plane, where the student drags poles (×) and zeros (○),
// with the Bode plot of G(jω) and the step response beside it, updated live.
// Options: preset (required: first-order-pole | first-order-zero | lhp-vs-rhp-zero | second-order-q |
// buck-lc | boost-rhp), show (bode,step or one of them; default both). build_notes.py checks both.
//
// The plane's axes are in hertz, s/2π: a real pole at −1 kHz is the corner frequency 1 kHz. G(s) is
// written K·Π(1 − s/zᵢ)/Π(1 − s/pᵢ), so dragging keeps the DC gain G(0) = K fixed. A real root stays
// on the real axis; a pair moves as a conjugate pair, and snaps onto the axis as a double root, which
// can then be pulled apart along the axis. The step response is exact: the controllable canonical
// form, sampled with the matrix exponential (scaling and squaring). With more zeros than poles the
// system is improper; a far pole, ten times the farthest root, makes it proper, and the readout says so.
// The two converter presets take the poles and zeros from the averaged power stage of converter.js
// (its PLANT export) at scenarios.json's operating point, duty → V(out), without the digital delay;
// their sliders (load, ESR, input voltage) move them, and their markers are not dragged.
import { loadConverter, el, css, canvasPlot, panel, line, hline, vline, slider, legend, num, eng, decade, FONT } from "./common.js";

const PRESETS = ["first-order-pole", "first-order-zero", "lhp-vs-rhp-zero", "second-order-q", "buck-lc", "boost-rhp"];

const TEXT = {
  en: {
    pole: "pole", zero: "zero", polePair: "pole pair", zeroPair: "zero pair", far: "far pole (added)",
    head: ["", "s/2π", "f", "Q"], rhp: "right half-plane", unstableTag: "unstable",
    zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset", mirror: "Mirror the zero (left ↔ right half-plane)",
    plane: "s-plane", magAxis: "magnitude (dB)", phAxis: "phase (°)", stepAxis: "step response", stepAxisV: "V(out) per unit of duty (V)",
    poles: "poles", zeros: "zeros", farKey: "added far pole", fcKey: "crossover of the lab's design",
    dcFixed: k => `DC gain G(0) = ${k}, held fixed while you drag: G(s) is written K·Π(1 − s/zᵢ)/Π(1 − s/pᵢ).`,
    dcModel: k => `DC gain G(0) = ${k} per unit of duty, set by the circuit.`,
    overshoot: v => `Overshoot: ${v} past the final value.`, noOvershoot: "No overshoot.",
    inverse: v => `Inverse initial response: the step first goes the wrong way, down to ${v} of the final value.`,
    jump: v => `At t = 0⁺ the output jumps at once to ${v} of the final value (as many zeros as poles).`,
    settle: v => `Settles within 2 % after ${v}.`,
    unstable: "Unstable: a pole is in the right half-plane, or on the jω axis, and the step response grows or never settles.",
    improper: (n, f) => `More zeros than poles: G(s) is improper, so it cannot be built and its step response would hold an impulse. ${n === 1 ? "A far pole" : `${n} far poles`} at ${f} (ten times the farthest root) ${n === 1 ? "was" : "were"} added to make it proper.`,
    drag: "Drag a marker, or focus it with Tab and move it with the arrow keys (Shift: larger steps). A real root stays on the real axis; a pair moves as a conjugate pair and snaps onto the axis as a double root.",
    model: "Averaged power stage of the lab's converter, duty → V(out), at its operating point, without the digital delay (a delay is not a pole or zero; it only adds phase lag). The sliders move the poles and zeros.",
    modelBoost: " The ADC's sampling correction is left out too.",
    Q: "Q", R: "Load", ESR: "ESR", vin: "Input voltage",
    at: (name, re, im) => im ? `${name} at ${re} ± j${im}` : `${name} at ${re}`,
    markerLabel: where => `${where}. Arrow keys move it.`,
    aria: (rows, extra) => `s-plane: ${rows}. ${extra}`,
    ariaBode: "Bode plot of G(jω): magnitude in dB and phase in degrees against frequency.",
    ariaStep: "Step response of G(s) against time.",
    pair: (f0, q) => `f₀ ${f0}, Q ${q}`,
  },
  pt: {
    pole: "polo", zero: "zero", polePair: "par de polos", zeroPair: "par de zeros", far: "polo distante (acrescentado)",
    head: ["", "s/2π", "f", "Q"], rhp: "semiplano direito", unstableTag: "instável",
    zoomIn: "Aproximar", zoomOut: "Afastar", reset: "Restaurar", mirror: "Espelhar o zero (semiplano esquerdo ↔ direito)",
    plane: "plano s", magAxis: "módulo (dB)", phAxis: "fase (°)", stepAxis: "resposta ao degrau", stepAxisV: "V(out) por unidade de razão cíclica (V)",
    poles: "polos", zeros: "zeros", farKey: "polo distante acrescentado", fcKey: "cruzamento do projeto do laboratório",
    dcFixed: k => `Ganho DC G(0) = ${k}, mantido fixo enquanto você arrasta: G(s) está escrita como K·Π(1 − s/zᵢ)/Π(1 − s/pᵢ).`,
    dcModel: k => `Ganho DC G(0) = ${k} por unidade de razão cíclica, dado pelo circuito.`,
    overshoot: v => `Sobressinal: ${v} além do valor final.`, noOvershoot: "Sem sobressinal.",
    inverse: v => `Resposta inicial inversa: o degrau primeiro vai para o lado errado, até ${v} do valor final.`,
    jump: v => `Em t = 0⁺ a saída salta de uma vez para ${v} do valor final (tantos zeros quanto polos).`,
    settle: v => `Acomoda-se dentro de 2 % após ${v}.`,
    unstable: "Instável: há um polo no semiplano direito, ou sobre o eixo jω, e a resposta ao degrau cresce ou nunca se acomoda.",
    improper: (n, f) => `Mais zeros que polos: G(s) é imprópria, não pode ser construída e sua resposta ao degrau teria um impulso. ${n === 1 ? "Um polo distante foi acrescentado" : `${n} polos distantes foram acrescentados`} em ${f} (dez vezes a raiz mais distante) para torná-la própria.`,
    drag: "Arraste um marcador, ou selecione-o com Tab e mova-o com as setas (Shift: passos maiores). Uma raiz real fica no eixo real; um par se move como par conjugado e gruda no eixo como raiz dupla.",
    model: "Estágio de potência médio do conversor do laboratório, razão cíclica → V(out), no ponto de operação, sem o atraso digital (um atraso não é polo nem zero; só acrescenta atraso de fase). Os controles deslizantes movem os polos e zeros.",
    modelBoost: " A correção de amostragem do ADC também fica de fora.",
    Q: "Q", R: "Carga", ESR: "ESR", vin: "Tensão de entrada",
    at: (name, re, im) => im ? `${name} em ${re} ± j${im}` : `${name} em ${re}`,
    markerLabel: where => `${where}. As setas o movem.`,
    aria: (rows, extra) => `Plano s: ${rows}. ${extra}`,
    ariaBode: "Diagrama de Bode de G(jω): módulo em dB e fase em graus contra a frequência.",
    ariaStep: "Resposta ao degrau de G(s) no tempo.",
    pair: (f0, q) => `f₀ ${f0}, Q ${q}`,
  },
};

// ---- presets ----
// Roots in hertz (s/2π). A real root { type: "real", r }; a pair { type: "pair", r1, r2, im }: complex
// r1 ± j·im when im > 0, else the two real roots r1 and r2. view: the plane's centre on the real axis
// and its half height; bode: the frequency range.
const real = r => ({ type: "real", r });
const pairOf = (f0, q) => {  // a pair of natural frequency f0 and quality factor q
  const a = f0 / q, disc = a * a / 4 - f0 * f0;
  return disc < 0 ? { type: "pair", r1: -a / 2, r2: -a / 2, im: Math.sqrt(-disc) }
                  : { type: "pair", r1: -a / 2 + Math.sqrt(disc), r2: -a / 2 - Math.sqrt(disc), im: 0 };
};
const GENERIC = {
  "first-order-pole": () => ({ poles: [real(-1000)], zeros: [], view: { cx: -700, half: 2000 }, bode: [10, 1e5] }),
  "first-order-zero": () => ({ poles: [], zeros: [real(-1000)], view: { cx: -700, half: 2000 }, bode: [10, 1e6] }),
  "lhp-vs-rhp-zero": () => ({ poles: [real(-1000), real(-4000)], zeros: [real(2000)], view: { cx: -1200, half: 3500 }, bode: [10, 1e5] }),
  "second-order-q": () => ({ poles: [pairOf(1000, 2)], zeros: [], view: { cx: -500, half: 1600 }, bode: [10, 1e5] }),
};

// The buck's duty → V(out): Vin·R(1 + sC·ESR) / [s²LC(R + ESR) + s(RC·ESR + L + Rl·C(R + ESR)) + R + Rl]
function buckModel(P, vin, R, esr) {
  const { L, C } = P, Rl = P.R, w = 2 * Math.PI;
  const c2 = L * C * (R + esr), c1 = R * C * esr + L + Rl * C * (R + esr), c0 = R + Rl;
  return { k: vin * R / c0, poles: [quadratic(c1 / c2 / w, c0 / c2 / (w * w))], zeros: [real(-1 / (w * C * esr))] };
}
// The boost's duty → V(out) (converter.js): Zo·(D'V − I(sL + Rl)) / (sL + Rl + Zo·D'²), Zo = R ∥ (ESR + 1/sC):
// R(1 + sC·ESR)(D'V − I·Rl − sLI) / [s²LC(R + ESR) + s(L + Rl·C(R + ESR) + RC·ESR·D'²) + Rl + R·D'²]
function boostModel(P, converter, vin, vref, R) {
  const { L, C, RL: Rl, ESR: esr } = P, w = 2 * Math.PI;
  const op = converter.operatingPoint({ vin, vref, load: R }), dp = 1 - op.duty, I = op.current;
  const c2 = L * C * (R + esr), c1 = L + Rl * C * (R + esr) + R * C * esr * dp * dp, c0 = Rl + R * dp * dp;
  const gain = dp * vref - I * Rl;
  return { k: R * gain / c0, op, poles: [quadratic(c1 / c2 / w, c0 / c2 / (w * w))],
           zeros: [real(-1 / (w * C * esr)), real(gain / (w * L * I))] };
}
// s² + a·s + b (in hertz) as a pair
function quadratic(a, b) {
  const disc = a * a / 4 - b;
  return disc < 0 ? { type: "pair", r1: -a / 2, r2: -a / 2, im: Math.sqrt(-disc) }
                  : { type: "pair", r1: -a / 2 + Math.sqrt(disc), r2: -a / 2 - Math.sqrt(disc), im: 0 };
}

// ---- the transfer function ----
const coeffs = it => it.type === "real" ? null : it.im > 0 ? { a: -2 * it.r1, b: it.r1 * it.r1 + it.im * it.im } : { a: -(it.r1 + it.r2), b: it.r1 * it.r2 };
const rootsOf = it => it.type === "real" ? [{ re: it.r, im: 0 }]
  : it.im > 0 ? [{ re: it.r1, im: it.im }, { re: it.r1, im: -it.im }] : [{ re: it.r1, im: 0 }, { re: it.r2, im: 0 }];
const order = list => list.reduce((n, it) => n + (it.type === "real" ? 1 : 2), 0);

// One factor normalised to 1 at s = 0, at s/2π = j·f: [re, im].
function factorAt(it, f) {
  if (it.type === "real") return [1, -f / it.r];
  const { a, b } = coeffs(it);
  return [(b - f * f) / b, a * f / b];
}
// Magnitude (dB) and phase (°) of G(j2πf). The phase is the sum of each factor's own angle, each
// continuous in f, so it needs no unwrapping and a right-half-plane zero shows its lag.
function bodeOf(sys, freqs) {
  const db = [], phase = [];
  for (const f of freqs) {
    let m = 20 * Math.log10(Math.abs(sys.k)), p = sys.k < 0 ? 180 : 0;
    for (const [list, sign] of [[sys.zeros, 1], [sys.poles, -1]])
      for (const it of list) { const [re, im] = factorAt(it, f); m += sign * 10 * Math.log10(re * re + im * im); p += sign * Math.atan2(im, re) * 180 / Math.PI; }
    db.push(m); phase.push(p);
  }
  return { db, phase };
}

// Polynomials in ascending powers.
const polyMul = (p, q) => { const r = new Array(p.length + q.length - 1).fill(0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] += a * b; })); return r; };
// A factor as a polynomial in s' = s/(2π·fref), normalised to 1 at s = 0.
function factorPoly(it, fref) {
  if (it.type === "real") return [1, -fref / it.r];
  const { a, b } = coeffs(it);
  return [1, a * fref / b, fref * fref / b];
}

// e^M by scaling and squaring with a Taylor series.
function expm(M) {
  const n = M.length, mul = (A, B) => A.map((row, i) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  const norm = Math.max(...M.map(row => row.reduce((s, v) => s + Math.abs(v), 0)));
  const sq = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1), A = M.map(row => row.map(v => v / 2 ** sq));
  let E = A.map((row, i) => row.map((_, j) => +(i === j))), term = E;
  for (let k = 1; k <= 18; k++) { term = mul(term, A).map(row => row.map(v => v / k)); E = E.map((row, i) => row.map((v, j) => v + term[i][j])); }
  for (let i = 0; i < sq; i++) E = mul(E, E);
  return E;
}

// The unit step response, exact at each sample: { t (s), y, stable }.
function stepOf(sys) {
  const poles = sys.poles.flatMap(rootsOf), zeros = sys.zeros.flatMap(rootsOf);
  const mags = [...poles, ...zeros].map(p => Math.hypot(p.re, p.im)).filter(m => m > 0);
  const fref = mags.length ? Math.exp(mags.reduce((s, m) => s + Math.log(m), 0) / mags.length) : 1;
  let top = [sys.k], den = [1];
  for (const it of sys.zeros) top = polyMul(top, factorPoly(it, fref));
  for (const it of sys.poles) den = polyMul(den, factorPoly(it, fref));
  const n = den.length - 1, w = 2 * Math.PI * fref;  // s' = s / w, t' = w·t
  // the window: eight time constants of the slowest stable pole, or the growth of an unstable one,
  // at most about ten periods of the slowest pole's natural frequency
  const sigma = poles.map(p => -p.re), pmin = Math.min(...poles.map(p => Math.hypot(p.re, p.im)));
  const stable = poles.every(p => p.re < -1e-9 * Math.hypot(p.re, p.im));
  const longest = 60 / (2 * Math.PI * pmin);
  const T = !poles.length ? 1e-3 : stable ? Math.min(8 / (2 * Math.PI * Math.min(...sigma)), longest)
          : Math.max(...poles.map(p => p.re)) > 0 ? Math.min(6 / (2 * Math.PI * Math.max(...poles.map(p => p.re))), longest) : longest;
  const N = 600, t = Array.from({ length: N + 1 }, (_, i) => T * i / N);
  if (n === 0) return { t, y: t.map(() => top[0]), stable: true, d: top[0] };
  const lead = den[n], d = den.map(v => v / lead), b = top.concat(new Array(n + 1 - top.length).fill(0)).map(v => v / lead);
  const dd = b[n], c = Array.from({ length: n }, (_, i) => b[i] - dd * d[i]);
  // x' = A x + B u, controllable canonical form, with u = 1 kept as an extra state
  const M = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < n - 1; i++) M[i][i + 1] = 1;
  for (let j = 0; j < n; j++) M[n - 1][j] = -d[j];
  M[n - 1][n] = 1;
  const h = w * T / N, Phi = expm(M.map(row => row.map(v => v * h)));
  let x = new Array(n).fill(0).concat(1);
  const y = [];
  for (let k = 0; k <= N; k++) {
    y.push(c.reduce((s, ci, i) => s + ci * x[i], 0) + dd);
    x = Phi.map(row => row.reduce((s, v, j) => s + v * x[j], 0));
  }
  return { t, y, stable, d: dd };
}

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang];
  const preset = PRESETS.includes(options.preset) ? options.preset : "first-order-pole";
  const shown = (options.show || "bode,step").split(",");
  const showBode = shown.includes("bode"), showStep = shown.includes("step");
  const model = preset === "buck-lc" || preset === "boost-rhp";
  const info = model ? await loadConverter(preset === "buck-lc" ? "buck" : "boost") : null;
  const hzText = v => eng(v, "Hz", lang);
  const pct = v => num(v * 100, Math.abs(v) < 0.1 ? 1 : 0, lang) + " %";

  // ---- state ----
  let sys, view, bodeRange, data = null, selected = null, drag = null;
  const params = {};
  function start() {
    if (preset === "buck-lc") {
      params.R = info.spec.defaults.load; params.ESR = info.PLANT.ESR;
      view = { cx: -2500, half: 8000 }; bodeRange = [100, 1e6];
    } else if (preset === "boost-rhp") {
      params.vin = info.spec.defaults.vin; params.R = info.spec.defaults.load;
      view = { cx: 1000, half: 3000 }; bodeRange = [10, 1e5];
    } else {
      const p = GENERIC[preset]();
      sys = { k: 1, poles: p.poles, zeros: p.zeros };
      view = p.view; bodeRange = p.bode;
    }
    view.home = view.half;
    rebuildModel();
  }
  function rebuildModel() {
    if (preset === "buck-lc") sys = buckModel(info.PLANT, info.spec.defaults.vin, params.R, params.ESR);
    else if (preset === "boost-rhp") sys = boostModel(info.PLANT, info.converter, params.vin, info.spec.defaults.vref, params.R);
  }
  const minRoot = () => view.home * 0.01;  // roots keep off the origin: G(0) stays finite
  const awayFromOrigin = r => Math.abs(r) >= minRoot() ? r : (r < 0 || Object.is(r, -0) ? -minRoot() : minRoot());

  start();

  // ---- layout ----
  body.classList.add("w");
  const wrap = el("div", { class: "w-pz-wrap" }), grid = el("div", { class: "w-pz" });
  const planeSide = el("div", { class: "w-pz-side" }), plotSide = el("div", { class: "w-pz-side" });
  grid.append(planeSide);
  if (showBode || showStep) grid.append(plotSide);
  wrap.append(grid);
  const readout = el("div", { class: "w-readout" }), controls = el("div", { class: "w-panel w-controls" }), live = el("p", { class: "w-sr", "aria-live": "polite" });
  body.append(wrap, readout, controls, live);

  const tools = el("div", { class: "w-toolbar w-pz-tools" });
  const zoomOut = el("button", { type: "button", "aria-label": s.zoomOut, title: s.zoomOut, text: "−" });
  const zoomIn = el("button", { type: "button", "aria-label": s.zoomIn, title: s.zoomIn, text: "+" });
  const reset = el("button", { type: "button", text: s.reset });
  tools.append(el("span", { class: "w-pz-title", text: s.plane + " (s/2π)" }), zoomOut, zoomIn, reset);
  planeSide.append(tools);
  const plane = canvasPlot(planeSide, { height: 320, draw: drawPlane });
  const keys = [["--loop", s.poles, "cross"], ["--plant", s.zeros, "ring"]];
  const legendBox = el("div");
  planeSide.append(legendBox);
  const markerLayer = el("div", { class: "w-pz-markers" });
  plane.box.append(markerLayer);
  const bode = showBode ? canvasPlot(plotSide, { height: showStep ? 250 : 320, draw: drawBode }) : null;
  const step = showStep ? canvasPlot(plotSide, { height: showBode ? 200 : 300, draw: drawStep }) : null;
  if (bode) bode.label(s.ariaBode);
  if (step) step.label(s.ariaStep);
  const table = el("div", { class: "w-table-wrap" }), dcLine = el("p"), stepLines = el("div", { class: "w-pz-lines" }), notes = el("div", { class: "w-pz-lines" });
  readout.append(table, dcLine, stepLines, notes);

  // controls
  const sliders = {};
  if (preset === "second-order-q")
    sliders.Q = slider(controls, { label: s.Q, min: 0.2, max: 20, value: 2, log: true, format: q => num(Number(q.toPrecision(2)), undefined, lang),
      oninput: q => { const it = sys.poles[0], { b } = coeffs(it); Object.assign(it, pairOf(Math.sqrt(Math.abs(b)), q)); update(); } });
  if (preset === "buck-lc") {
    sliders.R = slider(controls, { label: s.R, min: 1, max: 1000, value: params.R, log: true, format: r => eng(r, "Ω", lang, 2),
      oninput: r => { params.R = r; rebuildModel(); update(); } });
    sliders.ESR = slider(controls, { label: s.ESR, min: 1e-3, max: 1, value: params.ESR, log: true, format: r => eng(r, "Ω", lang, 2),
      oninput: r => { params.ESR = r; rebuildModel(); update(); } });
  }
  if (preset === "boost-rhp") {
    sliders.vin = slider(controls, { label: s.vin, min: 9, max: 15, value: params.vin, step: 0.5, format: v => eng(v, "V", lang, 3),
      oninput: v => { params.vin = v; rebuildModel(); update(); } });
    sliders.R = slider(controls, { label: s.R, min: 24, max: 480, value: params.R, log: true, format: r => eng(r, "Ω", lang, 2),
      oninput: r => { params.R = r; rebuildModel(); update(); } });
  }
  if (preset === "lhp-vs-rhp-zero")
    controls.append(el("div", {}, el("button", { type: "button", text: s.mirror, onclick: () => { const z = sys.zeros[0]; z.r = -z.r; update(); announce(markerOf(z, 0, sys.zeros)); } })));

  zoomIn.addEventListener("click", () => { view.half /= 2; view.cx /= 2; update(); });
  zoomOut.addEventListener("click", () => { view.half *= 2; view.cx *= 2; update(); });
  reset.addEventListener("click", () => {
    start();
    for (const [key, sl] of Object.entries(sliders)) sl.set(key === "Q" ? 2 : params[key]);
    update();
    live.textContent = s.reset + ". " + describeAll();
  });

  // ---- the markers: focusable buttons over the canvas ----
  // A marker is { list ("poles" | "zeros"), i (index in the list), k (0, or 1 for a pair's second root) }.
  const markers = [];
  const nameOf = (list, it) => it.type === "pair" ? (list === "poles" ? s.polePair : s.zeroPair) : (list === "poles" ? s.pole : s.zero);
  function markerOf(it, k, list) { return { list: list === sys.poles ? "poles" : "zeros", i: list.indexOf(it), k }; }
  function rootAt(m) { return rootsOf(sys[m.list][m.i])[m.k]; }
  function whereText(it) {
    if (it.type === "real") return hzText(it.r);
    if (it.im > 0) return `${hzText(it.r1)} ± j${hzText(it.im)}`;
    return `${hzText(it.r1)}, ${hzText(it.r2)}`;
  }
  function describe(m) { const it = sys[m.list][m.i]; return s.at(nameOf(m.list, it), it.type === "pair" && it.im > 0 ? hzText(it.r1) : whereText(it), it.type === "pair" && it.im > 0 ? hzText(it.im) : null); }
  function describeAll() {
    return ["poles", "zeros"].flatMap(list => sys[list].map((it, i) => describe({ list, i, k: 0 }))).join("; ");
  }
  function announce(m) { live.textContent = describe(m) + "."; }

  function buildMarkers() {
    markerLayer.replaceChildren();
    markers.length = 0;
    if (model) return;
    for (const list of ["poles", "zeros"])
      sys[list].forEach((it, i) => {
        for (let k = 0; k < (it.type === "pair" ? 2 : 1); k++) {
          const m = { list, i, k };
          const button = el("button", { type: "button", class: "w-pz-marker" });
          button.addEventListener("pointerdown", e => {
            e.preventDefault();
            button.focus();
            try { button.setPointerCapture(e.pointerId); } catch (error) { /* a pointer already gone */ }
            selected = m; drag = { m, pointer: e.pointerId };
            button.classList.add("dragging");
            plane.render();
          });
          button.addEventListener("pointermove", e => {
            if (!drag || drag.pointer !== e.pointerId || drag.m !== m || !data?.map) return;
            const r = plane.canvas.getBoundingClientRect(), { toRe, toIm, Y } = data.map;
            const px = e.clientX - r.left, py = e.clientY - r.top;
            moveTo(m, toRe(px), toIm(py), Math.abs(py - Y(0)) < 8);
          });
          const end = () => { if (drag && drag.m === m) { drag = null; button.classList.remove("dragging"); announce(m); } };
          button.addEventListener("pointerup", end);
          button.addEventListener("pointercancel", end);
          button.addEventListener("focus", () => { selected = m; plane.render(); });
          button.addEventListener("blur", () => { if (selected === m && !drag) { selected = null; plane.render(); } });
          button.addEventListener("keydown", e => {
            const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
            if (!moves[e.key]) return;
            e.preventDefault();
            const stepSize = view.half / 40 * (e.shiftKey ? 5 : 1), here = rootAt(m), [dx, dy] = moves[e.key];
            const im = here.im + dy * stepSize;
            moveTo(m, here.re + dx * stepSize, Math.abs(im) < stepSize / 2 ? 0 : im, false);
            announce(m);
          });
          markers.push({ m, button });
          markerLayer.append(button);
        }
      });
  }

  // Moves marker m to (re, im) in hertz; snap puts it on the real axis.
  function moveTo(m, re, im, snap) {
    const it = sys[m.list][m.i], v = data.map.bounds;
    re = Math.min(Math.max(re, v.x0), v.x1);
    im = Math.min(Math.max(im, -v.y), v.y);
    if (it.type === "real") it.r = awayFromOrigin(re);
    else if (snap || im === 0) {
      if (it.im > 0) { it.r1 = it.r2 = awayFromOrigin(re); it.im = 0; }  // a complex pair lands as a double root
      else it[m.k ? "r2" : "r1"] = awayFromOrigin(re);                     // a real one: this root moves alone
    } else {
      it.r1 = it.r2 = Math.hypot(re, im) < minRoot() ? -minRoot() : re;
      it.im = Math.abs(im);
    }
    if (sliders.Q) { const { a, b } = coeffs(it); if (a > 0 && b > 0) sliders.Q.set(Math.sqrt(b) / a); }
    update();
  }

  // ---- computing ----
  function withFarPoles() {
    const extra = order(sys.zeros) - order(sys.poles);
    if (extra <= 0) return { ...sys, far: [] };
    const reach = Math.max(...[...sys.poles, ...sys.zeros].flatMap(rootsOf).map(p => Math.hypot(p.re, p.im)));
    const far = Array.from({ length: extra }, () => real(-10 * reach));
    return { ...sys, poles: [...sys.poles, ...far], far };
  }
  function update() {
    const full = withFarPoles();
    const roots = [...full.poles, ...full.zeros].flatMap(rootsOf).map(p => Math.hypot(p.re, p.im)).filter(m => m > 0);
    // the Bode range: the preset's, widened by decades to take in every root
    let [lo, hi] = bodeRange;
    lo = Math.min(lo, 10 ** Math.floor(Math.log10(Math.min(...roots) / 10)));
    hi = Math.max(hi, 10 ** Math.ceil(Math.log10(Math.max(...roots) * 2)));
    lo = Math.max(lo, 0.1); hi = Math.min(hi, 1e8);
    const freqs = Array.from({ length: 401 }, (_, i) => lo * (hi / lo) ** (i / 400));
    data = { full, freqs, curve: showBode ? bodeOf(full, freqs) : null, step: stepOf(full), map: data?.map || null };
    readouts();
    if (markers.length !== order(sys.poles) + order(sys.zeros) && !model) buildMarkers();
    plane.render();
    if (bode) bode.render();
    if (step) step.render();
  }

  function readouts() {
    const { full, step: st } = data, fmt = v => num(Number(v.toPrecision(3)), undefined, lang);
    const rows = [];
    const qText = it => {
      const { a, b } = coeffs(it);
      if (!(b > 0)) return "—";
      if (!(a > 0)) return "∞";  // on or past the jω axis
      const q = Math.sqrt(b) / a;
      return `${fmt(q)} <span class="w-pz-zeta">(ζ = ${fmt(1 / (2 * q))})</span>`;
    };
    for (const list of ["poles", "zeros"])
      for (const it of sys[list]) {
        const right = rootsOf(it).some(p => p.re > 0), name = nameOf(list, it);
        const flag = right ? ` <span class="${list === "poles" ? "bad" : "w-pz-flag"}">${s.rhp}</span>` : "";
        const b = it.type === "pair" ? coeffs(it).b : 0;
        const f = it.type === "real" ? hzText(Math.abs(it.r)) : b > 0 ? hzText(Math.sqrt(b)) : "—";
        rows.push(`<tr><td>${name}${flag}</td><td>${whereText(it)}</td><td>${f}</td><td>${it.type === "pair" ? qText(it) : "—"}</td></tr>`);
      }
    for (const it of full.far) rows.push(`<tr><td class="w-pz-muted">${s.far}</td><td>${hzText(it.r)}</td><td>${hzText(Math.abs(it.r))}</td><td>—</td></tr>`);
    const head = s.head.map((h, i) => `<th>${i === 2 ? "f / f₀" : h}</th>`).join("");
    table.innerHTML = `<table class="w-table"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    const k = model ? eng(sys.k, "V", lang) : fmt(sys.k);
    dcLine.textContent = model ? s.dcModel(k) : s.dcFixed(k);
    const lines = [];
    if (!st.stable) lines.push(el("p", { class: "w-bad", text: s.unstable }));
    else {
      const K = full.k, sign = Math.sign(K) || 1;
      const peak = Math.max(...st.y.map(v => sign * (v - K))) / Math.abs(K);
      const dip = -Math.min(...st.y.map(v => sign * v)) / Math.abs(K);
      // after a jump at t = 0⁺ (as many zeros as poles), overshoot counts only once the response has
      // turned: past its first local minimum
      const jumps = Math.abs(st.d) > 0.005 * Math.abs(K), e = st.y.map(v => sign * (v - K));
      const turn = e.findIndex((v, i) => i > 0 && i < e.length - 1 && v <= e[i - 1] && v < e[i + 1]);
      const peakLate = !jumps ? peak : turn < 0 ? 0 : Math.max(...e.slice(turn)) / Math.abs(K);
      lines.push(el("p", { text: peakLate > 0.002 ? s.overshoot(pct(peakLate)) : s.noOvershoot }));
      if (dip > 0.002) lines.push(el("p", { class: "w-pz-warn", text: s.inverse(pct(-dip)) }));
      if (Math.abs(st.d) > 0.005 * Math.abs(K)) lines.push(el("p", { text: s.jump(pct(st.d / K)) }));
      let last = 0;
      st.y.forEach((v, i) => { if (Math.abs(v - K) > 0.02 * Math.abs(K)) last = i; });
      if (last < st.y.length - 1) lines.push(el("p", { text: s.settle(eng(st.t[Math.min(last + 1, st.t.length - 1)], "s", lang)) }));
    }
    stepLines.replaceChildren(...lines);
    const ns = [];
    if (full.far.length) ns.push(el("p", { class: "w-pz-warn", text: s.improper(full.far.length, hzText(full.far[0].r)) }));
    ns.push(el("p", { class: "w-note", text: model ? s.model + (preset === "boost-rhp" ? s.modelBoost : "") : s.drag }));
    notes.replaceChildren(...ns);
    legendBox.replaceChildren(legend([...keys, ...(full.far.length ? [["--muted", s.farKey, "cross"]] : []),
      ...(preset === "boost-rhp" ? [["--margin", s.fcKey, "dashed"]] : [])]));
    plane.label(s.aria(describeAll(), st.stable ? "" : s.unstable));
    for (const { m, button } of markers) button.setAttribute("aria-label", s.markerLabel(describe(m)));
  }

  // ---- drawing ----
  const fmtAxis = v => eng(v, "Hz", lang, 2);
  function drawPlane(g, w, h) {
    if (!data) return;
    const box = { left: 48, top: 10, width: w - 58, height: h - 32 };
    const halfX = view.half * box.width / box.height;
    const x = { min: view.cx - halfX, max: view.cx + halfX, format: fmtAxis }, y = { min: -view.half, max: view.half, format: fmtAxis };
    // the right half-plane, shaded: a pole there is unstable
    const X0 = box.left + (0 - x.min) / (x.max - x.min) * box.width;
    if (X0 < box.left + box.width) {
      g.save(); g.fillStyle = css("--bad"); g.globalAlpha = 0.06;
      g.fillRect(Math.max(X0, box.left), box.top, box.left + box.width - Math.max(X0, box.left), box.height); g.restore();
    }
    const p = panel(g, box, x, y);
    data.map = { X: p.X, Y: p.Y, toRe: px => x.min + (px - box.left) / box.width * (x.max - x.min),
                 toIm: py => y.max - (py - box.top) / box.height * (y.max - y.min), bounds: { x0: x.min, x1: x.max, y: view.half } };
    // axes
    p.clip(() => {
      g.strokeStyle = css("--muted"); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(box.left, p.Y(0)); g.lineTo(box.left + box.width, p.Y(0)); g.stroke();
      if (x.min < 0 && x.max > 0) { g.beginPath(); g.moveTo(p.X(0), box.top); g.lineTo(p.X(0), box.top + box.height); g.stroke(); }
      g.fillStyle = css("--muted"); g.font = FONT;
      g.textAlign = "right"; g.fillText("σ/2π", box.left + box.width - 4, p.Y(0) + 14);
      if (x.min < 0 && x.max > 0) { g.textAlign = "left"; g.fillText("jω/2π", p.X(0) + 5, box.top + 12); }
      g.textAlign = "left";
      // the lab design's crossover, as a circle |s| = 2π·fc
      if (preset === "boost-rhp") {
        const fc = info.converter.design.fc, r = p.X(fc) - p.X(0);
        g.strokeStyle = css("--margin"); g.setLineDash([5, 4]); g.lineWidth = 1.2;
        g.beginPath(); g.arc(p.X(0), p.Y(0), r, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
      }
    });
    // What a label must not cover: the axis labels, every marker, the labels already placed.
    // Rectangles [x0, y0, x1, y1] in canvas pixels.
    g.font = FONT;
    const taken = [[box.left + box.width - 4 - g.measureText("σ/2π").width, p.Y(0) + 3, box.left + box.width - 4, p.Y(0) + 17]];
    if (x.min < 0 && x.max > 0) taken.push([p.X(0) + 5, box.top + 1, p.X(0) + 5 + g.measureText("jω/2π").width, box.top + 15]);
    const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const labels = [];
    // the markers: inside the view, or at its edge with an arrow and their value
    const inView = q => q.re >= x.min && q.re <= x.max && q.im >= y.min && q.im <= y.max;
    const place = q => [Math.min(Math.max(p.X(q.re), box.left + 8), box.left + box.width - 8), Math.min(Math.max(p.Y(q.im), box.top + 8), box.top + box.height - 8)];
    const cross = (px, py, color, r = 6, dash = []) => {
      g.strokeStyle = css(color); g.lineWidth = 2.2; g.setLineDash(dash);
      g.beginPath(); g.moveTo(px - r, py - r); g.lineTo(px + r, py + r); g.moveTo(px + r, py - r); g.lineTo(px - r, py + r); g.stroke(); g.setLineDash([]);
    };
    const ring = (px, py, color, r = 6) => { g.strokeStyle = css(color); g.lineWidth = 2.2; g.beginPath(); g.arc(px, py, r, 0, 2 * Math.PI); g.stroke(); };
    const edge = (q, px, py, color, text) => {
      const dx = q.re < x.min ? -1 : q.re > x.max ? 1 : 0, dy = q.im > y.max ? -1 : q.im < y.min ? 1 : 0;
      g.fillStyle = css(color);
      g.beginPath();
      if (dx) { g.moveTo(px + dx * 7, py); g.lineTo(px - dx * 1, py - 6); g.lineTo(px - dx * 1, py + 6); }
      else { g.moveTo(px, py + dy * 7); g.lineTo(px - 6, py - dy); g.lineTo(px + 6, py - dy); }
      g.fill();
      labels.push({ px, py, dx, dy, color, text });
    };
    // Each edge label takes the first free spot: beside its arrow, under or over it, a step further
    // out each time; inside the plot, clear of the axis labels, the markers and the other labels.
    const LABEL_FONT = "600 11px system-ui, sans-serif";
    const placeLabels = () => {
      g.font = LABEL_FONT;
      for (const { px, py, dx, dy, color, text } of labels) {
        const w = g.measureText(text).width, spots = [];
        if (dx) for (const off of [18, -10, 32, -24, 46, -38]) spots.push([dx > 0 ? px - 10 - w : px + 10, py + off]);
        else for (const off of dy > 0 ? [-10, -24, -38] : [22, 36, 50]) spots.push([px + 10, py + off], [px - 10 - w, py + off]);
        const rects = spots.map(([lx, ly]) => [lx, ly - 10, lx + w, ly + 2]);
        const inside = r => r[0] >= box.left + 2 && r[2] <= box.left + box.width - 2 && r[1] >= box.top && r[3] <= box.top + box.height;
        const free = rects.find(r => inside(r) && !taken.some(o => hits(o, r))) || rects.find(inside) || rects[0];
        taken.push(free);
        g.fillStyle = css(color); g.textAlign = "left";
        g.fillText(text, free[0], free[3] - 2);
      }
      g.font = FONT; g.textAlign = "left";
    };
    const positions = new Map();
    for (const [list, color, shape] of [["poles", "--loop", "cross"], ["zeros", "--plant", "ring"]])
      sys[list].forEach((it, i) => rootsOf(it).forEach((q, k) => {
        const [px, py] = place(q);
        positions.set(`${list}${i}.${k}`, [px, py]);
        taken.push([px - 9, py - 9, px + 9, py + 9]);
        if (selected && selected.list === list && selected.i === i) { g.fillStyle = css("--selected-bg"); g.beginPath(); g.arc(px, py, 12, 0, 2 * Math.PI); g.fill(); }
        if (shape === "cross") cross(px, py, color); else ring(px, py, color);
        if (it.type === "pair" && it.im === 0 && it.r1 === it.r2 && k === 0) { g.fillStyle = css(color); g.fillText("×2", px + 8, py - 8); }
        if (!inView(q) && (q.im >= 0)) edge(q, px, py, color, (list === "poles" ? "p " : "z ") + hzText(q.re));
      }));
    for (const it of data.full.far) {
      const q = { re: it.r, im: 0 }, [px, py] = place(q);
      cross(px, py, "--muted", 5, [2, 2]);
      taken.push([px - 8, py - 8, px + 8, py + 8]);
      if (!inView(q)) edge(q, px, py, "--muted", "p " + hzText(q.re));
    }
    placeLabels();
    // the buttons follow the markers
    for (const { m, button } of markers) {
      const [px, py] = positions.get(`${m.list}${m.i}.${m.k}`) || [0, 0];
      button.style.left = px + "px"; button.style.top = py + "px";
    }
  }

  function drawBode(g, w, h) {
    if (!data) return;
    const { freqs, curve, full } = data;
    const left = 48, right = 12, top = 22, gap = 32, bottom = 22, width = w - left - right;
    const magH = (h - top - gap - bottom) * 0.55, phH = h - top - gap - bottom - magH;
    const snap = (v, st, up) => (up ? Math.ceil(v / st - 1e-9) : Math.floor(v / st + 1e-9)) * st;
    let dbLo = Math.max(snap(Math.min(...curve.db), 20, false), -120), dbHi = Math.min(snap(Math.max(...curve.db), 20, true), 140);
    if (dbHi - dbLo < 40) { dbLo = Math.min(dbLo, dbHi - 40); }
    let phLo = snap(Math.min(...curve.phase), 45, false), phHi = snap(Math.max(...curve.phase), 45, true);
    if (phHi - phLo < 90) { phLo = Math.min(phLo, phHi - 90); }
    const dbStep = dbHi - dbLo > 80 ? 40 : 20, phStep = [45, 90, 180].find(st => (phHi - phLo) / st <= phH / 24) || 180;
    phLo = snap(phLo, phStep, false); phHi = snap(phHi, phStep, true);
    // a label on every decade, or on every other one when they would crowd
    const fmin = freqs[0], fmax = freqs[freqs.length - 1], perDecade = width / Math.log10(fmax / fmin);
    const fx = { min: fmin, max: fmax, log: true, format: f => perDecade >= 58 || Math.round(Math.log10(f)) % 2 === 0 ? decade(f, lang) : "" };
    const range = (lo, hi, st) => { const out = []; for (let v = lo; v <= hi + 1e-9; v += st) out.push(v); return out; };
    const pm = panel(g, { left, top, width, height: magH }, { ...fx }, { min: dbLo, max: dbHi, ticks: range(dbLo, dbHi, dbStep), format: v => num(v, 0, lang) + " dB", label: s.magAxis }, { xLabels: false });
    const pp = panel(g, { left, top: top + magH + gap, width, height: phH }, fx, { min: phLo, max: phHi, ticks: range(phLo, phHi, phStep), format: v => num(v, 0, lang) + "°", label: s.phAxis });
    line(g, pm, freqs, curve.db, { color: "--loop", width: 2 });
    line(g, pp, freqs, curve.phase, { color: "--loop", width: 2 });
    // the roots' frequencies on the magnitude plot's floor: × poles, ○ zeros
    const yMark = top + magH - 7;
    g.lineWidth = 1.6;
    const at = f => f >= fx.min && f <= fx.max;
    for (const [list, color] of [["poles", "--loop"], ["zeros", "--plant"]])
      for (const it of (list === "poles" ? full.poles : full.zeros)) {
        const fs = it.type === "real" ? [Math.abs(it.r)] : it.im > 0 ? [Math.sqrt(coeffs(it).b)] : [Math.abs(it.r1), Math.abs(it.r2)];
        for (const f of fs) {
          if (!at(f)) continue;
          const px = pm.X(f), isFar = full.far.includes(it);
          g.strokeStyle = css(isFar ? "--muted" : color);
          g.beginPath();
          if (list === "poles") { g.moveTo(px - 4, yMark - 4); g.lineTo(px + 4, yMark + 4); g.moveTo(px + 4, yMark - 4); g.lineTo(px - 4, yMark + 4); }
          else g.arc(px, yMark, 4, 0, 2 * Math.PI);
          g.stroke();
        }
      }
    if (preset === "boost-rhp") {
      const fc = info.converter.design.fc;
      vline(g, pm, fc, "--margin", [5, 4], 1.2); vline(g, pp, fc, "--margin", [5, 4], 1.2);
    }
  }

  function drawStep(g, w, h) {
    if (!data) return;
    const { t, y, stable } = data.step, K = data.full.k;
    let lo = Math.min(0, ...y), hi = Math.max(0, ...y);
    if (!stable) { const lim = 6 * Math.max(Math.abs(K), Math.abs(data.step.d)); lo = Math.max(lo, -lim); hi = Math.min(hi, lim); }
    const pad = (hi - lo) * 0.08 || 1;
    const p = panel(g, { left: 48, top: 22, width: w - 60, height: h - 46 }, { min: 0, max: t[t.length - 1], format: v => eng(v, "s", lang, 2) },
      { min: lo - pad, max: hi + pad, format: v => num(Number(v.toPrecision(3)), undefined, lang), label: model ? s.stepAxisV : s.stepAxis });
    hline(g, p, 0, "--muted", []);
    if (stable) hline(g, p, K, "--muted");
    line(g, p, t, y, { color: "--vout", width: 2 });
  }

  buildMarkers();
  update();
}
