// The converter gallery, index.html: one card per converter of converters/index.json, each opening
// scope.html next to the page. The texts follow the page's language (i18n.js).
import { t, tr } from "/assets/pcl/i18n.js";

const $ = id => document.getElementById(id);
const escape = text => String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The card's picture: the converter's topology, an SVG drawn with the page's colour tokens, put
// inline so it follows the theme.
async function topology(base) {
  try {
    const response = await fetch(base + "topology.svg", { cache: "no-cache" });
    return response.ok ? await response.text() : "";
  } catch (error) { return ""; }
}

const list = await (await fetch("converters/index.json", { cache: "no-cache" })).json();
for (const c of list.converters) {
  const base = `converters/${c.id}/`;
  const [spec, picture] = await Promise.all([fetch(base + "scenarios.json", { cache: "no-cache" }).then(r => r.json()), topology(base)]);
  const card = document.createElement("a");
  card.className = "card";
  card.href = `scope.html?c=${encodeURIComponent(c.id)}` + (c.open ? `&s=${encodeURIComponent(c.open)}` : "");
  card.innerHTML = `<div class="topology">${picture}</div>` +
    `<div class="body"><h2>${escape(tr(c.title))}</h2><p>${escape(tr(c.summary))}</p>` +
    `<div class="chips">${c.specs.map(s => `<span>${escape(tr(s))}</span>`).join("")}</div>` +
    `<div class="foot"><span>${escape(t("gallery.scenarios", spec.scenarios.length))} · ${escape(tr(c.controls))}</span>` +
    `<span class="open">${escape(t("gallery.open"))}</span></div></div>`;
  // The SVG describes itself in English; the index has the description in both languages.
  const svg = card.querySelector(".topology svg");
  if (svg && c.diagram) svg.setAttribute("aria-label", tr(c.diagram));
  $("cards").append(card);
}
