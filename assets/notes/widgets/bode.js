// {{widget bode converter=buck design=2p2z}}: the loop gain's Bode plot, with the plant (dashed),
// crossover, phase and gain margins, and sliders for the 2p2z or PID design: the oscilloscope's
// Bode window, drawn by the same code (assets/pcl/plot.js), with the pointer's readout.
// Options: converter (buck | boost | buckboost), design (a controller id of scenarios.json, or
// custom), fc, fz1, fz2, fp (Hz) and form (2p2z | pid) on top of the design, sliders (1 | 0),
// show (both | loop | plant).
import { DEFAULT_BODE, FORMULAS, frequencies, designController, retune, response, margins, sameController, coefficients, pidEquivalent } from "../../pcl/loop.js";
import { drawBode, bodeLegend, marginsGrid, cellsGrid, hzText } from "../../pcl/plot.js";
import { loadConverter, pickDesign, tr, num, hz, deg, el, canvasPlot, slider, choice, scopeLink, localNumber, CONVERTER_NAMES } from "./common.js";

const TEXT = {
  en: { magAxis: "magnitude (dB)", phAxis: "phase (°)", fAxis: "frequency (Hz)", plant: "plant (duty → Vout)", loop: "loop gain", design: "loop gain, design", simulated: "loop gain, as simulated",
        fc: "Crossover", fz1: "Zero 1", fz2: "Zero 2", fp: "Pole", form: "Form", pid: "PID", "2p2z": "2p2z",
        crossover: "crossover", pm: "phase margin", gm: "gain margin", none: "no crossover", at: "at", rowDesign: "Design", rowSim: "As simulated",
        PM: "PM", GM: "GM", open: "open the simulation", unstable: "Unstable: the closed loop oscillates.",
        coeffs: "Coefficients", title: "Loop gain", titlePlant: "Plant", formRow: "Firmware form", details: "Formula, PID gains and 2p2z coefficients",
        form2p2z: "2p2z, velocity form", formPid: "PID, integrator clamp", gains: "PID gains", equivalent: "PID equivalent (continuous time)",
        as2p2z: "the same as 2p2z coefficients, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)", coefficients: "2p2z coefficients, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)",
        aria: (n, m) => `Bode plot of the ${n} loop gain: ${m}.`, ariaPlant: n => `Bode plot of the ${n} plant, duty to output voltage.`,
        moved: "Moving a slider replaces the original controller by a design with these zeros and pole." },
  pt: { magAxis: "módulo (dB)", phAxis: "fase (°)", fAxis: "frequência (Hz)", plant: "planta (razão cíclica → Vout)", loop: "ganho de malha", design: "ganho de malha, projeto", simulated: "ganho de malha, como simulado",
        fc: "Cruzamento", fz1: "Zero 1", fz2: "Zero 2", fp: "Polo", form: "Forma", pid: "PID", "2p2z": "2p2z",
        crossover: "cruzamento", pm: "margem de fase", gm: "margem de ganho", none: "sem cruzamento", at: "em", rowDesign: "Projeto", rowSim: "Como simulado",
        PM: "MF", GM: "MG", open: "abrir a simulação", unstable: "Instável: a malha fechada oscila.",
        coeffs: "Coeficientes", title: "Ganho de malha", titlePlant: "Planta", formRow: "Forma no *firmware*", details: "Fórmula, ganhos do PID e coeficientes 2p2z",
        form2p2z: "2p2z, forma de velocidade", formPid: "PID, integrador limitado", gains: "Ganhos do PID", equivalent: "PID equivalente (tempo contínuo)",
        as2p2z: "os mesmos, como coeficientes 2p2z, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)", coefficients: "Coeficientes 2p2z, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)",
        aria: (n, m) => `Diagrama de Bode do ganho de malha do ${n}: ${m}.`, ariaPlant: n => `Diagrama de Bode da planta do ${n}, da razão cíclica à tensão de saída.`,
        moved: "Mover um controle troca o controlador original por um projeto com estes zeros e polo." },
};

export function describeMargins(m, s, lang) {
  if (!m) return s.none;
  return `${s.crossover} ${hz(m.fc, lang)}, ${s.pm} ${deg(m.pm, lang)}, ${s.gm} ${m.gm === null ? "—" : num(m.gm, 1, lang) + " dB"}`;
}

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang], fmt = localNumber(lang);
  const info = await loadConverter(options.converter || "buck");
  const { converter: c, op, name } = info, T = c.T;
  const BODE = c.bode || DEFAULT_BODE, freqs = frequencies(BODE);
  const plant = f => c.plant(f, op);
  const { chosen, design } = pickDesign(info, options);
  const show = ["loop", "plant", "both"].includes(options.show) ? options.show : "both";
  const withSliders = options.sliders !== "0" && show !== "plant";
  let showDesign = !chosen || !!chosen.design;  // a controller without a design shows only itself, until a slider moves
  const running = chosen ? chosen.controller : null;
  design.k = retune(design, T, plant);

  // The Bode window: title bar, plot, then legend, margins, form, sliders and coefficients.
  body.classList.add("w");
  const ohms = r => r >= 1000 ? `${fmt(Number((r / 1000).toPrecision(3)))} kΩ` : `${fmt(Number(r.toPrecision(3)))} Ω`;
  const win = el("div", { class: "w-panel w-window" });
  win.append(el("div", { class: "w-window-head" }, el("span", { class: "w-window-title", text: show === "plant" ? s.titlePlant : s.title }),
    el("span", { class: "w-window-op", text: c.describe(op, ohms, fmt) })));
  body.append(win);
  let data = null;
  const plot = canvasPlot(win, { height: 340, hover: true, draw });
  const winBody = el("div", { class: "w-window-body" });
  win.append(winBody);
  const keys = el("div", { class: "w-legend", "aria-hidden": "true" });
  const table = el("div", { class: "w-grid-table" });
  const note = el("p", { class: "w-note", "aria-live": "polite" });
  winBody.append(keys);
  if (show !== "plant") winBody.append(table);
  let formSwitch = null;
  const sliders = {};
  if (withSliders) {
    formSwitch = choice(winBody, { label: s.formRow, options: [["2p2z", s.form2p2z], ["pid", s.formPid]], value: design.form,
      onchange: v => { design.form = v; design.k = retune(design, T, plant); showDesign = true; update(); } });
    for (const key of ["fc", "fz1", "fz2", "fp"]) {
      const [low, high] = BODE.sliders[key];
      sliders[key] = slider(winBody, { label: s[key], min: low, max: high, value: design[key], log: true, format: f => hzText(f, fmt),
        oninput: f => {
          if (key === "fp") f = Math.max(f, 1.2 * Math.max(design.fz1, design.fz2));  // pole above both zeros:
          else if (key !== "fc") f = Math.min(f, design.fp / 1.2);                     // KP and KD stay positive
          design[key] = f;
          design.k = retune(design, T, plant);
          showDesign = true;
          update();
        } });
    }
  }
  const formula = el("div", { class: "w-formula" }), pid = el("div", { class: "w-pid" });
  if (show !== "plant") winBody.append(el("details", { open: true }, el("summary", { text: s.details }), formula, pid));
  winBody.append(note);
  const foot = el("div", { class: "w-foot" });
  body.append(foot);
  if (chosen) foot.append(scopeLink(lang, name, `${chosen.id}-load`, s.open));

  function compute() {
    const control = designController(design, T);
    const applied = running && showDesign && sameController(control, running);
    const curves = {
      plant: show !== "loop" ? response(freqs, plant, null, T) : null,
      design: show !== "plant" && showDesign ? response(freqs, plant, control, T) : null,
      running: show !== "plant" && running && !applied ? response(freqs, plant, running, T) : null,
    };
    data = { control, applied, curves, margins: { design: curves.design && margins(curves.design, freqs), running: curves.running && margins(curves.running, freqs) } };
  }

  function update() {
    compute();
    const { margins: m, curves, control } = data;
    const rows = [];
    if (curves.design) rows.push([s.rowDesign, m.design]);
    if (curves.running) rows.push([s.rowSim, m.running]);
    table.innerHTML = marginsGrid(["", s.crossover, s.pm, s.gm], rows, { none: s.none, at: (gm, f) => `${gm} dB ${s.at} ${f}` }, fmt);
    const shown = curves.design ? control : running;
    if (show !== "plant" && shown) {
      // as the oscilloscope's details: the formula, the PID gains, the 2p2z coefficients
      const [b0, b1, b2, p] = coefficients(shown, T);
      const values = shown === control ? pidEquivalent(design, T) : shown.form === "pid" ? shown.values : null;
      const isPid = shown === control ? design.form === "pid" : shown.form === "pid";
      formula.textContent = curves.design ? tr(FORMULAS[design.form], lang) : "";
      formula.hidden = !curves.design;
      pid.innerHTML = (values ? `<span class="title">${isPid ? s.gains : s.equivalent}</span>` +
          cellsGrid(["K_P (1/V)", "K_I (1/(V·s))", "K_D (µs/V)", "T_F (µs)"], [values[0], values[1], values[2] * 1e6, values[3] * 1e6].map(v => fmt(Number(v.toPrecision(3))))) : "") +
        `<span class="title">${isPid ? s.as2p2z : s.coefficients}</span>` +
        cellsGrid(["b0", "b1", "b2", "a1", "a2"], [b0, b1, b2, -(1 + p), p].map(v => fmt(v.toPrecision(5))));
    }
    const main = m.design || m.running;
    const unstable = show !== "plant" && (!main || main.pm <= 0 || (main.gm !== null && main.gm <= 0));
    note.replaceChildren(...(unstable ? [el("span", { class: "w-bad", text: s.unstable })] : []),
      ...(!showDesign && withSliders ? [(unstable ? " " : "") + s.moved] : []));
    note.hidden = !note.textContent;
    plot.label(show === "plant" ? s.ariaPlant(CONVERTER_NAMES[name]) : s.aria(CONVERTER_NAMES[name], describeMargins(main, s, lang)));
    for (const [key, sl] of Object.entries(sliders)) sl.set(design[key]);
    if (formSwitch) formSwitch.set(design.form);
    plot.render();
  }

  function draw(g, w, h, pointer) {
    if (!data) return;
    const { curves, margins: m } = data;
    const i = drawBode(g, w, h, { freqs, range: BODE, curves, marks: curves.design ? design : null,
      margin: show === "plant" ? null : m.design || m.running, hover: pointer ? pointer.x : null, labels: { pm: s.PM, gm: s.GM }, fmt });
    const items = [];
    if (curves.plant) items.push(["--plant", s.plant, "dashed", curves.plant]);
    if (curves.design) items.push(["--loop", running && !data.applied ? s.design : s.loop, "solid", curves.design]);
    if (curves.running) items.push(["--running", s.simulated, "solid", curves.running]);
    keys.innerHTML = bodeLegend(items, i, freqs, fmt, lang);
  }
  update();
}
