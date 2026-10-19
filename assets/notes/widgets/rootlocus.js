// {{widget rootlocus preset=buck-2p2z}}: the root locus of a converter's loop in the s-plane, in hertz
// (s/2π): the open-loop poles (×) and zeros (○) of T(s) = K·N(s)/D(s), the branches of D + K·N = 0
// for K from 0 to ∞, the closed-loop poles at the K of a slider (K = 1 is the lab's design, marked
// with squares), the critical gain where a branch crosses the jω axis (the gain margin, in dB), lines
// of constant damping ζ, and, as diamonds, the closed-loop poles of the exact sampled-data model.
// Options: preset (required: buck-2p2z | boost-2p2z), delay (none | 1 | 2 | 3 | 4, the Padé order
// shown first; default 1 for the buck, none for the boost). build_notes.py checks both.
//
// The model (locus.js): the averaged power stage of converter.js at scenarios.json's operating point,
// times the 2p2z's continuous prototype K_I·(1 + s/ωz1)(1 + s/ωz2)/[s·(1 + s/ωp)] with the zeros,
// pole and integral gain of the lab's controller, times a Padé approximation of the firmware's delay,
// (1 + D)·Tₛ for the buck and (1 + D/2)·Tₛ for the boost. The output capacitor's ESR zero is left out
// unless its switch is on (it stays in the poles' damping), as the note's sketch does. K scales the
// controller's gain: K = 1 is the controller of scenarios.json. The locus is traced by solving
// D + K·N = 0 on a log grid of K, so a negative effective gain (the boost's right-half-plane zero, a
// Padé zero: the 0° locus) needs no special case; the readout says when the sign is negative.
// Presets: buck-2p2z (switches: Padé order, ESR zero); boost-2p2z (also input voltage, 10 or 12 V,
// and load, 1 or 2 A at 48 V). The exact model's poles are discrete.js's z-plane closed loop mapped by
// s = ln z / Tₛ; a z-plane mode of the figure was left out (zplane.js shows that plane).
import { loadConverter, el, css, canvasPlot, panel, legend, slider, choice, toggle, num, eng, rich, plainText, FONT } from "./common.js";
import { buildLocus, polesAt, exactPoles } from "./locus.js";

const PRESETS = { "buck-2p2z": "buck", "boost-2p2z": "boost" };
const ORDERS = ["none", "1", "2", "3", "4"];

const TEXT = {
  en: {
    plane: "s-plane (s/2π)", zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset view",
    K: "Gain K (× design)", design: "K = 1 (design)", delay: "Delay, Padé order", none: "none",
    esr: "ESR zero", exact: "Exact sampled model (diamonds)", vin: "Input voltage", load: "Load",
    keys: { poles: "open-loop poles", zeros: "open-loop zeros", branches: "branches, K from 0 to ∞", now: "closed-loop poles at K",
            design: "at K = 1 (design)", exact: "exact sampled model at K", cross: "jω crossing (K_cr)", zeta: "constant ζ" },
    head: ["closed-loop pole", "f₀", "ζ"],
    stable: k => `K = ${k}: stable, every closed-loop pole in the left half-plane.`,
    unstable: k => `K = ${k}: unstable, a closed-loop pole is in the right half-plane.`,
    crit: (k, db, f) => `Critical gain: a branch crosses the jω axis at K_cr = ${k}, at ${f}; gain margin ${db} dB.`,
    critNone: "No branch crosses the jω axis: without the delay, stable for any K.",
    critLow: "Unstable already at small K.",
    exactCrit: (k, db, f) => `Exact sampled model: K_cr = ${k}, at ${f}; gain margin ${db} dB.`,
    exactPoles: list => `Exact sampled model at this K: ${list}.`,
    sign: zs => `In the monic form Π(s − zⱼ)/Π(s − pᵢ) the effective gain is negative (right half-plane zero at ${zs}): this is the 0° locus, and rule 3 counts an even number. The figure just solves D(s) + K·N(s) = 0, which takes the sign in by itself.`,
    open: (p, z) => `Open loop: poles ${p}; zeros ${z}.`,
    model: (n, tau, order) => `Model: the *${n}*'s averaged power stage at its operating point times the 2p2z's continuous prototype, K_I·(1 + s/ωz1)(1 + s/ωz2)/[s·(1 + s/ωp)], with the lab's controller (K = 1)` +
      (order ? `, and the firmware's delay of ${tau} as a Padé approximation of order ${order}.` : `, without the delay.`) +
      ` Diamonds: the exact sampled-data model's closed-loop poles (z-plane, mapped by s = ln z / Tₛ).`,
    double: "double", outView: "out of view",
    aria: (n, k, st, crit) => `Root locus of the ${n} loop in the s-plane. At K = ${k} the loop is ${st}. ${crit}`, st: ["stable", "unstable"],
    ampsLabel: a => `${a} A`,
  },
  pt: {
    plane: "plano s (s/2π)", zoomIn: "Aproximar", zoomOut: "Afastar", reset: "Restaurar a vista",
    K: "Ganho K (× projeto)", design: "K = 1 (projeto)", delay: "Atraso, ordem de Padé", none: "sem",
    esr: "Zero da ESR", exact: "Modelo amostrado exato (losangos)", vin: "Tensão de entrada", load: "Carga",
    keys: { poles: "polos de malha aberta", zeros: "zeros de malha aberta", branches: "ramos, K de 0 a ∞", now: "polos de malha fechada em K",
            design: "em K = 1 (projeto)", exact: "modelo amostrado exato em K", cross: "cruzamento do eixo jω (K_cr)", zeta: "ζ constante" },
    head: ["polo de malha fechada", "f₀", "ζ"],
    stable: k => `K = ${k}: estável, todos os polos de malha fechada no semiplano esquerdo.`,
    unstable: k => `K = ${k}: instável, há um polo de malha fechada no semiplano direito.`,
    crit: (k, db, f) => `Ganho crítico: um ramo cruza o eixo jω em K_cr = ${k}, em ${f}; margem de ganho de ${db} dB.`,
    critNone: "Nenhum ramo cruza o eixo jω: sem o atraso, estável com qualquer K.",
    critLow: "Instável já com K pequeno.",
    exactCrit: (k, db, f) => `Modelo amostrado exato: K_cr = ${k}, em ${f}; margem de ganho de ${db} dB.`,
    exactPoles: list => `Modelo amostrado exato neste K: ${list}.`,
    sign: zs => `Na forma mônica Π(s − zⱼ)/Π(s − pᵢ), o ganho efetivo é negativo (zero no semiplano direito em ${zs}): é o lugar de 0°, e a regra 3 conta um número par. A figura só resolve D(s) + K·N(s) = 0, e o sinal entra sozinho.`,
    open: (p, z) => `Malha aberta: polos ${p}; zeros ${z}.`,
    model: (n, tau, order) => `Modelo: estágio de potência médio do *${n}* no ponto de operação, vezes o protótipo contínuo do 2p2z, K_I·(1 + s/ωz1)(1 + s/ωz2)/[s·(1 + s/ωp)], com o controlador do laboratório (K = 1)` +
      (order ? `, e o atraso do *firmware*, ${tau}, pela aproximação de Padé de ordem ${order}.` : `, sem o atraso.`) +
      ` Losangos: os polos de malha fechada do modelo amostrado exato (plano z, levados ao plano s por s = ln z / Tₛ).`,
    double: "duplo", outView: "fora da vista",
    aria: (n, k, st, crit) => `Lugar das raízes da malha do ${n} no plano s. Com K = ${k}, a malha está ${st}. ${crit}`, st: ["estável", "instável"],
    ampsLabel: a => `${a} A`,
  },
};

// Frequencies in hertz as the note writes them: −467 Hz, −2.41 kHz, 26.3 kHz.
const kHzDigits = m => (m < 1e4 ? 2 : m < 1e5 ? 1 : 0);
function fmtHz(v, lang) {
  const m = Math.abs(v);
  return m >= 1e3 ? num(v / 1e3, kHzDigits(m), lang) + " kHz" : num(v, 0, lang) + " Hz";
}
function fmtRoot(r, lang) {
  if (Math.abs(r.im) < 1e-6 * Math.max(1, Math.abs(r.re))) return fmtHz(r.re, lang);
  const m = Math.max(Math.abs(r.re), Math.abs(r.im));
  if (m < 500) return `${num(r.re, 0, lang)} ± j${num(Math.abs(r.im), 0, lang)} Hz`;
  const d = kHzDigits(m);
  return `${num(r.re / 1e3, d, lang)} ± j${num(Math.abs(r.im) / 1e3, d, lang)} kHz`;
}
const fmtK = (k, lang) => num(k, k < 10 ? 2 : k < 100 ? 1 : 0, lang);
const dB = (k, lang) => num(20 * Math.log10(k), 1, lang);
const zetaOf = r => -r.re / Math.hypot(r.re, r.im);
// The roots with im ≥ 0, each pair once, equal ones merged with their count.
function distinct(list) {
  const out = [];
  for (const r of list) {
    if (r.im < -1e-9 * Math.max(1, Math.abs(r.re))) continue;
    const same = out.find(o => Math.hypot(o.re - r.re, o.im - r.im) < 1e-4 * Math.max(1, Math.hypot(r.re, r.im)));
    if (same) same.count++; else out.push({ re: r.re, im: r.im, count: 1 });
  }
  return out;
}

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang];
  const preset = PRESETS[options.preset] ? options.preset : "buck-2p2z";
  const name = PRESETS[preset];
  const info = await loadConverter(name);
  const { converter: conv, PLANT, spec } = info, T = conv.T;
  const entry = spec.controllers.find(c => c.id === "2p2z");
  const control = entry.controller, design = { ...conv.design, ...entry.design, k: control.values[0] };
  const state = {
    K: 1, order: ORDERS.includes(options.delay) ? (options.delay === "none" ? 0 : +options.delay) : name === "buck" ? 1 : 0,
    esrZero: false, exact: true, vin: spec.defaults.vin, amps: Math.round(spec.defaults.vref / spec.defaults.load),
  };
  const HOME = name === "buck" ? { cx: -10e3, half: 30e3 } : { cx: -4e3, half: 22e3 };
  const view = { ...HOME };
  let locus = null, now = null, design1 = null, exactNow = [], lastUnstable = null;

  // ---- layout ----
  body.classList.add("w");
  const tools = el("div", { class: "w-toolbar w-pz-tools" });
  const zoomOut = el("button", { type: "button", "aria-label": s.zoomOut, title: s.zoomOut, text: "−" });
  const zoomIn = el("button", { type: "button", "aria-label": s.zoomIn, title: s.zoomIn, text: "+" });
  const reset = el("button", { type: "button", text: s.reset });
  tools.append(el("span", { class: "w-pz-title", text: s.plane }), zoomOut, zoomIn, reset);
  const plots = el("div", { class: "w-plots" });
  plots.append(tools);
  const plane = canvasPlot(plots, { height: 380, draw: drawPlane });
  const legendBox = el("div");
  plots.append(legendBox);
  const readout = el("div", { class: "w-readout w-pz-lines" }), controls = el("div", { class: "w-panel w-controls" }), live = el("p", { class: "w-sr", "aria-live": "polite" });
  body.append(plots, readout, controls, live);
  const status = el("p"), critLine = el("p"), exactLine = el("p"), table = el("div", { class: "w-table-wrap" }),
        exactList = el("p", { class: "w-pz-muted" }), signLine = el("p"), openLine = el("p", { class: "w-pz-muted" }), modelLine = el("p", { class: "w-note" });
  readout.append(status, critLine, exactLine, table, exactList, signLine, openLine, modelLine);

  // ---- controls ----
  const kSlider = slider(controls, { label: s.K, min: 0.01, max: 100, value: 1, log: true, format: k => fmtK(k, lang),
    oninput: k => { state.K = k; updateK(); } });
  controls.append(el("div", { class: "w-rl-buttons" }, el("button", { type: "button", text: s.design,
    onclick: () => { state.K = 1; kSlider.set(1); updateK(); } })));
  choice(controls, { label: s.delay, options: ORDERS.map(o => [o, o === "none" ? s.none : o]), value: state.order ? String(state.order) : "none",
    onchange: v => { state.order = v === "none" ? 0 : +v; rebuild(); } });
  if (name === "boost") {
    choice(controls, { label: s.vin, options: [["10", "10 V"], ["12", "12 V"]], value: String(state.vin), onchange: v => { state.vin = +v; rebuild(); } });
    choice(controls, { label: s.load, options: [["1", s.ampsLabel(1)], ["2", s.ampsLabel(2)]], value: String(state.amps), onchange: v => { state.amps = +v; rebuild(); } });
  }
  toggle(controls, { label: s.esr, checked: state.esrZero, onchange: v => { state.esrZero = v; rebuild(); } });
  toggle(controls, { label: s.exact, checked: state.exact, onchange: v => { state.exact = v; updateK(); } });
  zoomIn.addEventListener("click", () => { view.half /= 2; view.cx /= 2; plane.render(); });
  zoomOut.addEventListener("click", () => { view.half *= 2; view.cx *= 2; plane.render(); });
  reset.addEventListener("click", () => { Object.assign(view, HOME); plane.render(); });

  // ---- computing ----
  function rebuild() {
    const op = conv.operatingPoint({ ...spec.defaults, vin: state.vin, load: name === "boost" ? spec.defaults.vref / state.amps : spec.defaults.load });
    locus = buildLocus({ name, P: PLANT, op, T, design, control, order: state.order, esrZero: state.esrZero, delayFactor: PLANT.DELAY });
    locus.op = op;
    design1 = polesAt(locus.model, 1);
    staticReadouts();
    updateK();
  }
  function updateK() {
    now = polesAt(locus.model, state.K);
    exactNow = exactPoles(locus.zPlant, control, T, state.K);
    kReadouts();
    plane.render();
  }

  function staticReadouts() {
    const L = locus, c = L.critical;
    critLine.textContent = !c ? s.critNone : !c.stableAtStart ? s.critLow : s.crit(fmtK(c.k, lang), dB(c.k, lang), fmtHz(c.f, lang));
    const e = L.exact;
    exactLine.textContent = e && e.stableAtStart ? s.exactCrit(fmtK(e.k, lang), dB(e.k, lang), fmtHz(e.f, lang)) : "";
    const rhp = distinct(L.olZeros).filter(z => z.re > 0);
    signLine.textContent = L.sign < 0 ? s.sign(rhp.map(z => fmtRoot(z, lang)).join(", ")) : "";
    const list = roots => distinct(roots).sort((a, b) => b.re - a.re).map(r => fmtRoot(r, lang) + (r.count > 1 ? ` (${s.double})` : "")).join(", ");
    openLine.textContent = s.open(list(L.olPoles), list(L.olZeros));
    const tau = eng(L.tau, "s", lang, 4);
    modelLine.replaceChildren(...rich(s.model(name, tau, state.order)));
  }
  function kReadouts() {
    const unstable = now.some(r => r.re >= 0);
    const k = fmtK(state.K, lang);
    status.replaceChildren(el("span", { class: unstable ? "w-bad" : "w-ok", text: unstable ? s.unstable(k) : s.stable(k) }));
    const rows = distinct(now).sort((a, b) => Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im)).map(r => {
      const complex = Math.abs(r.im) > 0;
      return `<tr><td${r.re >= 0 ? ' class="bad"' : ""}>${fmtRoot(r, lang)}</td><td>${fmtHz(Math.hypot(r.re, r.im), lang)}</td><td>${complex ? num(zetaOf(r), 3, lang) : "—"}</td></tr>`;
    });
    table.innerHTML = `<table class="w-table"><thead><tr>${s.head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    const near = distinct(exactNow).filter(r => Math.hypot(r.re, r.im) < 0.25 / T).sort((a, b) => Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im));
    exactList.textContent = state.exact ? s.exactPoles(near.map(r => fmtRoot(r, lang) + (r.im > 0 ? ` (ζ ${num(zetaOf(r), 2, lang)})` : "")).join("; ")) : "";
    const c = locus.critical;
    const crit = plainText(critLine.textContent);
    plane.label(s.aria(name, k, s.st[unstable ? 1 : 0], crit));
    // the live region speaks only when the loop turns stable or unstable (the slider says K itself)
    if (unstable !== lastUnstable) { lastUnstable = unstable; live.textContent = unstable ? s.unstable(k) : s.stable(k); }
    legendBox.replaceChildren(legend([["--text", s.keys.poles, "cross"], ["--text", s.keys.zeros, "ring"], ["--loop", s.keys.branches],
      ["--closed", s.keys.now, "dot"], ["--closed", s.keys.design, "square"], ...(state.exact ? [["--margin", s.keys.exact, "rhomb"]] : []),
      ...(c && c.stableAtStart ? [["--bad", s.keys.cross, "dot"]] : []), ["--muted", s.keys.zeta, "dashed"]]));
  }

  // ---- drawing ----
  function drawPlane(g, w, h) {
    if (!locus) return;
    const box = { left: 52, top: 10, width: w - 62, height: h - 32 };
    const halfX = view.half * box.width / box.height;
    const fmtAxis = v => eng(v, "Hz", lang, 2);
    const x = { min: view.cx - halfX, max: view.cx + halfX, format: fmtAxis }, y = { min: -view.half, max: view.half, format: fmtAxis };
    // the right half-plane, shaded: a closed-loop pole there is unstable
    const X0 = box.left + (0 - x.min) / (x.max - x.min) * box.width;
    if (X0 < box.left + box.width) {
      g.save(); g.fillStyle = css("--bad"); g.globalAlpha = 0.06;
      g.fillRect(Math.max(X0, box.left), box.top, box.left + box.width - Math.max(X0, box.left), box.height); g.restore();
    }
    const p = panel(g, box, x, y);
    const X = p.X, Y = p.Y;
    // a segment clipped to the view widened by a margin (Liang–Barsky), so far points draw as straight lines
    const pad = 20, lim = { x0: box.left - pad, x1: box.left + box.width + pad, y0: box.top - pad, y1: box.top + box.height + pad };
    const clipSeg = (ax, ay, bx, by) => {
      let t0 = 0, t1 = 1;
      const dx = bx - ax, dy = by - ay;
      for (const [pp, q] of [[-dx, ax - lim.x0], [dx, lim.x1 - ax], [-dy, ay - lim.y0], [dy, lim.y1 - ay]]) {
        if (pp === 0) { if (q < 0) return null; continue; }
        const r = q / pp;
        if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
      return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
    };
    p.clip(() => {
      // axes
      g.strokeStyle = css("--muted"); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(box.left, Y(0)); g.lineTo(box.left + box.width, Y(0)); g.stroke();
      if (x.min < 0 && x.max > 0) { g.beginPath(); g.moveTo(X(0), box.top); g.lineTo(X(0), box.top + box.height); g.stroke(); }
      g.fillStyle = css("--muted"); g.font = FONT;
      g.textAlign = "right"; g.fillText("σ/2π", box.left + box.width - 4, Y(0) + 14);
      if (x.min < 0 && x.max > 0) { g.textAlign = "left"; g.fillText("jω/2π", X(0) + 5, box.top + 12); }
      // lines of constant ζ, from the origin into the left half-plane
      g.font = "10px system-ui, sans-serif"; g.textAlign = "center";
      // labels kept apart from each other and from the jω axis's own label
      const labelled = [[X(0) - 4, X(0) + 44, box.top, box.top + 16]];
      for (const z of [0.1, 0.2, 0.3, 0.5, 0.7]) {
        const dx = -z, dy = Math.sqrt(1 - z * z), far = 4 * Math.max(halfX, view.half);
        g.strokeStyle = css("--muted"); g.globalAlpha = 0.55; g.setLineDash([4, 4]); g.lineWidth = 1;
        for (const sgn of [1, -1]) {
          const seg = clipSeg(X(0), Y(0), X(dx * far), Y(sgn * dy * far));
          if (seg) { g.beginPath(); g.moveTo(seg[0], seg[1]); g.lineTo(seg[2], seg[3]); g.stroke(); }
        }
        g.setLineDash([]); g.globalAlpha = 1;
        // the label where the upper ray leaves the view, pulled inside
        let t = Infinity;
        if (dy > 0) t = Math.min(t, (y.max * 0.93) / dy);
        if (x.min < 0) t = Math.min(t, (x.min * 0.93) / dx);
        if (Number.isFinite(t) && t > 0) {
          const lx = X(dx * t), ly = Y(dy * t);
          const r = [lx - 16, lx + 16, ly - 6, ly + 6];
          const free = !labelled.some(o => r[0] < o[1] && o[0] < r[1] && r[2] < o[3] && o[2] < r[3]);
          if (free && lx > box.left + 16 && ly > box.top + 6) { labelled.push(r); g.fillStyle = css("--muted"); g.fillText(`ζ ${num(z, 1, lang)}`, lx, ly + 4); }
        }
      }
      g.textAlign = "left"; g.font = FONT;
      // the branches, with an arrow (increasing K) halfway along the visible part of each
      g.strokeStyle = css("--loop"); g.fillStyle = css("--loop"); g.lineWidth = 1.8;
      for (const b of locus.path.branches) {
        g.beginPath();
        const segs = [];
        for (let i = 1; i < b.length; i++) {
          const seg = clipSeg(X(b[i - 1].re), Y(b[i - 1].im), X(b[i].re), Y(b[i].im));
          if (!seg) continue;
          g.moveTo(seg[0], seg[1]); g.lineTo(seg[2], seg[3]);
          segs.push(seg);
        }
        g.stroke();
        const inside = segs.filter(sg => sg[2] >= box.left && sg[2] <= box.left + box.width && sg[3] >= box.top && sg[3] <= box.top + box.height);
        const len = inside.reduce((a, sg) => a + Math.hypot(sg[2] - sg[0], sg[3] - sg[1]), 0);
        if (len > 40) {
          let acc = 0;
          for (const sg of inside) {
            const l = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
            if (acc + l >= len / 2 && l > 0) {
              const t = (len / 2 - acc) / l, ax = sg[0] + t * (sg[2] - sg[0]), ay = sg[1] + t * (sg[3] - sg[1]);
              const ux = (sg[2] - sg[0]) / l, uy = (sg[3] - sg[1]) / l;
              g.beginPath(); g.moveTo(ax + 6 * ux, ay + 6 * uy); g.lineTo(ax - 4 * ux - 4 * uy, ay - 4 * uy + 4 * ux); g.lineTo(ax - 4 * ux + 4 * uy, ay - 4 * uy - 4 * ux); g.closePath(); g.fill();
              break;
            }
            acc += l;
          }
        }
      }
      // the critical gain's crossing of the jω axis
      const c = locus.critical;
      if (c && c.stableAtStart && x.min < 0 && x.max > 0) {
        g.fillStyle = css("--bad");
        for (const sgn of [1, -1]) { g.beginPath(); g.arc(X(0), Y(sgn * c.f), 4.5, 0, 2 * Math.PI); g.fill(); }
        g.font = "600 11px system-ui, sans-serif"; g.textAlign = "left";
        const ly = Y(c.f);
        if (ly > box.top + 10 && ly < box.top + box.height - 20) g.fillText(`K_cr ${fmtK(c.k, lang)}`, X(0) + 8, ly + 16);
        g.font = FONT;
      }
      // open-loop poles and zeros
      g.strokeStyle = css("--text"); g.lineWidth = 2;
      for (const r of locus.olPoles) {
        const px = X(r.re), py = Y(r.im);
        g.beginPath(); g.moveTo(px - 5, py - 5); g.lineTo(px + 5, py + 5); g.moveTo(px + 5, py - 5); g.lineTo(px - 5, py + 5); g.stroke();
      }
      for (const z of distinct(locus.olZeros)) for (const sgn of z.im > 0 ? [1, -1] : [1]) {
        const px = X(z.re), py = Y(sgn * z.im);
        g.beginPath(); g.arc(px, py, 5.5, 0, 2 * Math.PI); g.stroke();
        if (z.count > 1 && sgn === 1) { g.fillStyle = css("--text"); g.fillText("×" + z.count, px + 7, py - 7); }
      }
      // the design point K = 1, squares
      g.strokeStyle = css("--closed"); g.lineWidth = 1.6;
      for (const r of design1) g.strokeRect(X(r.re) - 5, Y(r.im) - 5, 10, 10);
      // the exact model's closed-loop poles at K, diamonds
      if (state.exact) {
        g.strokeStyle = css("--margin"); g.lineWidth = 1.8;
        for (const r of exactNow) {
          const px = X(r.re), py = Y(r.im);
          g.beginPath(); g.moveTo(px, py - 6); g.lineTo(px + 6, py); g.lineTo(px, py + 6); g.lineTo(px - 6, py); g.closePath(); g.stroke();
        }
      }
      // the closed-loop poles at K
      g.fillStyle = css("--closed");
      for (const r of now) { g.beginPath(); g.arc(X(r.re), Y(r.im), 4.5, 0, 2 * Math.PI); g.fill(); }
    });
  }

  rebuild();
}
