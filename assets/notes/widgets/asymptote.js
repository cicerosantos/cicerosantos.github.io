// {{widget asymptote factors="k:10; zero:100; pole:1k"}}: the asymptotic Bode plot of a transfer function
// in the course's factored form, magnitude in dB and phase in degrees on one log-frequency axis: the
// asymptotes bold, with the slope of each segment (dB/dec, °/dec) and the level of each flat one, the
// corners marked, and the exact curve dashed over them; above, G(s) in the course's notation: an
// integrator's or differentiator's 0 dB frequency as ωᵢ (ωᵢ₁, ωᵢ₂… when they differ), the real corners
// as ω₁ < ω₂ < …. Or, with forms=, an explorer of single factors: a menu of the listed
// forms, a slider for the corner (and Q for a pair), the form's equation and its asymptotes in words.
// Options (build_notes.py checks them):
//   factors="k:10; zero:100; pole:1k; pair:5k:0.7" or forms="pole,zero,int,…" (exactly one of the two);
//     tokens k:<gain> (may be negative) and <form>:<f in Hz> (k and M suffixes), a pair <form>:<f>:<Q>;
//     forms (asymptote-model.js): pole zero int diff rpole rzero ipole izero irpole irzero pair zpair
//     rpair rzpair ipair izpair irpair irzpair; a pair's Q may be inf (undamped);
//   mode=show (default: equation and plot), read (plot, the equation behind a button: graph → equation),
//     draw (equation, the plot behind a button: equation → graph);
//   exact=on|off: the exact curve, dashed (default on in show mode, off in read and draw); a switch in
//     the figure changes it;
//   pz=on|off (default off; with forms= only): the form's poles (×) and zeros (○) in the s-plane, in
//     units of its ω (σ/ω, jω/ω), beside the plot (below it on a narrow page).
// The math, and the phase convention of the composite, are in asymptote-model.js.
import { el, css, uid, canvasPlot, panel, toggle, slider, legend, num, eng, decade, FONT } from "./common.js";
import { KINDS, isPair, parseFactors, model, span, polylines, segments, exactCurve, factorEnds, rootsOf } from "./asymptote-model.js";

const TEXT = {
  en: {
    perDec: "dB/dec", degDec: "°/dec", asym: "asymptotes", exact: "exact curve", exactSwitch: "Exact curve (dashed)",
    showAnswer: "Show the answer", hideAnswer: "Hide the answer", showPlot: "Show the plot", hidePlot: "Hide the plot",
    readHint: "Write G(s) from the asymptotic plot, then check.", drawHint: "Sketch the asymptotes of this G(s), then check.",
    form: "Form", corner: "Corner frequency", zeroDb: "0 dB frequency", Q: "Q",
    corners: "Corners", with: "with ω = 2πf", originZero: { int: "integrator 0 dB", diff: "differentiator 0 dB" },
    perDecWords: "dB per decade", degDecWords: "° per decade",
    bad: msg => `This figure's expression is invalid: ${msg}.`, noForms: "None of the listed forms is known.",
    cornerErr: v => `corner error ${v} dB`,
    aria: (mag, ph) => `Asymptotic Bode plot. Magnitude: ${mag}. Phase: ${ph}.`,
    upTo: (v, f) => `${v} up to ${f}`, from: (v, a, b) => `${v} from ${a} to ${b}`, after: (v, f) => `${v} above ${f}`, all: v => `${v} throughout`,
    names: { pole: "pole", zero: "zero", int: "integrator (pole at the origin)", diff: "differentiator (zero at the origin)",
             rpole: "RHP pole", rzero: "RHP zero", ipole: "inverted pole", izero: "inverted zero", irpole: "inverted RHP pole", irzero: "inverted RHP zero",
             pair: "pole pair", zpair: "zero pair", rpair: "RHP pole pair", rzpair: "RHP zero pair", ipair: "inverted pole pair", izpair: "inverted zero pair",
             irpair: "inverted RHP pole pair", irzpair: "inverted RHP zero pair" },
    undamped: "Q = ∞ (undamped)", step: "a step", stepAt: (a, b, f) => `a step from ${a} to ${b} at ${f}`,
    phaseStep: "Phase: {a} below {f}, {b} above: a step, since Q = ∞.",
    errInf: "At the corner the exact magnitude is infinite (Q = ∞): an infinite peak for poles, a notch for zeros.",
    pzTitle: "s-plane (in units of ω)", pzKeys: ["poles", "zeros"], pzAria: (p, z) => `s-plane in units of ω: poles ${p}; zeros ${z}.`, none: "none", double: "double",
    magCommon: "Magnitude: 0 dB up to {f}, then {s}.", magInv: "Magnitude: {s} up to {f}, then 0 dB.", magOrigin: "Magnitude: {s} throughout, 0 dB at {f}.",
    phase: "Phase: {a} below {lo}, {b} above {hi}, a straight line of {s} between them ({m} at {f}).", phaseConst: "Phase: {a} at every frequency.",
    errBelow: "At the corner the exact curve is 3 dB below the asymptote.", errAbove: "At the corner the exact curve is 3 dB above the asymptote.",
    errPairPole: "At the corner the exact curve is 20 log₁₀ Q dB above the asymptote (below if Q < 1); with a high Q, almost all of the exact phase change happens near the corner.",
    errPairZero: "At the corner the exact curve is 20 log₁₀ Q dB below the asymptote (above if Q < 1); with a high Q, almost all of the exact phase change happens near the corner.",
    errNone: "The asymptote is the exact curve.",
  },
  pt: {
    perDec: "dB/déc", degDec: "°/déc", asym: "assíntotas", exact: "curva exata", exactSwitch: "Curva exata (tracejada)",
    showAnswer: "Mostrar a resposta", hideAnswer: "Esconder a resposta", showPlot: "Mostrar o gráfico", hidePlot: "Esconder o gráfico",
    readHint: "Escreva G(s) a partir do gráfico assintótico e depois confira.", drawHint: "Esboce as assíntotas desta G(s) e depois confira.",
    form: "Forma", corner: "Canto", zeroDb: "Frequência de 0 dB", Q: "Q",
    corners: "Cantos", with: "com ω = 2πf", originZero: { int: "0 dB do integrador", diff: "0 dB do derivador" },
    perDecWords: "dB por década", degDecWords: "° por década",
    bad: msg => `A expressão desta figura é inválida: ${msg}.`, noForms: "Nenhuma das formas listadas é conhecida.",
    cornerErr: v => `erro no canto ${v} dB`,
    aria: (mag, ph) => `Diagrama de Bode assintótico. Módulo: ${mag}. Fase: ${ph}.`,
    upTo: (v, f) => `${v} até ${f}`, from: (v, a, b) => `${v} de ${a} a ${b}`, after: (v, f) => `${v} acima de ${f}`, all: v => `${v} em toda a faixa`,
    names: { pole: "polo", zero: "zero", int: "integrador (polo na origem)", diff: "derivador (zero na origem)",
             rpole: "polo RHP", rzero: "zero RHP", ipole: "polo invertido", izero: "zero invertido", irpole: "polo invertido RHP", irzero: "zero invertido RHP",
             pair: "par de polos", zpair: "par de zeros", rpair: "par de polos RHP", rzpair: "par de zeros RHP", ipair: "par de polos invertido", izpair: "par de zeros invertido",
             irpair: "par de polos invertido RHP", irzpair: "par de zeros invertido RHP" },
    undamped: "Q = ∞ (sem amortecimento)", step: "um degrau", stepAt: (a, b, f) => `um degrau de ${a} para ${b} em ${f}`,
    phaseStep: "Fase: {a} abaixo de {f}, {b} acima: um degrau, porque Q = ∞.",
    errInf: "No canto, o módulo exato é infinito (Q = ∞): um pico infinito nos polos, um entalhe nos zeros.",
    pzTitle: "plano s (em unidades de ω)", pzKeys: ["polos", "zeros"], pzAria: (p, z) => `Plano s em unidades de ω: polos ${p}; zeros ${z}.`, none: "nenhum", double: "duplo",
    magCommon: "Módulo: 0 dB até {f}, depois {s}.", magInv: "Módulo: {s} até {f}, depois 0 dB.", magOrigin: "Módulo: {s} em toda a faixa, 0 dB em {f}.",
    phase: "Fase: {a} abaixo de {lo}, {b} acima de {hi}, e entre eles uma reta de {s} ({m} em {f}).", phaseConst: "Fase: {a} em qualquer frequência.",
    errBelow: "No canto, a curva exata fica 3 dB abaixo da assíntota.", errAbove: "No canto, a curva exata fica 3 dB acima da assíntota.",
    errPairPole: "No canto, a curva exata fica 20 log₁₀ Q dB acima da assíntota (abaixo, se Q < 1); com Q alto, quase toda a variação da fase exata se concentra perto do canto.",
    errPairZero: "No canto, a curva exata fica 20 log₁₀ Q dB abaixo da assíntota (acima, se Q < 1); com Q alto, quase toda a variação da fase exata se concentra perto do canto.",
    errNone: "A assíntota é a própria curva exata.",
  },
};

// ---- numbers ----
const signed = v => (v > 0 ? "+" : "") + num(v, undefined);
const dbText = v => num(Number(v.toFixed(1)), undefined) + " dB";
const hzText = (f, lang) => eng(f, "Hz", lang, 3);
const SUB = "₀₁₂₃₄₅₆₇₈₉";
// "−20 dB/dec"; the phase's "−45°/dec", without the space
const slopeText = (v, per) => signed(Number(v.toFixed(1))) + (per.startsWith("/") ? "°" : " ") + per;
const qText = q => (q === Infinity ? "∞" : num(q, undefined));
const STEP = 1e4;  // a slope above this, in dB or degrees per decade, is an undamped pair's step
const subDigits = n => String(n).replace(/\d/g, d => SUB[d]);
// The course's numbering: the 0 dB frequency of each integrator or differentiator is fᵢ (fᵢ₁ < fᵢ₂ < …
// when they differ), and only the real corners are f₁ < f₂ < …. sub(c) → the subscript of factor c.
function numbering(factors) {
  const sorted = list => [...new Set(list.map(c => c.f))].sort((a, b) => a - b);
  const origin = sorted(factors.filter(c => KINDS[c.kind].origin)), real = sorted(factors.filter(c => !KINDS[c.kind].origin));
  const originSub = f => (origin.length > 1 ? "i" + (origin.indexOf(f) + 1) : "i");
  return { origin, real, originSub, sub: c => (KINDS[c.kind].origin ? originSub(c.f) : String(real.indexOf(c.f) + 1)) };
}

// ---- the equation, in LaTeX ----
const gainTex = k => {
  const a = Math.abs(k), text = a >= 1e4 || a < 1e-3 ? a.toExponential(3).replace(/\.?0+e/, "e").replace(/e\+?(-?)(\d+)/, (_, m, e) => ` \\cdot 10^{${m}${e}}`) : String(Number(a.toPrecision(4)));
  return (k < 0 ? "-" : "") + text;
};
function factorTex(c, w, q) {
  const d = KINDS[c.kind], sg = d.rhp ? "-" : "+";
  if (d.origin) return `\\frac{s}{${w}}`;
  const u = d.inv ? `\\frac{${w}}{s}` : `\\frac{s}{${w}}`;
  if (d.order === 1) return `1 ${sg} ${u}`;
  if (c.Q === Infinity) return `1 + \\left(${u}\\right)^{2}`;
  const uq = d.inv ? `\\frac{${w}}{${q} s}` : `\\frac{s}{${q} ${w}}`;
  return `1 ${sg} ${uq} + \\left(${u}\\right)^{2}`;
}
// symbols(c) → [ω symbol, Q symbol]. The equation: K·Π(numerator)/Π(denominator), equal factors as powers.
function equationTex(gain, hasGain, factors, symbols) {
  const groups = { 1: [], [-1]: [] };
  for (const c of factors) {
    const [w, q] = symbols(c), tex = factorTex(c, w, q), part = groups[KINDS[c.kind].side];
    const same = part.find(p => p.tex === tex);
    if (same) same.n++; else part.push({ tex, n: 1, simple: !!KINDS[c.kind].origin });
  }
  const product = list => list.map(p => {
    const alone = list.length === 1 && p.n === 1;
    const body = alone ? p.tex : `\\left(${p.tex}\\right)`;
    return p.n > 1 ? `${body}^{${p.n}}` : body;
  }).join(" ");
  const top = product(groups[1]), den = product(groups[-1]);
  const k = hasGain || gain !== 1 ? gainTex(gain) : "";
  const kPart = k === "-1" ? "-" : k ? k + " \\cdot " : "";
  if (!den) return `G(s) = ${top ? (k === "-1" ? "-" : k ? k + " " : "") + top : k || "1"}`;
  return `G(s) = ${kPart}\\dfrac{${top || "1"}}{${den}}`;
}

// ---- canvas helpers ----
const rectsOverlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
function haloText(g, text, x, y, color) {
  g.save();
  g.lineJoin = "round"; g.lineWidth = 3.5; g.strokeStyle = css("--panel"); g.strokeText(text, x, y);
  g.fillStyle = css(color); g.fillText(text, x, y);
  g.restore();
}

export default async function mount(body, options, { lang, typeset }) {
  const s = TEXT[lang] || TEXT.en;
  body.classList.add("w");
  const fail = text => body.replaceChildren(el("p", { class: "widget-error", text }));
  const mode = ["show", "read", "draw"].includes(options.mode) ? options.mode : "show";
  let showExact = options.exact === "on" ? true : options.exact === "off" ? false : mode === "show";

  // ---- what is plotted ----
  const explorer = !options.factors && !!options.forms;
  let parsed = null, forms = [];
  if (explorer) {
    forms = options.forms.split(",").map(t => t.trim()).filter(t => KINDS[t]);
    if (!forms.length) return fail(s.noForms);
  } else {
    try { parsed = parseFactors(options.factors || ""); } catch (error) { return fail(s.bad(error.message)); }
  }
  const state = { kind: forms[0], f: 1000, Q: 0.707, undamped: false };
  const current = () => explorer ? { gain: 1, hasGain: false,
    factors: [{ kind: state.kind, f: state.f, ...(isPair(state.kind) ? { Q: state.undamped ? Infinity : state.Q } : {}) }] } : parsed;
  const withPz = explorer && options.pz === "on";
  // the explorer's axis stays put while the sliders move: two decades beyond the slider's ends
  const F_RANGE = [100, 1e4], Q_RANGE = [0.1, 10];
  const [fmin, fmax] = explorer ? span(F_RANGE) : span(model(parsed).corners);

  // ---- layout: the equation (behind a button in read mode), the plot (behind one in draw mode), the switches ----
  const answer = el("div", { class: "w-panel w-asym-eq" });
  const eqBox = el("div", { class: "w-asym-tex" }), values = el("p", { class: "w-asym-values" }), words = el("div", { class: "w-asym-words" });
  answer.append(eqBox, values, words);
  const plots = el("div", { class: "w-plots" });
  const row = el("div", { class: withPz ? "w-asym-row" : "w-asym-one" }), main = el("div", { class: "w-asym-main" });
  row.append(main);
  plots.append(el("div", { class: "w-asym-wrap" }, row));
  const plot = canvasPlot(main, { height: 470, draw });
  main.append(legend([["--loop", s.asym], ["--plant", s.exact, "dashed"]]));
  let pzPlot = null;
  if (withPz) {
    const side = el("div", { class: "w-asym-side" });
    row.append(side);
    side.append(el("div", { class: "w-note", text: s.pzTitle }));
    pzPlot = canvasPlot(side, { height: 240, draw: drawPz, className: "square" });
    side.append(legend([["--text", s.pzKeys[0], "cross"], ["--text", s.pzKeys[1], "ring"]]));
  }
  const cornerLine = el("p", { class: "w-note" });
  plots.append(cornerLine);
  const controls = el("div", { class: "w-panel w-controls" });

  const reveal = (target, showText, hideText, hint) => {
    const id = target.id = uid("w-asym");
    const button = el("button", { type: "button", class: "w-asym-reveal", "aria-expanded": "false", "aria-controls": id, text: showText });
    target.hidden = true;
    button.addEventListener("click", () => {
      target.hidden = !target.hidden;
      button.setAttribute("aria-expanded", String(!target.hidden));
      button.textContent = target.hidden ? showText : hideText;
      if (!target.hidden) { plot.render(); pzPlot?.render(); }
    });
    return el("div", { class: "w-asym-ask" }, el("span", { class: "w-note", text: hint }), button);
  };
  if (mode === "read") body.append(plots, reveal(answer, s.showAnswer, s.hideAnswer, s.readHint), answer, controls);
  else if (mode === "draw") body.append(answer, reveal(plots, s.showPlot, s.hidePlot, s.drawHint), plots, controls);
  else body.append(answer, plots, controls);

  let fSlider = null, qSlider = null, qSwitch = null, formSelect = null;
  if (explorer) {
    if (forms.length > 1) {
      const id = uid("w-asym-form");
      formSelect = el("select", { id, class: "w-asym-select" }, ...forms.map(k => el("option", { value: k, text: s.names[k] })));
      formSelect.addEventListener("change", () => { state.kind = formSelect.value; formChanged(); });
      controls.append(el("div", { class: "w-asym-form" }, el("label", { for: id, text: s.form }), formSelect));
    }
    fSlider = slider(controls, { label: s.corner, min: F_RANGE[0], max: F_RANGE[1], value: state.f, log: true, format: f => hzText(f, lang),
      oninput: f => { state.f = f; update(); } });
    qSlider = slider(controls, { label: s.Q, min: Q_RANGE[0], max: Q_RANGE[1], value: state.Q, log: true, format: q => num(Number(q.toPrecision(2)), undefined),
      oninput: q => { state.Q = q; update(); } });
    qSwitch = toggle(controls, { label: s.undamped, checked: false, onchange: v => {
      state.undamped = v; qSlider.input.disabled = v; writeEquation(); update(); } });
  }
  toggle(controls, { label: s.exactSwitch, checked: showExact, onchange: v => { showExact = v; plot.render(); } });

  // ---- ranges: in the explorer, over the slider's ends, so the axes stay put ----
  let yRange = null;
  function rangeOf(list) {
    let lo = Infinity, hi = -Infinity, plo = Infinity, phi = -Infinity;
    for (const fac of list) {
      const m = model(fac), pl = polylines(m, fmin, fmax), ex = exactCurve(m, fmin, fmax, 300);
      for (const [, v] of pl.mag) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const [alo, ahi] = [Math.min(...pl.mag.map(p => p[1])), Math.max(...pl.mag.map(p => p[1]))];
      for (const v of ex.mag) { const c = Math.min(ahi + 30, Math.max(alo - 30, v)); lo = Math.min(lo, c); hi = Math.max(hi, c); }
      for (const [, v] of pl.phase) { plo = Math.min(plo, v); phi = Math.max(phi, v); }
      for (const v of ex.ph) { plo = Math.min(plo, v); phi = Math.max(phi, v); }
    }
    return { mag: [lo, hi], phase: [plo, phi] };
  }
  function computeRange() {
    if (!explorer) return rangeOf([parsed]);
    const list = [];
    for (const f of F_RANGE) for (const Q of isPair(state.kind) ? [...Q_RANGE, 0.5, Infinity] : [1])
      list.push({ gain: 1, factors: [{ kind: state.kind, f, Q }] });
    return rangeOf(list);
  }

  // ---- the equation and the words ----
  const italicSub = (base, sub) => [el("i", { text: base }), el("sub", { text: sub })];
  function kindSub(kind) { return KINDS[kind].origin ? "i" : isPair(kind) ? "0" : KINDS[kind].side < 0 ? "p" : "z"; }
  function fillWords(template, map) {
    return String(template).split(/\{(\w+)\}/).flatMap((part, i) => (i % 2 ? map[part] ?? [] : part ? [part] : []));
  }
  function writeEquation() {
    const g = current();
    let symbols;
    if (explorer) {
      const sub = kindSub(state.kind);
      symbols = () => [`\\omega_{${sub}}`, "Q"];
    } else {
      const { sub } = numbering(g.factors);
      const pairs = g.factors.filter(c => isPair(c.kind));
      const oneQ = new Set(pairs.map(c => c.Q)).size <= 1;
      symbols = c => { const i = sub(c); return [`\\omega_{${i}}`, oneQ ? "Q" : `Q_{${i}}`]; };
    }
    eqBox.textContent = `\\[${equationTex(g.gain, g.hasGain, g.factors, symbols)}\\]`;
    if (explorer) {
      const c = g.factors[0], d = KINDS[c.kind], sub = kindSub(c.kind);
      const F = italicSub("f", sub), slope = `${signed((d.inv ? -1 : 1) * d.side * 20 * d.order)} ${s.perDecWords}`;
      const lines = [];
      lines.push(fillWords(d.origin ? s.magOrigin : d.inv ? s.magInv : s.magCommon, { f: F, s: [slope] }));
      const [a, b] = factorEnds(c);
      if (d.origin) lines.push(fillWords(s.phaseConst, { a: [signed(a) + "°"] }));
      else if (c.Q === Infinity) lines.push(fillWords(s.phaseStep, { a: [signed(a) + "°"], b: [signed(b) + "°"], f: italicSub("f", sub) }));
      else lines.push(fillWords(s.phase, { a: [signed(a) + "°"], b: [signed(b) + "°"], lo: [...italicSub("f", sub), "/10"], hi: ["10 ", ...italicSub("f", sub)],
        s: [`${signed((b - a) / 2)}${s.degDecWords}`], m: [signed((a + b) / 2) + "°"], f: italicSub("f", sub) }));
      lines.push([d.origin ? s.errNone : c.Q === Infinity ? s.errInf : d.order === 1 ? (d.side < 0 ? s.errBelow : s.errAbove) : d.side < 0 ? s.errPairPole : s.errPairZero]);
      words.replaceChildren(...lines.map(parts => el("p", {}, ...parts)));
    }
    typeset(eqBox);
  }
  function writeValues() {
    const g = current();
    const parts = [];
    if (explorer) {
      const c = g.factors[0], sub = kindSub(c.kind);
      parts.push(...italicSub("f", sub), ` = ${hzText(c.f, lang)} (${s.with})`);
      if (isPair(c.kind)) parts.push("; ", el("i", { text: "Q" }), c.Q === Infinity ? " = ∞" : ` = ${num(Number(c.Q.toPrecision(2)), undefined)} (${s.cornerErr(signed(Number((-KINDS[c.kind].side * 20 * Math.log10(c.Q)).toFixed(1))))})`);
    } else {
      // fᵢ (or fᵢ₁, fᵢ₂…), then f₁, f₂…, each group joined by commas, the groups by semicolons
      const { origin, real, originSub, sub } = numbering(g.factors);
      const group = (list, name) => list.flatMap((f, i) => [...(i ? [", "] : []), ...italicSub("f", name(f, i)), ` = ${hzText(f, lang)}`]);
      const groups = [group(origin, originSub), group(real, (f, i) => String(i + 1))].filter(x => x.length);
      groups.forEach((x, i) => parts.push(...(i ? ["; "] : []), ...x));
      if (groups.length) parts.push(` (${s.with})`);
      const pairs = g.factors.filter(c => isPair(c.kind)), oneQ = new Set(pairs.map(c => c.Q)).size <= 1;
      pairs.forEach((c, i) => {
        if (oneQ && i) return;
        parts.push("; ", ...(oneQ ? [el("i", { text: "Q" })] : italicSub("Q", sub(c))), ` = ${qText(c.Q)}`);
      });
    }
    values.replaceChildren(...parts);
    // under the plot, for the reader of read mode: the corners' values, and the frequency where each
    // integrator or differentiator crosses 0 dB (not a corner: its slope never changes). No Q: the reader
    // finds it on the plot, from the exact curve's peak over the asymptote.
    if (!explorer && mode === "read") {
      const real = [...new Set(g.factors.filter(c => !KINDS[c.kind].origin).map(c => c.f))].sort((a, b) => a - b);
      const items = real.length ? [`${s.corners}: ${real.map(f => hzText(f, lang)).join(", ")}`] : [];
      for (const kind of ["int", "diff"]) {
        const fs = [...new Set(g.factors.filter(c => c.kind === kind).map(c => c.f))].sort((a, b) => a - b);
        if (fs.length) items.push(`${s.originZero[kind]}: ${fs.map(f => hzText(f, lang)).join(", ")}`);
      }
      cornerLine.textContent = items.length ? items.join("; ") + "." : "";
    } else cornerLine.hidden = true;
  }

  // ---- drawing ----
  let data = null;
  function update() {
    const g = current(), m = model(g);
    const pl = polylines(m, fmin, fmax);
    data = { m, pl, ex: exactCurve(m, fmin, fmax, 600) };
    writeValues();
    plot.label(describe(pl));
    plot.render();
    if (pzPlot) { pzPlot.label(pzDescribe()); pzPlot.render(); }
  }
  function formChanged() {
    if (qSlider) {
      for (const node of [qSlider.input, qSlider.output, qSlider.input.previousElementSibling, qSwitch.parentElement]) node.hidden = !isPair(state.kind);
    }
    if (fSlider) fSlider.input.previousElementSibling.textContent = KINDS[state.kind].origin ? s.zeroDb : s.corner;
    yRange = computeRange();
    writeEquation();
    update();
  }
  function describe(pl) {
    // in words for a screen reader: "−20 dB per decade", the phase's levels signed ("+90°")
    const text = (pts, unit, per, sign) => segments(pts).map((seg, i, all) => {
      const a = hzText(seg.f0, lang), b = hzText(seg.f1, lang);
      if (Math.abs(seg.slope) > STEP) return s.stepAt(signed(seg.v0) + unit, signed(seg.v1) + unit, a);
      const level = Number(seg.v0.toFixed(1));
      const v = Math.abs(seg.slope) < 1e-6 ? (sign ? signed(level) : num(level, undefined)) + unit : signed(Number(seg.slope.toFixed(1))) + per;
      return all.length === 1 ? s.all(v) : i === 0 ? s.upTo(v, b) : i === all.length - 1 ? s.after(v, a) : s.from(v, a, b);
    }).join("; ");
    return s.aria(text(pl.mag, " dB", ` ${s.perDecWords}`, false), text(pl.phase, "°", s.degDecWords, true));
  }

  function axisSteps(lo, hi, height, steps) {
    const room = Math.max(2, Math.floor(height / 24));
    for (const step of steps) {
      const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
      if ((b - a) / step <= room) return { min: a, max: b, step };
    }
    const step = steps[steps.length - 1];
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
  }

  function draw(g, w, h) {
    if (!data) return;
    const { m, pl, ex } = data;
    const left = 50, right = 10, top = 40, gap = 30, bottom = 22;
    const ph = (h - top - gap - bottom) / 2, width = w - left - right;
    const decades = Math.log10(fmax / fmin), perDecade = width / decades;
    const every = Math.max(1, Math.ceil(56 / perDecade)), e0 = Math.round(Math.log10(fmin));
    const x = { min: fmin, max: fmax, log: true, format: f => ((Math.round(Math.log10(f)) - e0) % every === 0 ? decade(f, lang) : "") };
    const range = yRange || computeRange();
    // the magnitude's range, padded a little beyond the curves, in steps of 20 dB
    const my = axisSteps(range.mag[0] - 3, range.mag[1] + 3, ph, [20, 40, 60, 100, 200]);
    const py = axisSteps(range.phase[0] - 8, range.phase[1] + 8, ph, [45, 90, 180, 360]);
    const tickList = r => { const out = []; for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(v); return out; };
    const pm = panel(g, { left, top, width, height: ph }, x,
      { min: my.min, max: my.max, ticks: tickList(my), format: v => num(v, undefined) + " dB" }, { xLabels: false });
    const pp = panel(g, { left, top: top + ph + gap, width, height: ph }, x,
      { min: py.min, max: py.max, ticks: tickList(py), format: v => num(v, undefined) + "°" });

    // the corners: dotted lines over both panels, their values over the magnitude (in two rows when crowded)
    g.save();
    g.font = FONT; g.textAlign = "center";
    const rows = [[], []], cornerRects = [];
    // the fallback label: fᵢ for an integrator's or differentiator's 0 dB frequency, f₁, f₂… for a real corner
    const numbers = numbering(m.factors);
    const short = f => "f" + (numbers.real.includes(f) ? subDigits(numbers.real.indexOf(f) + 1) : "ᵢ" + (numbers.origin.length > 1 ? subDigits(numbers.origin.indexOf(f) + 1) : ""));
    m.corners.forEach(f => {
      for (const p of [pm, pp]) p.clip(() => {
        g.strokeStyle = css("--muted"); g.lineWidth = 1; g.setLineDash([2, 3]);
        const px = Math.round(p.X(f)) + 0.5;
        g.beginPath(); g.moveTo(px, p.box.top); g.lineTo(px, p.box.top + p.box.height); g.stroke(); g.setLineDash([]);
      });
      const px = pm.X(f);
      for (const text of [hzText(f, lang), short(f)]) {
        const tw = g.measureText(text).width, x0 = Math.max(2, Math.min(w - 2 - tw, px - tw / 2));
        const row = rows.findIndex(r => r.every(([a, b]) => x0 > b + 6 || x0 + tw < a - 6));
        if (row < 0) continue;
        rows[row].push([x0, x0 + tw]);
        const y = row === 0 ? top - 8 : top - 22;
        g.fillStyle = css("--text"); g.textAlign = "left"; g.fillText(text, x0, y);
        cornerRects.push({ x0, x1: x0 + tw, y0: y - 11, y1: y + 3 });
        break;
      }
    });
    g.restore();

    // the exact curves, dashed, then the asymptotes, bold
    const dashedLine = (p, ys) => p.clip(() => {
      g.strokeStyle = css("--plant"); g.lineWidth = 1.6; g.setLineDash([6, 4]);
      const top = p.box.top - 20, bottom = p.box.top + p.box.height + 20;  // an undamped pair's infinite peak, cut at the frame
      const Y = v => Math.min(bottom, Math.max(top, p.Y(v)));
      g.beginPath(); ex.fs.forEach((f, i) => (i ? g.lineTo(p.X(f), Y(ys[i])) : g.moveTo(p.X(f), Y(ys[i])))); g.stroke(); g.setLineDash([]);
    });
    if (showExact) { dashedLine(pm, ex.mag); dashedLine(pp, ex.ph); }
    const bold = (p, pts) => p.clip(() => {
      g.strokeStyle = css("--loop"); g.lineWidth = 2.6; g.lineJoin = "round";
      g.beginPath(); pts.forEach(([f, v], i) => (i ? g.lineTo(p.X(f), p.Y(v)) : g.moveTo(p.X(f), p.Y(v)))); g.stroke();
    });
    bold(pm, pl.mag); bold(pp, pl.phase);

    // the labels: each flat segment's level, each sloped one's slope; the longest segments first, each
    // placed above or below its segment where it covers neither the asymptote nor another label
    g.save();
    g.font = "600 11px system-ui, sans-serif"; g.textAlign = "left";
    const placeLabels = (p, pts, unit, per) => {
      const valueAt = fx => { for (let i = 1; i < pts.length; i++) if (fx <= pts[i][0] || i === pts.length - 1) {
        const [f0, v0] = pts[i - 1], [f1, v1] = pts[i]; return v0 + (v1 - v0) * Math.log10(fx / f0) / Math.log10(f1 / f0); } };
      const yOfPx = px => p.Y(valueAt(fmin * 10 ** ((px - p.box.left) / width * decades)));
      const placed = [...cornerRects];
      const segs = segments(pts).map(seg => ({ ...seg, len: Math.hypot(p.X(seg.f1) - p.X(seg.f0), p.Y(seg.v1) - p.Y(seg.v0)) })).sort((a, b) => b.len - a.len);
      for (const seg of segs) {
        if (Math.abs(seg.slope) > STEP) continue;
        const flat = Math.abs(seg.slope) < 1e-6;
        const text = flat ? num(Number(seg.v0.toFixed(1)), undefined) + unit : slopeText(seg.slope, per);
        const tw = g.measureText(text).width;
        if (seg.len < Math.min(tw, 40)) continue;
        // where the label's box goes from a point on the segment: centred above or below a flat one; beside
        // a sloped one, on the side away from it (up-right of a falling line, up-left of a rising one)
        const down = seg.slope < 0;
        const spots = flat ? [[-tw / 2, -9], [-tw / 2, 17], [-tw / 2, -20], [-tw / 2, 28]]
                           : [[down ? 5 : -tw - 5, -6], [down ? -tw - 5 : 5, 16], [-tw / 2, -12], [-tw / 2, 20]];
        let done = false;
        for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const cx = p.X(seg.f0 * (seg.f1 / seg.f0) ** t), cy = p.Y(seg.v0 + (seg.v1 - seg.v0) * t);
          for (const [dx, dy] of spots) {
            const x0 = cx + dx, y = cy + dy, r = { x0: x0 - 2, x1: x0 + tw + 2, y0: y - 11, y1: y + 3 };
            if (r.x0 < p.box.left + 1 || r.x1 > p.box.left + width - 1 || r.y0 < p.box.top + 1 || r.y1 > p.box.top + p.box.height - 1) continue;
            if (placed.some(o => rectsOverlap(o, r))) continue;
            // not across the asymptote: its y at the label's left, middle and right edges
            if ([r.x0, (r.x0 + r.x1) / 2, r.x1].some(px => { const yy = yOfPx(px); return yy > r.y0 - 2 && yy < r.y1 + 2; })) continue;
            haloText(g, text, x0, y, "--loop");
            placed.push(r);
            done = true;
            break;
          }
          if (done) break;
        }
      }
    };
    placeLabels(pm, pl.mag, " dB", s.perDec);
    placeLabels(pp, pl.phase, "°", s.degDec.slice(1));
    g.restore();
  }

  // ---- the s-plane, in units of the form's ω ----
  function pzRoots() {
    const r = rootsOf(current().factors[0]);
    const merge = list => {
      const out = [];
      for (const z of list) { const same = out.find(o => Math.hypot(o.re - z.re, o.im - z.im) < 1e-9); if (same) same.n++; else out.push({ ...z, n: 1 }); }
      return out;
    };
    return { poles: merge(r.poles), zeros: merge(r.zeros) };
  }
  function pzDescribe() {
    const { poles, zeros } = pzRoots();
    const t = list => list.length ? list.map(z => `${num(Number(z.re.toFixed(2)), undefined)}${z.im ? ` ${z.im > 0 ? "+" : "−"} j${num(Number(Math.abs(z.im).toFixed(2)), undefined)}` : ""}` +
      (z.n > 1 ? ` (${s.double})` : "")).join(", ") : s.none;
    return s.pzAria(t(poles), t(zeros));
  }
  function drawPz(g, w, h) {
    const { poles, zeros } = pzRoots();
    const far = Math.max(1, ...[...poles, ...zeros].map(z => Math.max(Math.abs(z.re), Math.abs(z.im))));
    const half = far <= 1.15 ? 1.25 : Math.ceil(far * 1.15 / 0.5) * 0.5;
    const box = { left: 38, top: 8, width: w - 46, height: h - 30 };
    const sq = Math.min(box.width, box.height);
    box.left += (box.width - sq) / 2; box.width = sq; box.height = sq;
    const step = half <= 1.5 ? 0.5 : half <= 4 ? 1 : half <= 10 ? 2 : 5;
    const ticks = []; for (let v = -Math.floor(half / step) * step; v <= half + 1e-9; v += step) ticks.push(v);
    const fmt = v => num(Number(v.toFixed(2)), undefined);
    const p = panel(g, box, { min: -half, max: half, ticks, format: fmt }, { min: -half, max: half, ticks, format: fmt });
    p.clip(() => {
      g.strokeStyle = css("--muted"); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(box.left, p.Y(0)); g.lineTo(box.left + box.width, p.Y(0)); g.moveTo(p.X(0), box.top); g.lineTo(p.X(0), box.top + box.height); g.stroke();
      g.fillStyle = css("--muted"); g.font = FONT; g.textAlign = "right";
      g.fillText("σ/ω", box.left + box.width - 4, p.Y(0) - 5);
      g.textAlign = "left"; g.fillText("jω/ω", p.X(0) + 5, box.top + 12);
      g.strokeStyle = css("--text"); g.lineWidth = 2;
      for (const z of poles) {
        const x = p.X(z.re), y = p.Y(z.im), r = 6;
        g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
        if (z.n > 1) { g.fillStyle = css("--text"); g.fillText(String(z.n), x + 8, y - 6); }
      }
      for (const z of zeros) {
        const x = p.X(z.re), y = p.Y(z.im);
        g.beginPath(); g.arc(x, y, 6.5, 0, 2 * Math.PI); g.stroke();
        if (z.n > 1) { g.fillStyle = css("--text"); g.fillText(String(z.n), x + 8, y + 14); }
      }
    });
  }

  if (explorer) formChanged();
  else { yRange = computeRange(); writeEquation(); update(); }
}
