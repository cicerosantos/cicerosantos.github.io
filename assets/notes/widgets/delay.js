// {{widget delay converter=buck design=2p2z}}: what the loop's delay costs in phase margin. A slider
// sets the delay from 0 to 2T; the loop gain's phase near the crossover moves down, and the phase
// margin falls on a straight line, 360°·fc·T per period of delay.
// Options: converter (buck | boost | buckboost), design (a controller id of scenarios.json, or custom,
// with fc, fz1, fz2, fp, form), compare (conventions).
//
// The plant's own delay, from converter.js, is (1 + DELAY·D)·T. The figure divides the plant by
// that term and multiplies by e^(−jωτ) with the chosen τ; the rest of the plant (including the boost's
// and buck-boost's ESR sample term) is kept.
//
// compare=conventions (buck only): four ways of counting the same loop's delay, with a slider for the
// D that sets the trailing edge's position. The buck's averaged stage does not depend on D at a given
// Vin and load, so the slider moves only the edge. With the modulator's baseband term as a pure delay:
//   trailing edge, updated the next period:   e^(−jω(1 + D)T)            (converter.js's own model)
//   symmetric PWM, updated at the next peak/valley:  sinc(ωT/2)·e^(−jω1.5T)   (ZOH + z⁻¹)
//   symmetric PWM, updated in the same cycle:   sinc(ωT/2)·e^(−jωT/2)      (ZOH only)
//   double counting, ZOH added to (1 + D)T:     sinc(ωT/2)·e^(−jω(1.5 + D)T)   (an error)
// plus, dotted, the exact sampled-data model of the trailing edge (discrete.js). At D = 0.375 the
// 2p2z's margins, at its last 0 dB crossing (8 kHz), are 41.3° (41.4° exact), 39.6°, 53.9° and 34.2°.
// The boost's and buck-boost's 0.6·D is a fitted residual, not a convention, so they are left out.
import { DEFAULT_BODE, frequencies, designController, retune, response, margins, controller } from "../../pcl/loop.js";
import { cmul, cexpj, cscale } from "/power-labs/complex.js";
import { loadConverter, pickDesign, num, hz, deg, decade, eng, css, el, canvasPlot, panel, line, hline, vline, tag, legend, slider, choice, frame, CONVERTER_NAMES } from "./common.js";
import { sampledPlant, plantResponse } from "./discrete.js";

const TEXT = {
  en: { delay: "Loop delay", phase: "loop-gain phase", own: n => `the ${n}'s own delay`, chosen: "chosen delay", none: "no delay",
        pmAxis: "phase margin", line: "360°·fc·τ line", T: "Tₛ",
        read: (tau, us, pm, fc, cost) => `Delay ${tau} Tₛ (${us}): phase margin ${pm} at the crossover, ${fc}. Each period Tₛ of delay costs 360°·fc·Tₛ = ${cost}.`,
        unstable: "Unstable: no phase margin left.",
        aria1: (n, pm, tau) => `Loop-gain phase of the ${n} near the crossover with a delay of ${tau} Tₛ: phase margin ${pm}.`,
        aria2: (pm0, slope) => `Phase margin against delay: ${pm0} with no delay, falling by ${slope} per period Tₛ.` },
  pt: { delay: "Atraso da malha", phase: "fase do ganho de malha", own: n => `atraso próprio do *${n}*`, chosen: "atraso escolhido", none: "sem atraso",
        pmAxis: "margem de fase", line: "reta 360°·fc·τ", T: "Tₛ",
        read: (tau, us, pm, fc, cost) => `Atraso de ${tau} Tₛ (${us}): margem de fase de ${pm} no cruzamento, em ${fc}. Cada período Tₛ de atraso custa 360°·fc·Tₛ = ${cost}.`,
        unstable: "Instável: não sobra margem de fase.",
        aria1: (n, pm, tau) => `Fase do ganho de malha do ${n} perto do cruzamento, com atraso de ${tau} Tₛ: margem de fase de ${pm}.`,
        aria2: (pm0, slope) => `Margem de fase em função do atraso: ${pm0} sem atraso, caindo ${slope} por período Tₛ.` },
};

export default async function mount(body, options, { lang }) {
  if (options.compare === "conventions") return conventions(body, options, lang);
  const s = TEXT[lang];
  const info = await loadConverter(options.converter || "buck");
  const { converter: c, op, name, PLANT } = info, T = c.T, cname = CONVERTER_NAMES[name];
  const freqs = frequencies(c.bode || DEFAULT_BODE);
  const { chosen, design } = pickDesign(info, options);
  const base = f => c.plant(f, op);
  let control;
  if (chosen && chosen.controller) control = chosen.controller;
  else { design.k = retune(design, T, base); control = designController(design, T); }
  const own = 1 + (PLANT?.DELAY ?? 1) * op.duty;  // in periods
  const withDelay = tau => f => cmul(base(f), cexpj(2 * Math.PI * f * (own - tau) * T));
  const loopAt = tau => response(freqs, withDelay(tau), control, T);

  // phase margin against delay, 0..2T
  const taus = Array.from({ length: 81 }, (_, i) => i / 40);
  const pms = taus.map(tau => { const m = margins(loopAt(tau), freqs); return m ? m.pm : NaN; });
  const m0 = margins(loopAt(0), freqs);
  const fc = m0 ? m0.fc : design.fc, cost = 360 * fc * T;
  let tau = own;

  const ui = frame(body);
  const row = el("div", { class: "w-plots-row" });
  ui.plots.append(row);
  const left = el("div"), right = el("div");
  row.append(left, right);
  const phasePlot = canvasPlot(left, { height: 270, draw: drawPhase });
  left.append(legend([["--loop", s.chosen], ["--running", s.own(cname), "dashed"], ["--plant", s.none, "dashed"]]));
  const pmPlot = canvasPlot(right, { height: 270, draw: drawPm });
  right.append(legend([["--margin", s.pmAxis, "dot"], ["--muted", s.line, "dashed"]]));
  const text = el("p");
  ui.readout.append(text);
  slider(ui.controls, { label: s.delay, min: 0, max: 2, step: 0.01, value: tau, format: v => `${num(v, 2, lang)} Tₛ`,
    oninput: v => { tau = v; update(); } });

  let current = null;
  function update() {
    const curve = loopAt(tau), m = margins(curve, freqs);
    current = { curve, m, ownCurve: loopAt(own), zero: loopAt(0) };
    const pm = m ? deg(m.pm, lang) : "—";
    text.replaceChildren(s.read(num(tau, 2, lang), eng(tau * T, "s", lang), pm, hz(fc, lang), deg(cost, lang)));
    if (!m || m.pm <= 0) text.prepend(el("span", { class: "w-bad", text: s.unstable + " " }));
    phasePlot.label(s.aria1(cname, pm, num(tau, 2, lang)));
    pmPlot.label(s.aria2(m0 ? deg(m0.pm, lang) : "—", deg(cost, lang)));
    phasePlot.render(); pmPlot.render();
  }

  function drawPhase(g, w, h) {
    if (!current) return;
    const lo = Math.max(freqs[0], fc / 6), hi = Math.min(freqs[freqs.length - 1], fc * 6);
    const idx = freqs.map((f, i) => [f, i]).filter(([f]) => f >= lo && f <= hi).map(([, i]) => i);
    const xs = idx.map(i => freqs[i]);
    const pick = cv => idx.map(i => cv.phase[i]);
    const series = [pick(current.zero), pick(current.ownCurve), pick(current.curve)];
    const all = series.flat().filter(Number.isFinite);
    const yLo = Math.floor(Math.min(...all, -200) / 45) * 45, yHi = Math.ceil(Math.max(...all) / 45) * 45;
    const p = panel(g, { left: 44, top: 24, width: w - 52, height: h - 44 }, { min: lo, max: hi, log: true, format: f => decade(f, lang) },
      { min: yLo, max: yHi, ticks: rangeOf(yLo, yHi, yHi - yLo > 270 ? 90 : 45), format: v => num(v, undefined, lang) + "°", label: s.phase });
    hline(g, p, -180);
    vline(g, p, fc, "--margin");
    line(g, p, xs, series[0], { color: "--plant", width: 1.2, dash: [3, 3] });
    line(g, p, xs, series[1], { color: "--running", width: 1.4, dash: [6, 4] });
    line(g, p, xs, series[2], { color: "--loop", width: 2.2 });
    if (current.m) {
      const ph = current.m.cross.phase, level = 360 * Math.round((ph + 180) / 360) - 180, px = p.X(current.m.fc);
      const color = current.m.pm > 0 ? "--margin" : "--bad";
      g.strokeStyle = g.fillStyle = css(color); g.lineWidth = 2;
      g.beginPath(); g.moveTo(px, p.Y(level)); g.lineTo(px, p.Y(ph)); g.stroke();
      tag(g, `${deg(current.m.pm, lang, 0)}`, px + 5, (p.Y(level) + p.Y(ph)) / 2 + 4, color);
    }
  }

  function drawPm(g, w, h) {
    if (!current) return;
    const finite = pms.filter(Number.isFinite);
    const yLo = Math.min(-30, Math.floor(Math.min(...finite) / 30) * 30), yHi = Math.max(30, Math.ceil(Math.max(...finite) / 30) * 30);
    const p = panel(g, { left: 40, top: 24, width: w - 50, height: h - 44 }, { min: 0, max: 2, ticks: [0, 0.5, 1, 1.5, 2], format: v => num(v, undefined, lang) + " Tₛ" },
      { min: yLo, max: yHi, ticks: rangeOf(yLo, yHi, yHi - yLo > 150 ? 60 : 30), format: v => num(v, undefined, lang) + "°", label: s.pmAxis });
    hline(g, p, 0, "--bad", [2, 3]);
    if (m0) line(g, p, [0, 2], [m0.pm, m0.pm - 2 * cost], { color: "--muted", width: 1, dash: [5, 4] });
    p.clip(() => {
      g.fillStyle = css("--margin");
      taus.forEach((t, i) => { if (Number.isFinite(pms[i])) { g.beginPath(); g.arc(p.X(t), p.Y(pms[i]), 1.8, 0, 7); g.fill(); } });
    });
    vline(g, p, own, "--running", [6, 4], 1.4);
    vline(g, p, tau, "--loop", [], 2);
    if (current.m) {
      g.fillStyle = css("--loop"); g.beginPath(); g.arc(p.X(tau), p.Y(current.m.pm), 4.5, 0, 7); g.fill();
    }
  }
  update();
}

// ---- compare=conventions ----
const CONV = {
  en: { D: "D (falling edge)", pick: "Highlight", phase: "loop-gain phase", pmAxis: "phase margin", exact: "exact, sampled",
        names: { te: "(1 + D)·Tₛ", next: "Tₛ + Tₛ/2", same: "Tₛ/2", twice: "(1.5 + D)·Tₛ" },
        long: { te: "trailing edge, next period", next: "symmetric, next peak/valley (ZOH + z⁻¹)", same: "symmetric, same cycle (ZOH)", twice: "ZOH added to (1 + D)·Tₛ (wrong)" },
        why: {
          te: (pm, ex) => `Trailing-edge PWM, duty loaded at the next period: one period of computation, then D·Tₛ to the falling edge, the only one that moves. Margin ${pm} (exact sampled-data model ${ex}).`,
          next: pm => `Symmetric PWM, duty loaded at the next peak or valley: one period of computation, then Tₛ/2 to the midpoint of the two edges that move, for any D. This is the "ZOH + z⁻¹" count; on the trailing-edge PWM it is right only at D = 0.5. Margin ${pm}.`,
          same: pm => `Symmetric PWM, duty written in the same cycle, before the edges it moves: only the modulator's Tₛ/2, the "ZOH". It needs the computation to fit before the first edge. Margin ${pm}.`,
          twice: pm => `The error: the ZOH's Tₛ/2 added to (1 + D)·Tₛ, where D·Tₛ already is the modulator. Margin ${pm}, lower than the loop really has.` },
        aria1: (pm, D) => `Loop-gain phase of the buck near the crossover for four ways of counting the delay, at D = ${D}; highlighted convention's margin ${pm}.`,
        aria2: D => `Phase margin against D for the four conventions; the marker is at D = ${D}.`,
        unstable: "Unstable: no phase margin left." },
  pt: { D: "D (borda de descida)", pick: "Destacar", phase: "fase do ganho de malha", pmAxis: "margem de fase", exact: "exato, amostrado",
        names: { te: "(1 + D)·Tₛ", next: "Tₛ + Tₛ/2", same: "Tₛ/2", twice: "(1,5 + D)·Tₛ" },
        long: { te: "borda de descida, período seguinte", next: "simétrico, pico/vale seguinte (ZOH + z⁻¹)", same: "simétrico, mesmo ciclo (ZOH)", twice: "ZOH somado a (1 + D)·Tₛ (errado)" },
        why: {
          te: (pm, ex) => `PWM de borda de descida, razão cíclica carregada no período seguinte: um período de cálculo e depois D·Tₛ até a borda de descida, a única que se move. Margem de ${pm} (modelo amostrado exato: ${ex}).`,
          next: pm => `PWM simétrico, razão cíclica carregada no pico ou no vale seguinte: um período de cálculo e depois Tₛ/2 até o ponto médio das duas bordas que se movem, para qualquer D. É a conta "ZOH + z⁻¹"; no PWM de borda de descida, só acerta com D = 0,5. Margem de ${pm}.`,
          same: pm => `PWM simétrico, razão cíclica escrita no mesmo ciclo, antes das bordas que ela move: só o Tₛ/2 do modulador, o "ZOH". Exige que o cálculo termine antes da primeira borda. Margem de ${pm}.`,
          twice: pm => `O erro: o Tₛ/2 do ZOH somado a (1 + D)·Tₛ, em que D·Tₛ já é o modulador. Margem de ${pm}, menor do que o laço de fato tem.` },
        aria1: (pm, D) => `Fase do ganho de malha do buck perto do cruzamento para quatro formas de contar o atraso, com D = ${D}; margem da convenção destacada: ${pm}.`,
        aria2: D => `Margem de fase em função de D para as quatro convenções; o marcador está em D = ${D}.`,
        unstable: "Instável: não sobra margem de fase." },
};
const KEYS = ["te", "next", "same", "twice"];
const COLORS = { te: "--loop", next: "--alt1", same: "--alt3", twice: "--bad" };

async function conventions(body, options, lang) {
  const s = CONV[lang];
  const info = await loadConverter(options.converter || "buck");
  if (info.name !== "buck") throw new Error("compare=conventions is for the buck only");
  const { converter: c, op, PLANT } = info, T = c.T;
  const freqs = frequencies(c.bode || DEFAULT_BODE);
  const { chosen, design } = pickDesign(info, options);
  const own = 1 + (PLANT?.DELAY ?? 1) * op.duty;
  const stage = f => cmul(c.plant(f, op), cexpj(2 * Math.PI * f * own * T));  // the averaged stage, no delay
  let control;
  if (chosen && chosen.controller) control = chosen.controller;
  else { design.k = retune(design, T, f => c.plant(f, op)); control = designController(design, T); }
  const sinc = f => { const x = Math.PI * f * T; return x ? Math.sin(x) / x : 1; };
  const models = {
    te: D => f => cmul(stage(f), cexpj(-2 * Math.PI * f * (1 + D) * T)),
    next: () => f => cscale(cmul(stage(f), cexpj(-2 * Math.PI * f * 1.5 * T)), sinc(f)),
    same: () => f => cscale(cmul(stage(f), cexpj(-2 * Math.PI * f * 0.5 * T)), sinc(f)),
    twice: D => f => cscale(cmul(stage(f), cexpj(-2 * Math.PI * f * (1.5 + D) * T)), sinc(f)),
  };
  const exactAt = D => { const P = sampledPlant("buck", PLANT, { ...op, duty: D }, T); return f => plantResponse(P, f, T); };
  const curveOf = (key, D) => response(freqs, key === "exact" ? exactAt(D) : models[key](D), control, T);
  // margins() interpolates between the grid's points; refine its last crossover by bisection on the
  // model itself, so the shown margins match the full-precision ones (39.55° rather than 39.5°)
  const loopOf = (key, D) => { const P = key === "exact" ? exactAt(D) : models[key](D); return f => cmul(controller(f, control, T), P(f)); };
  const refined = (key, D, m) => {
    if (!m) return m;
    const L = loopOf(key, D), mag = f => Math.hypot(L(f).re, L(f).im) - 1;
    let lo = m.fc / 1.05, hi = m.fc * 1.05;
    if (mag(lo) * mag(hi) > 0) return m;
    for (let i = 0; i < 50; i++) { const mid = Math.sqrt(lo * hi); if (mag(lo) * mag(mid) <= 0) hi = mid; else lo = mid; }
    const v = L(lo); let pm = 180 + Math.atan2(v.im, v.re) * 180 / Math.PI;
    pm -= 360 * Math.round(pm / 360);
    return { ...m, fc: lo, pm, cross: { ...m.cross, f: lo, phase: m.cross.phase + (pm - m.pm) } };
  };
  const marginOf = (key, D, cv) => refined(key, D, margins(cv, freqs));
  const pmOf = (key, D) => { const m = marginOf(key, D, curveOf(key, D)); return m ? m.pm : NaN; };

  // margin against D, 0.05..0.95
  const Ds = Array.from({ length: 37 }, (_, i) => 0.05 + i * 0.025);
  const sweep = {};
  for (const key of [...KEYS, "exact"]) { const flat = (key === "next" || key === "same") ? pmOf(key, 0.5) : null; sweep[key] = Ds.map(D => flat ?? pmOf(key, D)); }

  let D = op.duty, pick = "te", current = null;
  const ui = frame(body);
  const row = el("div", { class: "w-plots-row" });
  ui.plots.append(row);
  const left = el("div"), right = el("div");
  row.append(left, right);
  const phasePlot = canvasPlot(left, { height: 270, draw: drawPhase });
  const keyBox = el("div");
  left.append(keyBox);
  const pmPlot = canvasPlot(right, { height: 270, draw: drawPm });
  right.append(legend([["--loop", s.exact, "dotted"]]));
  const text = el("p");
  ui.readout.append(text);
  slider(ui.controls, { label: s.D, min: 0.05, max: 0.95, step: 0.005, value: D, format: v => num(v, 3, lang),
    oninput: v => { D = v; update(); } });
  choice(ui.controls, { label: s.pick, options: KEYS.map(k => [k, s.names[k]]), value: pick, onchange: v => { pick = v; update(); } });

  function update() {
    const curves = {}, m = {};
    for (const key of [...KEYS, "exact"]) { curves[key] = curveOf(key, D); m[key] = marginOf(key, D, curves[key]); }
    current = { curves, m };
    const pm = key => (m[key] ? deg(m[key].pm, lang) : "—");
    keyBox.replaceChildren(legend(KEYS.map(k => [COLORS[k], `${s.names[k]}, ${s.long[k]}: ${pm(k)}`, k === "twice" ? "dashed" : "solid"])));
    text.replaceChildren(pick === "te" ? s.why.te(pm("te"), pm("exact")) : s.why[pick](pm(pick)));
    if (!m[pick] || m[pick].pm <= 0) text.prepend(el("span", { class: "w-bad", text: s.unstable + " " }));
    phasePlot.label(s.aria1(pm(pick), num(D, 3, lang)));
    pmPlot.label(s.aria2(num(D, 3, lang)));
    phasePlot.render(); pmPlot.render();
  }

  function drawPhase(g, w, h) {
    if (!current) return;
    const ref = current.m.te, fc = ref ? ref.fc : design.fc;
    const lo = Math.max(freqs[0], fc / 6), hi = Math.min(freqs[freqs.length - 1], fc * 6);
    const idx = freqs.map((f, i) => [f, i]).filter(([f]) => f >= lo && f <= hi).map(([, i]) => i);
    const xs = idx.map(i => freqs[i]);
    const pickOf = cv => idx.map(i => cv.phase[i]);
    const all = KEYS.flatMap(k => pickOf(current.curves[k])).filter(Number.isFinite);
    const yLo = Math.floor(Math.min(...all, -200) / 45) * 45, yHi = Math.ceil(Math.max(...all) / 45) * 45;
    const p = panel(g, { left: 44, top: 24, width: w - 52, height: h - 44 }, { min: lo, max: hi, log: true, format: f => decade(f, lang) },
      { min: yLo, max: yHi, ticks: rangeOf(yLo, yHi, yHi - yLo > 270 ? 90 : 45), format: v => num(v, undefined, lang) + "°", label: s.phase });
    hline(g, p, -180);
    for (const k of KEYS.filter(k => k !== pick).concat(pick))
      line(g, p, xs, pickOf(current.curves[k]), { color: COLORS[k], width: k === pick ? 2.4 : 1.2, dash: k === "twice" ? [6, 4] : [], alpha: k === pick ? 1 : 0.75 });
    line(g, p, xs, pickOf(current.curves.exact), { color: "--loop", width: 1, dash: [2, 3] });
    const mk = current.m[pick];
    if (mk) {
      const ph = mk.cross.phase, level = 360 * Math.round((ph + 180) / 360) - 180, px = p.X(mk.fc);
      const color = mk.pm > 0 ? COLORS[pick] : "--bad";
      g.strokeStyle = css(color); g.lineWidth = 2;
      g.beginPath(); g.moveTo(px, p.Y(level)); g.lineTo(px, p.Y(ph)); g.stroke();
      tag(g, `${deg(mk.pm, lang)}`, px + 5, (p.Y(level) + p.Y(ph)) / 2 + 4, color);
    }
  }

  function drawPm(g, w, h) {
    if (!current) return;
    const finite = Object.values(sweep).flat().filter(Number.isFinite);
    const yLo = Math.min(0, Math.floor(Math.min(...finite) / 15) * 15), yHi = Math.ceil(Math.max(...finite) / 15) * 15;
    const p = panel(g, { left: 40, top: 24, width: w - 50, height: h - 44 }, { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], format: v => num(v, undefined, lang) },
      { min: yLo, max: yHi, ticks: rangeOf(yLo, yHi, yHi - yLo > 60 ? 15 : 10), format: v => num(v, undefined, lang) + "°", label: s.pmAxis });
    if (yLo < 0) hline(g, p, 0, "--bad", [2, 3]);
    vline(g, p, 0.5, "--muted", [2, 3]);
    for (const k of KEYS.filter(k => k !== pick).concat(pick))
      line(g, p, Ds, sweep[k], { color: COLORS[k], width: k === pick ? 2.4 : 1.2, dash: k === "twice" ? [6, 4] : [] });
    line(g, p, Ds, sweep.exact, { color: "--loop", width: 1, dash: [2, 3] });
    vline(g, p, D, "--text", [], 1);
    for (const k of KEYS) {
      const mk = current.m[k];
      if (!mk) continue;
      g.fillStyle = css(COLORS[k]); g.beginPath(); g.arc(p.X(D), p.Y(mk.pm), k === pick ? 4.5 : 3, 0, 7); g.fill();
    }
  }
  update();
}

function rangeOf(lo, hi, step) { const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v); return out; }
