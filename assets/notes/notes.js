// The notes' pages, built by tools/build_notes.py from the Obsidian vaults in notes/: the math of
// text drawn at runtime (the build renders the pages' own), code by highlight.js, previews of linked
// notes on hover, search (busca.js), and the interactive figures, each a module in widgets/ loaded when
// its figure comes near the screen.
import { buscar, indexar, termosDaConsulta, trecho, MAX_QUERY_CHARS } from "./busca.js";
const LANG = document.documentElement.lang.startsWith("pt") ? "pt" : "en";
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// titles and summaries keep the notes' *italics* (the English terms of the Portuguese notes), as the build does
const withItalics = html => html.replace(/(?<![*\w\\])\*(?![\s*])([^*\n]+?)(?<![\s*\\])\*(?![*\w])/g, "<em>$1</em>");

function whenLoaded(test) {
  return new Promise(resolve => {
    if (test()) return resolve();
    const tick = setInterval(() => { if (test()) { clearInterval(tick); resolve(); } }, 30);
    window.addEventListener("load", () => { clearInterval(tick); resolve(); }, { once: true });
  });
}

// ---- equations and code ----
// The build renders the pages' math; KaTeX's script is loaded only when something drawn here holds
// \(…\): a figure's labels, a link's preview, search results.
const KATEX = "/assets/vendor/katex-0.16.11/";
let katexReady = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src, onload: resolve, onerror: () => reject(new Error(`could not load ${src}`)) });
    document.head.append(script);
  });
}
export function typeset(root = document.body) {
  if (!/\\[([]/.test(root.textContent)) return Promise.resolve();
  katexReady ??= loadScript(KATEX + "katex.min.js").then(() => loadScript(KATEX + "contrib/auto-render.min.js"));
  return katexReady.then(() => window.renderMathInElement(root, {
    delimiters: [{ left: "\\[", right: "\\]", display: true }, { left: "\\(", right: "\\)", display: false }],
    throwOnError: false, output: "htmlAndMathml",
    // units in \text{µs}: µ is outside KaTeX's fonts but renders well; other warnings stay
    strict: code => (code === "unknownSymbol" || code === "unicodeTextInMathMode") ? "ignore" : "warn",
  })).catch(error => { katexReady = null; console.error(error); });
}
whenLoaded(() => window.hljs).then(() => {
  if (!window.hljs) return;
  for (const block of document.querySelectorAll("pre code")) {
    if (!/language-/.test(block.className)) block.classList.add("language-plaintext");
    window.hljs.highlightElement(block);
  }
});

// ---- previews of linked notes ----
// A link's data-title and data-summary hold text (the build escapes them into the attributes), so
// they are escaped again here. The preview stays open while the pointer is on it, and Escape closes it.
const tip = document.createElement("div");
tip.className = "note-tip"; tip.id = "note-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
document.addEventListener("DOMContentLoaded", () => document.body.append(tip));
let tipFor = null, hideTimer = 0;
function showTip(link) {
  clearTimeout(hideTimer);
  const text = link.dataset.summary;
  if (!text || matchMedia("(hover: none)").matches) return;
  if (tipFor && tipFor !== link) tipFor.removeAttribute("aria-describedby");
  tipFor = link;
  const name = link.dataset.title ? withItalics(escapeHtml(link.dataset.title)) : link.innerHTML;
  tip.innerHTML = `<b>${name}</b><span>${withItalics(escapeHtml(text))}</span>`;
  tip.hidden = false;
  link.setAttribute("aria-describedby", tip.id);
  placeTip(link);
  typeset(tip).then(() => { if (tipFor === link) placeTip(link); });  // the math changes its height
}
function placeTip(link) {
  const r = link.getBoundingClientRect(), w = Math.min(360, innerWidth - 24);
  tip.style.width = w + "px";
  tip.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + "px";
  const below = r.bottom + 8 + tip.offsetHeight < innerHeight;
  tip.style.top = (below ? r.bottom + 8 : r.top - tip.offsetHeight - 8) + scrollY + "px";
}
function hideTip() {
  clearTimeout(hideTimer);
  if (tipFor) tipFor.removeAttribute("aria-describedby");
  tip.hidden = true; tipFor = null;
}
document.addEventListener("mouseover", e => {
  if (tip.contains(e.target)) { clearTimeout(hideTimer); return; }
  const link = e.target.closest?.("a[data-summary]");
  if (link && link !== tipFor) showTip(link);
  else if (link) clearTimeout(hideTimer);
  else if (tipFor) { clearTimeout(hideTimer); hideTimer = setTimeout(hideTip, 250); }  // time to reach the preview
});
document.addEventListener("focusin", e => { const link = e.target.closest?.("a[data-summary]"); if (link) showTip(link); });
document.addEventListener("focusout", hideTip);
document.addEventListener("keydown", e => { if (e.key === "Escape" && tipFor) hideTip(); });

// ---- search ----
// The index (search.json) is read once; a failed read is forgotten, so the next query tries again.
// The analysis and BM25 are in busca.js. Results are built with text nodes, never with the query as HTML.
const SEARCH_LABELS = LANG === "pt"
  ? { first: "Antes, veja:", trail: "Trilha:", none: "Nenhum resultado.", count: n => `${n} ${n === 1 ? "resultado" : "resultados"}`,
      error: "Não foi possível carregar a busca. Tente de novo." }
  : { first: "First, see:", trail: "Trail:", none: "No results.", count: n => `${n} ${n === 1 ? "result" : "results"}`,
      error: "Search could not be loaded. Try again." };
let searchIndex = null;
function loadSearch() {
  searchIndex ??= fetch(`/${LANG}/search.json`, { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error(`search.json: HTTP ${r.status}`); return r.json(); })
    .then(passages => indexar(passages, LANG))
    .catch(error => { searchIndex = null; throw error; });
  return searchIndex;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function safeHref(url) { return typeof url === "string" && url.startsWith("/") ? url : null; }
function renderHit({ passagem: p }, termos) {
  const item = element("li", "result");
  if (p.heading && p.heading !== p.title) item.append(element("span", "result-heading", p.heading));
  const note = element("a", "result-note", p.title);
  if (safeHref(p.url)) note.href = p.url;
  item.append(note);
  const excerpt = trecho(p.text, termos, LANG);  // LaTeX as written; KaTeX renders it after the list is built
  if (excerpt) item.append(element("p", "result-text", excerpt));
  const meta = [];
  for (const [label, links] of [[SEARCH_LABELS.first, p.prereqs ?? []], [SEARCH_LABELS.trail, p.trails ?? []]]) {
    if (!links.length) continue;
    const span = element("span", "result-meta", `${label} `);
    links.forEach(([name, url], i) => {
      if (i) span.append(", ");
      const a = element("a", null, name);
      if (safeHref(url)) a.href = url;
      span.append(a);
    });
    meta.push(span);
  }
  item.append(...meta);
  return item;
}
function search(box) {
  const input = box.querySelector("input"), list = box.querySelector(".results");
  const status = element("p", "search-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  list.before(status);
  let timer = 0, turn = 0;
  const clear = () => { clearTimeout(timer); turn++; list.replaceChildren(); status.textContent = ""; };
  const run = async () => {
    const mine = ++turn;
    const query = input.value.slice(0, MAX_QUERY_CHARS);
    let index;
    try { index = await loadSearch(); } catch (error) {
      console.error(error);
      if (mine === turn) { list.replaceChildren(); status.textContent = SEARCH_LABELS.error; }
      return;
    }
    if (mine !== turn) return;  // a newer query has been typed meanwhile
    const hits = buscar(index, query, 10);
    const termos = termosDaConsulta(query, LANG);
    list.replaceChildren(...hits.map(hit => renderHit(hit, termos)));
    status.textContent = hits.length ? SEARCH_LABELS.count(hits.length) : SEARCH_LABELS.none;
    typeset(list);  // the excerpts' math; the status above does not wait for it
  };
  input.addEventListener("input", () => {
    if (input.value.length > MAX_QUERY_CHARS) input.value = input.value.slice(0, MAX_QUERY_CHARS);  // a paste, before any processing
    if (!input.value.trim()) return clear();
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Escape" && (input.value || list.childNodes.length)) { e.preventDefault(); input.value = ""; clear(); }
  });
}
document.addEventListener("DOMContentLoaded", () => document.querySelectorAll(".note-search").forEach(search));

// ---- interactive figures ----
// A figure <figure class="widget" data-widget="bode" data-converter="buck" …> is drawn by
// widgets/bode.js, whose default export is mount(body, options, { lang, typeset }).
const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { observer.unobserve(e.target); mount(e.target); }
}, { rootMargin: "400px" }) : null;
async function mount(figure) {
  const body = figure.querySelector(".widget-body");
  try {
    const module = await import(`/assets/notes/widgets/${figure.dataset.widget}.js`);
    body.innerHTML = "";
    await module.default(body, { ...figure.dataset }, { lang: LANG, typeset });
  } catch (error) {
    console.error(error);
    body.innerHTML = `<p class="widget-error">${LANG === "pt" ? "Não foi possível carregar esta figura." : "This figure could not be loaded."}</p>`;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  for (const figure of document.querySelectorAll("figure.widget")) observer ? observer.observe(figure) : mount(figure);
});
