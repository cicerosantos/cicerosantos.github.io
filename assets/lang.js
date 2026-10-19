// The link to the other language, English or Portuguese. A page loads this file and, where the link
// goes, puts an element with data-lang-slot; without one the link goes in the top-right group of
// controls (.top-controls), beside the theme button of site.js.
// The choice is kept in localStorage "pcl-lang", which the side menu (site.js) reads too.
//  - The notes, under /en/ and /pt/, have one page per language: the link goes to the same page in
//    the other one, keeping the query and the fragment.
//  - The lab, under /power-labs/, has one page for both: this file, loaded in its <head> before
//    anything else, sets <html lang> from ?lang=en|pt (which it then removes from the address), the
//    last choice or the browser's language, and /assets/pcl/i18n.js translates the page. The link
//    reloads the same address (the oscilloscope keeps its converter and scenario in the query) in the
//    other language.
//  - The home page, /, also has one page for both, with each text in the two languages (lang="en"
//    and lang="pt-BR" blocks): the language is chosen as on the lab's pages, and the page's CSS
//    shows the blocks of <html data-lang>. It needs no translation, so it is never hidden.
(() => {
  const store = lang => { try { localStorage.setItem("pcl-lang", lang); } catch (error) { /* storage blocked */ } };
  const prefix = location.pathname.match(/^\/(en|pt)\//);
  const lab = /^\/power-labs\//.test(location.pathname);
  const home = location.pathname === "/" || location.pathname === "/index.html";
  if (!prefix && !lab && !home) return;

  let here;
  if (prefix) here = prefix[1];
  else {
    const url = new URL(location.href), asked = url.searchParams.get("lang");
    if (asked === "en" || asked === "pt") {
      here = asked;
      store(asked);
      url.searchParams.delete("lang");
      history.replaceState(history.state, "", url);
    } else {
      try { here = localStorage.getItem("pcl-lang"); } catch (error) { /* storage blocked */ }
      if (here !== "en" && here !== "pt") here = /^pt/i.test(navigator.language || "") ? "pt" : "en";
    }
    const root = document.documentElement;
    root.lang = here === "pt" ? "pt-BR" : "en";
    root.dataset.lang = here;  // for site.js, even when storage is blocked
    if (lab && here !== "en") {
      // Hidden until i18n.js has translated the page's English, at most a few seconds.
      root.classList.add("i18n-pending");
      const style = document.createElement("style");
      style.textContent = "html.i18n-pending body { visibility: hidden; }";
      document.head.append(style);
      setTimeout(() => root.classList.remove("i18n-pending"), 3000);
    }
  }
  const other = here === "pt" ? "en" : "pt";
  const target = () => {
    if (prefix) return location.pathname.replace(/^\/(en|pt)\//, `/${other}/`) + location.search + location.hash;
    const url = new URL(location.href);
    url.searchParams.set("lang", other);
    return url.pathname + url.search + url.hash;
  };

  function place() {
    const link = document.createElement("a");
    link.className = "lang-switch";
    link.textContent = other.toUpperCase();
    link.lang = link.hreflang = other === "pt" ? "pt-BR" : "en";
    link.title = other === "pt" ? "Ler em português" : "Read in English";
    link.href = target();
    // The page may change its query after loading: refresh the link before it is followed.
    const refresh = () => { link.href = target(); };
    for (const type of ["focus", "pointerenter", "mouseenter", "touchstart"]) link.addEventListener(type, refresh, { passive: true });
    link.addEventListener("click", () => { refresh(); store(other); });
    link.classList.add("top-button");
    const slot = document.querySelector("[data-lang-slot]");
    if (slot) { slot.append(link); return; }
    // Otherwise first in the top-right group, beside site.js's theme button; site.js moves the group
    // into the side menu, early in the tab order.
    let group = document.querySelector(".top-controls");
    if (!group) {
      group = Object.assign(document.createElement("div"), { className: "top-controls" });
      const skip = document.querySelector("body > .skip-link");
      skip ? skip.after(group) : document.body.prepend(group);
    }
    group.prepend(link);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", place);
  else place();
})();
