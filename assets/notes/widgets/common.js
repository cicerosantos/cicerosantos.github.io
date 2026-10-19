// Shared pieces of the notes' interactive figures: the converter loader, number formatting in both
// languages, the theme watch, canvas plots with axes, and the controls (sliders, switches, tables).
// Each figure is a module next to this one whose default export is mount(body, options, { lang, typeset }).
// The charts are drawn as the oscilloscope's, with its own pieces (assets/pcl/plot.js).
import { FONT, css, localNumber, niceStep, timeLabel, reading, detailRange, autoRange, sizeCanvas, timeGrid, valueAxis,
         triggerMarker, trace, cursorLine, cursorDot, cursorTime, legendItem } from "../../pcl/plot.js";

// The figures' stylesheets, traces.css and widgets.css. tools/build_notes.py links them, versioned
// (?v=), in the head of every page with a figure; a page without them gets them here, unversioned.
if (!document.querySelector('link[data-widgets-css]')) {
  for (const href of ["../../pcl/traces.css", "./widgets.css"]) {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL(href, import.meta.url).href });
    if (href === "./widgets.css") link.dataset.widgetsCss = "";
    document.head.append(link);
  }
}

// ---- converters ----
export const CONVERTERS = ["buck", "boost", "buckboost"];
export const CONVERTER_NAMES = { buck: "buck", boost: "boost", buckboost: "buck-boost" };
const cache = {};
// { name, converter (the default export), PLANT, spec (scenarios.json), op (at spec.defaults) }
export function loadConverter(name = "buck") {
  if (!CONVERTERS.includes(name)) return Promise.reject(new Error(`unknown converter "${name}"`));
  cache[name] ||= Promise.all([
    import(`/power-labs/converters/${name}/converter.js`),
    fetch(`/power-labs/converters/${name}/scenarios.json`, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  ]).then(([module, spec]) => {
    const converter = module.default;
    return { name, converter, PLANT: module.PLANT, spec, op: converter.operatingPoint(spec.defaults) };
  });
  return cache[name];
}

// The design of a controller id from scenarios.json, or of "custom": the converter's starting design
// with the figure's options (fc, fz1, fz2, fp, form) on top. Returns { chosen, design, control }:
// chosen is the scenarios.json entry (null for custom), design the slider values (null when the
// entry has no design), control the controller to plot first.
export function pickDesign(info, options) {
  const { spec, converter } = info;
  const id = options.design || "2p2z";
  const chosen = id === "custom" ? null : spec.controllers.find(c => c.id === id);
  if (id !== "custom" && !chosen) throw new Error(`unknown design "${id}" for ${info.name}`);
  const design = { ...converter.design, ...(chosen ? chosen.design || {} : {}), k: null };
  for (const key of ["fc", "fz1", "fz2", "fp"]) if (options[key] !== undefined && !isNaN(+options[key])) design[key] = +options[key];
  if (options.form === "pid" || options.form === "2p2z") design.form = options.form;
  return { chosen, design, fromDesign: !chosen || !!chosen.design };
}

export const tr = (value, lang) => (value && typeof value === "object" ? value[lang] ?? value.en : value);

// ---- numbers ----
export function num(v, digits, lang) {
  let text = typeof digits === "number" ? v.toFixed(digits) : String(v);
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);  // −0,00 from a tiny negative value reads as 0,00
  return text.replace(/^-/, "−");
}
export function sig(v, digits, lang) { return num(Number(v.toPrecision(digits)), undefined, lang); }
export function hz(f, lang) {
  return f >= 1e6 ? num(f / 1e6, 2, lang) + "\u00a0MHz" : f >= 1e3 ? num(f / 1e3, f < 1e4 ? 2 : 1, lang) + "\u00a0kHz" : num(f, 0, lang) + "\u00a0Hz";
}
export function eng(v, unit, lang, digits = 3) {
  if (v === 0) return "0 " + unit;
  const prefixes = [[1e-12, "p"], [1e-9, "n"], [1e-6, "µ"], [1e-3, "m"], [1, ""], [1e3, "k"], [1e6, "M"]];
  let [scale, prefix] = prefixes[0];
  for (const p of prefixes) if (Math.abs(v) >= p[0] * 0.9999) [scale, prefix] = p;
  return num(Number((v / scale).toPrecision(digits)), undefined, lang) + "\u00a0" + prefix + unit;
}
// A decade's label on a log axis: 100 Hz, 1 kHz, 10 kHz.
export const decade = (f, lang) => (f >= 1e6 ? num(f / 1e6, undefined, lang) + " MHz" : f >= 1e3 ? num(f / 1e3, undefined, lang) + " kHz" : num(f, undefined, lang) + " Hz");
export const deg = (v, lang, digits = 1) => num(v, digits, lang) + "°";

// *text* in italics: the English terms of the Portuguese strings (*buck*, *preload*), as the notes write
// them. rich() gives DOM nodes (never HTML); plainText() drops the asterisks, for aria labels.
export const rich = str => String(str).split(/\*([^*\n]+)\*/).map((part, i) => (i % 2 ? el("em", { text: part }) : part)).filter(p => p !== "");
export const plainText = str => String(str).replace(/\*([^*\n]+)\*/g, "$1");
// The same on a canvas, with the current font: the *spans* in its italic. Draws left-aligned at (x, y)
// unless measure is set, and returns the width.
export function richText(g, text, x, y, measure = false) {
  const base = g.font, italic = "italic " + base.replace(/^italic\s+/, "");
  let w = 0;
  String(text).split(/\*([^*\n]+)\*/).forEach((part, i) => {
    if (!part) return;
    g.font = i % 2 ? italic : base;
    if (!measure) g.fillText(part, x + w, y);
    w += g.measureText(part).width;
  });
  g.font = base;
  return w;
}

// ---- theme ----
export { css, FONT };
const themeWatchers = new Set();
new MutationObserver(() => themeWatchers.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => themeWatchers.forEach(f => f()));
export function watchTheme(redraw) { themeWatchers.add(redraw); return () => themeWatchers.delete(redraw); }
// Printing uses the light tokens (site.css, widgets.css), and there is no frame to wait for: redraw at once.
const printWatchers = new Set();
for (const type of ["beforeprint", "afterprint"]) addEventListener(type, () => printWatchers.forEach(f => f()));

// ---- elements ----
let serial = 0;
export const uid = prefix => `${prefix}-${++serial}`;
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.filter(c => c !== null && c !== undefined && c !== false));
  return node;
}

// ---- plots ----
// A chart panel, as the oscilloscope's: a canvas that fills the panel's width and redraws on resize
// and theme changes, and an optional legend at its upper right (HTML, set with legend(html)).
// draw(g, w, h, pointer) paints in CSS pixels; pointer is { x, y } in the canvas while it is over the
// chart when hover is set, else null. Returns { canvas, box, render, label(text), legend(html) → its height }.
export function canvasPlot(parent, { height = 280, draw, className = "", hover = false, overlay = false }) {
  // inline sizes, so the canvas never shows at its pixel size while widgets.css is still loading
  const box = el("div", { class: `w-chart ${hover ? "hover " : ""}${className}`, style: `position:relative;height:${height}px` });
  const canvas = el("canvas", { role: "img", style: "position:absolute;inset:0;width:100%;height:100%;display:block" });
  const legendBox = overlay ? el("div", { class: "w-chart-legend", "aria-hidden": "true" }) : null;
  box.append(canvas);
  if (legendBox) box.append(legendBox);
  parent.append(box);
  let queued = false, pointer = null;
  const render = () => {
    const [g, w, h] = sizeCanvas(canvas, box);
    if (!w || !h) return;
    g.font = FONT;
    draw(g, w, h, pointer);
  };
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); } };
  if (hover) {
    canvas.addEventListener("pointermove", e => { const r = canvas.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; request(); });
    canvas.addEventListener("pointerleave", () => { pointer = null; request(); });
  }
  new ResizeObserver(request).observe(box);
  watchTheme(request);
  printWatchers.add(render);
  return { canvas, box, render: request, label: text => canvas.setAttribute("aria-label", text),
           legend: html => { if (legendBox && legendBox.innerHTML !== html) legendBox.innerHTML = html; return legendBox ? legendBox.offsetHeight : 0; } };
}

// "Nice" linear ticks covering [lo, hi], about n of them.
export function ticks(lo, hi, n = 5) {
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return Number.isFinite(lo) ? [lo] : [];  // no span: no loop
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
export function niceRange(lo, hi, n = 5) {
  if (!(hi > lo)) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
  const t = ticks(lo, hi, n), step = t.length > 1 ? t[1] - t[0] : (hi - lo);
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
}

// One panel of a plot, drawn as the oscilloscope's Bode plot: grid in the grid colour (a log axis's
// 2..9 multiples lighter), value labels at the canvas's left edge, the axis's labels under the panel.
// box = { left, top, width, height }; x and y are { min, max, log?, ticks?, format(v), label? }; y.label
// goes above the panel, so leave about 20 px over it.
// Returns { X, Y, clip(fn) } to map values to pixels.
export function panel(g, box, x, y, opts = {}) {
  const { left, top, width, height } = box;
  const X = x.log ? v => left + Math.log10(v / x.min) / Math.log10(x.max / x.min) * width
                  : v => left + (v - x.min) / (x.max - x.min) * width;
  const Y = v => top + (y.max - v) / (y.max - y.min) * height;
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = css("--grid"); g.fillStyle = css("--muted"); g.font = FONT;
  const xLabel = (text, px) => {
    if (opts.xLabels === false) return;
    g.textAlign = px > left + width - 20 ? "right" : px < left + 20 ? "left" : "center";
    g.fillText(text, px, top + height + 14);
    g.textAlign = "left";
  };
  // vertical grid
  if (x.log) {
    for (let decade = 10 ** Math.floor(Math.log10(x.min)); decade <= x.max * 1.0001; decade *= 10)
      for (let n = 1; n < 10; n++) {
        const f = decade * n;
        if (f < x.min * 0.9999 || f > x.max * 1.0001) continue;
        const px = Math.round(X(f)) + 0.5;
        g.globalAlpha = n === 1 ? 1 : 0.5;
        g.beginPath(); g.moveTo(px, top); g.lineTo(px, top + height); g.stroke();
        g.globalAlpha = 1;
        const few = Math.log10(x.max / x.min) < 1.6;  // under two decades: label 2 and 5 too
        if (n === 1 || (few && (n === 2 || n === 5))) xLabel(x.format(f), px);
      }
  } else {
    for (const v of x.ticks || ticks(x.min, x.max, Math.max(3, Math.floor(width / 70)))) {
      const px = Math.round(X(v)) + 0.5;
      g.beginPath(); g.moveTo(px, top); g.lineTo(px, top + height); g.stroke();
      xLabel(x.format(v), px);
    }
  }
  // horizontal grid, labelled at the canvas's left edge
  for (const v of y.ticks || ticks(y.min, y.max, Math.max(2, Math.floor(height / 36)))) {
    const py = Math.round(Y(v)) + 0.5;
    g.beginPath(); g.moveTo(left, py); g.lineTo(left + width, py); g.stroke();
    g.fillText(y.format(v), 4, py + 4);
  }
  // the axis's name above the panel's right end, where the oscilloscope's legend sits
  if (y.label) { g.fillStyle = css("--muted"); g.textAlign = "right"; g.fillText(y.label, left + width, Math.max(11, top - 7)); g.textAlign = "left"; }
  g.restore();
  return {
    X, Y, box,
    clip(fn) { g.save(); g.beginPath(); g.rect(left, top, width, height); g.clip(); fn(); g.restore(); },
  };
}

// A polyline through (xs[i], ys[i]); style = { color, width, dash, alpha, step }.
export function line(g, p, xs, ys, { color = "--text", width = 1.4, dash = [], alpha = 1, step = false } = {}) {
  p.clip(() => {
    g.strokeStyle = css(color); g.lineWidth = width; g.setLineDash(dash); g.globalAlpha = alpha;
    g.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (!Number.isFinite(y)) { started = false; continue; }
      const px = p.X(xs[i]), py = p.Y(y);
      if (!started) { g.moveTo(px, py); started = true; }
      else if (step) { g.lineTo(px, p.Y(ys[i - 1])); g.lineTo(px, py); }
      else g.lineTo(px, py);
    }
    g.stroke();
  });
  g.setLineDash([]); g.globalAlpha = 1;
}
export function hline(g, p, v, color = "--muted", dash = [5, 4]) {
  const py = p.Y(v);
  p.clip(() => {
    g.strokeStyle = css(color); g.lineWidth = 1; g.setLineDash(dash);
    g.beginPath(); g.moveTo(p.box.left, py); g.lineTo(p.box.left + p.box.width, py); g.stroke(); g.setLineDash([]);
  });
}
export function vline(g, p, v, color = "--muted", dash = [2, 3], width = 1) {
  const px = p.X(v);
  p.clip(() => {
    g.strokeStyle = css(color); g.lineWidth = width; g.setLineDash(dash);
    g.beginPath(); g.moveTo(px, p.box.top); g.lineTo(px, p.box.top + p.box.height); g.stroke(); g.setLineDash([]);
  });
}
// A label in a framed box, as the Bode plot's margins box, so it stays legible over the curves.
export function tag(g, text, x, y, color = "--text", align = "left") {
  g.save();
  g.font = "600 11px system-ui, sans-serif";
  const w = g.measureText(text).width + 10;
  const left = align === "right" ? x - w : x;
  g.fillStyle = css("--panel"); g.fillRect(left, y - 13, w, 17);
  g.strokeStyle = css(color); g.lineWidth = 1; g.strokeRect(left + 0.5, y - 12.5, w - 1, 16);
  g.fillStyle = css(color); g.fillText(text, left + 5, y);
  g.restore();
}

// Legend under a plot: items [color, text, style ("solid" | "dashed" | "dotted" | "dot" | "cross" | "ring")].
export function legend(items) {
  return el("div", { class: "w-legend" }, ...items.map(([color, text, style = "solid"]) =>
    el("span", {}, el("i", { class: "w-key " + style, style: `--c: var(${color})` }),
      /\*[^*\n]+\*/.test(text) ? el("span", { class: "w-rich" }, ...rich(text)) : text)));  // one run of text in the flex row
}

// ---- oscilloscope charts ----
// Per pixel column of a plot width px wide over [x0, x1], the first, lowest, highest and last value
// of the samples (xs[i], vs[i]), i < n: the oscilloscope's buckets, which keep the switching ripple's
// envelope at any width. Also the lowest and highest value inside [x0, x1].
export function bucketsOf(xs, vs, n, x0, x1, width) {
  const out = [], scale = width / (x1 - x0);
  let min = Infinity, max = -Infinity, bucket = null, bmin = 0, bmax = 0, bfirst = 0, blast = 0;
  for (let i = 0; i < n; i++) {
    const t = xs[i], v = vs[i];
    if (!Number.isFinite(v)) continue;
    const px = Math.floor((t - x0) * scale);
    if (px !== bucket) {
      if (bucket !== null) out.push([bucket, bfirst, bmin, bmax, blast]);
      bucket = px; bmin = v; bmax = v; bfirst = v;
    } else { if (v < bmin) bmin = v; if (v > bmax) bmax = v; }
    blast = v;
    if (t >= x0 && t <= x1) { if (v < min) min = v; if (v > max) max = v; }
  }
  if (bucket !== null) out.push([bucket, bfirst, bmin, bmax, blast]);
  return { buckets: out, min, max };
}
// A staircase through (xs[k], vs[k]), each value held until the next x, as corner points.
export function stairs(xs, vs, end) {
  const points = [];
  for (let k = 0; k < xs.length; k++) points.push([xs[k], vs[k]], [k + 1 < xs.length ? xs[k + 1] : end, vs[k]]);
  const finite = vs.filter(Number.isFinite);
  return { points, min: Math.min(...finite), max: Math.max(...finite) };
}
// The value of a staircase or of samples at x: held from the last x at or before it, or interpolated.
export function valueAt(xs, vs, x, n = xs.length, held = false) {
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; }
  if (held) return vs[Math.max(0, Math.min(n - 1, lo < n && xs[lo] === x ? lo : lo - 1))];
  if (lo <= 0) return vs[0];
  if (lo >= n) return vs[n - 1];
  const t0 = xs[lo - 1], t1 = xs[lo];
  return t1 > t0 ? vs[lo - 1] + (vs[lo] - vs[lo - 1]) * (x - t0) / (t1 - t0) : vs[lo];
}

// Charts stacked as the oscilloscope's, sharing one x axis (labelled under the last one), with the
// grid, value axis, traces, trigger marker, pointer cursor and legend of scope.js.
//   x = { min, max, step, label(v) (axis), cursor(v) (the pointer's x), trigger (x of the marker, or null) }
//   charts[i] = { height, aria, unit, mode ("detail" | "auto"; a Y button switches), range(min, max) → [low, high]
//                 (instead of the modes and the button), minStep,
//                 series: [{ label, color, style: { dash, width, order }, data(x0, x1, width) → { buckets | points, min, max },
//                            at(x), read(v) → text }],
//                 extra(g, y, plot) (drawn under the traces; plot = { left, right, top, bottom }) }
// Returns { render(), label(i, text) }.
export function scopeCharts(parent, { x, charts, lang }) {
  const fmt = localNumber(lang), words = Y_WORDS[lang] || Y_WORDS.en;
  let pointerX = null;
  const items = charts.map((spec, i) => {
    const last = i === charts.length - 1, state = { mode: spec.mode || "auto", previous: null, margin: null, legendHeight: 0 };
    const plot = canvasPlot(parent, { height: spec.height, hover: true, overlay: true, draw: (g, w, h) => draw(spec, state, last, plot, g, w, h) });
    plot.label(spec.aria);
    if (!spec.range) {  // a chart with its own range has no Y button
      const button = el("button", { type: "button", class: "w-ymode", title: words.title, text: words[state.mode] });
      button.addEventListener("click", () => { state.mode = state.mode === "auto" ? "detail" : "auto"; state.previous = null; button.textContent = words[state.mode]; plot.render(); });
      plot.box.append(button);
    }
    plot.canvas.addEventListener("pointermove", e => {
      const m = state.margin;
      if (!m) return;
      const r = plot.canvas.getBoundingClientRect(), px = e.clientX - r.left;
      pointerX = px < m.left || px > r.width - m.right ? null : x.min + (px - m.left) / (r.width - m.left - m.right) * (x.max - x.min);
      renderAll();
    });
    plot.canvas.addEventListener("pointerleave", () => { pointerX = null; renderAll(); });
    return plot;
  });
  const renderAll = () => items.forEach(p => p.render());

  function draw(spec, state, last, plot, g, w, h) {
    // the scope's margins; on touch screens the Y button is taller, and the plot starts below it
    // (and below the legend, when a narrow chart wraps it to more lines)
    const m = state.margin = { left: 50, right: 14, top: Math.max(COARSE.matches && !spec.range ? 46 : 34, state.legendHeight + 16 || 0), bottom: last ? 22 : 12 };
    const pw = w - m.left - m.right, ph = h - m.top - m.bottom;
    const X = v => m.left + (v - x.min) / (x.max - x.min) * pw;
    timeGrid(g, { from: x.min, to: x.max, step: x.step, x: X, top: m.top, bottom: h - m.bottom, h, label: last ? x.label : null });
    const data = spec.series.map(s => s.data(x.min, x.max, pw));
    let min = Math.min(...data.map(d => d.min)), max = Math.max(...data.map(d => d.max));
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    const [low, high] = spec.range ? spec.range(min, max) : state.mode === "detail" ? detailRange(min, max) : (state.previous = autoRange(min, max, state.previous));
    const y = valueAxis(g, { low, high, top: m.top, height: ph, x0: m.left, x1: w - m.right, side: "left", color: "--muted", unit: spec.unit, fmt, minStep: spec.minStep });
    if (spec.extra) { g.save(); g.beginPath(); g.rect(m.left, m.top, pw, ph); g.clip(); spec.extra(g, y, { left: m.left, right: w - m.right, top: m.top, bottom: h - m.bottom }); g.restore(); }
    spec.series.map((s, i) => [s, data[i]]).sort((a, b) => (a[0].style?.order || 0) - (b[0].style?.order || 0))
      .forEach(([s, d]) => trace(g, { left: m.left, width: pw, height: h, color: s.color, style: s.style || {}, points: d.points, buckets: d.buckets, x: X, y }));
    if (x.trigger !== null && x.trigger !== undefined && x.trigger >= x.min && x.trigger <= x.max) triggerMarker(g, X(x.trigger), m.top, h - m.bottom);
    const show = pointerX !== null;
    if (show) {
      const px = X(pointerX);
      cursorLine(g, px, m.top, h - m.bottom);
      for (const s of spec.series) { const v = s.at(pointerX); if (Number.isFinite(v)) cursorDot(g, px, y(v), s.color); }
      if (last) cursorTime(g, x.cursor(pointerX), px, m.left, w - m.right, h);
    }
    const height = plot.legend(spec.series.map(s => legendItem(s.color, s.label + (show ? ` <b>${s.read(s.at(pointerX))}</b>` : ""), !!s.style?.dash)).join(""));
    if (!show && height !== state.legendHeight) { state.legendHeight = height; plot.render(); }  // the plot's top follows the legend
  }
  return { render: renderAll, label: (i, text) => items[i].label(text), fmt };
}
const COARSE = matchMedia("(pointer: coarse)");
const Y_WORDS = {
  en: { auto: "Y auto", detail: "Y detail", title: "Vertical scale: auto (round divisions, as an oscilloscope's V/div) or detail (fits the data tightly)" },
  pt: { auto: "Y auto", detail: "Y detalhe", title: "Escala vertical: auto (divisões redondas, como o V/div de um osciloscópio) ou detalhe (ajustada aos dados)" },
};
export { timeLabel, reading, niceStep, localNumber };

// ---- controls ----
// A labelled range input in a grid of sliders, as the Bode window's: label, track, value. log: the
// slider moves the value geometrically between min and max. The value is also a text box: typing
// "1k", "1 kHz", "0,707" or "2.2e-3" and pressing Enter (or leaving the box) sets it exactly, clamped
// to [min, max]. Returns { input, output, set(value), get() }; output is the text box.
export function slider(parent, { label, min, max, value, log = false, step, format, oninput }) {
  const id = uid("w-slider");
  const steps = 1000;
  const input = el("input", { type: "range", id, min: log ? 0 : min, max: log ? steps : max, step: log ? 1 : step ?? (max - min) / steps });
  const output = el("input", { type: "text", id: id + "-value", name: id + "-value", class: "w-num", maxlength: 24, spellcheck: "false", autocomplete: "off", "aria-label": label });
  const name = el("label", { for: id, text: label });
  const toValue = () => (log ? min * (max / min) ** (input.value / steps) : +input.value);
  let current = value;
  const show = v => { output.value = format(v); input.setAttribute("aria-valuetext", format(v)); output.removeAttribute("aria-invalid"); };
  const set = v => {
    current = v;
    input.value = log ? Math.round(steps * Math.log(Math.min(Math.max(v, min), max) / min) / Math.log(max / min)) : v;
    show(v);
  };
  input.addEventListener("input", () => { current = toValue(); show(current); oninput(current); });
  const typed = () => {
    let v = parseTyped(output.value);
    if (!Number.isFinite(v)) { output.setAttribute("aria-invalid", "true"); return; }
    if (!log && step) v = min + Math.round((v - min) / step) * step;
    v = Math.min(Math.max(v, min), max);
    if (v !== current) { set(v); oninput(current); } else show(v);
  };
  output.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); typed(); output.select(); }
    else if (e.key === "Escape") { show(current); output.blur(); }
  });
  output.addEventListener("change", typed);
  output.addEventListener("focus", () => output.select());
  // the box follows the slider when a figure disables the slider
  new MutationObserver(() => { output.disabled = input.disabled; }).observe(input, { attributes: true, attributeFilter: ["disabled"] });
  set(value);
  let grid = parent.lastElementChild;
  if (!grid || !grid.classList.contains("w-sliders")) parent.append(grid = el("div", { class: "w-sliders" }));
  grid.append(name, input, output);
  return { input, output, set, get: () => current };
}

// A typed number with an optional SI prefix and unit: "1k", "1,5 kHz", "−20", "470 µ", "2e3 Hz".
const PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
export function parseTyped(text) {
  const t = text.replace(/[\s\u00a0\u202f]/g, "").replace(/\u2212/g, "-").replace(",", ".");
  // the number, an optional prefix, then only a unit's letters or symbols: "1k5" or "1..2" is refused
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([pnuµμmkKMG])?([^\d.,+\-]*)$/i.exec(t);
  if (!m) return NaN;
  let prefix = m[2];
  if (prefix && !(prefix in PREFIX)) prefix = prefix.toLowerCase() in PREFIX ? prefix.toLowerCase() : undefined;
  return +m[1] * (prefix ? PREFIX[prefix] : 1);
}

// A group of radio buttons drawn as the oscilloscope's segmented switch. options: [[value, text]].
export function choice(parent, { label, options, value, onchange }) {
  const name = uid("w-choice");
  const row = el("div", { class: "w-segmented" });
  const group = el("fieldset", { class: "w-switch" }, el("legend", {}, ...rich(label)), row);
  const inputs = options.map(([v, text]) => {
    const input = el("input", { type: "radio", name, value: v, id: `${name}-${v}` });
    input.checked = v === value;
    input.addEventListener("change", () => input.checked && onchange(v));
    row.append(el("span", {}, input, el("label", { for: input.id, text })));
    return input;
  });
  parent.append(group);
  return { set: v => inputs.forEach(i => { i.checked = i.value === v; }) };
}

// A checkbox switch.
export function toggle(parent, { label, checked, onchange }) {
  const id = uid("w-toggle");
  const input = el("input", { type: "checkbox", id });
  input.checked = checked;
  input.addEventListener("change", () => onchange(input.checked));
  parent.append(el("div", { class: "w-toggle" }, input, el("label", { for: id, text: label })));
  return input;
}

// The standard layout: the plots, then the readouts, then the controls in a panel, then the links.
export function frame(body) {
  body.classList.add("w");
  const plots = el("div", { class: "w-plots" }), readout = el("div", { class: "w-readout", "aria-live": "polite" }),
        controls = el("div", { class: "w-panel w-controls" }), foot = el("div", { class: "w-foot" });
  body.append(plots, readout, controls, foot);
  return { plots, readout, controls, foot };
}

// Link to an oscilloscope scenario.
export function scopeLink(lang, name, scenario, text) {
  return el("a", { class: "w-scope", href: `/power-labs/scope.html?c=${name}&s=${scenario}&lang=${lang}`, text: text + " →" });
}
