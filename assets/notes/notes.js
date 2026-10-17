// The notes' pages, built by tools/build_notes.py from the Obsidian vaults in notes/: the math of
// text drawn at runtime (the build renders the pages' own), code by highlight.js, previews of linked
// notes on hover, search, and the interactive figures, each a module in widgets/ loaded when its
// figure comes near the screen.
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
let index = null;
async function notesIndex() {
  if (!index) index = fetch(`/${LANG}/notes.json`, { cache: "no-cache" }).then(r => r.json());
  return index;
}
const noteLink = n => `<a class="note-link" href="${n.url}" data-title="${escapeHtml(n.title)}" data-summary="${escapeHtml(n.summary)}">${withItalics(escapeHtml(n.title))}</a>`;
const fold = text => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const FOUND = {
  pt: n => n ? `${n} ${n === 1 ? "nota encontrada" : "notas encontradas"}` : "Nenhuma nota encontrada.",
  en: n => n ? `${n} ${n === 1 ? "note found" : "notes found"}` : "No notes found.",
}[LANG];
function search(box) {
  const input = box.querySelector("input"), list = box.querySelector(".results");
  const status = Object.assign(document.createElement("p"), { className: "search-status" });
  status.setAttribute("role", "status");
  list.before(status);
  input.addEventListener("input", async () => {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    if (!words.length) { list.innerHTML = ""; status.textContent = ""; return; }
    const notes = await notesIndex().catch(() => []);
    const scored = notes.map(n => {
      const title = fold(n.title), body = fold(`${n.summary} ${n.tags.join(" ")} ${n.text}`);
      let score = 0;
      for (const w of words) score += title.includes(w) ? 5 : body.includes(w) ? 1 : -100;
      return [score, n];
    }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 12);
    list.innerHTML = scored.map(([, n]) => `<li>${noteLink(n)}</li>`).join("");
    status.textContent = FOUND(scored.length);
    typeset(list);
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
