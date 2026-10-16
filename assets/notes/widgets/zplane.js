// {{widget zplane converter=buck design=2p2z}}: the z-plane with the unit circle, the controller's
// poles (×) and zeros (○), the plant's, and the closed-loop poles of plant·controller, which follow
// the 2p2z's zeros and pole as the sliders move them.
// Options: converter (buck | boost | buckboost), design (a controller id of scenarios.json, or custom,
// with fc, fz1, fz2, fp, form).
//
// The plant in z is discrete.js's sampled-data model of the converter's averaged power stage
// (converter.js PLANT at the operating point of scenarios.json's defaults): sampled exactly, with the
// duty change acting as an impulse at the PWM's falling edge, (1 + DELAY·D)·T after its sample, as in
// converter.js's plant(). Its pole at z = 0 is the period of computation latency.
import { DEFAULT_BODE, designController, retune } from "../../pcl/loop.js";
import { sampledPlant, controllerZ, closedLoopPoles } from "./discrete.js";
import { loadConverter, pickDesign, num, hz, css, el, canvasPlot, legend, slider, choice, frame, CONVERTER_NAMES } from "./common.js";

const TEXT = {
  en: { fc: "Crossover", fz1: "Zero 1", fz2: "Zero 2", fp: "Pole", view: "View", whole: "whole circle", near: "near z = 1",
        ctlP: "controller poles", ctlZ: "controller zeros", plantP: "plant poles", plantZ: "plant zeros", closed: "closed-loop poles",
        stable: "Stable: every closed-loop pole is inside the unit circle.", unstable: "Unstable: a closed-loop pole is outside the unit circle.",
        head: ["pole", "|z|", "f", "ζ"], outside: v => `plant zero at z = ${v}, outside the view (right half-plane zero)`,
        model: (n, d) => `Plant: the ${n}'s averaged stage, sampled exactly; a duty change acts at the PWM's falling edge, (1 + ${d})·Tₛ after the sample it comes from (one period of computation delay, then the edge). The pole at z = 0 is that period.`,
        aria: (n, r, st) => `z-plane of the ${n} loop: largest closed-loop pole radius ${r}, ${st}.`, st: ["stable", "unstable"] },
  pt: { fc: "Cruzamento", fz1: "Zero 1", fz2: "Zero 2", fp: "Polo", view: "Vista", whole: "círculo inteiro", near: "perto de z = 1",
        ctlP: "polos do controlador", ctlZ: "zeros do controlador", plantP: "polos da planta", plantZ: "zeros da planta", closed: "polos de malha fechada",
        stable: "Estável: todos os polos de malha fechada estão dentro do círculo unitário.", unstable: "Instável: há um polo de malha fechada fora do círculo unitário.",
        head: ["polo", "|z|", "f", "ζ"], outside: v => `zero da planta em z = ${v}, fora da vista (zero no semiplano direito)`,
        model: (n, d) => `Planta: estágio médio do ${n}, amostrado de forma exata; uma mudança da razão cíclica age na borda de descida do PWM, (1 + ${d})·Tₛ depois da amostra que a gerou (um período de atraso de cálculo, depois a borda). O polo em z = 0 é esse período.`,
        aria: (n, r, st) => `Plano z da malha do ${n}: maior raio de polo de malha fechada ${r}, ${st}.`, st: ["estável", "instável"] },
};

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang];
  const info = await loadConverter(options.converter || "buck");
  const { converter: c, op, name, PLANT } = info, T = c.T, cname = CONVERTER_NAMES[name];
  const BODE = c.bode || DEFAULT_BODE;
  const plantFn = f => c.plant(f, op);
  const { chosen, design } = pickDesign(info, options);
  design.k = retune(design, T, plantFn);
  let control = chosen && chosen.controller ? chosen.controller : designController(design, T);
  const zp = sampledPlant(name, PLANT, op, T);
  let view = "whole", data = null;

  const ui = frame(body);
  const plot = canvasPlot(ui.plots, { height: 360, className: "square", draw });
  ui.plots.append(legend([["--loop", s.ctlP, "cross"], ["--loop", s.ctlZ, "ring"], ["--plant", s.plantP, "cross"], ["--plant", s.plantZ, "ring"], ["--closed", s.closed, "dot"]]));
  const status = el("p"), table = el("div", { class: "w-table-wrap" }), note = el("p", { class: "w-note" });
  ui.readout.append(status, table, note);
  const sliders = {};
  for (const key of ["fc", "fz1", "fz2", "fp"]) {
    const [low, high] = BODE.sliders[key];
    sliders[key] = slider(ui.controls, { label: s[key], min: low, max: high, value: design[key], log: true, format: f => hz(f, lang),
      oninput: f => {
        if (key === "fp") f = Math.max(f, 1.2 * Math.max(design.fz1, design.fz2));
        else if (key !== "fc") f = Math.min(f, design.fp / 1.2);
        design[key] = f;
        design.k = retune(design, T, plantFn);
        control = designController(design, T);
        update();
      } });
  }
  choice(ui.controls, { label: s.view, options: [["whole", s.whole], ["near", s.near]], value: view, onchange: v => { view = v; plot.render(); } });

  function update() {
    const cz = controllerZ(control, T), cl = closedLoopPoles(zp, control, T);
    const radius = Math.max(...cl.map(p => Math.hypot(p.re, p.im)));
    data = { cz, cl, radius };
    const unstable = radius >= 1;
    status.replaceChildren(el("span", { class: unstable ? "w-bad" : "w-ok", text: unstable ? s.unstable : s.stable }));
    const rows = cl.filter(p => p.im >= -1e-12).sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im)).map(p => {
      const r = Math.hypot(p.re, p.im), th = Math.atan2(p.im, p.re), sigma = Math.log(r);
      const zeta = Math.hypot(sigma, th) > 0 ? -sigma / Math.hypot(sigma, th) : 1;
      const z = Math.abs(p.im) < 1e-9 ? num(p.re, 4, lang) : `${num(p.re, 4, lang)}\u00a0±\u00a0${num(Math.abs(p.im), 4, lang)}j`;
      return `<tr><td>${z}</td><td${r >= 1 ? ' class="bad"' : ""}>${num(r, 4, lang)}</td><td>${Math.abs(th) > 1e-9 ? hz(Math.abs(th) / (2 * Math.PI * T), lang) : "—"}</td>` +
             `<td>${p.re > 0 || Math.abs(th) > 1e-9 ? num(zeta, 2, lang) : "—"}</td></tr>`;
    });
    table.innerHTML = `<table class="w-table"><thead><tr>${s.head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    const far = zp.zeros.filter(z => Math.abs(z.re) > 1.5);
    note.textContent = s.model(cname, num(Number(zp.delta.toFixed(3)), undefined, lang)) + (far.length ? " " + far.map(z => s.outside(num(z.re, 2, lang))).join("; ") + "." : "");
    for (const [key, sl] of Object.entries(sliders)) sl.set(design[key]);
    plot.label(s.aria(cname, num(radius, 3, lang), s.st[unstable ? 1 : 0]));
    plot.render();
  }

  function draw(g, w, h) {
    if (!data) return;
    const [cxv, cyv, half] = view === "whole" ? [0, 0, 1.25] : [0.85, 0, 0.25];
    const size = Math.min(w, h) - 16, ox = w / 2, oy = h / 2, scale = size / (2 * half);
    const X = v => ox + (v - cxv) * scale, Y = v => oy - (v - cyv) * scale;
    g.save();
    g.beginPath(); g.rect(ox - size / 2, oy - size / 2, size, size); g.clip();
    // grid and axes
    g.strokeStyle = css("--grid"); g.lineWidth = 1; g.fillStyle = css("--muted");
    const step = half > 1 ? 0.5 : 0.05;
    for (let v = Math.ceil((cxv - half) / step) * step; v <= cxv + half + 1e-9; v += step) {
      g.beginPath(); g.moveTo(X(v), Y(cyv - half)); g.lineTo(X(v), Y(cyv + half)); g.stroke();
    }
    for (let v = Math.ceil((cyv - half) / step) * step; v <= cyv + half + 1e-9; v += step) {
      g.beginPath(); g.moveTo(X(cxv - half), Y(v)); g.lineTo(X(cxv + half), Y(v)); g.stroke();
    }
    g.strokeStyle = css("--muted");
    g.beginPath(); g.moveTo(X(cxv - half), Y(0)); g.lineTo(X(cxv + half), Y(0)); g.stroke();
    if (cxv - half < 0) { g.beginPath(); g.moveTo(X(0), Y(cyv - half)); g.lineTo(X(0), Y(cyv + half)); g.stroke(); }
    // unit circle
    g.strokeStyle = css("--text"); g.lineWidth = 1.4;
    g.beginPath(); g.arc(X(0), Y(0), scale, 0, 2 * Math.PI); g.stroke();
    // labels on the real axis
    g.fillStyle = css("--muted"); g.font = "11px system-ui, sans-serif"; g.textAlign = "center";
    const labelStep = half > 1 ? 1 : 0.1;
    for (let v = Math.ceil((cxv - half) / labelStep) * labelStep; v <= cxv + half + 1e-9; v += labelStep)
      g.fillText(num(Number(v.toFixed(2)), undefined, lang), X(v), Y(0) + 13);
    g.textAlign = "left";
    const cross = (p, color, r = 5, width = 2) => {
      g.strokeStyle = css(color); g.lineWidth = width;
      g.beginPath(); g.moveTo(X(p.re) - r, Y(p.im) - r); g.lineTo(X(p.re) + r, Y(p.im) + r);
      g.moveTo(X(p.re) + r, Y(p.im) - r); g.lineTo(X(p.re) - r, Y(p.im) + r); g.stroke();
    };
    const ring = (p, color, r = 5, width = 2) => { g.strokeStyle = css(color); g.lineWidth = width; g.beginPath(); g.arc(X(p.re), Y(p.im), r, 0, 7); g.stroke(); };
    zp.poles.forEach(p => cross(p, "--plant", 4, 1.5));
    zp.zeros.forEach(z => ring(z, "--plant", 4, 1.5));
    cross({ re: 0, im: 0 }, "--plant", 4, 1.5);  // the computation delay's pole
    data.cz.poles.forEach(p => cross(p, "--loop", 6, 2.2));
    data.cz.zeros.forEach(z => ring(z, "--loop", 6, 2.2));
    g.fillStyle = css("--closed");
    data.cl.forEach(p => { g.beginPath(); g.arc(X(p.re), Y(p.im), 4.5, 0, 7); g.fill(); });
    g.restore();
  }
  update();
}
