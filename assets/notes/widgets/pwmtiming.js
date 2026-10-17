// {{widget pwmtiming mode=compare}}: how a digital PWM takes a new duty, as a timing diagram over about
// three periods, rows aligned in time: the carrier with the compare level (the CCR, which steps when
// the active register is loaded), the high-side gate, and the events (ADC sample ▲, the interrupt's
// computation as a bar, the write to the CCR's preload ◆, the update event that copies the preload to
// the active register, dashed). A "step" toggle makes the controller's output from sample k a new
// duty: the gate before the step stays as a dashed ghost, the edges that sample k moves are ringed, and
// brackets show t_c (sample → load), t_m (load → moved edge, or the midpoint of the two moved edges)
// and t_d = t_c + t_m, in units of Tₛ. The base of the Part III timeline (period → ADC → ISR → CCR).
// Options: mode (trailing | symmetric | compare; compare, the default, stacks the two).
//
// The geometry, with sample k at t = 0 and the carrier between 0 and 1:
//   trailing edge: sawtooth, the gate on from the counter reset until the counter reaches the CCR;
//     sample at the reset, update at the next reset: t_c = Tₛ, only the falling edge moves, t_m = D·Tₛ.
//   symmetric: triangle, valley at integers, peak at half-integers, the gate on while carrier < CCR
//     (on pulse centred on the valley); sample at the valley, mid on-pulse (also at the peak in double). Loads, as in the note's table:
//       same   — no preload, the write is the load: t_c = the computation, t_m = Tₛ/2 − t_c, t_d = Tₛ/2,
//                if the write lands before the first edge it moves (the ISR bar is shortened to fit);
//       peak   — update at the peak: t_c = Tₛ/2, t_m = Tₛ/2 (t_d = Tₛ);
//       valley — update at the next valley: t_c = Tₛ, t_m = Tₛ/2 (t_d = 1.5·Tₛ);
//       double — sample and update at every peak and valley, so Tₛ = T_PWM/2: each load moves one
//                edge, (1 − D)·Tₛ and D·Tₛ after it in turn, Tₛ/2 on average.
// The delays are measured on the drawn edges, not typed in; D is the duty after the step, so the
// measured values are exactly the expressions above.
import { el, css, canvasPlot, legend, slider, choice, toggle, frame, num, FONT, richText } from "./common.js";

const TEXT = {
  en: {
    D: "D (after the step)", step: "Step the duty from sample k", load: "Symmetric: load at",
    loads: { same: "same valley", peak: "peak", valley: "next valley", double: "peak + valley" },
    title: { trailing: "Trailing edge: sawtooth carrier, update at the counter reset",
             symmetric: "Symmetric (center-aligned): triangle carrier, sample at the valley, mid on-pulse",
             double: "Symmetric (center-aligned): triangle carrier, sample at every valley and peak" },
    rows: { carrier: "carrier and compare level (CCR)", gate: "high-side gate", events: "ADC, ISR, CCR, update" },
    keys: { adc: "ADC sample", isr: "ISR (computing)", ccr: "write to CCR (preload)", upd: "update event (preload → active)",
            ghost: "before the step", moved: "edges moved by sample k" },
    keysSame: { ccr: "write to CCR (no preload: takes effect at once)" },
    off: "With the step off nothing moves; the rings mark the edges that sample k sets.",
    illus: "Illustrative: the ±0.2 duty step and the interrupt's length (shortened in “same valley” so it ends before the edge). Tₛ is the sampling period: T_PWM with one update per period, T_PWM/2 with double update.",
    trailing: (tc, tm, td) => `Sample k at the counter reset. The ISR writes the new duty to the CCR's preload; the update event at the next reset, ${tc} after the sample, copies it to the active register (t_c). Only the falling edge moves, ${tm} after that reset (t_m = D·Tₛ); the rising edge stays at the reset. From the sample to the moving edge, t_d = t_c + t_m = ${td} = (1 + D)·Tₛ.`,
    same: (tc, tm, td) => `No preload: the write takes effect at once, so the load is the write, t_c = ${tc} after the sample (the computation). It must land before the first edge it moves, the falling edge D·Tₛ/2 after the valley; at small D there is hardly any time, and a write after the counter has passed the new value delays or loses that edge, depending on the timer. The new duty sets that falling edge and the next rising edge, symmetric about the peak: t_m = ${tm} = Tₛ/2 − t_c, and t_d = t_c + t_m = ${td} = Tₛ/2 whatever the computation time, as long as it fits.`,
    peak: (tc, tm, td) => `The update event at the peak, ${tc} after the sample, loads the new duty (t_c). It moves two edges, the rising edge before the next valley and the falling edge after it, symmetric about that valley: their midpoint is ${tm} after the load for any D (t_m = Tₛ/2, the modulator itself). t_d = t_c + t_m = ${td}.`,
    valley: (tc, tm, td) => `The update event at the next valley, ${tc} after the sample, loads the new duty (t_c). It moves the falling edge after that valley and the rising edge before the following one, symmetric about the peak between them: midpoint ${tm} after the load for any D (t_m = Tₛ/2). t_d = t_c + t_m = ${td} = Tₛ + Tₛ/2.`,
    double: (tc, tm1, tm2, mean) => `Double update: sample and update at every peak and valley, so Tₛ = T_PWM/2 here (the axis's unit; one carrier period is 2·Tₛ). The load comes ${tc} after the sample (t_c), and each load moves one edge only: the load at the peak, the rising edge ${tm1} later, (1 − D)·Tₛ; the next one, at the valley, the falling edge ${tm2} later, D·Tₛ. The two alternate, and their mean is ${mean} = Tₛ/2, so t_d = 1.5·Tₛ = 0.75·T_PWM on average.`,
    aria: (title, D, td) => `${title}. Timing diagram over about three periods with D = ${D}: carrier and compare level, high-side gate, ADC samples, interrupt, CCR write and update events. ${td}`,
    ariaTd: v => `Delay from sample k to the moved edge: ${v}.`,
    ariaTm: (a, b) => `Each load moves one edge, ${a} and ${b} after it.`,
  },
  pt: {
    D: "D (depois do degrau)", step: "Degrau na razão cíclica a partir da amostra k", load: "Simétrico: carga no",
    loads: { same: "mesmo vale", peak: "pico", valley: "vale seguinte", double: "pico + vale" },
    title: { trailing: "Borda de descida (*trailing edge*): portadora dente de serra, *update event* no reinício do contador",
             symmetric: "PWM simétrico (*center-aligned*): portadora triangular, amostra no vale, meio do pulso ligado",
             double: "PWM simétrico (*center-aligned*): portadora triangular, amostra em todo vale e todo pico" },
    rows: { carrier: "portadora e nível de comparação (CCR)", gate: "*gate* da chave de cima", events: "ADC, interrupção, CCR, *update event*" },
    keys: { adc: "amostra do ADC", isr: "interrupção (cálculo)", ccr: "escrita no CCR (*preload*)", upd: "*update event* (*preload* → ativo)",
            ghost: "antes do degrau", moved: "bordas movidas pela amostra k" },
    keysSame: { ccr: "escrita no CCR (sem *preload*: vale na hora)" },
    off: "Sem o degrau nada se move; os anéis marcam as bordas que a amostra k define.",
    illus: "Ilustrativos: o degrau de ±0.2 na razão cíclica e a duração da interrupção (encurtada no “mesmo vale” para terminar antes da borda). Tₛ é o período de amostragem: T_PWM com uma atualização por período, T_PWM/2 na atualização dupla.",
    trailing: (tc, tm, td) => `Amostra k no reinício do contador. A interrupção escreve a razão cíclica nova no *preload* do CCR; o *update event* no reinício seguinte, ${tc} depois da amostra, a copia para o registrador ativo (t_c). Só a borda de descida se move, ${tm} depois desse reinício (t_m = D·Tₛ); a borda de subida fica no reinício. Da amostra até a borda que se move, t_d = t_c + t_m = ${td} = (1 + D)·Tₛ.`,
    same: (tc, tm, td) => `Sem *preload*: a escrita vale na hora, então a carga é a própria escrita, t_c = ${tc} depois da amostra (o cálculo). Ela precisa chegar antes da primeira borda que move, a de descida, D·Tₛ/2 depois do vale; com D pequeno quase não há tempo, e uma escrita depois que o contador passou do valor novo atrasa ou perde essa borda, conforme o timer. A razão cíclica nova define essa borda de descida e a de subida seguinte, simétricas em torno do pico: t_m = ${tm} = Tₛ/2 − t_c, e t_d = t_c + t_m = ${td} = Tₛ/2 qualquer que seja o tempo de cálculo, desde que caiba.`,
    peak: (tc, tm, td) => `O *update event* no pico, ${tc} depois da amostra, carrega a razão cíclica nova (t_c). Ela move duas bordas, a de subida antes do vale seguinte e a de descida depois dele, simétricas em torno desse vale: o ponto médio fica ${tm} depois da carga para qualquer D (t_m = Tₛ/2, o próprio modulador). t_d = t_c + t_m = ${td}.`,
    valley: (tc, tm, td) => `O *update event* no vale seguinte, ${tc} depois da amostra, carrega a razão cíclica nova (t_c). Ela move a borda de descida depois desse vale e a de subida antes do próximo, simétricas em torno do pico entre elas: ponto médio ${tm} depois da carga para qualquer D (t_m = Tₛ/2). t_d = t_c + t_m = ${td} = Tₛ + Tₛ/2.`,
    double: (tc, tm1, tm2, mean) => `Atualização dupla: amostra e *update event* em todo pico e todo vale, então aqui Tₛ = T_PWM/2 (a unidade do eixo; um período da portadora vale 2·Tₛ). A carga vem ${tc} depois da amostra (t_c), e cada carga move uma borda só: a carga no pico, a borda de subida ${tm1} depois, (1 − D)·Tₛ; a seguinte, no vale, a borda de descida ${tm2} depois, D·Tₛ. As duas se alternam, e a média é ${mean} = Tₛ/2; em média, t_d = 1.5·Tₛ = 0.75·T_PWM.`,
    aria: (title, D, td) => `${title}. Diagrama de tempos de cerca de três períodos com D = ${D}: portadora e nível de comparação, *gate* da chave de cima, amostras do ADC, interrupção, escrita no CCR e *update events*. ${td}`,
    ariaTd: v => `Atraso da amostra k até a borda movida: ${v}.`,
    ariaTm: (a, b) => `Cada carga move uma borda, ${a} e ${b} depois dela.`,
  },
};

// "*term*" → the term in italics (English terms kept in the Portuguese text), as nodes, never as HTML
// *text* in italics, and t_c, t_m, t_d, T_PWM with a real subscript.
const subscripted = str => str.split(/\b([tT])_(c|m|d|PWM)\b/).flatMap((part, i, all) =>
  i % 3 === 1 ? [el("span", {}, el("i", { text: part }), el("sub", { text: all[i + 1] }))] : i % 3 === 2 ? [] : [part]);
const rich = str => str.split(/\*([^*]+)\*/).flatMap((part, i) => (i % 2 ? [el("em", { text: part })] : subscripted(part))).filter(p => p !== "");
const plain = str => str.replace(/\*/g, "").replace(/\b([tT])_(c|m|d|PWM)\b/g, "$1$2");

const X0 = -0.5, X1 = 2.75;     // the window, in units of Tₛ (of T_PWM for the symmetric carrier)
const ISR_END = 0.36;           // the interrupt runs from 0.04 to 0.36 of a period after its sample
const STEP = 0.2;               // the duty step

// The timing of one diagram: events, compare level, gate pulses (with and without the step) and the
// edges that sample k moves, with t_c, t_m and t_d measured on them. Times in periods of the carrier.
export function timing(kind, load, D, stepOn) {
  const Do = stepOn ? (D >= 0.3 ? D - STEP : D + STEP) : D;
  const sym = kind === "symmetric";
  const dt = sym && load === "double" ? 0.5 : 1;                               // sample (and load) interval
  const lag = !sym ? 1 : { same: 0, peak: 0.5, valley: 1, double: 0.5 }[load];  // sample → load
  const isrEnd = sym && load === "same" ? Math.min(ISR_END, 0.6 * Math.min(D, Do) / 2) : Math.min(ISR_END, dt - 0.1);
  const valueOf = j => (j >= -1e-9 ? D : Do);                                    // the controller's output at sample j
  // the active compare value governing an edge whose half (symmetric) or period (sawtooth) starts at t
  const active = (t, d = null) => d ?? valueOf(Math.floor((t - lag) / dt + 1e-9) * dt);
  const samples = [];
  for (let t = Math.ceil(X0 / dt - 1e-9) * dt; t <= X1 + 1e-9; t += dt) samples.push(t);
  const writeAt = s => s + isrEnd;
  const loads = samples.map(s => (sym && load === "same" ? writeAt(s) : s + lag));
  const updates = sym && load === "same" ? [] : loads;
  // the gate's on intervals
  const pulses = fixed => {
    const out = [];
    for (let n = Math.floor(X0) - 1; n <= Math.ceil(X1) + 1; n++) {
      if (!sym) out.push([n, n + active(n, fixed)]);
      else out.push([n - active(n - 0.5, fixed) / 2, n + active(n, fixed) / 2]);
    }
    return out;
  };
  // the edges in the half (or period) starting at h, set by the load at h
  const edgeIn = h => (!sym ? h + D : Math.abs(h - Math.round(h)) < 1e-9 ? h + D / 2 : h + 0.5 - D / 2);
  const moved = (dt === 1 && sym ? [lag, lag + 0.5] : [lag]).map(edgeIn);
  const mid = moved.reduce((a, b) => a + b, 0) / moved.length;
  const out = { kind, load: sym ? load : null, D, Do, stepOn, dt, lag, isrEnd, samples, loads, updates,
                writes: samples.map(writeAt), pulses: pulses(null), ghost: stepOn ? pulses(Do) : null,
                moved, mid, tc: sym && load === "same" ? isrEnd : lag, td: mid };
  out.tm = mid - out.tc;   // without preload the load is the write itself, so t_c is the computation
  if (sym && load === "double") {   // the next sample's load moves the next edge
    const e2 = edgeIn(lag + 0.5);
    out.moved2 = [e2]; out.tm2 = e2 - (lag + 0.5);
  }
  // the compare level as drawn: steps at each load (at the write, without preload)
  out.level = t => { let v = Do; samples.forEach((s, i) => { if (loads[i] <= t + 1e-12) v = valueOf(s); }); return v; };
  return out;
}

const tri = t => 2 * Math.abs(t - Math.round(t));     // 0 at the valleys (integers), 1 at the peaks
const saw = t => t - Math.floor(t);

export default function mount(body, options, { lang }) {
  const s = TEXT[lang] || TEXT.en;
  const mode = ["trailing", "symmetric", "compare"].includes(options.mode) ? options.mode : "compare";
  const state = { D: 0.375, step: true, load: "peak" };
  const ui = frame(body);
  const kinds = mode === "compare" ? ["trailing", "symmetric"] : [mode];
  const diagrams = kinds.map(kind => diagram(ui.plots, kind, s, lang, state));

  slider(ui.controls, { label: s.D, min: 0.1, max: 0.9, step: 0.005, value: state.D, format: v => num(v, 3, lang),
    oninput: v => { state.D = v; update(); } });
  toggle(ui.controls, { label: s.step, checked: state.step, onchange: v => { state.step = v; update(); } });
  if (kinds.includes("symmetric"))
    choice(ui.controls, { label: s.load, options: ["same", "peak", "valley", "double"].map(k => [k, s.loads[k]]), value: state.load,
      onchange: v => { state.load = v; update(); } });

  ui.foot.append(el("p", { class: "w-note" }, ...rich(s.illus)));   // once, under the controls

  function update() { diagrams.forEach(d => d.update()); }
  update();
}

function diagram(parent, kind, s, lang, state) {
  const box = el("div", { class: "w-pwmt" });
  const head = el("div", { class: "w-toolbar" });
  box.append(head);
  parent.append(box);
  let t = null;
  const plot = canvasPlot(box, { height: 262, draw });
  const keys = el("div");
  const text = el("p");
  const readout = el("div", { class: "w-readout", "aria-live": "polite" }, text);
  box.append(keys, readout);
  const T = v => `${num(Number((v / t.dt).toFixed(3)), undefined, lang)} Tₛ`;   // carrier periods → Tₛ

  function update() {
    t = timing(kind, state.load, state.D, state.step);
    const same = kind === "symmetric" && t.load === "same";
    const title = s.title[kind === "symmetric" && t.load === "double" ? "double" : kind];
    head.replaceChildren(el("span", { class: "w-pwmt-rich" }, ...rich(title)));
    const items = legend([
      ["--il", s.keys.adc, "tri"], ["--alt3", s.keys.isr, "bar"], ["--margin", same ? s.keysSame.ccr : s.keys.ccr, "diamond"],
      ...(same ? [] : [["--alt1", s.keys.upd, "dashed"]]),
      ...(t.stepOn ? [["--hg", s.keys.ghost, "dashed"]] : []), ["--bad", s.keys.moved, "ring"]]);
    for (const span of items.children) { const last = span.lastChild; if (last.nodeType === 3) last.replaceWith(el("span", { class: "w-pwmt-rich" }, ...rich(last.data))); }
    keys.replaceChildren(items);
    let line, ariaTd;
    if (kind === "trailing") { line = s.trailing(T(t.tc), T(t.tm), T(t.td)); ariaTd = s.ariaTd(T(t.td)); }
    else if (t.load === "double") { line = s.double(T(t.tc), T(t.tm), T(t.tm2), T((t.tm + t.tm2) / 2)); ariaTd = s.ariaTm(T(t.tm), T(t.tm2)); }
    else { line = s[t.load](T(t.tc), T(t.tm), T(t.td)); ariaTd = s.ariaTd(T(t.td)); }
    text.replaceChildren(...rich(line + (t.stepOn ? "" : " " + s.off)));
    plot.label(plain(s.aria(title, num(t.D, 3, lang), ariaTd)));
    plot.render();
  }

  function draw(g, w, h) {
    if (!t) return;
    const left = 12, right = w - 14, X = v => left + (v - X0) / (X1 - X0) * (right - left);
    const sym = kind === "symmetric";
    // the bands, top to bottom
    const car = { top: 18, h: 52 }, gate = { top: 92, h: 22 }, ev = { top: 136, h: 30 }, ann = { top: 176, step: 24 }, axis = h - 6;
    const labels = [];   // the rows' names, drawn last on the panel's colour, so no line crosses them
    const label = (text, y) => labels.push([text, y]);
    // grid at every half period, through all the bands
    g.lineWidth = 1; g.strokeStyle = css("--grid");
    for (let v = Math.ceil(X0 * 2) / 2; v <= X1 + 1e-9; v += 0.5) {
      const px = Math.round(X(v)) + 0.5;
      g.beginPath(); g.moveTo(px, car.top); g.lineTo(px, axis - 14); g.stroke();
    }
    // update events: dashed lines across the carrier, gate and events
    g.strokeStyle = css("--alt1"); g.setLineDash([4, 3]); g.lineWidth = 1.2;
    for (const u of t.updates) if (u >= X0 && u <= X1) { const px = X(u); g.beginPath(); g.moveTo(px, car.top); g.lineTo(px, ev.top + ev.h); g.stroke(); }
    g.setLineDash([]);

    // carrier and compare level
    label(s.rows.carrier, car.top - 6);
    const cy = v => car.top + 4 + (1 - v) * (car.h - 4);
    g.strokeStyle = css("--vref"); g.lineWidth = 1.3; g.beginPath();
    const n = Math.max(200, Math.round(right - left));
    for (let i = 0; i <= n; i++) {
      const tt = X0 + (X1 - X0) * i / n;
      let v = sym ? tri(tt) : saw(tt);
      if (!sym && i > 0) {   // the sawtooth's reset: a vertical drop
        const prev = X0 + (X1 - X0) * (i - 1) / n;
        if (Math.floor(tt) !== Math.floor(prev)) { const r = Math.floor(tt); g.lineTo(X(r), cy(1)); g.lineTo(X(r), cy(0)); }
      }
      i ? g.lineTo(X(tt), cy(v)) : g.moveTo(X(tt), cy(v));
    }
    g.stroke();
    if (t.stepOn) {   // the compare level before the step
      g.strokeStyle = css("--margin"); g.globalAlpha = 0.55; g.setLineDash([5, 4]); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(X(X0), cy(t.Do)); g.lineTo(X(X1), cy(t.Do)); g.stroke();
      g.globalAlpha = 1; g.setLineDash([]);
    }
    g.strokeStyle = css("--margin"); g.lineWidth = 2; g.beginPath();
    const changes = [X0, ...t.loads.filter(l => l > X0 && l < X1), X1];
    changes.forEach((c, i) => {
      const v = t.level(c);
      if (i === 0) g.moveTo(X(c), cy(v));
      else { g.lineTo(X(c), cy(t.level(changes[i - 1]))); g.lineTo(X(c), cy(v)); }
    });
    g.stroke();

    // gate
    label(s.rows.gate, gate.top - 6);
    const gy = on => (on ? gate.top + 2 : gate.top + gate.h);
    const wave = (pulses, color, dash, alpha, width, fill) => {
      g.save(); g.beginPath(); g.rect(left, gate.top - 4, right - left, gate.h + 8); g.clip();
      if (fill) {
        g.fillStyle = css(color); g.globalAlpha = 0.14;
        for (const [a, b] of pulses) g.fillRect(X(a), gy(true), X(b) - X(a), gy(false) - gy(true));
        g.globalAlpha = 1;
      }
      g.strokeStyle = css(color); g.setLineDash(dash); g.globalAlpha = alpha; g.lineWidth = width;
      g.beginPath(); g.moveTo(X(X0 - 1), gy(false));
      for (const [a, b] of pulses) { g.lineTo(X(a), gy(false)); g.lineTo(X(a), gy(true)); g.lineTo(X(b), gy(true)); g.lineTo(X(b), gy(false)); }
      g.lineTo(X(X1 + 1), gy(false)); g.stroke();
      g.restore();
    };
    if (t.ghost) wave(t.ghost, "--hg", [4, 3], 0.6, 1.4, false);
    wave(t.pulses, "--hg", [], 1, 2, true);

    // events: the interrupt as a bar, the CCR write at its end, the ADC sample under it
    label(s.rows.events, ev.top - 6);
    const barY = ev.top + 3, barH = 8, triY = ev.top + ev.h;
    g.save(); g.beginPath(); g.rect(left - 8, ev.top - 2, right - left + 16, ev.h + 4); g.clip();
    t.samples.forEach((smp, i) => {
      if (smp > X1 || t.writes[i] < X0) return;
      g.fillStyle = css("--alt3"); g.globalAlpha = 0.85;
      g.fillRect(X(smp + 0.04), barY, Math.max(2, X(t.writes[i]) - X(smp + 0.04)), barH); g.globalAlpha = 1;
      const wx = X(t.writes[i]), wy = barY + barH / 2;
      g.fillStyle = css("--margin"); g.beginPath(); g.moveTo(wx, wy - 6); g.lineTo(wx + 5, wy); g.lineTo(wx, wy + 6); g.lineTo(wx - 5, wy); g.closePath(); g.fill();
      if (smp < X0) return;
      const k = Math.abs(smp) < 1e-9, sx = X(smp), r = k ? 7 : 5.5;
      g.fillStyle = css("--il"); g.beginPath(); g.moveTo(sx, triY - 1.6 * r); g.lineTo(sx + r, triY); g.lineTo(sx - r, triY); g.closePath(); g.fill();
      if (k) { g.fillStyle = css("--text"); g.font = "600 11px system-ui, sans-serif"; g.textAlign = "right"; g.fillText("k", sx - r - 2, triY - 1); g.font = FONT; g.textAlign = "left"; }
    });
    g.restore();

    // the edges sample k moves: rings on the gate, dotted down to the brackets
    const lastLine = ann.top + ann.step * 2;
    const ring = e => {
      g.strokeStyle = css("--bad"); g.lineWidth = 2; g.beginPath(); g.arc(X(e), gate.top + gate.h / 2 + 1, 6, 0, 7); g.stroke();
      g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(X(e), gate.top + gate.h + 4); g.lineTo(X(e), lastLine + 4); g.stroke(); g.setLineDash([]);
    };
    t.moved.forEach(ring);
    if (t.moved2) t.moved2.forEach(ring);

    // brackets: t_c, t_m, then t_d (or, with double update, the next load's t_m)
    const bracket = (a, b, row, sub, color = "--text", prime = false) => {
      const y = ann.top + ann.step * row, xa = X(a), xb = X(b);
      g.strokeStyle = g.fillStyle = css(color); g.lineWidth = 1.4;
      if (b - a > 1e-6) {
        g.beginPath(); g.moveTo(xa, y - 5); g.lineTo(xa, y + 5); g.moveTo(xb, y - 5); g.lineTo(xb, y + 5); g.moveTo(xa, y); g.lineTo(xb, y); g.stroke();
        if (xb - xa > 10) { g.beginPath(); g.moveTo(xb, y); g.lineTo(xb - 6, y - 3.5); g.lineTo(xb - 6, y + 3.5); g.closePath(); g.fill(); }
      } else { g.beginPath(); g.moveTo(xa, y - 5); g.lineTo(xa, y + 5); g.stroke(); }
      // the label: "t" with its subscript, over the bracket when it fits, else to its right (or left at the edge)
      g.font = "italic 13px system-ui, sans-serif"; const wt = g.measureText("t").width;
      g.font = "11px system-ui, sans-serif"; const text = sub + (prime ? "′" : "") + (b - a > 1e-6 ? "" : " = 0"), ws = g.measureText(text).width;
      const lw = wt + ws + 1;
      let lx = xb - xa >= lw + 12 ? (xa + xb) / 2 - lw / 2 : xb + 6;
      if (lx + lw > right) lx = xa - 6 - lw;
      const ly = xb - xa >= lw + 12 ? y - 3 : y + 3;
      if (xb - xa >= lw + 12) { g.fillStyle = css("--panel"); g.fillRect(lx - 2, ly - 11, lw + 4, 12); }
      g.fillStyle = css(color);
      g.font = "italic 13px system-ui, sans-serif"; g.textAlign = "left"; g.fillText("t", lx, ly);
      g.font = "11px system-ui, sans-serif"; g.fillText(text, lx + wt + 1, ly + 3);
      g.font = FONT;
    };
    bracket(0, t.tc, 0, "c");
    bracket(t.tc, t.tc + t.tm, 1, "m");
    if (t.moved.length === 2) {   // the midpoint of the two moved edges
      const mx = X(t.mid), my = ann.top + ann.step;
      g.strokeStyle = css("--bad"); g.lineWidth = 1.6; g.beginPath();
      g.moveTo(mx - 4, my - 4); g.lineTo(mx + 4, my + 4); g.moveTo(mx + 4, my - 4); g.lineTo(mx - 4, my + 4); g.stroke();
    }
    if (t.moved2) bracket(t.lag + 0.5, t.lag + 0.5 + t.tm2, 2, "m", "--text", true);
    else bracket(0, t.td, 2, "d", "--bad");

    // time axis, in Tₛ (in double update, Tₛ is half the carrier's period)
    g.fillStyle = css("--muted"); g.font = FONT; g.textAlign = "center";
    const unit = t.dt;   // carrier periods per Tₛ
    for (let v = Math.ceil(X0 / unit - 1e-9) * unit; v <= X1 + 1e-9; v += unit) {
      const m = Math.round(v / unit);
      if (m < 0) continue;
      const text = m === 0 ? "0" : m === 1 ? "Tₛ" : `${m}Tₛ`;
      g.textAlign = X(v) > right - 12 ? "right" : "center";
      g.fillText(text, X(v), axis);
    }
    g.textAlign = "left";
    g.font = FONT;
    for (const [text, y] of labels) {
      g.fillStyle = css("--panel"); g.fillRect(left - 2, y - 10, richText(g, text, left, y, true) + 6, 13);
      g.fillStyle = css("--muted"); richText(g, text, left, y);   // *gate*, *update event* in italics
    }
  }
  return { update };
}
