// {{widget step converter=buck design=2p2z event=load}}: the closed loop's step response, computed in
// the browser by switched.js: the switched circuit of the converter's netlist (switches with their
// Ron, body diodes in the dead time, inductor and capacitor with their resistances, the load as a
// conductance) integrated exactly interval by interval, under the firmware of scenario.cpp (ADC of
// vfs and bits, the 2p2z or PID exactly as it runs, the duty's clamp at [dmin, dmax], one period of
// computation latency, trailing-edge PWM with the dead time) and the scenario's commands and slews.
// Plots V(out) with its switching ripple, I(L) and the duty against time as the oscilloscope's
// charts (from the step, its trigger; the pointer reads every trace), and links to the same
// scenario simulated in QSPICE, which it matches within a few mV and tens of mA (see switched.js).
// Options: converter (buck | boost | buckboost), design (a controller id of scenarios.json, or
// custom, with fc, fz1, fz2, fp, form), event (vref | load | vin | vref-step).
import { designController, retune } from "../../pcl/loop.js";
import { simulateSwitched, circuitOf } from "./switched.js";
import { loadConverter, pickDesign, tr, css, eng, el, frame, scopeLink, scopeCharts, bucketsOf, stairs, valueAt, timeLabel, reading, niceStep, CONVERTER_NAMES } from "./common.js";

const TEXT = {
  en: { vout: "V(out)", vref: "V(ref)", il: "I(L)", duty: "duty", time: "ms", open: "compare with the QSPICE simulation",
        div: d => `${d}/div`, periods: n => `${n} periods`, trigger: "trigger: the step",
        charts: ["Output voltage and reference", "Inductor current", "Duty"],
        read: (peak, settle, ref) => `${ref ? "Overshoot past the final value" : "Largest deviation from the final value"}: ${peak}. Settled after ${settle}. (Both on the output's average over each period.)`,
        ripple: (v, i) => `Switching ripple before the step: ${v} in V(out), ${i} in I(L), peak to peak.`,
        never: "it does not settle in this window", clamp: "The duty hits its limit.",
        unstable: "The loop does not settle: it oscillates.", event: { vref: "reference", load: "load", vin: "input", "vref-step": "reference" },
        aria: (n, ev, peak, settle) => `Step response of the ${n} to a ${ev} step: output voltage, inductor current and duty against time; largest deviation ${peak}, settling ${settle}.`,
        model: "Switched circuit simulated in the browser: the netlist's switches and their resistance, the body diodes in the dead time, the inductor and capacitor with their resistances; the firmware's ADC, controller, duty clamp and one period of computation delay, with trailing-edge PWM." },
  pt: { vout: "V(out)", vref: "V(ref)", il: "I(L)", duty: "razão cíclica", time: "ms", open: "comparar com a simulação no QSPICE",
        div: d => `${d}/div`, periods: n => `${n} períodos`, trigger: "disparo: o degrau",
        charts: ["Tensão de saída e referência", "Corrente no indutor", "Razão cíclica"],
        read: (peak, settle, ref) => `${ref ? "Sobressinal além do valor final" : "Maior desvio em relação ao valor final"}: ${peak}. Acomodada após ${settle}. (Ambos na média da saída em cada período.)`,
        ripple: (v, i) => `Ondulação do chaveamento antes do degrau: ${v} em V(out), ${i} em I(L), de pico a pico.`,
        never: "não se acomoda nesta janela", clamp: "A razão cíclica chega ao limite.",
        unstable: "A malha não se acomoda: ela oscila.", event: { vref: "referência", load: "carga", vin: "entrada", "vref-step": "referência" },
        aria: (n, ev, peak, settle) => `Resposta ao degrau de ${ev} do ${n}: tensão de saída, corrente no indutor e razão cíclica no tempo; maior desvio ${peak}, acomodação ${settle}.`,
        model: "Circuito chaveado simulado no navegador: as chaves do netlist e sua resistência, os diodos de corpo no tempo morto, o indutor e o capacitor com suas resistências; o ADC, o controlador, o limite da razão cíclica e um período de atraso de cálculo do firmware, com PWM de borda de descida." },
};

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang];
  const info = await loadConverter(options.converter || "buck");
  const { converter: c, op, name, spec } = info, T = c.T, cname = CONVERTER_NAMES[name];
  const event = ["vref", "load", "vin", "vref-step"].includes(options.event) ? options.event : "load";
  const { chosen, design } = pickDesign(info, options);
  let control = chosen && chosen.controller;
  if (!control) { design.k = retune(design, T, f => c.plant(f, op)); control = designController(design, T); }
  const scenario = spec.scenarios.find(x => x.id === `${chosen ? chosen.id : "2p2z"}-${event}`) ||
                   spec.scenarios.find(x => x.event === event) || { step: [event, op.vref] };
  const sim = spec.simulation || {}, defaults = { ...spec.defaults, ...(scenario.initial || {}) };
  const circuit = circuitOf(spec);
  const pre = sim.pre ?? 40, periods = spec.periods ?? 400;
  const [key, value] = scenario.step;
  const out = simulateSwitched({
    name, circuit, vin: defaults.vin, vref: defaults.vref, r: defaults.load, control,
    slew: defaults.slew ?? 0, vinSlew: defaults.vinSlew ?? 0, periods, events: [{ k: pre, key, value }],
  });
  const t0 = pre * T, n = out.n;
  const vavg = Array.from(out.vavg);

  // settling, on the period averages: deviation from the final value (mean of the last 10% of the window)
  const tail = vavg.slice(-Math.round(periods / 10)), final = tail.reduce((a, b) => a + b, 0) / tail.length;
  const before = vavg[pre - 1], size = Math.max(Math.abs(final - before), 0.01 * Math.abs(final));
  let peak = 0, settleK = null;
  // a load or input step: the largest deviation; a reference step: the overshoot past the final value
  const sign = Math.sign(final - before);
  for (let k = pre; k < periods; k++) peak = Math.max(peak, key === "vref" ? sign * (vavg[k] - final) : Math.abs(vavg[k] - final));
  // the band: 2% of the change (or of the peak deviation, for a load step), but at least 1.5 ADC LSB
  const band = Math.max(0.02 * Math.max(size, peak), 1.5 * circuit.vfs / (2 ** circuit.bits - 1));
  for (let k = periods - 1; k >= pre; k--) if (Math.abs(vavg[k] - final) > band) { settleK = k + 1; break; }
  const finite = vavg.every(Number.isFinite);
  const swing = Math.max(...tail) - Math.min(...tail);
  const oscillates = !finite || swing > Math.max(0.05 * size, 2 * band);
  const settled = !oscillates && settleK !== null && settleK < periods - 1;
  const clamps = out.dutyK.some(d => d <= circuit.dmin + 1e-9 || d >= circuit.dmax - 1e-9);
  // ripple: peak to peak over the periods before the step, averaged
  const rippleOf = v => {
    let sum = 0, count = 0, lo = Infinity, hi = -Infinity, k = 0;
    for (let i = 0; i < n && out.t[i] < t0; i++) {
      const kk = Math.min(periods - 1, Math.floor(out.t[i] / T + 1e-9));
      if (kk !== k) { if (k >= 5) { sum += hi - lo; count++; } k = kk; lo = Infinity; hi = -Infinity; }
      lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]);
    }
    return count ? sum / count : 0;
  };

  const ui = frame(body);
  // Times in µs from the step, as the oscilloscope shows a frame from its trigger.
  const us = Float64Array.from(out.t.subarray(0, n), t => (t - t0) * 1e6);
  const kus = Array.from(out.tk, t => (t - t0) * 1e6), end = (periods - pre) * T * 1e6;
  const vrefs = Array.from(out.vref), duties = Array.from(out.dutyK);
  const xmin = us[0], xmax = end, span = xmax - xmin;
  const toolbar = el("div", { class: "w-toolbar" });
  ui.plots.append(toolbar);
  const charts = scopeCharts(ui.plots, { lang, x: {
      min: xmin, max: xmax, step: niceStep(span, 8), trigger: 0,
      label: v => timeLabel(v, span, f), cursor: v => timeLabel(v, span, f, 2) },
    charts: [
      { height: 190, aria: "", unit: "V", mode: "detail", series: [
        { label: s.vout, color: "--vout", data: (a, b, w) => bucketsOf(us, out.vout, n, a, b, w), at: v => valueAt(us, out.vout, v, n), read: v => reading(v, "V", f) },
        { label: s.vref, color: "--vref", style: { dash: [5, 3], width: 1.2, order: -1 }, data: () => stairs(kus, vrefs, end), at: v => valueAt(kus, vrefs, v, kus.length, true), read: v => reading(v, "V", f) }] },
      { height: 150, aria: "", unit: "A", mode: "detail", series: [
        { label: s.il, color: "--il", data: (a, b, w) => bucketsOf(us, out.il, n, a, b, w), at: v => valueAt(us, out.il, v, n), read: v => reading(v, "A", f) }] },
      { height: 140, aria: "", unit: "", mode: "detail", series: [
        { label: s.duty, color: "--lg", style: { width: 1.6 }, data: () => stairs(kus, duties, end), at: v => valueAt(kus, duties, v, kus.length, true), read: v => f(v.toFixed(3)) }],
        extra: (g, y, p) => {  // the duty's clamp
          g.strokeStyle = css("--bad"); g.lineWidth = 1; g.setLineDash([2, 3]);
          for (const lim of [circuit.dmin, circuit.dmax]) { const py = y(lim); if (py >= p.top && py <= p.bottom) { g.beginPath(); g.moveTo(p.left, py); g.lineTo(p.right, py); g.stroke(); } }
          g.setLineDash([]);
        } }] });
  const f = charts.fmt;
  toolbar.append(el("span", { text: s.div(eng(niceStep(span, 8) * 1e-6, "s", lang)) }),
    el("span", { text: `${s.periods(periods)} · ${s.trigger} · ${tr(spec.events.find(e => e.id === event)?.label, lang) || s.event[event]}` }));
  const peakText = eng(Math.max(peak, 0), "V", lang), settleText = settled ? eng((settleK - pre) * T, "s", lang) : s.never;
  const p = el("p", { text: oscillates ? s.unstable : s.read(peakText, settleText, key === "vref") });
  if (oscillates) p.className = "w-bad";
  ui.readout.append(p);
  if (!oscillates) ui.readout.append(el("p", { text: s.ripple(eng(rippleOf(out.vout), "V", lang), eng(rippleOf(out.il), "A", lang)) }));
  if (clamps) ui.readout.append(el("p", { class: "w-note", text: s.clamp }));
  ui.readout.append(el("p", { class: "w-note", text: s.model }));
  ui.controls.remove();
  ui.foot.append(scopeLink(lang, name, scenario.id || `2p2z-${event}`, s.open));
  const aria = s.aria(cname, s.event[event], peakText, settleText);
  s.charts.forEach((name, i) => charts.label(i, `${name}. ${aria}`));

}
