// The lab's two languages, English and Brazilian Portuguese. The page's <html lang> picks one: on the
// lab's pages, /power-labs/, /assets/lang.js sets it before the page is drawn, from ?lang=, the
// visitor's last choice or the browser; the notes' pages are written in one language each.
//   tr(value): a data text, either a plain string or { en, pt } (en when pt is missing).
//   t(key, ...args): a text of the page's scripts, from STRINGS below; a function entry takes args.
//   num(text): a number as text, with U+2212 for minus and, in Portuguese, a decimal comma.
// The lab's pages are written in English; on import, this module translates the elements marked
// data-t="key" (text), data-t-title, data-t-aria (aria-label), data-t-content (a <meta>'s content) and
// data-t-href (a link's address in the other language).
export const LANG = /^pt/i.test(document.documentElement.lang) ? "pt" : "en";
export const LOCALE = LANG === "pt" ? "pt-BR" : "en";

export const tr = value =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value[LANG] ?? value.en) : value;

export const num = text => {
  const s = String(text).replace(/-(?=[0-9.])/g, "−");
  return s;
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const STRINGS = {
  // ---- the pages' own texts (data-t…) ----
  "gallery.page": { en: "Power labs", pt: "Power labs" },
  "gallery.description": {
    en: "Simulated power converters: open one to see its waveforms in a browser oscilloscope, with prepared steps and controller designs.",
    pt: "Conversores de potência simulados: abra um para ver suas formas de onda num osciloscópio no navegador, com degraus preparados e projetos de controlador.",
  },
  "gallery.intro": {
    en: "Simulated power converters with digital control. Open one to see its waveforms in a browser oscilloscope: " +
        "reference, input and load steps under several controller designs, with zoom, cursors, measurements and the loop gain.",
    pt: "Conversores de potência simulados, com controle digital. Abra um para ver suas formas de onda num osciloscópio no navegador: " +
        "degraus de referência, de entrada e de carga com vários projetos de controlador, com zoom, cursores, medições e o ganho de malha.",
  },
  "gallery.cards": { en: "Converters", pt: "Conversores" },
  "gallery.course": { en: "The course: the notes behind these converters →", pt: "O curso: as notas por trás destes conversores →" },
  "gallery.course.href": { en: "/en/", pt: "/pt/" },
  "gallery.footer": {
    en: "Simulated with QSPICE, Qorvo's freeware circuit simulator, under Wine. This site is not affiliated with or endorsed by Qorvo.",
    pt: "Simulado com o QSPICE, simulador de circuitos gratuito da Qorvo, sob o Wine. Este site não tem vínculo com a Qorvo nem é endossado por ela.",
  },
  "scope.page": { en: "Converter", pt: "Conversor" },
  "scope.back": { en: "← All converters", pt: "← Todos os conversores" },
  "scope.scenario": { en: "Scenario", pt: "Cenário" },
  "scope.controller": { en: "Controller", pt: "Controlador" },
  "scope.event": { en: "Event", pt: "Evento" },
  "scope.view": { en: "View", pt: "Visualização" },
  "scope.zoomIn": { en: "Zoom in", pt: "Ampliar" },
  "scope.zoomIn.title": {
    en: "Zoom in (or drag across a chart to zoom into that span, or the mouse wheel; Shift+drag pans, Shift+wheel zooms the Y axis)",
    pt: "Ampliar (ou arraste sobre um gráfico para ampliar aquele trecho, ou use a roda do mouse; Shift+arrastar desloca, Shift+roda amplia o eixo Y)",
  },
  "scope.zoomOut": { en: "Zoom out", pt: "Reduzir" },
  "scope.fit": { en: "Fit", pt: "Tudo" },
  "scope.fit.title": { en: "Whole frame (or double-click)", pt: "Quadro inteiro (ou clique duplo)" },
  "scope.bode": { en: "Bode plot", pt: "Diagrama de Bode" },
  "scope.bode.title": { en: "Show or hide the loop gain", pt: "Mostrar ou ocultar o ganho de malha" },
  "scope.bode.canvas": { en: "Bode plot of the loop gain", pt: "Diagrama de Bode do ganho de malha" },
  "scope.qspice": {
    en: "Simulated with QSPICE (Qorvo freeware) under Wine; this site is not affiliated with Qorvo.",
    pt: "Simulado com o QSPICE (gratuito, da Qorvo) sob o Wine; este site não tem vínculo com a Qorvo.",
  },
  "scope.scope": { en: "Oscilloscope", pt: "Osciloscópio" },
  "scope.measure": { en: "Measure", pt: "Medir" },
  "scope.measure.title": {
    en: "Min, max, peak-to-peak, mean and RMS of each trace, over the view or between cursors A and B",
    pt: "Mínimo, máximo, pico a pico, média e RMS de cada traço, na janela visível ou entre os cursores A e B",
  },
  "scope.cursors": { en: "Cursors A/B", pt: "Cursores A/B" },
  "scope.cursors.title": {
    en: "Two time cursors, A and B: drag them; the table shows each trace at A and B",
    pt: "Dois cursores de tempo, A e B: arraste-os; a tabela mostra cada traço em A e em B",
  },
  "scope.periods": { en: "whole periods", pt: "períodos inteiros" },
  "scope.periods.title": {
    en: "Round the measured span to whole PWM periods, so means are not biased by the ripple",
    pt: "Arredonda o trecho medido para um número inteiro de períodos do PWM, para que a ondulação não distorça as médias",
  },
  "scope.loop": { en: "Loop gain", pt: "Ganho de malha" },
  "scope.close": { en: "Close", pt: "Fechar" },
  "scope.close.title": { en: "Hide (the Bode plot button brings it back)", pt: "Ocultar (o botão Diagrama de Bode a traz de volta)" },
  "scope.form": { en: "Firmware form", pt: "Forma no firmware" },
  "scope.details": { en: "Formula, PID gains and 2p2z coefficients", pt: "Fórmula, ganhos do PID e coeficientes 2p2z" },
  "scope.simulated": { en: "Simulated", pt: "Simulados" },

  // ---- gallery ----
  "gallery.scenarios": { en: n => plural(n, "scenario", "scenarios"), pt: n => plural(n, "cenário", "cenários") },
  "gallery.open": { en: "Open →", pt: "Abrir →" },

  // ---- oscilloscope: charts ----
  "y.auto": { en: "Y auto", pt: "Y auto" },
  "y.detail": { en: "Y detail", pt: "Y detalhe" },
  "y.manual": { en: "Y manual", pt: "Y manual" },
  "y.title": {
    en: "Click to switch between auto (span of at least 20% of the signal, stable between frames) and " +
        "detail (fits the data tightly, to inspect ripple). Shift+wheel zooms this axis by hand.",
    pt: "Clique para alternar entre auto (faixa de pelo menos 20% do sinal, estável entre quadros) e " +
        "detalhe (ajustada aos dados, para examinar a ondulação). Shift+roda amplia este eixo à mão.",
  },
  "zoom.to": { en: span => `zoom to ${span}`, pt: span => `ampliar para ${span}` },
  "gate.on": { en: "on", pt: "lig" },
  "gate.off": { en: "off", pt: "desl" },
  "view.div": { en: step => `${step}/div`, pt: step => `${step}/div` },
  "view.span": { en: (a, b) => `view ${a} to ${b}`, pt: (a, b) => `janela de ${a} a ${b}` },

  // ---- measurements ----
  "measure.cursors": { en: (a, b) => `between cursors: ${a} to ${b}`, pt: (a, b) => `entre os cursores: de ${a} a ${b}` },
  "measure.window": { en: (a, b) => `visible window: ${a} to ${b}`, pt: (a, b) => `janela visível: de ${a} a ${b}` },
  "measure.periods": { en: n => plural(n, "period", "periods"), pt: n => plural(n, "período", "períodos") },
  "measure.switching": { en: f => `switching ${f}`, pt: f => `chaveamento ${f}` },
  "measure.duty": { en: d => `duty ${d}`, pt: d => `razão cíclica ${d}` },
  "measure.min": { en: "min", pt: "mín" },
  "measure.max": { en: "max", pt: "máx" },
  "measure.pp": { en: "peak-peak", pt: "pico a pico" },
  "measure.mean": { en: "mean", pt: "média" },
  "measure.rms": { en: "RMS", pt: "RMS" },

  // ---- frame info ----
  "frame.points": { en: n => `${n} points`, pt: n => `${n} pontos` },
  "frame.trigger.gate": { en: "trigger: gate rising edge", pt: "disparo: borda de subida do gate" },
  "frame.trigger.event": { en: "trigger: the event", pt: "disparo: o evento" },
  "event.controller": { en: "new controller", pt: "novo controlador" },
  "event.off": { en: "off", pt: "desligada" },
  "event.slew": { en: v => `reference slew → ${v}`, pt: v => `rampa da referência → ${v}` },
  "event.vinSlew": { en: v => `input slew → ${v}`, pt: v => `rampa da entrada → ${v}` },
  "event.load": { en: v => `load → ${v}`, pt: v => `carga → ${v}` },
  "event.vref": { en: v => `reference → ${v}`, pt: v => `referência → ${v}` },
  "event.vin": { en: v => `input → ${v}`, pt: v => `entrada → ${v}` },
  "loading": { en: "loading…", pt: "carregando…" },
  "load.failed": { en: "could not load this scenario", pt: "não foi possível carregar este cenário" },
  "not.simulated": { en: "Not simulated with this controller", pt: "Não simulado com este controlador" },

  // ---- Bode window ----
  "form.2p2z": { en: "2p2z, velocity form", pt: "2p2z, forma de velocidade" },
  "form.pid": { en: "PID, integrator clamp", pt: "PID, integrador limitado" },
  "slider.fc": { en: "Target crossover", pt: "Cruzamento desejado" },
  "slider.fz1": { en: "Zero 1", pt: "Zero 1" },
  "slider.fz2": { en: "Zero 2", pt: "Zero 2" },
  "slider.fp": { en: "Pole", pt: "Polo" },
  "pid.gains": { en: "PID gains", pt: "Ganhos do PID" },
  "pid.equivalent": { en: "PID equivalent (continuous time)", pt: "PID equivalente (tempo contínuo)" },
  "pid.as2p2z": { en: "the same as 2p2z coefficients, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)", pt: "os mesmos, como coeficientes 2p2z, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)" },
  "coefficients": { en: "2p2z coefficients, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)", pt: "Coeficientes 2p2z, (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)" },
  "margin.crossover": { en: "crossover", pt: "cruzamento" },
  "margin.phase": { en: "phase margin", pt: "margem de fase" },
  "margin.gain": { en: "gain margin", pt: "margem de ganho" },
  "margin.none": { en: "no crossover", pt: "sem cruzamento" },
  "margin.at": { en: (db, f) => `${db} dB at ${f}`, pt: (db, f) => `${db} dB em ${f}` },
  "row.design": { en: "Design", pt: "Projeto" },
  "row.designSimulated": { en: "Design (simulated)", pt: "Projeto (simulado)" },
  "row.simulated": { en: "Simulated", pt: "Simulado" },
  "note.unstable": {
    en: f => "This design is unstable here: the output would oscillate" + (f ? ` at about ${f}` : "") + ". ",
    pt: f => "Este projeto é instável neste ponto: a saída oscilaria" + (f ? ` em torno de ${f}` : "") + ". ",
  },
  "note.response": {
    en: "The time response on the charts is the simulated controller's. The designs under Simulated have one; " +
        "moving the sliders shows only the frequency response.",
    pt: "A resposta no tempo nos gráficos é a do controlador simulado. Os projetos em Simulados têm uma; " +
        "mover os controles deslizantes mostra só a resposta em frequência.",
  },
  "bode.pm": { en: "PM", pt: "MF" },
  "bode.gm": { en: "GM", pt: "MG" },
  "bode.plant": { en: "plant (duty → Vout)", pt: "planta (razão cíclica → Vout)" },
  "bode.loopApplied": { en: "loop, design = simulated", pt: "malha, projeto = simulado" },
  "bode.loop": { en: "loop, design", pt: "malha, projeto" },
  "bode.loopSimulated": { en: "loop, simulated", pt: "malha, simulado" },

  // ---- theme button ----
  "theme.auto": { en: "Theme: auto", pt: "Tema: automático" },
  "theme.light": { en: "Theme: light", pt: "Tema: claro" },
  "theme.dark": { en: "Theme: dark", pt: "Tema: escuro" },
};

export function t(key, ...args) {
  const entry = STRINGS[key];
  if (!entry) return key;
  const text = entry[LANG] ?? entry.en;
  return typeof text === "function" ? text(...args) : text;
}

// The page's own texts, written in English in its HTML.
if (LANG !== "en") {
  const ATTRIBUTES = { t: null, tTitle: "title", tAria: "aria-label", tContent: "content", tHref: "href" };
  for (const [key, attribute] of Object.entries(ATTRIBUTES)) {
    const name = "data-" + key.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
    for (const element of document.querySelectorAll(`[${name}]`)) {
      const text = t(element.dataset[key]);
      if (attribute) element.setAttribute(attribute, text);
      else element.textContent = text;
    }
  }
  document.documentElement.classList.remove("i18n-pending");
}
