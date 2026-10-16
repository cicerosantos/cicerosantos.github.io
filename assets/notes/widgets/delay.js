// {{widget delay converter=buck design=2p2z}}: what the loop's delay costs in phase margin. A slider
// sets the delay from 0 to 2T; the loop gain's phase near the crossover moves down, and the phase
// margin falls on a straight line, 360°·fc·T per period of delay.
// Options: converter (buck | boost | buckboost), design (a controller id of scenarios.json, or custom,
// with fc, fz1, fz2, fp, form).
//
// The plant's own delay, from converter.js, is (1 + DELAY·D)·T. The figure divides the plant by
// that term and multiplies by e^(−jωτ) with the chosen τ; the rest of the plant (including the boost's
// and buck-boost's ESR sample term) is kept.
import { DEFAULT_BODE, frequencies, designController, retune, response, margins } from "../../pcl/loop.js";
import { cmul, cexpj } from "/power-labs/complex.js";
import { loadConverter, pickDesign, num, hz, deg, decade, eng, css, el, canvasPlot, panel, line, hline, vline, tag, legend, slider, frame, CONVERTER_NAMES } from "./common.js";

const TEXT = {
  en: { delay: "Loop delay", phase: "loop-gain phase", own: n => `the ${n}'s own delay`, chosen: "chosen delay", none: "no delay",
        pmAxis: "phase margin", line: "360°·fc·τ line", T: "Tₛ",
        read: (tau, us, pm, fc, cost) => `Delay ${tau} Tₛ (${us}): phase margin ${pm} at the crossover, ${fc}. Each period Tₛ of delay costs 360°·fc·Tₛ = ${cost}.`,
        unstable: "Unstable: no phase margin left.",
        aria1: (n, pm, tau) => `Loop-gain phase of the ${n} near the crossover with a delay of ${tau} Tₛ: phase margin ${pm}.`,
        aria2: (pm0, slope) => `Phase margin against delay: ${pm0} with no delay, falling by ${slope} per period Tₛ.` },
  pt: { delay: "Atraso da malha", phase: "fase do ganho de malha", own: n => `atraso próprio do ${n}`, chosen: "atraso escolhido", none: "sem atraso",
        pmAxis: "margem de fase", line: "reta 360°·fc·τ", T: "Tₛ",
        read: (tau, us, pm, fc, cost) => `Atraso de ${tau} Tₛ (${us}): margem de fase de ${pm} no cruzamento, em ${fc}. Cada período Tₛ de atraso custa 360°·fc·Tₛ = ${cost}.`,
        unstable: "Instável: não sobra margem de fase.",
        aria1: (n, pm, tau) => `Fase do ganho de malha do ${n} perto do cruzamento, com atraso de ${tau} Tₛ: margem de fase de ${pm}.`,
        aria2: (pm0, slope) => `Margem de fase em função do atraso: ${pm0} sem atraso, caindo ${slope} por período Tₛ.` },
};

export default async function mount(body, options, { lang }) {
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

function rangeOf(lo, hi, step) { const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v); return out; }
