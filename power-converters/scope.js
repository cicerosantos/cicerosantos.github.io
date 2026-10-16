// The oscilloscope for recorded scenarios: the live demo's charts, cursors, measurements and Bode
// window, reading frames from files. scope.html?c=<converter>&s=<scenario> opens one scenario of
// converters/<converter>/: converter.js describes its frames and its loop-gain model, and
// scenarios.json its controllers, events and the frame file of each pair.
import { cx, cadd, csub, cmul, cdiv, cscale, cexpj } from "./complex.js";

const params = new URLSearchParams(location.search);
const NAME = /^[a-z0-9-]+$/.test(params.get("c") || "") ? params.get("c") : "buck";
const BASE = `converters/${NAME}/`;
const converter = (await import(`./${BASE}converter.js`)).default;
const spec = await (await fetch(BASE + "scenarios.json", { cache: "no-cache" })).json();
const { COL, COLUMNS, CHARTS, GATE } = converter;

const Y_MODES = { auto: "Y auto", detail: "Y detail", manual: "Y manual" };
const Y_TITLE = "Click to switch between auto (span of at least 20% of the signal, stable between frames) and " +
  "detail (fits the data tightly, to inspect ripple). Shift+wheel zooms this axis by hand.";

let frame = null;          // { meta, data: Float32Array, rows }
let view = null;           // [start, end] in us from the frame start
let cursorX = null;        // us from the frame start, under the mouse
let selection = null;      // [start, end] being dragged out to zoom into, us from the frame start
let frameEpoch = 0;        // counts changes of frame length: a drag belongs to one
let cursors = null;        // { a, b }: measurement cursors in us from the trigger, or null when hidden
let measuring = false;     // the measurement table is shown

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const $ = id => document.getElementById(id);

// U+2212 for negative numbers, as in the table headings.
const minus = text => String(text).replace(/-(?=[0-9.])/g, "−");

function addButtons(container, choices, onclick, key) {
  for (const [value, label] of choices) {
    const button = document.createElement("button");
    button.textContent = label;
    button.dataset[key] = value;
    button.onclick = () => onclick(value, button);
    container.appendChild(button);
  }
}
$("zoom-in").onclick = () => zoom(0.5);
$("zoom-out").onclick = () => zoom(2);
$("zoom-fit").onclick = () => fit();

function press(button, on) {
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
}

const ohms = r => r >= 1000 ? `${Number((r / 1000).toPrecision(3))} kΩ` : `${Number(r.toPrecision(3))} Ω`;

// ---- time axis: frames are shown relative to the trigger, like an oscilloscope ----

// A time for the axis, with the digits its grid step needs; extra adds digits for cursor readouts.
function timeLabel(us, span, extra = 0) {
  const ms = span >= 2000;
  const value = ms ? us / 1000 : us;
  const unit = ms ? " ms" : " µs";
  const step = (ms ? span / 1000 : span) / 8;
  const digits = (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3) + extra;
  return minus(value.toFixed(Math.min(digits, 4))) + unit;
}

function niceStep(span, count) {
  const raw = span / count, power = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

function fit() {
  if (!frame) return;
  view = [0, frame.meta.lengthUs];
  requestDraw();
}

function clampView(start, end) {
  const length = frame.meta.lengthUs, span = Math.min(Math.max(end - start, 0.05), length);
  start = Math.min(Math.max(start, 0), length - span);
  return [start, start + span];
}

function zoom(factor, centre) {
  if (!frame || !view) return;
  const c = centre ?? (view[0] + view[1]) / 2;
  view = clampView(c - (c - view[0]) * factor, c + (view[1] - c) * factor);
  requestDraw();
}

// ---- data access ----

function lowerBound(t) {
  // first row with time >= t (times are increasing)
  let lo = 0, hi = frame.rows;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frame.data[mid * COLUMNS] < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// The reference the firmware uses. At the start of each period it moves toward the commanded one by
// at most the slew rate (V/ms) times the period, then holds for the period. A frame starts from the
// value the firmware had then (vrefNow), which may be mid-ramp; a command acts in the period it
// arrives, so that period already has one step.
function vrefAt(t) {
  const P = frame.meta.periodUs, initial = frame.meta.initial;
  const approach = (from, to, rate, steps) => steps <= 0 ? from
    : rate ? from + Math.sign(to - from) * Math.min(Math.abs(to - from), rate * steps * P / 1000) : to;
  const periods = us => Math.floor(us / P + 1e-6);
  let from = initial.vrefNow ?? initial.vref, to = initial.vref, rate = initial.slew || 0, since = 0, lead = 0;
  for (const [at, name, v] of frame.meta.events) {
    if (at > t || (name !== "vref" && name !== "slew")) continue;
    from = approach(from, to, rate, periods(at - since) - 1 + lead);
    since = at; lead = 1;
    if (name === "vref") to = v; else rate = v;
  }
  return approach(from, to, rate, periods(t - since) + lead);
}

// The value under the cursor: on the straight line drawn between the rows, as the plot shows it; a
// gate changes only between the two rows kept around each edge, so it reads the nearest row.
function valueAt(column, t, digital = false) {
  if (column === "vref") return vrefAt(t);
  if (!digital) return interpolate(column, t);
  const i = Math.min(Math.max(lowerBound(t), 0), frame.rows - 1);
  const j = i > 0 && Math.abs(frame.data[(i - 1) * COLUMNS] - t) < Math.abs(frame.data[i * COLUMNS] - t) ? i - 1 : i;
  return frame.data[j * COLUMNS + column];
}

// Min/max per pixel column over the visible rows; keeps fast edges visible at any zoom.
function envelope(column, width, x0, x1) {
  const out = [];
  if (column === "vref") {
    const points = [];
    for (let i = 0; i <= 400; i++) points.push([x0 + (x1 - x0) * i / 400, vrefAt(x0 + (x1 - x0) * i / 400)]);
    for (const [at, name] of frame.meta.events)
      if ((name === "vref" || name === "slew") && at > x0 && at < x1) points.push([at - 1e-6, vrefAt(at - 1e-6)], [at, vrefAt(at)]);
    points.sort((a, b) => a[0] - b[0]);
    return { points, min: Math.min(...points.map(p => p[1])), max: Math.max(...points.map(p => p[1])) };
  }
  const first = Math.max(lowerBound(x0) - 1, 0), last = Math.min(lowerBound(x1) + 1, frame.rows);
  const scale = width / (x1 - x0), d = frame.data;
  let min = Infinity, max = -Infinity, bucket = null, bmin = 0, bmax = 0, bfirst = 0, blast = 0;
  // one row, or one block of rows from t to tEnd: its min, max, first and last values
  const add = (t, low, high, a, z, tEnd) => {
    const px = Math.floor((t - x0) * scale);
    if (px !== bucket) {
      if (bucket !== null) out.push([bucket, bfirst, bmin, bmax, blast]);
      bucket = px; bmin = low; bmax = high; bfirst = a;
    } else { if (low < bmin) bmin = low; if (high > bmax) bmax = high; }
    blast = z;
    if (tEnd >= x0 && t <= x1) { if (low < min) min = low; if (high > max) max = high; }
  };
  const rows = (i0, i1) => {
    for (let i = i0; i < i1; i++) { const t = d[i * COLUMNS], v = d[i * COLUMNS + column]; add(t, v, v, v, v, t); }
  };
  const blocks = frame.blocks;
  if (blocks && last - first > 2 * BLOCK * width) {  // zoomed out: whole blocks, each narrower than a pixel
    const b0 = Math.ceil(first / BLOCK), b1 = Math.floor(last / BLOCK), c = blocks.columns[column];
    rows(first, b0 * BLOCK);
    for (let k = b0; k < b1; k++) add(blocks.t0[k], c.min[k], c.max[k], c.first[k], c.last[k], blocks.t1[k]);
    rows(Math.max(b1 * BLOCK, b0 * BLOCK), last);
  } else rows(first, last);
  if (bucket !== null) out.push([bucket, bfirst, bmin, bmax, blast]);
  return { buckets: out, min, max, first, last };
}

// Min, max, first and last value of each column over blocks of BLOCK rows, and the integrals of the
// value and of its square between the block's rows, built once per frame: a zoomed-out view and the
// measurements read a few thousand blocks instead of a quarter of a million rows.
const BLOCK = 32;
function buildBlocks(data, rows) {
  const n = Math.floor(rows / BLOCK), t0 = new Float32Array(n), t1 = new Float32Array(n), columns = {};
  for (let c = 1; c < COLUMNS; c++)
    columns[c] = { min: new Float32Array(n), max: new Float32Array(n), first: new Float32Array(n), last: new Float32Array(n),
                   area: new Float64Array(n), square: new Float64Array(n) };
  for (let k = 0; k < n; k++) {
    const i0 = k * BLOCK, i1 = i0 + BLOCK;
    t0[k] = data[i0 * COLUMNS]; t1[k] = data[(i1 - 1) * COLUMNS];
    for (let c = 1; c < COLUMNS; c++) {
      let low = Infinity, high = -Infinity, area = 0, square = 0;
      for (let i = i0; i < i1; i++) {
        const v = data[i * COLUMNS + c];
        if (v < low) low = v;
        if (v > high) high = v;
        if (i > i0) {  // trapezoids, as statistics() integrates
          const u = data[(i - 1) * COLUMNS + c], dt = data[i * COLUMNS] - data[(i - 1) * COLUMNS];
          area += (v + u) / 2 * dt; square += (v * v + v * u + u * u) / 3 * dt;
        }
      }
      const b = columns[c];
      b.min[k] = low; b.max[k] = high; b.first[k] = data[i0 * COLUMNS + c]; b.last[k] = data[(i1 - 1) * COLUMNS + c];
      b.area[k] = area; b.square[k] = square;
    }
  }
  return { t0, t1, columns };
}

// ---- drawing ----

class Chart {
  constructor(element, spec) {
    this.element = element; this.spec = spec;
    this.first = element.dataset.chart === "0"; this.last = Number(element.dataset.chart) === CHARTS.length - 1;
    this.base = document.createElement("canvas");
    this.overlay = document.createElement("canvas");
    this.overlay.className = "overlay";
    this.base.setAttribute("role", "img"); this.base.setAttribute("aria-label", element.dataset.label);
    this.overlay.setAttribute("aria-hidden", "true");
    this.legend = document.createElement("div");
    this.legend.className = "legend";
    element.append(this.base, this.overlay, this.legend);
    this.yMode = "auto";
    this.auto = {}; this.manual = {}; this.current = {};
    if (!spec.digital) {
      this.yButton = document.createElement("button");
      this.yButton.className = "ymode"; this.yButton.title = Y_TITLE; this.yButton.textContent = Y_MODES.auto;
      this.yButton.onclick = () => { this.yMode = this.yMode === "auto" ? "detail" : "auto"; this.auto = {}; this.draw(); };
      element.append(this.yButton);
    }
    // Same margins on every chart, so their time axes line up.
    this.margin = { left: 50, right: 50, top: spec.digital ? 22 : 34, bottom: this.last ? 22 : 16 };
    this.attachMouse();
  }

  size(canvas) {
    const ratio = window.devicePixelRatio || 1, w = this.element.clientWidth, h = this.element.clientHeight;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    }
    const g = canvas.getContext("2d");
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    return [g, w, h];
  }

  plotWidth() { return this.element.clientWidth - this.margin.left - this.margin.right; }
  x(t) { return this.margin.left + (t - view[0]) / (view[1] - view[0]) * this.plotWidth(); }

  draw() {
    const [g, w, h] = this.size(this.base);
    const m = this.margin, pw = w - m.left - m.right, ph = h - m.top - m.bottom;
    g.font = "11px system-ui, sans-serif";
    if (!frame || !view) return;
    const trigger = frame.meta.triggerUs, span = view[1] - view[0];
    this.envelopes = {};  // per column, for this draw: the axis range and the trace use the same one
    // vertical grid with time from the trigger
    g.strokeStyle = css("--grid"); g.fillStyle = css("--muted"); g.lineWidth = 1;
    const step = niceStep(span, 8);
    for (let t = Math.ceil((view[0] - trigger) / step) * step; t <= view[1] - trigger + 1e-9; t += step) {
      const px = this.x(t + trigger);
      g.beginPath(); g.moveTo(px, m.top); g.lineTo(px, h - m.bottom); g.stroke();
      if (this.last) { g.textAlign = "center"; g.fillText(timeLabel(t, span), px, h - 6); g.textAlign = "left"; }
    }
    const scales = [];
    if (this.spec.digital) {
      const lanes = this.spec.digital;
      lanes.forEach(([label, column, color], lane) => {
        const top = m.top + lane * ph / lanes.length, height = ph / lanes.length;
        const y = v => top + height * (0.85 - 0.7 * v);
        this.trace(g, column, color, y, pw);
        g.fillStyle = css(color); g.fillText(label.split(" ")[0], 6, y(0.5) + 4);
        scales.push({ column, y, unit: "", label });
      });
    } else {
      const sides = ["left", "right"].filter(side => this.spec[side]);
      for (const side of sides) {
        const ranges = this.spec[side].series.map(([, column]) => this.envelopes[column] = envelope(column, pw, view[0], view[1]));
        this.current[side] = this.yRange(side, Math.min(...ranges.map(r => r.min)), Math.max(...ranges.map(r => r.max)));
      }
      if (sides.length === 2 && this.yMode !== "manual") this.alignZero();
      const series = [];
      for (const side of sides) {
        const axis = this.spec[side], [low, high] = this.current[side];
        const y = v => m.top + (high - v) / (high - low) * ph;
        // about one label per 26 px, at most 4 divisions
        const ystep = niceStep(high - low, Math.max(1.5, Math.min(4, ph / 26))), digits = Math.max(0, -Math.floor(Math.log10(ystep)));
        g.fillStyle = sides.length === 2 ? css(axis.series[0][2]) : css("--muted");
        for (let v = Math.ceil(low / ystep - 1e-9) * ystep; v <= high + 1e-9; v += ystep) {
          const py = y(v), label = minus(v.toFixed(digits)) + " " + axis.unit;
          if (side === "left") {
            g.strokeStyle = css("--grid"); g.lineWidth = Math.abs(v) < ystep / 2 && sides.length === 2 ? 2 : 1;
            g.beginPath(); g.moveTo(m.left, py); g.lineTo(w - m.right, py); g.stroke(); g.lineWidth = 1;
            g.fillText(label, 4, py + 4);
          } else {
            g.fillText(label, w - m.right + 4, py + 4);
          }
        }
        for (const [label, column, color, style] of axis.series) {
          series.push({ column, color, y, style: style || {} });
          scales.push({ column, y, unit: axis.unit, label });
        }
      }
      series.sort((a, b) => (a.style.order || 0) - (b.style.order || 0));
      for (const { column, color, y, style } of series) this.trace(g, column, color, y, pw, style);
    }
    // trigger and command markers
    const tx = this.x(trigger);
    if (tx >= m.left && tx <= w - m.right) {
      g.strokeStyle = css("--trigger"); g.setLineDash([4, 3]); g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(tx, m.top); g.lineTo(tx, h - m.bottom); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = css("--trigger");
      g.beginPath(); g.moveTo(tx - 5, m.top - 8); g.lineTo(tx + 5, m.top - 8); g.lineTo(tx, m.top - 2); g.fill();
    }
    this.scales = scales;
    if (this.yButton) { this.yButton.textContent = Y_MODES[this.yMode]; this.yButton.classList.toggle("manual", this.yMode === "manual"); }
    this.drawOverlay();
  }

  // Y range for one axis. Auto mode behaves like a scope's fixed V/div: the span is at least 20% of
  // the signal's magnitude, so a small ripple on a large DC level looks small, the limits fall on
  // round divisions, and the range is kept between frames until the signal leaves it or uses too
  // little of it.
  yRange(side, min, max) {
    if (!isFinite(min)) { min = 0; max = 1; }
    if (this.yMode === "manual" && this.manual[side]) return this.manual[side];
    if (this.yMode === "detail") {
      const pad = (max - min) * 0.08 || Math.max(Math.abs(max) * 0.01, 0.01);
      return [min - pad, max + pad];
    }
    const span = Math.max(max - min, 0.2 * Math.max(Math.abs(min), Math.abs(max)), 0.1);
    const mid = (min + max) / 2, step = niceStep(span * 1.1, 4);
    let low = Math.floor((mid - span * 0.55) / step) * step, high = Math.ceil((mid + span * 0.55) / step) * step;
    // A one-signed signal does not need the other side of zero; keep a sliver so it stays visible.
    if (min >= 0 && low < 0) low = -0.03 * high;
    if (max <= 0 && high >= 0) high = -0.03 * low;
    const previous = this.auto[side];
    if (previous && min >= previous[0] && max <= previous[1] && high - low >= 0.6 * (previous[1] - previous[0])) return previous;
    return this.auto[side] = [low, high];
  }

  // Two axes on one chart: extend the ranges so that both zeros fall at the same height, as two scope
  // channels share the ground level. Only when both ranges include zero. When one signal is mostly
  // positive and the other mostly negative (the low-side switch: Vds up, Id down), zero goes to the
  // middle and each trace keeps its own half.
  alignZero() {
    const [l, r] = [this.current.left, this.current.right];
    if (!(l[0] <= 0 && l[1] >= 0 && r[0] <= 0 && r[1] >= 0)) return;
    const below = ([low, high]) => -low / (high - low);  // fraction of the height below zero
    if (!(l[1] > l[0] && r[1] > r[0])) return;
    const q = Math.abs(below(l) - below(r)) > 0.5 ? 0.5 : Math.max(below(l), below(r));
    if (q <= 0 || q >= 0.95) return;  // both above zero (nothing to do), or one all below it
    const extend = ([low, high]) => below([low, high]) < q ? [-q * high / (1 - q), high]
      : below([low, high]) > q ? [low, -low * (1 - q) / q] : [low, high];
    this.current.left = extend(l); this.current.right = extend(r);
  }

  zoomY(factor, clientY) {
    const rect = this.overlay.getBoundingClientRect(), m = this.margin;
    const fraction = (clientY - rect.top - m.top) / (rect.height - m.top - m.bottom);
    for (const side of Object.keys(this.current)) {
      const [low, high] = this.current[side], centre = high - fraction * (high - low);
      this.manual[side] = [centre - (centre - low) * factor, centre + (high - centre) * factor];
    }
    this.yMode = "manual";
    this.draw();
  }

  trace(g, column, color, y, pw, style = {}) {
    g.save();
    g.beginPath(); g.rect(this.margin.left, 0, pw, this.element.clientHeight); g.clip();
    g.strokeStyle = css(color); g.lineWidth = style.width || 1.4; g.globalAlpha = style.alpha || 1;
    g.setLineDash(style.dash || []); g.beginPath();
    const e = this.envelopes?.[column] || envelope(column, pw, view[0], view[1]);
    if (e.points) {
      e.points.forEach(([t, v], i) => i ? g.lineTo(this.x(t), y(v)) : g.moveTo(this.x(t), y(v)));
    } else {
      const left = this.margin.left;
      e.buckets.forEach(([px, first, min, max, last], i) => {
        const x = left + px + 0.5;
        if (i) g.lineTo(x, y(first)); else g.moveTo(x, y(first));
        if (max !== min) { g.moveTo(x, y(min)); g.lineTo(x, y(max)); g.moveTo(x, y(last)); }
      });
    }
    g.stroke(); g.restore();
  }

  drawOverlay() {
    const [g, w, h] = this.size(this.overlay);
    const legend = [];
    const all = this.spec.digital || [...this.spec.left.series, ...(this.spec.right ? this.spec.right.series : [])];
    if (frame && view && selection) {
      const x0 = this.x(selection[0]), x1 = this.x(selection[1]), m = this.margin;
      g.fillStyle = css("--accent"); g.globalAlpha = 0.12; g.fillRect(x0, m.top, x1 - x0, h - m.top - m.bottom); g.globalAlpha = 1;
      g.strokeStyle = css("--accent"); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + 0.5, m.top); g.lineTo(x0 + 0.5, h - m.bottom); g.moveTo(x1 - 0.5, m.top); g.lineTo(x1 - 0.5, h - m.bottom); g.stroke();
      if (this.first) {
        const label = "zoom to " + engineering((selection[1] - selection[0]) * 1e-6, "s");
        g.font = "11px system-ui, sans-serif"; g.fillStyle = css("--accent");
        g.fillText(label, Math.min(x0 + 4, w - m.right - g.measureText(label).width - 2), m.top + 12);
      }
    }
    const showCursor = frame && view && cursorX !== null && cursorX >= view[0] && cursorX <= view[1];
    if (showCursor) {
      const px = this.x(cursorX);
      g.strokeStyle = css("--cursor"); g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, this.margin.top); g.lineTo(px, h - this.margin.bottom); g.stroke();
      for (const s of this.scales || []) {
        const v = valueAt(s.column, cursorX);
        g.fillStyle = css(all.find(a => a[1] === s.column)[2]);
        g.beginPath(); g.arc(px, s.y(v), 3, 0, 7); g.fill();
      }
      if (this.last) {  // the time under the cursor, on the time axis
        const label = timeLabel(cursorX - frame.meta.triggerUs, view[1] - view[0], 2);
        g.font = "11px system-ui, sans-serif";
        const tw = g.measureText(label).width + 8, lx = Math.min(Math.max(px - tw / 2, this.margin.left), w - this.margin.right - tw);
        g.fillStyle = css("--text"); g.fillRect(lx, h - 18, tw, 16);
        g.fillStyle = css("--panel"); g.fillText(label, lx + 4, h - 6);
      }
    }
    if (frame && view && cursors) this.drawCursors(g, w, h);
    for (const [label, column, color] of all) {
      let text = label;
      if (showCursor) {
        const v = valueAt(column, cursorX, this.spec.digital);
        text += (this.spec.digital ? " <b class=\"state\">" : " <b>") + (this.spec.digital ? (v > 0.5 ? "on" : "off")
          : reading(v, this.spec.left.series.some(s => s[1] === column) ? this.spec.left.unit : this.spec.right.unit)) + "</b>";
      }
      const dash = this.spec.digital ? null : all.find(a => a[1] === column)[3]?.dash;
      legend.push(`<span><i style="border-top-color:var(${color});border-top-style:${dash ? "dashed" : "solid"}"></i>${text}</span>`);
    }
    if (this.spec.title) legend.unshift(`<span>${this.spec.title}</span>`);
    this.legend.innerHTML = legend.join("");
  }

  // Cursors A and B in the text colour, which no trace uses: A dashed, B dotted, each with a lettered
  // tab at the top of every chart. An arrow at the edge marks one outside the view.
  drawCursors(g, w, h) {
    const m = this.margin, color = css("--measure"), panel = css("--panel");
    g.font = "bold 10px system-ui, sans-serif";
    for (const key of ["a", "b"]) {
      const t = cursors[key] + frame.meta.triggerUs, letter = key.toUpperCase();
      g.strokeStyle = g.fillStyle = color; g.lineWidth = 1.3;
      if (t < view[0] || t > view[1]) {
        const left = t < view[0], x = left ? m.left + 2 : w - m.right - 2, y = m.top + (key === "a" ? 8 : 22);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (left ? 8 : -8), y - 5); g.lineTo(x + (left ? 8 : -8), y + 5); g.fill();
        g.fillText(letter, x + (left ? 11 : -18), y + 4);
        continue;
      }
      const px = Math.round(this.x(t)) + 0.5;
      g.setLineDash(key === "a" ? [6, 3] : [1.5, 2.5]);
      g.beginPath(); g.moveTo(px, m.top); g.lineTo(px, h - m.bottom); g.stroke(); g.setLineDash([]);
      g.fillRect(px - 6, m.top, 12, 13);
      g.fillStyle = panel; g.textAlign = "center"; g.fillText(letter, px, m.top + 10); g.textAlign = "left";
    }
    g.font = "11px system-ui, sans-serif";
  }

  // The cursor within 6 px of the pointer, if any.
  nearCursor(clientX) {
    if (!cursors || !frame || !view) return null;
    const rect = this.overlay.getBoundingClientRect();
    let best = null, distance = 6;
    for (const key of ["a", "b"]) {
      const d = Math.abs(this.x(cursors[key] + frame.meta.triggerUs) - (clientX - rect.left));
      if (d <= distance) { best = key; distance = d; }
    }
    return best;
  }

  toFrameTime(clientX) {
    const rect = this.overlay.getBoundingClientRect();
    return view[0] + (clientX - rect.left - this.margin.left) / this.plotWidth() * (view[1] - view[0]);
  }

  attachMouse() {
    let drag = null;
    this.overlay.addEventListener("pointermove", event => {
      if (!frame || !view) return;
      if (drag && drag.epoch !== frameEpoch) drag = null;
      if (drag && drag.cursor) {
        const t = Math.min(Math.max(this.toFrameTime(event.clientX), 0), frame.meta.lengthUs);
        cursors[drag.cursor] = t - frame.meta.triggerUs;
        requestOverlay(); requestMeasure();
        return;
      }
      if (drag && drag.pan) {
        const shift = (event.clientX - drag.x) / this.plotWidth() * (drag.view[1] - drag.view[0]);
        view = clampView(drag.view[0] - shift, drag.view[1] - shift);
        requestDraw();
        return;
      }
      if (drag) {  // selecting a time span to zoom into
        const t = Math.min(Math.max(this.toFrameTime(event.clientX), view[0]), view[1]);
        selection = [Math.min(drag.t, t), Math.max(drag.t, t)];
        cursorX = t;
        requestOverlay();
        return;
      }
      cursorX = this.toFrameTime(event.clientX);
      this.element.classList.toggle("near-cursor", this.nearCursor(event.clientX) !== null);
      requestOverlay();
    });
    this.overlay.addEventListener("pointerleave", () => { cursorX = null; this.element.classList.remove("near-cursor"); requestOverlay(); });
    this.overlay.addEventListener("pointerdown", event => {
      if (!view) return;
      const cursor = this.nearCursor(event.clientX), pan = !cursor && event.shiftKey;
      drag = { x: event.clientX, view: [...view], cursor, pan, t: this.toFrameTime(event.clientX), epoch: frameEpoch };
      this.overlay.setPointerCapture(event.pointerId);
      if (pan) this.element.classList.add("dragging");
    });
    const stop = () => {
      // a selection wider than 4 px becomes the view; a plain click does nothing
      if (drag && drag.epoch === frameEpoch && selection && (selection[1] - selection[0]) / (view[1] - view[0]) * this.plotWidth() > 4) {
        view = clampView(selection[0], selection[1]);
        requestDraw();
      }
      drag = null; selection = null;
      this.element.classList.remove("dragging");
      requestOverlay();
    };
    this.overlay.addEventListener("pointerup", stop);
    this.overlay.addEventListener("pointercancel", () => { selection = null; stop(); });
    this.overlay.addEventListener("wheel", event => {
      if (!view) return;
      event.preventDefault();
      const delta = event.deltaY || event.deltaX;  // Shift+wheel scrolls sideways in some browsers
      if (event.shiftKey && !this.spec.digital) this.zoomY(delta < 0 ? 0.8 : 1.25, event.clientY);
      else zoom(delta < 0 ? 0.8 : 1.25, this.toFrameTime(event.clientX));
    }, { passive: false });
    this.overlay.addEventListener("dblclick", fit);
  }
}


// The charts, as the converter lists them; the first and the last get the cursor's labels and the time axis.
const charts = CHARTS.map((spec, i) => {
  const element = document.createElement("div");
  element.className = "panel chart" + (spec.size ? " " + spec.size : "");
  element.dataset.chart = i;
  element.dataset.label = spec.label;
  $("scope").append(element);
  return new Chart(element, spec);
});

function updateViewInfo() {
  if (!frame || !view) return;
  const trigger = frame.meta.triggerUs, span = view[1] - view[0];
  const step = niceStep(span, 8);
  let text = `${engineering(step * 1e-6, "s")}/div`;
  if (cursors) {
    const dt = Math.abs(cursors.b - cursors.a);
    text += ` · A ${timeLabel(cursors.a, span, 2)} · B ${timeLabel(cursors.b, span, 2)} · ΔT ${engineering(dt * 1e-6, "s")}` +
      (dt > 0 ? ` · 1/ΔT ${engineering(1e6 / dt, "Hz")}` : "");
  }
  $("view-info").textContent = text;
  $("view-info").title = text + ` · view ${timeLabel(view[0] - trigger, span)} to ${timeLabel(view[1] - trigger, span)}`;
}

function drawAll() {
  charts.forEach(c => c.draw());
  updateViewInfo();
  requestMeasure();
}

// Mouse wheel, drag and resize events come faster than a redraw: draw at most once per screen frame,
// and the measurement table after that, so it never delays the charts.
let drawQueued = false, overlayQueued = false, measureQueued = false;
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawAll(); });
}
function requestOverlay() {
  if (overlayQueued) return;
  overlayQueued = true;
  requestAnimationFrame(() => { overlayQueued = false; charts.forEach(c => c.drawOverlay()); updateViewInfo(); });
}
function requestMeasure() {
  if (measureQueued) return;
  measureQueued = true;
  setTimeout(() => { measureQueued = false; measure(); }, 30);
}

// ---- measurements ----

// The analog traces, in table order, with their unit.
const MEASURED = CHARTS.filter(c => !c.digital).flatMap(c =>
  [["left", c.left], ["right", c.right]].filter(([, axis]) => axis).flatMap(([, axis]) => axis.series.map(([label, column, color]) => ({ label, column, color, unit: axis.unit }))));

// A measured value at the oscilloscope's resolution, 0.1 mV or 0.1 mA: millivolts below 1 V, three
// decimals above, and 0 below the resolution (an off switch's nanoamps are not a reading).
function reading(v, unit) {
  if (Math.abs(v) < 1e-4) return "0 " + unit;
  if (Math.abs(v) < 1) return minus((v * 1e3).toFixed(Math.abs(v) < 0.01 ? 2 : Math.abs(v) < 0.1 ? 1 : 0)) + " m" + unit;
  return minus(v.toFixed(3)) + " " + unit;
}

// Linear interpolation of a column at time t (us from the frame start).
function interpolate(column, t) {
  const i = lowerBound(t);
  if (i <= 0) return frame.data[column];
  if (i >= frame.rows) return frame.data[(frame.rows - 1) * COLUMNS + column];
  const t0 = frame.data[(i - 1) * COLUMNS], t1 = frame.data[i * COLUMNS];
  const v0 = frame.data[(i - 1) * COLUMNS + column], v1 = frame.data[i * COLUMNS + column];
  return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v1;
}

// Min, max, mean and RMS of a column from t0 to t1. The time steps are unequal, so the mean and RMS are
// integrals by trapezoids, not averages of the samples.
function statistics(column, t0, t1) {
  let previousT = t0, previousV = interpolate(column, t0), min = previousV, max = previousV, area = 0, square = 0;
  const step = (t, v) => {
    const dt = t - previousT;
    area += (v + previousV) / 2 * dt;
    square += (v * v + v * previousV + previousV * previousV) / 3 * dt;  // exact for a straight segment
    if (v < min) min = v;
    if (v > max) max = v;
    previousT = t; previousV = v;
  };
  const d = frame.data, blocks = frame.blocks, end = lowerBound(t1);  // rows before end are before t1
  let i = lowerBound(t0);
  while (i < end && d[i * COLUMNS] <= t0) i++;
  while (i < end) {
    if (blocks && i % BLOCK === 0 && i + BLOCK <= end && i / BLOCK < blocks.t0.length) {
      // a whole block: the segment into its first row, then its own integrals and extremes
      const k = i / BLOCK, c = blocks.columns[column];
      step(blocks.t0[k], c.first[k]);
      area += c.area[k]; square += c.square[k];
      if (c.min[k] < min) min = c.min[k];
      if (c.max[k] > max) max = c.max[k];
      previousT = blocks.t1[k]; previousV = c.last[k];
      i += BLOCK;
    } else { step(d[i * COLUMNS], d[i * COLUMNS + column]); i++; }
  }
  step(t1, interpolate(column, t1));
  const span = t1 - t0;
  return { min, max, mean: span > 0 ? area / span : previousV, rms: span > 0 ? Math.sqrt(square / span) : Math.abs(previousV) };
}

// Switching frequency and duty from the rising edges of the converter's gate column within the span.
function gateTiming(t0, t1) {
  const rises = [], d = frame.data, blocks = frame.blocks, hg = GATE;
  let i = Math.max(lowerBound(t0), 1);
  while (i < frame.rows && d[i * COLUMNS] <= t1) {
    const k = i / BLOCK;
    if (blocks && i % BLOCK === 0 && k < blocks.t0.length && blocks.t1[k] <= t1) {
      // a block that stays low, or stays high after a high row, has no rising edge
      const c = blocks.columns[hg];
      if (c.max[k] < 0.5 || (c.min[k] >= 0.5 && d[(i - 1) * COLUMNS + hg] >= 0.5)) { i += BLOCK; continue; }
    }
    if (d[(i - 1) * COLUMNS + hg] < 0.5 && d[i * COLUMNS + hg] >= 0.5) rises.push(d[i * COLUMNS]);
    i++;
  }
  if (rises.length < 2) return null;
  const first = rises[0], last = rises[rises.length - 1];
  return { frequency: (rises.length - 1) / (last - first) * 1e6, duty: statistics(GATE, first, last).mean };
}

// The span measured: between the cursors, or the view; with "whole periods", shortened to a whole
// number of PWM periods from its start, so the ripple does not bias the mean.
function measuredSpan() {
  const trigger = frame.meta.triggerUs, length = frame.meta.lengthUs;
  let [t0, t1] = cursors ? [Math.min(cursors.a, cursors.b) + trigger, Math.max(cursors.a, cursors.b) + trigger] : view;
  t0 = Math.min(Math.max(t0, 0), length); t1 = Math.max(Math.min(t1, length), t0);
  const P = frame.meta.periodUs, periods = Math.floor((t1 - t0) / P + 1e-6);
  const whole = $("whole-periods").checked && periods >= 1;
  if (whole) t1 = t0 + periods * P;
  return { t0, t1, periods: whole ? periods : null };
}

function measure() {
  const panel = $("measure");
  panel.hidden = !measuring && !cursors;
  press($("measure-toggle"), measuring);
  press($("cursors-toggle"), cursors !== null);
  if (panel.hidden || !frame || !view) return;
  const { t0, t1, periods } = measuredSpan(), trigger = frame.meta.triggerUs, span = view[1] - view[0];
  const timing = gateTiming(t0, t1);
  let gate = `${cursors ? "between cursors" : "visible window"}: ${timeLabel(t0 - trigger, span, 2)} to ${timeLabel(t1 - trigger, span, 2)}` +
    (periods ? ` (${periods} period${periods > 1 ? "s" : ""})` : "");
  if (timing) gate += ` · switching ${engineering(timing.frequency, "Hz")} · duty ${timing.duty.toFixed(3)}`;
  const at = (column, key) => column === "vref" ? vrefAt(cursors[key] + trigger) : interpolate(column, cursors[key] + trigger);
  const heads = ["", ...(measuring ? ["min", "max", "peak-peak", "mean", "RMS"] : []), ...(cursors ? ["@A", "@B", "B − A"] : [])];
  const rows = MEASURED.map(({ label, column, color, unit }) => {
    const cells = [];
    if (measuring) {
      if (column === "vref") cells.push("", "", "", "", "");
      else {
        const s = statistics(column, t0, t1);
        cells.push(...[s.min, s.max, s.max - s.min, s.mean, s.rms].map(v => reading(v, unit)));
      }
    }
    if (cursors) {
      const a = at(column, "a"), b = at(column, "b");
      cells.push(reading(a, unit), reading(b, unit), reading(b - a, unit));
    }
    return `<tr style="--c:var(${color})"><td>${label}</td>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
  });
  panel.innerHTML = `<div class="gate">${gate}</div><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table>`;
}

$("measure-toggle").onclick = () => { measuring = !measuring; measure(); };
$("cursors-toggle").onclick = () => {
  if (cursors) cursors = null;
  else if (frame && view) {
    const trigger = frame.meta.triggerUs, span = view[1] - view[0];
    cursors = { a: view[0] + 0.4 * span - trigger, b: view[0] + 0.6 * span - trigger };
  }
  charts.forEach(c => c.drawOverlay());
  updateViewInfo(); measure();
};
$("whole-periods").onchange = measure;

function describeFrame() {
  const m = frame.meta, length = m.lengthUs;
  const events = m.events.map(([, name, value]) => name === "controller" ? "new controller"
    : name === "slew" ? `reference slew → ${value ? value + " V/ms" : "off"}`
    : name === "vinSlew" ? `input slew → ${value ? value + " V/ms" : "off"}`
    : name === "load" ? `load → ${ohms(value)}`
    : `${name === "vref" ? "reference" : "input"} → ${value} V`);
  $("frame-info").textContent = $("frame-info").title = `${timeLabel(length, length)} · ${m.rows.toLocaleString()} points · ` +
    `trigger: ${m.trigger === "gate" ? "gate rising edge" : "the event"}` + (events.length ? " · " + events.join(", ") : "");
  $("frame-info").classList.remove("loading");
}

// ---- scenarios: a controller and an event, each pair one recorded frame ----

const controllers = spec.controllers, eventsList = spec.events;
const scenarioOf = (controller, event) => spec.scenarios.find(s => s.controller === controller && s.event === event);
const frames = new Map();  // file: frame, so going back to a scenario is instant
let current = spec.scenarios.find(s => s.id === params.get("s")) || spec.scenarios[0];
let loading = null;

addButtons($("controllers"), controllers.map(c => [c.id, c.label]), id => choose(id, current.event), "id");
addButtons($("events"), eventsList.map(e => [e.id, e.label]), id => choose(current.controller, id), "id");

// Another controller keeps the event when that pair was simulated, or takes the controller's first event.
function choose(controller, event) {
  const scenario = scenarioOf(controller, event) || spec.scenarios.find(s => s.controller === controller);
  if (scenario) show(scenario);
}

function markScenario() {
  for (const button of $("controllers").children) press(button, button.dataset.id === current.controller);
  for (const button of $("events").children) {
    press(button, button.dataset.id === current.event);
    button.disabled = !scenarioOf(current.controller, button.dataset.id);
    button.title = button.disabled ? "Not simulated with this controller" : "";
  }
  for (const button of $("bode-simulated").children) press(button, button.dataset.id === current.controller);
  const controller = controllers.find(c => c.id === current.controller), event = eventsList.find(e => e.id === current.event);
  $("controller-about").textContent = controller.about || "";
  $("event-about").textContent = event.about || "";
  $("scenario-name").textContent = `${controller.label} · ${event.label}`;
}

async function show(scenario) {
  current = scenario;
  markScenario();
  const url = new URL(location.href);
  url.searchParams.set("c", NAME); url.searchParams.set("s", scenario.id);
  history.replaceState(null, "", url);
  const request = loading = scenario.file;
  let next = frames.get(scenario.file);
  if (!next) {
    $("frame-info").textContent = "loading…"; $("frame-info").classList.add("loading");
    try {
      next = parseFrame(await (await fetch(BASE + scenario.file, { cache: "no-cache" })).arrayBuffer());
    } catch (error) {
      if (loading === request) $("frame-info").textContent = "could not load this scenario";
      return;
    }
    frames.set(scenario.file, next);
  }
  if (loading !== request) return;  // another scenario was chosen meanwhile
  loadFrame(next);
}

// A frame file: a 4-byte length, the JSON metadata, then either float32 rows of COLUMNS values, as
// live.py sends them, or, when the metadata has "packing", the columns one after another as
// tools/frames.py writes them (time float32, gates one bit per row, the rest uint16 steps over
// their range). Either way the page works on float32 rows.
function parseFrame(buffer) {
  const length = new DataView(buffer).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)));
  const rows = meta.rows;
  if (!meta.packing) {
    const data = new Float32Array(buffer, 4 + length, rows * COLUMNS);
    return { meta, data, rows, blocks: buildBlocks(data, rows) };
  }
  const data = new Float32Array(rows * COLUMNS);
  let offset = 4 + length;
  meta.packing.list.forEach((column, c) => {
    if (column.type === "f32") {
      const values = new Float32Array(buffer, offset, rows);
      for (let i = 0; i < rows; i++) data[i * COLUMNS + c] = values[i];
      offset += rows * 4;
    } else if (column.type === "bit") {
      const bits = new Uint8Array(buffer, offset, (rows + 7) >> 3);
      for (let i = 0; i < rows; i++) data[i * COLUMNS + c] = (bits[i >> 3] >> (i & 7)) & 1;
      offset += bits.length;
    } else {
      const steps = new Uint16Array(buffer, offset, rows);
      for (let i = 0; i < rows; i++) data[i * COLUMNS + c] = column.low + steps[i] * column.step;
      offset += rows * 2;
    }
    offset += -offset & 3;
  });
  return { meta, data, rows, blocks: buildBlocks(data, rows) };
}

function loadFrame(next) {
  const previous = frame;
  frame = next;
  // Keep the zoom between frames of the same length, as on a scope; otherwise show it all.
  if (!view || !previous || previous.meta.lengthUs !== frame.meta.lengthUs) {
    view = [0, frame.meta.lengthUs];
    frameEpoch++; selection = null;  // a drag that started on the old frame ends without zooming
    if (cursors) cursors = { a: 0.4 * frame.meta.lengthUs - frame.meta.triggerUs, b: 0.6 * frame.meta.lengthUs - frame.meta.triggerUs };
  } else view = clampView(...view);
  describeFrame();
  drawAll();
  bodeKey = ""; updateBode();
}

// ---- loop gain (Bode window) ----
// The converter's small-signal model, its operating point in the frame's initial state, and the
// controller exactly as the firmware runs it, in either form (both are 2p2z transfer functions).
const T = converter.T;
const FORMS = [["2p2z", "2p2z, velocity form"], ["pid", "PID, integrator clamp"]];
const FORMULAS = {
  "2p2z": "C(z) = K·(1 − z1·z⁻¹)(1 − z2·z⁻¹) / [(1 − z⁻¹)(1 − p·z⁻¹)],  zi = e^(−ωzi·T), p = e^(−ωp·T)",
  pid: "C(s) = K·(1 + s/ωz1)(1 + s/ωz2) / [s·(1 + s/ωp)] = KP + KI/s + KD·s/(1 + s·TF), run with Euler's rules",
};
// The plot's frequency range, up to fs/2, and the sliders' ranges come from the converter (in Hz);
// these defaults are the buck's, at 200 kHz.
const BODE = converter.bode || { from: 100, to: 100e3, sliders: { fc: [1e3, 30e3], fz1: [100, 20e3], fz2: [100, 20e3], fp: [5e3, 100e3] } };
const DECADES = Math.log10(BODE.to / BODE.from);
const STEPS = Math.round(160 * DECADES);  // about 160 per decade, ending exactly at BODE.to
const FREQS = Array.from({ length: STEPS + 1 }, (_, i) => BODE.from * 10 ** (DECADES * i / STEPS));
const SLIDERS = [  // key, label, range in Hz
  ["fc", "Target crossover", ...BODE.sliders.fc], ["fz1", "Zero 1", ...BODE.sliders.fz1],
  ["fz2", "Zero 2", ...BODE.sliders.fz2], ["fp", "Pole", ...BODE.sliders.fp]];
const design = { ...converter.design, k: null };
let bodeHover = null, bodeKey = "";

const operatingPoint = () => converter.operatingPoint(frame.meta.initial);
const plant = (f, op) => converter.plant(f, op);

// The PID form's transfer function as 2p2z coefficients [B0, B1, B2, A]:
// KP + KI·T/(1 − z⁻¹) + [KD/(TF + T)]·(1 − z⁻¹)/(1 − A·z⁻¹), with A = TF/(TF + T).
function pidTo2p2z([kp, ki, kd, tf]) {
  const a = tf / (tf + T), b = kd / (tf + T);
  return [kp + ki * T + b, -kp * (1 + a) - ki * T * a - 2 * b, kp * a + b, a];
}

// Duty per volt of error, as the firmware computes it; controller is { form, values }.
function controller(f, { form, values }) {
  const [b0, b1, b2, a] = form === "pid" ? pidTo2p2z(values) : values;
  const zi = cexpj(-2 * Math.PI * f * T), zi2 = cmul(zi, zi);
  return cdiv(cadd(cadd(cx(b0), cscale(zi, b1)), cscale(zi2, b2)), cmul(csub(cx(1), zi), csub(cx(1), cscale(zi, a))));
}

// K·(1 + s/ωz1)(1 + s/ωz2) / [s·(1 + s/ωp)] = KP + KI/s + KD·s/(1 + s·TF), matching coefficients.
function gainsOf({ k, fz1, fz2, fp }) {
  const tz1 = 1 / (2 * Math.PI * fz1), tz2 = 1 / (2 * Math.PI * fz2), tf = 1 / (2 * Math.PI * fp);
  return [k * (tz1 + tz2 - tf), k, k * (tz1 - tf) * (tz2 - tf), tf];
}

// Matched poles and zeros: each s-plane root at −ω goes to z = e^(−ω·T); the integrator to z = 1.
function matched({ fz1, fz2, fp }) {
  const z = f => Math.exp(-2 * Math.PI * f * T);
  return [z(fz1), z(fz2), z(fp)];
}

// The design as the firmware runs it, in the chosen form.
function designController(d = design) {
  if (d.form === "pid") return { form: "pid", values: gainsOf(d) };
  const [z1, z2, p] = matched(d);
  return { form: "2p2z", values: [d.k, -d.k * (z1 + z2), d.k * z1 * z2, p] };
}

// PID gains with the same integral gain and the same poles and zeros, in continuous time.
function pidEquivalent(d = design) {
  if (d.form === "pid") return gainsOf(d);
  const [z1, z2, p] = matched(d);
  return gainsOf({ ...d, k: d.k * (1 - z1) * (1 - z2) / ((1 - p) * T) });
}

// Gain K that puts the crossover at fc for the present operating point.
function retune() {
  const loop = cmul(controller(design.fc, designController({ ...design, k: 1 })), plant(design.fc, operatingPoint()));
  design.k = 1 / Math.hypot(loop.re, loop.im);
}

function response(op, control) {
  const db = [], phase = [];
  let previous = null;
  for (const f of FREQS) {
    let v = plant(f, op);
    if (control) v = cmul(controller(f, control), v);
    db.push(20 * Math.log10(Math.hypot(v.re, v.im)));
    let p = Math.atan2(v.im, v.re) * 180 / Math.PI;
    if (previous !== null) p -= 360 * Math.round((p - previous) / 360);  // unwrapped
    phase.push(previous = p);
  }
  return { db, phase };
}

// Phase margin at the highest 0 dB crossing. Gain margin where the phase crosses −180° (mod 360°):
// the next crossing above, or, when the phase margin is negative, the last one below, where the
// loop oscillates (the gain margin is then negative).
function margins({ db, phase }) {
  const at = (i, x) => ({ f: FREQS[i] * (FREQS[i + 1] / FREQS[i]) ** x,
                          db: db[i] + x * (db[i + 1] - db[i]), phase: phase[i] + x * (phase[i + 1] - phase[i]) });
  let cross = null, i = FREQS.length - 2;
  for (; i >= 0; i--)
    if ((db[i] >= 0) !== (db[i + 1] >= 0)) { cross = at(i, db[i] / (db[i] - db[i + 1])); break; }
  if (!cross) return null;
  let pm = 180 + cross.phase;
  pm -= 360 * Math.round(pm / 360);
  let gain = null;
  for (let j = i; j >= 0 && j + 1 < FREQS.length && !gain; j += pm < 0 ? -1 : 1) {
    const level = 360 * Math.floor((phase[j] + 180) / 360) - 180;
    if (phase[j] >= level && phase[j + 1] < level) gain = at(j, (phase[j] - level) / (phase[j] - phase[j + 1]));
  }
  return { fc: cross.f, cross, pm, gain, gm: gain ? -gain.db : null };
}

function hz(f) {
  return f >= 1e3 ? (f / 1e3).toFixed(f < 1e4 ? 2 : 1) + " kHz" : f.toFixed(0) + " Hz";
}

function engineering(v, unit) {
  if (v === 0) return "0 " + unit;
  const prefixes = [[1e-15, "f"], [1e-12, "p"], [1e-9, "n"], [1e-6, "µ"], [1e-3, "m"], [1, ""], [1e3, "k"]];
  let [scale, prefix] = prefixes[0];
  for (const p of prefixes) if (Math.abs(v) >= p[0] * 0.9999) [scale, prefix] = p;
  return minus((v / scale).toPrecision(3)) + " " + prefix + unit;
}

const sliderInputs = {};
for (const [key, label, low, high] of SLIDERS) {
  const input = Object.assign(document.createElement("input"), { type: "range", min: 0, max: 1000, step: 1 });
  const output = document.createElement("output");
  input.oninput = () => {
    let f = low * (high / low) ** (input.value / 1000);
    if (key === "fp") f = Math.max(f, 1.2 * Math.max(design.fz1, design.fz2));  // pole above both zeros:
    else if (key !== "fc") f = Math.min(f, design.fp / 1.2);                     // KP and KD stay positive
    design[key] = f;
    retune();
    bodeKey = "";
    updateBode();
  };
  sliderInputs[key] = { input, output, low, high };
  const name = document.createElement("label");
  name.textContent = label;
  input.id = "slider-" + key; name.htmlFor = input.id; output.htmlFor = input.id;
  $("bode-sliders").append(name, input, output);
}

function syncSliders() {
  for (const [key, { input, output, low, high }] of Object.entries(sliderInputs)) {
    input.value = Math.round(1000 * Math.log(design[key] / low) / Math.log(high / low));
    output.textContent = hz(design[key]);
    input.setAttribute("aria-valuetext", hz(design[key]));
  }
}

function sameController(a, b) {
  return a.form === b.form && a.values.every((v, i) => Math.abs(v - b.values[i]) <= 1e-9 * Math.max(Math.abs(v), Math.abs(b.values[i])));
}

addButtons($("bode-form"), FORMS, value => { design.form = value; retune(); bodeKey = ""; updateBode(); }, "value");
let bodeData = null;
function updateBode() {
  if ($("bode").hidden || !frame) return;
  const op = operatingPoint();
  const running = frame.meta.initial.controller;
  if (design.k === null) retune();
  const control = designController();
  const key = JSON.stringify([op, running, control]);
  if (key === bodeKey) return;
  bodeKey = key;
  const applied = sameController(control, running);
  const curves = { plant: response(op, null), design: response(op, control), running: applied ? null : response(op, running) };
  bodeData = { op, control, running, applied, curves,
               margins: { design: margins(curves.design), running: applied ? null : margins(curves.running) } };
  $("bode-op").textContent = converter.describe(op, ohms);
  syncSliders();
  for (const button of $("bode-form").children) press(button, button.dataset.value === design.form);
  $("bode-formula").textContent = FORMULAS[design.form];
  const [kp, ki, kd, tf] = pidEquivalent();
  const coefficients = design.form === "pid" ? pidTo2p2z(control.values) : control.values;
  const cells = (names, values) => names.map(n => `<span class="name">${n}</span>`).join("") + values.map(v => `<span>${v}</span>`).join("");
  $("bode-pid").innerHTML =
    `<span class="title">${design.form === "pid" ? "PID gains" : "PID equivalent (continuous time)"}</span>` +
    cells(["KP (1/V)", "KI (1/(V·s))", "KD (µs/V)", "TF (µs)"], [kp, ki, kd * 1e6, tf * 1e6].map(v => minus(Number(v.toPrecision(3))))) +
    `<span class="title">${design.form === "pid" ? "the same as 2p2z coefficients" : "2p2z coefficients"}</span>` +
    cells(["B0", "B1", "B2", "A"], coefficients.map(v => minus(v.toPrecision(5))));
  const row = (label, m) => {
    if (!m) return `<span>${label}</span><span>no crossover</span><span></span><span></span>`;
    const bad = v => v === null || v <= 0 ? ' class="bad"' : "";
    return `<span>${label}</span><span>${hz(m.fc)}</span><span${bad(m.pm)}>${m.pm.toFixed(1)}°</span>` +
      `<span${bad(m.gm)}>${m.gm === null ? "—" : m.gm.toFixed(1) + " dB at " + hz(m.gain.f)}</span>`;
  };
  $("bode-margins").innerHTML = "<span></span><span>crossover</span><span>phase margin</span><span>gain margin</span>" +
    row(applied ? "Design (simulated)" : "Design", bodeData.margins.design) +
    (applied ? "" : row("Simulated", bodeData.margins.running));
  const m = bodeData.margins.design;
  const unstable = !m || m.pm <= 0 || (m.gm !== null && m.gm <= 0);
  $("bode-note").textContent = (unstable ? "This design is unstable here: the output would oscillate" +
      (m && m.gain ? ` at about ${hz(m.gain.f)}` : "") + ". " : "") +
    "The time response on the charts is the simulated controller's. The designs under Simulated have one; " +
    "moving the sliders shows only the frequency response.";
  drawBode();
}

function drawBode() {
  const element = $("bode-plot"), canvas = element.querySelector("canvas");
  if ($("bode").hidden || !bodeData) return;
  const ratio = window.devicePixelRatio || 1, w = element.clientWidth, h = element.clientHeight;
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  const g = canvas.getContext("2d");
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.font = "11px system-ui, sans-serif";
  const { curves, margins: m } = bodeData;
  const left = 48, right = 12, top = 10, gap = 24, bottom = 20, pw = w - left - right;
  const magH = (h - top - gap - bottom) * 0.56, phH = h - top - gap - bottom - magH, phTop = top + magH + gap;
  const x = f => left + Math.log10(f / FREQS[0]) / DECADES * pw;
  const all = Object.values(curves).filter(Boolean);
  const snap = (v, step, up) => (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;
  const dbLow = Math.max(snap(Math.min(...all.map(c => Math.min(...c.db))), 20, false), -80);
  const dbHigh = Math.min(snap(Math.max(...all.map(c => Math.max(...c.db))), 20, true), 100);
  const phLow = Math.max(snap(Math.min(...all.map(c => Math.min(...c.phase))), 90, false), -630);
  const phHigh = Math.min(snap(Math.max(...all.map(c => Math.max(...c.phase))), 90, true), 180);
  const yDb = v => top + (dbHigh - v) / (dbHigh - dbLow) * magH;
  const yPh = v => phTop + (phHigh - v) / (phHigh - phLow) * phH;
  // grid: decades labelled, the 2..9 multiples lighter
  const edge = 1 + 1e-9;
  for (let decade = 10 ** Math.floor(Math.log10(BODE.from)); decade <= BODE.to * edge; decade *= 10)
    for (let n = 1; n < 10 && decade * n <= BODE.to * edge; n++) {
      if (decade * n < BODE.from / edge) continue;
      const px = x(decade * n);
      g.strokeStyle = css("--grid"); g.globalAlpha = n === 1 ? 1 : 0.5;
      g.beginPath(); g.moveTo(px, top); g.lineTo(px, top + magH); g.moveTo(px, phTop); g.lineTo(px, phTop + phH); g.stroke();
      g.globalAlpha = 1;
      if (n === 1) {
        g.fillStyle = css("--muted"); g.textAlign = px > w - right - 20 ? "right" : px < left + 20 ? "left" : "center";
        g.fillText(decade >= 1e3 ? decade / 1e3 + " kHz" : decade + " Hz", px, h - 5); g.textAlign = "left";
      }
    }
  const hline = (y, label) => {
    g.strokeStyle = css("--grid"); g.beginPath(); g.moveTo(left, y); g.lineTo(w - right, y); g.stroke();
    g.fillStyle = css("--muted"); g.fillText(label, 4, y + 4);
  };
  const dbStep = dbHigh - dbLow > 100 ? 40 : 20;
  for (let v = dbLow; v <= dbHigh; v += dbStep) hline(yDb(v), minus(v) + " dB");
  const phStep = phHigh - phLow > 360 ? 180 : 90;
  for (let v = Math.ceil(phLow / phStep) * phStep; v <= phHigh; v += phStep) hline(yPh(v), minus(v) + "°");
  const dashed = (y, color) => {
    g.strokeStyle = css(color); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(left, y); g.lineTo(w - right, y); g.stroke(); g.setLineDash([]);
  };
  dashed(yDb(0), "--muted");
  for (let v = -180; v >= phLow; v -= 360) if (v <= phHigh) dashed(yPh(v), "--muted");
  // curves
  const trace = (c, color, width, dash) => {
    g.save(); g.strokeStyle = css(color); g.lineWidth = width; g.setLineDash(dash || []);
    for (const [values, y, low, high, y0] of [[c.db, yDb, dbLow, dbHigh, top], [c.phase, yPh, phLow, phHigh, phTop]]) {
      g.save(); g.beginPath(); g.rect(left, y0, pw, y === yDb ? magH : phH); g.clip();
      g.beginPath();
      values.forEach((v, i) => i ? g.lineTo(x(FREQS[i]), y(v)) : g.moveTo(x(FREQS[i]), y(v)));
      g.stroke(); g.restore();
    }
    g.restore();
  };
  trace(curves.plant, "--plant", 1.4, [6, 4]);
  if (curves.running) trace(curves.running, "--running", 1.4);
  trace(curves.design, "--loop", 2.2);
  // zeros (○) and pole (×) of the design, on the magnitude plot's floor
  const yMark = top + magH - 7;
  g.strokeStyle = css("--loop"); g.lineWidth = 1.6;
  const double = Math.abs(x(design.fz1) - x(design.fz2)) < 6;
  for (const f of double ? [design.fz1] : [design.fz1, design.fz2]) { g.beginPath(); g.arc(x(f), yMark, 4, 0, 7); g.stroke(); }
  if (double) { g.fillStyle = css("--loop"); g.fillText("×2", x(design.fz1) + 7, yMark + 4); }
  g.beginPath(); g.moveTo(x(design.fp) - 4, yMark - 4); g.lineTo(x(design.fp) + 4, yMark + 4);
  g.moveTo(x(design.fp) + 4, yMark - 4); g.lineTo(x(design.fp) - 4, yMark + 4); g.stroke();
  // margins of the design
  const d = m.design;
  if (d) {
    const arrow = (px, y0, y1, label) => {
      g.strokeStyle = g.fillStyle = css(d.pm > 0 && (d.gm === null || d.gm > 0) ? "--margin" : "--bad");
      g.lineWidth = 2; g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke();
      const s = y1 > y0 ? 1 : -1;
      g.beginPath(); g.moveTo(px - 4, y1 - 6 * s); g.lineTo(px + 4, y1 - 6 * s); g.lineTo(px, y1); g.fill();
      g.font = "600 10px system-ui, sans-serif";
      g.fillText(label, px + 4, y1 + (s > 0 ? -8 : 14));
      g.font = "11px system-ui, sans-serif";
    };
    g.strokeStyle = css("--margin"); g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(x(d.fc), top); g.lineTo(x(d.fc), phTop + phH); g.stroke(); g.setLineDash([]);
    const level = 360 * Math.round((d.cross.phase + 180) / 360) - 180;  // the −180° (mod 360°) line nearest the phase
    arrow(x(d.fc), yPh(level), yPh(d.cross.phase), "PM");
    if (d.gain) arrow(x(d.gain.f), yDb(d.gain.db), yDb(0), "GM");
    // the values in a box at the phase plot's lower left, where the curves seldom go
    const text = `PM ${minus(d.pm.toFixed(0))}° · GM ${d.gm === null ? "—" : minus(d.gm.toFixed(1)) + " dB"}`;
    g.font = "600 11px system-ui, sans-serif";
    const tw = g.measureText(text).width;
    g.fillStyle = css("--panel"); g.fillRect(left + 4, phTop + phH - 20, tw + 10, 17);
    g.strokeStyle = g.fillStyle = css(d.pm > 0 && (d.gm === null || d.gm > 0) ? "--margin" : "--bad");
    g.lineWidth = 1; g.strokeRect(left + 4.5, phTop + phH - 19.5, tw + 9, 16);
    g.fillText(text, left + 9, phTop + phH - 7);
    g.font = "11px system-ui, sans-serif";
  }
  // cursor
  let legend = [["--plant", "plant (duty → Vout)", "dashed"], ["--loop", bodeData.applied ? "loop, design = simulated" : "loop, design", "solid"]];
  if (curves.running) legend.push(["--running", "loop, simulated", "solid"]);
  if (bodeHover !== null && bodeHover >= left && bodeHover <= w - right) {
    const i = Math.round((bodeHover - left) / pw * (FREQS.length - 1));
    g.strokeStyle = css("--cursor"); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x(FREQS[i]), top); g.lineTo(x(FREQS[i]), phTop + phH); g.stroke();
    const value = c => `${c.db[i].toFixed(1)} dB, ${c.phase[i].toFixed(0)}°`;
    legend = legend.map(([color, label, style]) => [color, `${label}: ${value(color === "--plant" ? curves.plant : color === "--loop" ? curves.design : curves.running)}`, style]);
    legend.unshift([null, hz(FREQS[i])]);
  }
  $("bode-legend").innerHTML = legend.map(([color, label, style]) =>
    color ? `<span><i style="border-color:var(${color});border-top-style:${style}"></i>${label}</span>` : `<span>${label}</span>`).join("");
}

$("bode-plot").addEventListener("pointermove", event => {
  bodeHover = event.clientX - $("bode-plot").getBoundingClientRect().left; drawBode();
});
$("bode-plot").addEventListener("pointerleave", () => { bodeHover = null; drawBode(); });
// The controllers with simulated scenarios: each opens its scenario for the present event, and sets
// the sliders to its design when it has one.
addButtons($("bode-simulated"), controllers.map(c => [c.id, c.label]), id => {
  const chosen = controllers.find(c => c.id === id);
  if (chosen.design) { Object.assign(design, chosen.design, { k: null }); if (frame) retune(); bodeKey = ""; }
  choose(id, current.event);
  updateBode();
}, "id");

function showBode(visible) {
  const box = $("bode");
  if (visible && box.hidden && !box.style.top && innerWidth > 800) {
    const place = JSON.parse(storage("pcl-bode-place") || "null"), scope = document.querySelector(".scope").getBoundingClientRect();
    if (place) Object.assign(box.style, { left: Math.min(place.left, innerWidth - 340) + "px", top: Math.min(place.top, innerHeight - 60) + "px",
                                          right: "auto", width: place.width + "px", height: place.height + "px" });
    else box.style.top = scope.top + 40 + "px";  // below the oscilloscope's toolbar
  }
  box.hidden = !visible;
  press($("bode-toggle"), visible);
  try { localStorage.setItem("pcl-bode", visible ? "1" : "0"); } catch (error) { /* storage blocked */ }
  bodeKey = "";
  updateBode();
}
$("bode-toggle").onclick = () => showBode($("bode").hidden);
$("bode-close").onclick = () => showBode(false);
new ResizeObserver(() => drawBode()).observe($("bode-plot"));

// Drag by the title bar, kept inside the window.
{
  let drag = null;
  const head = $("bode-head"), box = $("bode");
  head.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    const rect = box.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    head.setPointerCapture(event.pointerId);
  });
  head.addEventListener("pointermove", event => {
    if (!drag) return;
    const rect = box.getBoundingClientRect();
    const leftPx = Math.min(Math.max(event.clientX - drag.dx, 0), window.innerWidth - rect.width);
    const topPx = Math.min(Math.max(event.clientY - drag.dy, 0), window.innerHeight - 40);
    Object.assign(box.style, { left: leftPx + "px", top: topPx + "px", right: "auto", bottom: "auto" });
  });
  const stop = () => { drag = null; remember(); };
  head.addEventListener("pointerup", stop);
  head.addEventListener("pointercancel", stop);
  const remember = () => {
    if (box.hidden || innerWidth <= 800) return;
    const rect = box.getBoundingClientRect();
    try { localStorage.setItem("pcl-bode-place", JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })); }
    catch (error) { /* storage blocked */ }
  };
  new ResizeObserver(remember).observe(box);
}
function storage(key) { try { return localStorage.getItem(key); } catch (error) { return null; } }

const THEMES = { auto: "Theme: auto", light: "Theme: light", dark: "Theme: dark" };
let theme = "auto";
try { theme = localStorage.getItem("pcl-theme") || "auto"; } catch (error) { /* storage blocked */ }
function applyTheme() {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $("theme").textContent = THEMES[theme];
  drawAll(); drawBode();
}
$("theme").onclick = () => {
  const order = Object.keys(THEMES);
  theme = order[(order.indexOf(theme) + 1) % order.length];
  try { localStorage.setItem("pcl-theme", theme); } catch (error) { /* storage blocked */ }
  applyTheme();
};
applyTheme();
// A chart changes size with the window, and also when the measurement table opens or the header wraps.
const resized = new ResizeObserver(requestDraw);
for (const chart of document.querySelectorAll(".chart")) resized.observe(chart);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { drawAll(); drawBode(); });
const start = controllers.find(c => c.id === current.controller);
if (start.design) Object.assign(design, start.design, { k: null });
for (const button of $("bode-form").children) press(button, button.dataset.value === design.form);
document.title = $("title").textContent = spec.title;
markScenario();
show(current);
try { if (localStorage.getItem("pcl-bode") === "1") showBode(true); } catch (error) { /* storage blocked */ }
