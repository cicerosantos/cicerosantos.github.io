// {{widget quantization converter=buck adc=12 dpwm=10}}: limit cycles from the ADC's and the DPWM's
// resolution. The same switched-circuit simulation as the step figure (switched.js: ripple, dead
// time, the firmware's controller and latency), in steady state, with the ADC quantizing the output
// (full scale vfs of scenarios.json) and the DPWM quantizing the duty. The reference is rounded to
// an ADC code, as a firmware working in counts would, so that a zero-error bin exists (the site's
// firmware compares volts: its 9 V sits between two codes). With
// an integrator, the loop can rest only if some DPWM level puts the output inside the ADC's zero-error
// bin: Vin·ΔD must be smaller than the ADC's LSB. Otherwise the duty hunts between levels.
// Options: converter (buck), adc (bits, 8 to 16; default 12), dpwm (bits, 6 to 16; default 10).
import { retune, designController } from "../../pcl/loop.js";
import { simulateSwitched, circuitOf } from "./switched.js";
import { loadConverter, num, eng, el, css, slider, toggle, frame, niceRange, scopeCharts, stairs, valueAt, niceStep } from "./common.js";

const TEXT = {
  en: { adc: "ADC", dpwm: "DPWM", bits: "bits", integ: "Integrator in the controller", vout: "V(out) − V(ref), sampled", duty: "duty, DPWM counts",
        lsb: (a, d) => `ADC LSB ${a}; DPWM step in output volts, Vin·ΔD = ${d}.`,
        holds: "Vin·ΔD < ADC LSB: the no-limit-cycle condition holds.", fails: "Vin·ΔD ≥ ADC LSB: the condition fails, and with the integrator the duty cannot rest.",
        noInt: "Without the integrator (its pole moved from z = 1 to a leak that leaves a DC loop gain of 0.5), the condition above no longer applies, and a static error remains.",
        cycle: (pp, dd, n) => `Limit cycle: the output swings ${pp} peak to peak, the duty over ${dd} DPWM ${dd === 1 ? "count" : "counts"}${n ? `, repeating every ${n} periods` : ""}.`,
        still: v => `No limit cycle: the duty rests on one DPWM level; the output's error is ${v}.`,
        aria: (txt) => `The last 200 periods of the buck in steady state. ${txt}`, adcBins: "ADC levels", period: "periods",
        div: n => `${n} periods/div`, window: n => `the last ${n} periods, in steady state; one sample per period`,
        model: "Switched circuit (ripple, dead time) under the firmware's 2p2z, sampled once per period; the reference is rounded to an ADC code, as a firmware working in counts would." },
  pt: { adc: "ADC", dpwm: "DPWM", bits: "bits", integ: "Integrador no controlador", vout: "V(out) − V(ref), amostrada", duty: "razão cíclica, contagens do DPWM",
        lsb: (a, d) => `LSB do ADC: ${a}; passo do DPWM em volts na saída, Vin·ΔD = ${d}.`,
        holds: "Vin·ΔD < LSB do ADC: a condição para não haver ciclo-limite é satisfeita.", fails: "Vin·ΔD ≥ LSB do ADC: a condição não é satisfeita, e com o integrador a razão cíclica não consegue parar.",
        noInt: "Sem o integrador (seu polo passa de z = 1 para uma fuga que deixa ganho de malha de 0,5 em CC), a condição acima deixa de valer, e fica um erro estático.",
        cycle: (pp, dd, n) => `Ciclo-limite: a saída oscila ${pp} de pico a pico, e a razão cíclica percorre ${dd} ${dd === 1 ? "contagem" : "contagens"} do DPWM${n ? `, repetindo-se a cada ${n} períodos` : ""}.`,
        still: v => `Sem ciclo-limite: a razão cíclica para num nível do DPWM; o erro da saída é de ${v}.`,
        aria: (txt) => `Os últimos 200 períodos do buck em regime. ${txt}`, adcBins: "níveis do ADC", period: "períodos",
        div: n => `${n} períodos/div`, window: n => `os últimos ${n} períodos, em regime; uma amostra por período`,
        model: "Circuito chaveado (ondulação, tempo morto) sob o 2p2z do firmware, amostrado uma vez por período; a referência é arredondada para um código do ADC, como faria um firmware que trabalha em contagens." },
};

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang];
  const info = await loadConverter(options.converter === "buck" || !options.converter ? "buck" : options.converter);
  const { converter: c, op, name, spec } = info, T = c.T, circuit = circuitOf(spec);
  const sim = spec.simulation || {}, vfs = sim.vfs ?? 20;
  const chosen = spec.controllers.find(x => x.id === "2p2z");
  const design = { ...(chosen.design || c.design), k: null };
  design.k = retune(design, T, f => c.plant(f, op));
  const control = chosen.controller || designController(design, T);
  let adc = clampInt(+options.adc || 12, 8, 16), dpwm = clampInt(+options.dpwm || 10, 6, 16), integrator = true, data = null;
  const SHOW = 200, RUN = 1200;
  // Without the integrator its pole moves from z = 1 to a leak that leaves a DC loop gain of 0.5.
  const [b0, b1, b2, a] = control.values, leak = 1 - op.vin * (b0 + b1 + b2) / ((1 - a) * 0.5);

  const ui = frame(body);
  const step = niceStep(SHOW, 8);
  ui.plots.append(el("div", { class: "w-toolbar" }, el("span", { text: s.div(step) }), el("span", { text: s.window(SHOW) })));
  const at = key => v => data ? valueAt(data.k, data[key], v, SHOW, key === "counts") : NaN;
  const charts = scopeCharts(ui.plots, { lang, x: { min: 0, max: SHOW, step, trigger: null, label: v => f(v), cursor: v => `${f(Math.round(v))} Tₛ` },
    charts: [
      { height: 190, aria: "", unit: "mV", series: [
        { label: s.vout, color: "--vout", style: { width: 1.6 }, data: () => ({ points: data.k.map((k, i) => [k, data.err[i]]), min: 0, max: 0 }), at: at("err"), read: v => `${f(v.toFixed(2))} mV` },
        { label: s.adcBins, color: "--muted", style: { dash: [4, 3], width: 1 }, data: () => ({ points: [], min: 0, max: 0 }), at: () => NaN, read: () => "" }],
        range: () => data.range,
        extra: (g, y, p) => {
          // the ADC's decision levels: bins centred on the codes, edges half an LSB off; V(ref) sits on a code only by chance
          const lsb = data.lsb, vref = op.vref;
          g.lineWidth = 1;
          g.strokeStyle = css("--muted"); g.setLineDash([4, 3]);
          const top = data.range[1], bottom = data.range[0];
          if ((top - bottom) / (lsb * 1e3) < 60) {
            const first = Math.ceil(((bottom / 1e3 + vref) / lsb) - 0.5), last = Math.floor(((top / 1e3 + vref) / lsb) - 0.5);
            for (let n = first; n <= last; n++) { const py = y(((n + 0.5) * lsb - vref) * 1e3); g.beginPath(); g.moveTo(p.left, py); g.lineTo(p.right, py); g.stroke(); }
          }
          g.setLineDash([]); g.strokeStyle = css("--muted");
          g.beginPath(); g.moveTo(p.left, y(0)); g.lineTo(p.right, y(0)); g.stroke();
        } },
      { height: 150, aria: "", unit: "", minStep: 1, series: [
        { label: s.duty, color: "--lg", style: { width: 1.6 }, data: () => stairs(data.k, data.counts, SHOW), at: at("counts"), read: v => f(Math.round(v)) }],
        range: () => niceRange(Math.min(...data.counts) - 1, Math.max(...data.counts) + 1, 3) }] });
  const f = charts.fmt;
  const lsbText = el("p"), cond = el("p"), seen = el("p");
  ui.readout.append(lsbText, cond, seen, el("p", { class: "w-note", text: s.model }));
  slider(ui.controls, { label: `${s.adc} (${s.bits})`, min: 8, max: 16, step: 1, value: adc, format: v => `${v} ${s.bits}`, oninput: v => { adc = v; update(); } });
  slider(ui.controls, { label: `${s.dpwm} (${s.bits})`, min: 6, max: 16, step: 1, value: dpwm, format: v => `${v} ${s.bits}`, oninput: v => { dpwm = v; update(); } });
  toggle(ui.controls, { label: s.integ, checked: integrator, onchange: v => { integrator = v; update(); } });

  function update() {
    const out = simulateSwitched({ name, circuit: { ...circuit, bits: adc }, vin: op.vin, vref: op.vref, r: op.r, control,
      dpwmBits: dpwm, integrator, refOnCode: true, leak, slew: 0, vinSlew: 0, warmup: RUN - SHOW, periods: SHOW, points: 1 });
    const k = Array.from({ length: SHOW }, (_, i) => i);
    const err = Array.from(out.y, v => (v - op.vref) * 1e3);  // mV
    const counts = Array.from(out.dutyK, d => d * 2 ** dpwm);
    const lsb = vfs / (2 ** adc - 1), step = op.vin / 2 ** dpwm;
    data = { k, err, counts, lsb };
    const lsbmV = lsb * 1e3, span = Math.max(3 * lsbmV, Math.max(...err.map(Math.abs)) * 1.2);
    data.range = niceRange(-span, span, 4);
    lsbText.textContent = s.lsb(eng(lsb, "V", lang), eng(step, "V", lang));
    cond.replaceChildren(integrator ? el("span", { class: step < lsb ? "w-ok" : "w-bad", text: step < lsb ? s.holds : s.fails }) : el("span", { text: s.noInt }));
    const dd = Math.round(Math.max(...counts) - Math.min(...counts)), pp = Math.max(...err) - Math.min(...err);
    let period = null;
    if (dd > 0) for (let n = 1; n <= 100 && !period; n++) if (counts.every((v, i) => i + n >= counts.length || Math.abs(v - counts[i + n]) < 1e-9)) period = n;
    const mean = err.reduce((a, b) => a + b, 0) / err.length;
    seen.textContent = dd > 0 ? s.cycle(eng(pp * 1e-3, "V", lang), dd, period) : s.still(eng(mean * 1e-3, "V", lang));
    charts.label(0, s.aria(`${lsbText.textContent} ${seen.textContent}`));
    charts.label(1, `${s.duty}. ${seen.textContent}`);
    charts.render();
  }

  update();
}

function clampInt(v, lo, hi) { return Math.min(hi, Math.max(lo, Math.round(v))); }
