// {{widget probe}}: the ×10 passive probe's compensation. The tip, R1∥C1 (9 MΩ, 22 pF), over the
// oscilloscope side, R2∥C2 (1 MΩ, and C2 the input, cable and trimmer, which a slider sets from 100 to
// 300 pF, typed values allowed). Shows the Bode plot of G = G0 (1 + s/ωz)/(1 + s/ωp), asymptotes bold
// and the exact curve dashed, with the zero (○) and the pole (×) marked, and the response to a 1 kHz
// square wave from 0 to 1 V in periodic steady state, over the ideal 0.1·u; the readouts give G0, fz,
// fp, τ, the edge's capacitive divider C1/(C1 + C2) against the resistive one, 0.1, and the verdict:
// overcompensated (C2 small: zero below pole, overshoot), undercompensated (C2 large: rounded edges)
// or compensated (within 1% of C2 = R1 C1/R2 = 198 pF).
// Options: c2=<pF>p, the starting C2 (default 198p); build_notes.py checks it.
// The math is in probe-model.js, without the DOM, for node.
import { el, css, canvasPlot, panel, slider, toggle, legend, num, eng, decade, FONT, parseTyped } from "./common.js";
import { DEFAULTS, C2_RANGE, probe, verdict, bode, square, squareLevels } from "./probe-model.js";

const TEXT = {
  en: {
    c2: "C2 (input + cable + trimmer)", exactSwitch: "Exact curve (dashed)", asym: "asymptotes", exact: "exact curve",
    y: "y (scope input)", ideal: "0.1·u (ideal)", zero: "zero", pole: "pole", same: "zero = pole",
    values: (g0, fz, fp, tau) => `G₀ = R2/(R1 + R2) = ${g0}; f_z = ${fz}, f_p = ${fp}; τ = (R1∥R2)(C1 + C2) = ${tau}.`,
    dividers: (j, g0, e) => `At an edge the capacitors divide: C1/(C1 + C2) = ${j}. In steady state the resistors divide: R2/(R1 + R2) = ${g0}. Edge error: ${e}%.`,
    verdict: { ok: "Compensated: R1C1 = R2C2, the zero falls on the pole, and the response is flat: a clean square wave.",
               over: "Overcompensated: C2 too small, the zero is below the pole. The gain rises at high frequency, and each edge overshoots before settling.",
               under: "Undercompensated: C2 too large, the pole is below the zero. The gain falls at high frequency, and the edges come out rounded." },
    target: c => `Compensation at C2 = R1C1/R2 = ${c}.`,
    note: "1 kHz square wave from 0 to 1 V, in periodic steady state (as the screen shows it after a while). Model: the tip and the scope side as two R∥C, without the cable's transmission line.",
    bodeAria: (fz, fp, lo, hi) => `Bode plot of the probe: magnitude ${lo} at low frequency and ${hi} at high frequency, zero at ${fz}, pole at ${fp}; phase positive when the zero is below the pole, negative when it is above.`,
    timeAria: (a, b) => `Response to a 1 kHz square wave from 0 to 1 V: just after each rising edge ${a}, just before the falling edge ${b}; the ideal level is 0.1 V.`,
    time: "ms",
  },
  pt: {
    c2: "C2 (entrada + cabo + trimmer)", exactSwitch: "Curva exata (tracejada)", asym: "assíntotas", exact: "curva exata",
    y: "y (entrada do osciloscópio)", ideal: "0.1·u (ideal)", zero: "zero", pole: "polo", same: "zero = polo",
    values: (g0, fz, fp, tau) => `G₀ = R2/(R1 + R2) = ${g0}; f_z = ${fz}, f_p = ${fp}; τ = (R1∥R2)(C1 + C2) = ${tau}.`,
    dividers: (j, g0, e) => `Na borda, dividem os capacitores: C1/(C1 + C2) = ${j}. Em regime, dividem os resistores: R2/(R1 + R2) = ${g0}. Erro na borda: ${e} %.`,
    verdict: { ok: "Compensada: R1C1 = R2C2, o zero cai sobre o polo e a resposta é plana: uma onda quadrada limpa.",
               over: "Sobrecompensada: C2 pequeno demais, o zero fica abaixo do polo. O ganho sobe em alta frequência, e cada borda ultrapassa o nível final antes de se acomodar.",
               under: "Subcompensada: C2 grande demais, o polo fica abaixo do zero. O ganho cai em alta frequência, e as bordas saem arredondadas." },
    target: c => `Compensação em C2 = R1C1/R2 = ${c}.`,
    note: "Onda quadrada de 1 kHz, de 0 a 1 V, em regime periódico (como a tela mostra depois de um tempo). Modelo: a ponta e o lado do osciloscópio como dois R∥C, sem a linha de transmissão do cabo.",
    bodeAria: (fz, fp, lo, hi) => `Diagrama de Bode da ponta de prova: módulo ${lo} em baixa frequência e ${hi} em alta, zero em ${fz}, polo em ${fp}; fase positiva quando o zero está abaixo do polo, negativa quando está acima.`,
    timeAria: (a, b) => `Resposta a uma onda quadrada de 1 kHz, de 0 a 1 V: logo depois de cada borda de subida, ${a}; logo antes da borda de descida, ${b}; o nível ideal é 0.1 V.`,
    time: "ms",
  },
};

const FMIN = 10, FMAX = 1e5;  // the axis stays put: f_z = 804 Hz, f_p from 549 Hz to 1.45 kHz
const MAG = { min: -26, max: -12, step: 2 }, PH = { min: -20, max: 20, step: 10 };
const VOLTS = { min: -0.1, max: 0.2 };

export default async function mount(body, options, { lang }) {
  const s = TEXT[lang] || TEXT.en;
  const ui = frame3(body);
  const typed = parseTyped(String(options.c2 || ""));
  let C2 = Number.isFinite(typed) && typed > 0 ? Math.min(C2_RANGE[1], Math.max(C2_RANGE[0], typed < 1e-6 ? typed : typed * 1e-12)) : DEFAULTS.C2;
  let showExact = true, p = null, curves = null;
  const dec = (v, d) => num(v, d);
  const hzText = f => eng(f, "Hz", lang, 3);
  const dB = v => num(v, 1) + " dB";
  // "f_z" as f<sub>z</sub>
  const subs = text => String(text).split(/_([a-z0-9]+)/).map((part, i) => (i % 2 ? el("sub", { text: part }) : part));

  const bodePlot = canvasPlot(ui.plots, { height: 300, draw: drawBode });
  ui.plots.append(legend([["--loop", s.asym], ["--plant", s.exact, "dashed"]]));
  const timePlot = canvasPlot(ui.plots, { height: 210, draw: drawTime });
  ui.plots.append(legend([["--vout", s.y], ["--vref", s.ideal, "dashed"]]));

  const values = el("p"), dividers = el("p"), verdictLine = el("p"), target = el("p", { class: "w-note" }), note = el("p", { class: "w-note", text: s.note });
  ui.readout.append(values, dividers, verdictLine, target, note);
  slider(ui.controls, { label: s.c2, min: C2_RANGE[0], max: C2_RANGE[1], value: C2, step: 1e-12,
    format: v => eng(v, "F", lang, 4),
    oninput: v => { C2 = v; update(); } });
  toggle(ui.controls, { label: s.exactSwitch, checked: showExact, onchange: v => { showExact = v; bodePlot.render(); } });

  function update() {
    p = probe({ ...DEFAULTS, C2 });
    curves = bode(p, FMIN, FMAX, 400);
    const v = verdict(p);
    values.replaceChildren(...subs(s.values(dec(p.G0, 3), hzText(p.fz), hzText(p.fp), eng(p.tau, "s", lang, 3))));
    const err = Math.round((p.Ginf - p.G0) / p.G0 * 100);  // (G∞ − G0)/G0, the edge's error
    dividers.textContent = s.dividers(dec(p.Ginf, 3), dec(p.G0, 3), (err > 0 ? "+" : err < 0 ? "−" : "") + Math.abs(err));
    verdictLine.textContent = s.verdict[v];
    verdictLine.className = v === "ok" ? "w-ok" : "w-bad";
    target.textContent = s.target(eng(p.C2c, "F", lang, 3));
    const lv = squareLevels(p, DEFAULTS.f, DEFAULTS.U);
    bodePlot.label(s.bodeAria(hzText(p.fz), hzText(p.fp), dB(20 * Math.log10(p.G0)), dB(20 * Math.log10(p.Ginf))));
    timePlot.label(s.timeAria(dec(lv.afterRise, 3) + " V", dec(lv.beforeFall, 3) + " V"));
    bodePlot.render(); timePlot.render();
  }

  function drawBode(g, w, h) {
    if (!p) return;
    const left = 50, right = 10, top = 34, gap = 28, bottom = 22;
    const ph = (h - top - gap - bottom) / 2, width = w - left - right;
    // narrow: no "10 kHz", which would run into the right-aligned "100 kHz"
    const x = { min: FMIN, max: FMAX, log: true, format: f => (width < 420 && f === 1e4 ? "" : decade(f, lang)) };
    const list = r => { const out = []; for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(v); return out; };
    const magTicks = ph < 110 ? [-24, -20, -16, -12] : list(MAG);
    const pm = panel(g, { left, top, width, height: ph }, x, { min: MAG.min, max: MAG.max, ticks: magTicks, format: v => num(v) + " dB" }, { xLabels: false });
    const pp = panel(g, { left, top: top + ph + gap, width, height: ph }, x, { min: PH.min, max: PH.max, ticks: list(PH), format: v => num(v) + "°" });
    // the zero and the pole: dotted lines over both panels, a ring and a cross over the magnitude
    const same = verdict(p) === "ok";
    const marks = same ? [[p.fz, "ring+cross", s.same]] : [[p.fz, "ring", s.zero], [p.fp, "cross", s.pole]];
    g.save();
    g.font = FONT;
    const labels = [];
    for (const [f, kind, name] of marks) {
      for (const q of [pm, pp]) q.clip(() => {
        g.strokeStyle = css("--muted"); g.lineWidth = 1; g.setLineDash([2, 3]);
        const px = Math.round(q.X(f)) + 0.5;
        g.beginPath(); g.moveTo(px, q.box.top); g.lineTo(px, q.box.top + q.box.height); g.stroke(); g.setLineDash([]);
      });
      const px = pm.X(f), py = top - 6;
      g.strokeStyle = css("--text"); g.lineWidth = 1.5;
      if (kind.includes("ring")) { g.beginPath(); g.arc(px, py, 4.5, 0, 2 * Math.PI); g.stroke(); }
      if (kind.includes("cross")) { g.beginPath(); g.moveTo(px - 4, py - 4); g.lineTo(px + 4, py + 4); g.moveTo(px + 4, py - 4); g.lineTo(px - 4, py + 4); g.stroke(); }
      labels.push([px, `${name} ${hzText(f)}`]);
    }
    // the labels left of the leftmost mark and right of the rightmost, so they never collide
    g.fillStyle = css("--text");
    labels.sort((a, b) => a[0] - b[0]).forEach(([px, text], i) => {
      const tw = g.measureText(text).width;
      const lx = labels.length === 1 ? Math.min(w - right - tw, px + 9) : i === 0 ? Math.max(2, px - 9 - tw) : Math.min(w - right - tw, px + 9);
      g.fillText(text, lx, top - 2);
    });
    g.restore();
    const ex = curves.exact;
    const dashed = (q, ys) => q.clip(() => {
      g.strokeStyle = css("--plant"); g.lineWidth = 1.6; g.setLineDash([6, 4]);
      g.beginPath(); ex.fs.forEach((f, i) => (i ? g.lineTo(q.X(f), q.Y(ys[i])) : g.moveTo(q.X(f), q.Y(ys[i])))); g.stroke(); g.setLineDash([]);
    });
    if (showExact) { dashed(pm, ex.mag); dashed(pp, ex.ph); }
    const bold = (q, pts) => q.clip(() => {
      g.strokeStyle = css("--loop"); g.lineWidth = 2.6; g.lineJoin = "round";
      g.beginPath(); pts.forEach(([f, v], i) => (i ? g.lineTo(q.X(f), q.Y(v)) : g.moveTo(q.X(f), q.Y(v)))); g.stroke();
    });
    bold(pm, curves.mag); bold(pp, curves.phase);
  }

  function drawTime(g, w, h) {
    if (!p) return;
    const left = 50, right = 10, top = 14, bottom = 22, T = 1 / DEFAULTS.f, span = 2 * T;
    const box = { left, top, width: w - left - right, height: h - top - bottom };
    const x = { min: 0, max: span * 1e3, ticks: [0, 0.5, 1, 1.5, 2], format: v => num(v) + " " + s.time };
    const q = panel(g, box, x, { min: VOLTS.min, max: VOLTS.max, ticks: [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2], format: v => num(v, 2) + " V" });
    const n = Math.max(200, Math.round(box.width * 2)), eps = 1e-12;
    // the ideal 0.1·u, dashed, then y; the edges drawn as vertical jumps
    const draw = (fn, color, dash, widthPx) => q.clip(() => {
      g.strokeStyle = css(color); g.lineWidth = widthPx; g.setLineDash(dash); g.lineJoin = "round";
      g.beginPath();
      const edges = [0, T / 2, T, 1.5 * T, 2 * T];
      let first = true;
      for (let k = 0; k < edges.length - 1; k++) {
        const a = edges[k], b = edges[k + 1];
        for (let i = 0; i <= n / 4; i++) {
          const t = a + (b - a) * i / (n / 4), tt = i === 0 ? t + eps : i === n / 4 ? t - eps : t;
          const px = q.X(t * 1e3), py = q.Y(fn(tt));
          if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py);
        }
      }
      g.stroke(); g.setLineDash([]);
    });
    draw(t => (((t % T) + T) % T < T / 2 ? p.G0 * DEFAULTS.U : 0), "--vref", [5, 4], 1.3);
    draw(t => square(p, t, DEFAULTS.f, DEFAULTS.U), "--vout", [], 2);
  }

  update();
}

// frame() from common.js, with the readouts between the plots and the controls
function frame3(body) {
  body.classList.add("w");
  const plots = el("div", { class: "w-plots" }), readout = el("div", { class: "w-readout", "aria-live": "polite" }),
        controls = el("div", { class: "w-panel w-controls" });
  body.append(plots, readout, controls);
  return { plots, readout, controls };
}
