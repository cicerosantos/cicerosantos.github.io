// The oscilloscope's drawing pieces, shared by the oscilloscope (scope.js) and the notes' interactive
// figures (assets/notes/widgets/): the time charts' grid, value axes, trigger marker, traces and
// cursor, the Bode plot with its margins, and the number formats of their labels. Pure drawing: the
// caller owns the data, the canvas and the language. Colours are the tokens of traces.css.
//
// fmt is the page's number formatter: a number or a string in, the text out, with U+2212 for minus
// and the decimal comma in Portuguese (i18n.js's num, or localNumber(lang) here).

export const FONT = "11px system-ui, sans-serif";
export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// i18n.js's num for a given language.
export const localNumber = lang => text => {
  const s = String(text).replace(/-(?=[0-9.])/g, "−");
  return s;
};

// ---- numbers ----

export function niceStep(span, count) {
  const raw = span / count, power = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

// A time in µs for the axis, with the digits its grid step needs; extra adds digits for cursor readouts.
export function timeLabel(us, span, fmt, extra = 0) {
  const ms = span >= 2000;
  const value = ms ? us / 1000 : us;
  const unit = ms ? " ms" : " µs";
  const step = (ms ? span / 1000 : span) / 8;
  const digits = (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3) + extra;
  return fmt(value.toFixed(Math.min(digits, 4))) + unit;
}

export function hzText(f, fmt) {
  return fmt(f >= 1e3 ? (f / 1e3).toFixed(f < 1e4 ? 2 : 1) + " kHz" : f.toFixed(0) + " Hz");
}

export function engineering(v, unit, fmt) {
  if (v === 0) return "0 " + unit;
  const prefixes = [[1e-15, "f"], [1e-12, "p"], [1e-9, "n"], [1e-6, "µ"], [1e-3, "m"], [1, ""], [1e3, "k"]];
  let [scale, prefix] = prefixes[0];
  for (const p of prefixes) if (Math.abs(v) >= p[0] * 0.9999) [scale, prefix] = p;
  return fmt((v / scale).toPrecision(3)) + " " + prefix + unit;
}

// A measured value at the oscilloscope's resolution, 0.1 mV or 0.1 mA: millivolts below 1 V, three
// decimals above, and 0 below the resolution (an off switch's nanoamps are not a reading).
export function reading(v, unit, fmt) {
  if (Math.abs(v) < 1e-4) return "0 " + unit;
  if (Math.abs(v) < 1) return fmt((v * 1e3).toFixed(Math.abs(v) < 0.01 ? 2 : Math.abs(v) < 0.1 ? 1 : 0)) + " m" + unit;
  return fmt(v.toFixed(3)) + " " + unit;
}

// ---- value ranges of a chart's axis ----

// Detail: the data's own span, padded by 8%.
export function detailRange(min, max) {
  const pad = (max - min) * 0.08 || Math.max(Math.abs(max) * 0.01, 0.01);
  return [min - pad, max + pad];
}

// Auto behaves like a scope's fixed V/div: the span is at least 20% of the signal's magnitude, so a
// small ripple on a large DC level looks small, the limits fall on round divisions, and the previous
// range is kept until the signal leaves it or uses too little of it.
export function autoRange(min, max, previous) {
  const span = Math.max(max - min, 0.2 * Math.max(Math.abs(min), Math.abs(max)), 0.1);
  const mid = (min + max) / 2, step = niceStep(span * 1.1, 4);
  let low = Math.floor((mid - span * 0.55) / step) * step, high = Math.ceil((mid + span * 0.55) / step) * step;
  // A one-signed signal does not need the other side of zero; keep a sliver so it stays visible.
  if (min >= 0 && low < 0) low = -0.03 * high;
  if (max <= 0 && high >= 0) high = -0.03 * low;
  if (previous && min >= previous[0] && max <= previous[1] && high - low >= 0.6 * (previous[1] - previous[0])) return previous;
  return [low, high];
}

// ---- time charts ----

// A canvas sized to its element in device pixels and cleared; returns [g, w, h] in CSS pixels.
export function sizeCanvas(canvas, element) {
  const ratio = window.devicePixelRatio || 1, w = element.clientWidth, h = element.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  }
  const g = canvas.getContext("2d");
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  return [g, w, h];
}

// Vertical grid lines every step from `from` to `to` (times from the trigger, x maps them to pixels),
// labelled under the chart when label is given.
export function timeGrid(g, { from, to, step, x, top, bottom, h, label }) {
  g.strokeStyle = css("--grid"); g.fillStyle = css("--muted"); g.lineWidth = 1;
  for (let t = Math.ceil(from / step) * step; t <= to + 1e-9; t += step) {
    const px = x(t);
    g.beginPath(); g.moveTo(px, top); g.lineTo(px, bottom); g.stroke();
    if (label) { g.textAlign = "center"; g.fillText(label(t), px, h - 6); g.textAlign = "left"; }
  }
}

// One value axis from low to high over the plot's height: the left one draws the horizontal grid
// (zero bold when two axes share the chart) and labels at the canvas's edge, the right one only its
// labels; about one label per 26 px, at most 4 divisions, none closer than minStep. Returns y(v).
export function valueAxis(g, { low, high, top, height, x0, x1, side, color, unit, fmt, boldZero = false, minStep = 0 }) {
  const y = v => top + (high - v) / (high - low) * height;
  const ystep = Math.max(minStep, niceStep(high - low, Math.max(1.5, Math.min(4, height / 26)))), digits = Math.max(0, -Math.floor(Math.log10(ystep)));
  g.fillStyle = css(color);
  for (let v = Math.ceil(low / ystep - 1e-9) * ystep; v <= high + 1e-9; v += ystep) {
    const py = y(v), label = fmt(v.toFixed(digits)) + (unit ? " " + unit : "");
    if (side === "left") {
      g.strokeStyle = css("--grid"); g.lineWidth = Math.abs(v) < ystep / 2 && boldZero ? 2 : 1;
      g.beginPath(); g.moveTo(x0, py); g.lineTo(x1, py); g.stroke(); g.lineWidth = 1;
      g.fillText(label, 4, py + 4);
    } else {
      g.fillText(label, x1 + 4, py + 4);
    }
  }
  return y;
}

// The trigger: a dashed line with a triangle above the plot.
export function triggerMarker(g, tx, top, bottom) {
  g.strokeStyle = css("--trigger"); g.setLineDash([4, 3]); g.globalAlpha = 0.55;
  g.beginPath(); g.moveTo(tx, top); g.lineTo(tx, bottom); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  g.fillStyle = css("--trigger");
  g.beginPath(); g.moveTo(tx - 5, top - 8); g.lineTo(tx + 5, top - 8); g.lineTo(tx, top - 2); g.fill();
}

// A trace clipped to the plot's columns: either points [t, v] (x maps t) or per-pixel buckets
// [px, first, min, max, last] from the plot's left edge, which keep fast edges visible at any zoom.
// style = { width, alpha, dash }.
export function trace(g, { left, width, height, color, style = {}, points, buckets, x, y }) {
  g.save();
  g.beginPath(); g.rect(left, 0, width, height); g.clip();
  g.strokeStyle = css(color); g.lineWidth = style.width || 1.4; g.globalAlpha = style.alpha || 1;
  g.setLineDash(style.dash || []); g.beginPath();
  if (points) {
    points.forEach(([t, v], i) => i ? g.lineTo(x(t), y(v)) : g.moveTo(x(t), y(v)));
  } else {
    buckets.forEach(([px, first, min, max, last], i) => {
      const xx = left + px + 0.5;
      if (i) g.lineTo(xx, y(first)); else g.moveTo(xx, y(first));
      if (max !== min) { g.moveTo(xx, y(min)); g.lineTo(xx, y(max)); g.moveTo(xx, y(last)); }
    });
  }
  g.stroke(); g.restore();
}

// The pointer's cursor: a line, a dot on each trace, and (on the chart with the time axis) the time
// in a dark box on the axis.
export function cursorLine(g, px, top, bottom) {
  g.strokeStyle = css("--cursor"); g.lineWidth = 1;
  g.beginPath(); g.moveTo(px, top); g.lineTo(px, bottom); g.stroke();
}
export function cursorDot(g, px, py, color) {
  g.fillStyle = css(color);
  g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill();
}
export function cursorTime(g, label, px, left, right, h) {
  g.font = FONT;
  const tw = g.measureText(label).width + 8, lx = Math.min(Math.max(px - tw / 2, left), right - tw);
  g.fillStyle = css("--text"); g.fillRect(lx, h - 18, tw, 16);
  g.fillStyle = css("--panel"); g.fillText(label, lx + 4, h - 6);
}

// One entry of a chart's legend (HTML): a short line in the trace's colour, then the text.
export const legendItem = (color, text, dashed = false) =>
  `<span><i style="border-top-color:var(${color});border-top-style:${dashed ? "dashed" : "solid"}"></i>${text}</span>`;

// ---- Bode plot ----

// Magnitude over phase on one canvas, log frequency from range.from to range.to. curves = { plant,
// design, running } (each { db, phase } over freqs, or null): the plant dashed, the design thick.
// marks = { fz1, fz2, fp } puts the design's zeros (○) and pole (×) on the magnitude's floor; margin
// (loop.js's margins of the main curve, or null) adds the crossover line, the PM and GM arrows and
// their box; hover is the pointer's x in px, or null. labels = { pm, gm }. Returns the frequency
// index under the pointer, or null.
export function drawBode(g, w, h, { freqs, range, curves, marks = null, margin: d = null, hover = null, labels, fmt }) {
  const left = 48, right = 12, top = 10, gap = 24, bottom = 20, pw = w - left - right;
  const magH = (h - top - gap - bottom) * 0.56, phH = h - top - gap - bottom - magH, phTop = top + magH + gap;
  const decades = Math.log10(range.to / range.from);
  const x = f => left + Math.log10(f / freqs[0]) / decades * pw;
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
  for (let decade = 10 ** Math.floor(Math.log10(range.from)); decade <= range.to * edge; decade *= 10)
    for (let n = 1; n < 10 && decade * n <= range.to * edge; n++) {
      if (decade * n < range.from / edge) continue;
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
  for (let v = dbLow; v <= dbHigh; v += dbStep) hline(yDb(v), fmt(v) + " dB");
  const phStep = phHigh - phLow > 360 ? 180 : 90;
  for (let v = Math.ceil(phLow / phStep) * phStep; v <= phHigh; v += phStep) hline(yPh(v), fmt(v) + "°");
  const dashed = (y, color) => {
    g.strokeStyle = css(color); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(left, y); g.lineTo(w - right, y); g.stroke(); g.setLineDash([]);
  };
  dashed(yDb(0), "--muted");
  for (let v = -180; v >= phLow; v -= 360) if (v <= phHigh) dashed(yPh(v), "--muted");
  // curves
  const curve = (c, color, width, dash) => {
    g.save(); g.strokeStyle = css(color); g.lineWidth = width; g.setLineDash(dash || []);
    for (const [values, y, y0] of [[c.db, yDb, top], [c.phase, yPh, phTop]]) {
      g.save(); g.beginPath(); g.rect(left, y0, pw, y === yDb ? magH : phH); g.clip();
      g.beginPath();
      values.forEach((v, i) => i ? g.lineTo(x(freqs[i]), y(v)) : g.moveTo(x(freqs[i]), y(v)));
      g.stroke(); g.restore();
    }
    g.restore();
  };
  if (curves.plant) curve(curves.plant, "--plant", 1.4, [6, 4]);
  if (curves.running) curve(curves.running, "--running", 1.4);
  if (curves.design) curve(curves.design, "--loop", 2.2);
  // zeros (○) and pole (×) of the design, on the magnitude plot's floor
  if (marks) {
    const yMark = top + magH - 7;
    g.strokeStyle = css("--loop"); g.lineWidth = 1.6;
    const double = Math.abs(x(marks.fz1) - x(marks.fz2)) < 6;
    for (const f of double ? [marks.fz1] : [marks.fz1, marks.fz2]) { g.beginPath(); g.arc(x(f), yMark, 4, 0, 7); g.stroke(); }
    if (double) { g.fillStyle = css("--loop"); g.fillText("×2", x(marks.fz1) + 7, yMark + 4); }
    g.beginPath(); g.moveTo(x(marks.fp) - 4, yMark - 4); g.lineTo(x(marks.fp) + 4, yMark + 4);
    g.moveTo(x(marks.fp) + 4, yMark - 4); g.lineTo(x(marks.fp) - 4, yMark + 4); g.stroke();
  }
  // margins
  if (d) {
    const arrow = (px, y0, y1, label) => {
      g.strokeStyle = g.fillStyle = css(d.pm > 0 && (d.gm === null || d.gm > 0) ? "--margin" : "--bad");
      g.lineWidth = 2; g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke();
      const s = y1 > y0 ? 1 : -1;
      g.beginPath(); g.moveTo(px - 4, y1 - 6 * s); g.lineTo(px + 4, y1 - 6 * s); g.lineTo(px, y1); g.fill();
      g.font = "600 10px system-ui, sans-serif";
      g.fillText(label, px + 4, y1 + (s > 0 ? -8 : 14));
      g.font = FONT;
    };
    g.strokeStyle = css("--margin"); g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(x(d.fc), top); g.lineTo(x(d.fc), phTop + phH); g.stroke(); g.setLineDash([]);
    const level = 360 * Math.round((d.cross.phase + 180) / 360) - 180;  // the −180° (mod 360°) line nearest the phase
    arrow(x(d.fc), yPh(level), yPh(d.cross.phase), labels.pm);
    if (d.gain) arrow(x(d.gain.f), yDb(d.gain.db), yDb(0), labels.gm);
    // the values in a box at the phase plot's lower left, where the curves seldom go
    const text = `${labels.pm} ${fmt(d.pm.toFixed(0))}° · ${labels.gm} ${d.gm === null ? "—" : fmt(d.gm.toFixed(1)) + " dB"}`;
    g.font = "600 11px system-ui, sans-serif";
    const tw = g.measureText(text).width;
    g.fillStyle = css("--panel"); g.fillRect(left + 4, phTop + phH - 20, tw + 10, 17);
    g.strokeStyle = g.fillStyle = css(d.pm > 0 && (d.gm === null || d.gm > 0) ? "--margin" : "--bad");
    g.lineWidth = 1; g.strokeRect(left + 4.5, phTop + phH - 19.5, tw + 9, 16);
    g.fillText(text, left + 9, phTop + phH - 7);
    g.font = FONT;
  }
  // cursor
  if (hover !== null && hover >= left && hover <= w - right) {
    const i = Math.round((hover - left) / pw * (freqs.length - 1));
    g.strokeStyle = css("--cursor"); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x(freqs[i]), top); g.lineTo(x(freqs[i]), phTop + phH); g.stroke();
    return i;
  }
  return null;
}

// The Bode plot's legend (HTML): items [color, label, style ("solid" | "dashed"), curve]; with the
// pointer at frequency index i, each label gets its curve's magnitude and phase there, and the
// frequency comes first.
export function bodeLegend(items, i, freqs, fmt, lang) {
  let legend = items.map(([color, label, style]) => [color, label, style]);
  if (i !== null) {
    const value = c => `${fmt(c.db[i].toFixed(1))} dB${","} ${fmt(c.phase[i].toFixed(0))}°`;
    legend = items.map(([color, label, style, c]) => [color, `${label}: ${value(c)}`, style]);
    legend.unshift([null, hzText(freqs[i], fmt)]);
  }
  return legend.map(([color, label, style]) =>
    color ? `<span><i style="border-color:var(${color});border-top-style:${style}"></i>${label}</span>` : `<span>${label}</span>`).join("");
}

// The margins table (HTML, a four-column grid): a heading row, then per row its label, the
// crossover, the phase margin and the gain margin with its frequency; values at or below zero in
// the "bad" colour. words = { none, at(gm, f) }.
export function marginsGrid(heads, rows, words, fmt) {
  const hz = f => hzText(f, fmt);
  const row = (label, m) => {
    if (!m) return `<span>${label}</span><span>${words.none}</span><span></span><span></span>`;
    const bad = v => v === null || v <= 0 ? ' class="bad"' : "";
    return `<span>${label}</span><span>${hz(m.fc)}</span><span${bad(m.pm)}>${fmt(m.pm.toFixed(1))}°</span>` +
      `<span${bad(m.gm)}>${m.gm === null ? "—" : words.at(fmt(m.gm.toFixed(1)), hz(m.gain.f))}</span>`;
  };
  return heads.map(k => `<span>${k}</span>`).join("") + rows.map(([label, m]) => row(label, m)).join("");
}

// A block of the five-column coefficient grid (HTML): the names, then the values, padded to five.
export function cellsGrid(names, values) {
  const pad = "<span></span>".repeat(5 - names.length);
  return names.map(n => `<span class="name">${n}</span>`).join("") + pad + values.map(v => `<span>${v}</span>`).join("") + pad;
}
