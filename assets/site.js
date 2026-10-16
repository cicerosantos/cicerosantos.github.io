// The side menu and the theme, shared by the site's pages. A page puts <aside class="side"></aside>
// first in <div class="layout"> and loads this file in its <head>; to add a page to the menu, add it
// to PAGES.
// Each page's icon is the inside of a 24×24 stroked SVG.
const PAGES = [
  { href: "/", label: "Home", icon: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h4.5v-6h4v6h4.5V9.5"/>' },
  { href: "/power-converters/", label: "Power converters lab", icon: '<path d="M2.5 17h4V7h5v10h5V7h5"/>' },
];
const ICONS = {
  github: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  fold: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
};
const icon = inside => `<svg viewBox="0 0 24 24" aria-hidden="true">${inside}</svg>`;

// The menu's state, expanded or collapsed, is applied at once too.
let side = "expanded";
try { side = localStorage.getItem("pcl-side") || "expanded"; } catch (error) { /* storage blocked */ }
document.documentElement.dataset.side = side;

// The theme is applied at once, before the page is drawn, so a dark page never flashes light.
const THEMES = { auto: "Theme: auto", light: "Theme: light", dark: "Theme: dark" };
let theme = "auto";
try { theme = localStorage.getItem("pcl-theme") || "auto"; } catch (error) { /* storage blocked */ }
function applyTheme() {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const label = document.querySelector("#theme .label");
  if (label) label.textContent = THEMES[theme];
}
applyTheme();

document.addEventListener("DOMContentLoaded", () => {
  const aside = document.querySelector(".side");
  if (!aside) return;
  const here = location.pathname.replace(/index\.html$/, "");
  const current = page => page.href === "/" ? here === "/" : here.startsWith(page.href);
  const item = (tag, attributes, svg, label, title = label) =>
    `<${tag} class="item" ${attributes} title="${title}">${icon(svg)}<span class="label">${label}</span></${tag}>`;
  aside.innerHTML = `
    <a class="who" href="/" title="Cicero A. dos Santos"><img src="/assets/profile-320.webp" alt="" width="36" height="36"><b>Cicero A. dos Santos</b></a>
    <button class="menu" aria-expanded="false" aria-controls="site-menu">Menu</button>
    <nav id="site-menu" aria-label="Site"><ul>${PAGES.map(page =>
      `<li>${item("a", `href="${page.href}"${current(page) ? ' aria-current="page"' : ""}`, page.icon, page.label)}</li>`).join("")}</ul></nav>
    <div class="end">
      ${item("a", 'href="https://github.com/cicerosantos"', ICONS.github, "GitHub")}
      ${item("button", 'id="theme" type="button"', ICONS.theme, THEMES[theme], "Light, dark, or follow the system")}
      ${item("button", 'id="fold" type="button"', ICONS.fold, "Collapse", "Collapse or expand the menu")}
    </div>`;
  const menu = aside.querySelector(".menu");
  menu.onclick = () => menu.setAttribute("aria-expanded", aside.classList.toggle("open"));
  aside.querySelector("#theme").onclick = () => {
    const order = Object.keys(THEMES);
    theme = order[(order.indexOf(theme) + 1) % order.length];
    try { localStorage.setItem("pcl-theme", theme); } catch (error) { /* storage blocked */ }
    applyTheme();
  };
  aside.querySelector("#fold").onclick = () => {
    side = side === "collapsed" ? "expanded" : "collapsed";
    document.documentElement.dataset.side = side;
    try { localStorage.setItem("pcl-side", side); } catch (error) { /* storage blocked */ }
  };
  applyTheme();
});
