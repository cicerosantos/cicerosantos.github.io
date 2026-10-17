// The side menu and the theme, shared by the site's pages. A page puts <aside class="side"></aside>
// first in <div class="layout"> and loads this file in its <head>; to add a page to the menu, add it
// to PAGES.
// Each page's icon is the inside of a 24×24 stroked SVG. {lang} in an href is the visitor's language,
// en or pt. A tab is current on its address and those below it; a tab with a section, on the notes of
// that section (/en/<section>/ or /pt/<section>/).
const PAGES = [
  { href: "/", label: { en: "Home", pt: "Início" }, icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h4.5v-6h4v6h4.5V9.5"/>' },
  // a square wave
  { href: "/power-labs/", label: { en: "Power labs", pt: "Power labs" },
    icon: '<path d="M2.5 17h4V7h5v10h5V7h5"/>' },
  // the s-plane: its axes, a pole (×) and a zero (○)
  { href: "/{lang}/control-basics/", section: "control-basics", label: { en: "Control basics", pt: "Fundamentos" },
    icon: '<path d="M3 12h18M15.5 3.5v17"/><path d="M5.5 4.5l5 5M10.5 4.5l-5 5"/><circle cx="8" cy="17" r="2.6"/>' },
  // an open book
  { href: "/{lang}/converters/", section: "converters", label: { en: "Power converters", pt: "Conversores" },
    icon: '<path d="M12 6.8C10.2 5.3 7.4 4.6 3.5 4.9v12.9c3.9-.3 6.7.4 8.5 1.9 1.8-1.5 4.6-2.2 8.5-1.9V4.9c-3.9-.3-6.7.4-8.5 1.9z"/><path d="M12 6.8v12.9"/>' },
  // a microcontroller
  { href: "/{lang}/digital-control/", section: "digital-control", label: { en: "Digital control", pt: "Controle digital" },
    icon: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="M10 6.5v-3M14 6.5v-3M10 20.5v-3M14 20.5v-3M6.5 10h-3M6.5 14h-3M20.5 10h-3M20.5 14h-3"/><path d="M10 12h4"/>' },
];

// The labels are in the visitor's language: the page's own under /en/ and /pt/; on the lab's pages
// the one lang.js chose; elsewhere the one last chosen with lang.js's link, or else the browser's.
const PAGE_LANG = (location.pathname.match(/^\/(en|pt)\//) || [])[1] || null;
function preferredLang() {
  if (PAGE_LANG) return PAGE_LANG;
  const chosen = document.documentElement.dataset.lang;  // set by lang.js on the lab's pages
  if (chosen === "en" || chosen === "pt") return chosen;
  try { const stored = localStorage.getItem("pcl-lang"); if (stored === "en" || stored === "pt") return stored; }
  catch (error) { /* storage blocked */ }
  return /^pt/i.test(navigator.language || "") ? "pt" : "en";
}
const UI = preferredLang();
const say = text => typeof text === "object" ? text[UI] ?? text.en : text;
const TEXT = {
  menu: { en: "Menu", pt: "Menu" }, site: { en: "Site", pt: "Site" },
  collapse: { en: "Collapse menu", pt: "Recolher menu" }, expand: { en: "Expand menu", pt: "Expandir menu" },
};

// The notes' sections. The equations, shared by both, belong to the section the reader came from.
const SECTION = (location.pathname.match(/^\/(?:en|pt)\/([a-z-]+)\//) || [])[1] || null;
function sectionHere() {
  if (SECTION !== "equations") {
    if (SECTION) try { sessionStorage.setItem("pcl-section", SECTION); } catch (error) { /* storage blocked */ }
    return SECTION;
  }
  try { return sessionStorage.getItem("pcl-section"); } catch (error) { return null; }
}

const ICONS = {
  github: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5"/>',
  fold: '<path d="M14 7l-5 5 5 5"/>',
};
// The theme button shows the current mode: auto (half dark), light (a sun) or dark (a moon).
const THEME_ICONS = {
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
};
const icon = inside => `<svg viewBox="0 0 24 24" aria-hidden="true">${inside}</svg>`;

// The menu's state, expanded or collapsed, is applied at once too.
let side = "expanded";
try { side = localStorage.getItem("pcl-side") || "expanded"; } catch (error) { /* storage blocked */ }
document.documentElement.dataset.side = side;

// The theme is applied at once, before the page is drawn, so a dark page never flashes light.
const THEMES = UI === "pt" ? { auto: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" }
                            : { auto: "Theme: auto", light: "Theme: light", dark: "Theme: dark" };
let theme = "auto";
try { theme = localStorage.getItem("pcl-theme") || "auto"; } catch (error) { /* storage blocked */ }
function applyTheme() {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const button = document.getElementById("theme");
  if (button) {
    button.innerHTML = icon(THEME_ICONS[theme]);
    button.title = THEMES[theme];
    button.setAttribute("aria-label", THEMES[theme]);
  }
}
applyTheme();

document.addEventListener("DOMContentLoaded", () => {
  const aside = document.querySelector(".side");
  if (!aside) return;
  // "Skip to content", first in the tab order, to the page's <main>.
  const main = document.querySelector("main");
  if (main) {
    main.id ||= "content";
    if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
    const skip = Object.assign(document.createElement("a"), { className: "skip-link", href: "#" + main.id,
      textContent: say({ en: "Skip to content", pt: "Pular para o conteúdo" }) });
    document.body.prepend(skip);
  }
  const here = location.pathname.replace(/index\.html$/, ""), section = sectionHere();
  const hrefOf = page => page.href.replace("{lang}", UI);
  const current = page => page.section ? page.section === section : page.href === "/" ? here === "/" : here.startsWith(page.href);
  const item = (tag, attributes, svg, label, title = label) =>
    `<${tag} class="item" ${attributes} title="${title}">${icon(svg)}<span class="label">${label}</span></${tag}>`;
  aside.innerHTML = `
    <a class="who" href="/" title="Cicero A. dos Santos"><img src="/assets/profile-320.webp" alt="" width="36" height="36"><b>Cicero A. dos Santos</b></a>
    <button class="menu" aria-expanded="false" aria-controls="site-menu">${say(TEXT.menu)}</button>
    <button class="fold" id="fold" type="button" aria-controls="site-menu"></button>
    <nav id="site-menu" aria-label="${say(TEXT.site)}"><ul>${PAGES.map(page =>
      `<li>${item("a", `href="${hrefOf(page)}"${current(page) ? ' aria-current="page"' : ""}`, page.icon, say(page.label))}</li>`).join("")}</ul></nav>
    <div class="end">
      ${item("a", 'href="https://github.com/cicerosantos"', ICONS.github, "GitHub")}
    </div>`;
  // The language link (lang.js) and the theme button, together at the top right: fixed in the corner
  // on wide screens, in the bar left of "Menu" on phones. They follow the profile link in the tab order.
  const controls = topControls();
  aside.querySelector(".who").after(controls);
  const themeButton = Object.assign(document.createElement("button"), { id: "theme", type: "button", className: "top-button" });
  controls.append(themeButton);
  const menu = aside.querySelector(".menu");
  menu.onclick = () => menu.setAttribute("aria-expanded", aside.classList.toggle("open"));
  themeButton.onclick = () => {
    const order = Object.keys(THEMES);
    theme = order[(order.indexOf(theme) + 1) % order.length];
    try { localStorage.setItem("pcl-theme", theme); } catch (error) { /* storage blocked */ }
    applyTheme();
  };
  // The arrow on the menu's right edge (wide screens): left to collapse, right to expand.
  const fold = aside.querySelector("#fold");
  fold.innerHTML = icon(ICONS.fold);
  const showFold = () => {
    const label = say(side === "collapsed" ? TEXT.expand : TEXT.collapse);
    fold.title = label;
    fold.setAttribute("aria-label", label);
    fold.setAttribute("aria-expanded", side !== "collapsed");
  };
  fold.onclick = () => {
    side = side === "collapsed" ? "expanded" : "collapsed";
    document.documentElement.dataset.side = side;
    try { localStorage.setItem("pcl-side", side); } catch (error) { /* storage blocked */ }
    showFold();
  };
  showFold();
  applyTheme();
});

// The group of the top-right controls, shared with lang.js, which may run first and create it.
function topControls() {
  let group = document.querySelector(".top-controls");
  if (!group) group = Object.assign(document.createElement("div"), { className: "top-controls" });
  return group;
}
