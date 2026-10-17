// The notes' search: the text analysis and BM25 over the passages of search.json, built by tools/build_notes.py.
// No DOM here, so tests/busca runs this same file through node. The analysis mirrors tools/busca.py step by
// step (the same regexes, lists and order); tests/busca/test_busca.py checks that both give the same tokens.

export const MAX_QUERY_CHARS = 120;
export const MAX_QUERY_TOKENS = 8;
const K1 = 1.2, B = 0.75;
// a field counts as many times as its weight: the title and the heading weigh twice the text
const WEIGHTS = { title: 2, heading: 2, summary: 1, trails: 1, text: 1 };

const STOPWORDS = {
  pt: new Set(`a o as os um uma uns umas de do da dos das em no na nos nas por para pelo pela pelos pelas
    com sem sob sobre entre ate ao aos e ou mas que se nao sim como mais menos muito muita muitos ja ha foi
    ser sao esta este esse essa esses essas isto isso aquele aquela pode podem deve devem cada seu sua seus
    suas ele ela eles elas quando onde qual quais`.split(/\s+/)),
  en: new Set(`a an the of to in on at by for from with and or nor but is are was were be been being it its this
    that these those as if so not no do does did can will would should we you they he she i which who when
    where what how than then there here into each also more most`.split(/\s+/)),
};
// groups of words that mean the same for the search: each token is expanded to the whole group
const SYNONYMS = [["retentor", "segurador", "zoh", "hold"]];
const GREEK = { omega: "ω", beta: "β", alpha: "α", alfa: "α", gamma: "γ", delta: "δ", zeta: "ζ",
  theta: "θ", lambda: "λ", tau: "τ", sigma: "σ", phi: "φ" };

const TOKEN = /[a-z0-9µα-ω]+(?:\.[0-9]+)*/g;
const LATEX_TEXT = /\\(?:text|textrm|textit|mathrm|mathit|mathbf|operatorname)\{([^{}]*)\}/g;
const LATEX_GREEK = /\\(omega|beta|alpha|gamma|delta|zeta|theta|lambda|tau|sigma|phi)(?![a-z])/g;
const DELIMITERS = /\\[()[\]]|\$|\\[,;:!\s]/g;
const LATEX_COMMAND = /\\[a-z]+|\\./g;
const DECIMAL_COMMA = /(?<=[0-9]),(?=[0-9])/g;
const ALIASES = [
  [/(?<![a-z0-9])ganho de laco(?:s)?(?![a-z0-9])/g, "ganho de malha"],
  [/(?<![a-z0-9])laco(?:s)?(?![a-z0-9])/g, "malha"],
  [/(?<![a-z0-9])t_\{?l\}?(?![a-z0-9])/g, "t"],
  [/(?<![a-z0-9_])tl(?![a-z0-9])/g, "t"],
  [/(?<![a-z])ohms?(?![a-z])/g, "ω"],
  ...Object.entries(GREEK).map(([name, symbol]) => [new RegExp(`(?<![a-z])${name}(?![a-z])`, "g"), symbol]),
];

// the same text analysis as tools/busca.py: lowercase, accents out, LaTeX as its text, aliases, tokens
export function normalizar(texto) {
  let s = String(texto).replace(/μ/g, "µ").toLowerCase();
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(LATEX_TEXT, " $1 ");
  s = s.replace(LATEX_GREEK, (_, name) => ` ${GREEK[name]} `);
  s = s.replace(DELIMITERS, " ");
  s = s.replace(LATEX_COMMAND, " ");
  s = s.replace(DECIMAL_COMMA, ".");
  for (const [pattern, replacement] of ALIASES) s = s.replace(pattern, replacement);
  return s;
}

function stemPt(w) {
  if (w.length < 4 || !/^[a-z]+$/.test(w)) return w;
  if (w.endsWith("oes") && w.length > 5) w = w.slice(0, -3) + "ao";
  else if (w.endsWith("ais") && w.length > 4) w = w.slice(0, -3) + "al";
  else if (w.endsWith("es") && w.length > 5 && "rzlnd".includes(w[w.length - 3])) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w) && w.length > 4) w = w.slice(0, -1);
  for (const suffix of ["mente", "ando", "endo", "indo", "ado", "ido", "ar", "er", "ir"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) { w = w.slice(0, -suffix.length); break; }
  }
  if ("aeo".includes(w[w.length - 1]) && w.length >= 5) w = w.slice(0, -1);
  return w;
}

function stemEn(w) {
  if (w.length < 4 || !/^[a-z]+$/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length - 3 >= 4) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length - 2 >= 4) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w) && w.length > 4) return w.slice(0, -1);
  return w;
}

const STEM = { pt: stemPt, en: stemEn };
const SYN = {};
for (const lang of Object.keys(STEM)) {
  const map = new Map();
  for (const group of SYNONYMS) {
    const stems = group.map(w => STEM[lang](w));
    for (const s of stems) map.set(s, stems.filter(x => x !== s));
  }
  SYN[lang] = map;
}

// the tokens of a text, in order, repeats kept (lang is "pt" or "en")
export function analisar(texto, lang) {
  const stop = STOPWORDS[lang], stem = STEM[lang], syn = SYN[lang];
  const out = [];
  for (const raw of normalizar(texto).match(TOKEN) ?? []) {
    if (stop.has(raw)) continue;
    const token = stem(raw);
    out.push(token);
    for (const x of syn.get(token) ?? []) out.push(x);
  }
  return out;
}

// a query's tokens: cut to 120 characters, analysed, unique, at most 8
export function termosDaConsulta(consulta, lang) {
  const seen = [];
  for (const token of analisar(String(consulta).slice(0, MAX_QUERY_CHARS), lang)) {
    if (!seen.includes(token)) seen.push(token);
    if (seen.length === MAX_QUERY_TOKENS) break;
  }
  return seen;
}

// a passage's excerpt for a result: about `limite` characters from the first word that matches a query term.
// Words are cut at spaces, but a \(…\) or \[…\] is one unit (its spaces stay), so KaTeX never gets half of a
// formula. The excerpt is the passage's own text (LaTeX as written), a slice of it, with "…" where it is cut.
export function trecho(texto, termos, lang, limite = 240) {
  const unidades = [];
  const s = String(texto ?? "");
  for (let i = 0; i < s.length;) {
    if (/\s/.test(s[i])) { i++; continue; }
    const start = i;
    while (i < s.length && !/\s/.test(s[i])) {
      const close = s.startsWith("\\(", i) ? "\\)" : s.startsWith("\\[", i) ? "\\]" : null;
      if (close) { const at = s.indexOf(close, i + 2); i = at < 0 ? s.length : at + 2; }
      else i++;
    }
    unidades.push([start, i]);
  }
  if (!unidades.length) return "";
  const wanted = new Set(termos);
  let first = unidades.findIndex(([a, b]) => analisar(s.slice(a, b), lang).some(t => wanted.has(t)));
  if (first < 0) first = 0;
  let from = Math.max(0, first - 2), to = from + 1;
  while (to < unidades.length && unidades[to][1] - unidades[from][0] <= limite) to++;
  const [a, b] = [unidades[from][0], unidades[to - 1][1]];
  return (from > 0 ? "… " : "") + s.slice(a, b) + (to < unidades.length ? " …" : "");
}

// the index: each passage's weighted token counts, and the postings (token -> [passage, count])
export function indexar(passagens, lang) {
  const docs = [], postings = new Map();
  let total = 0;
  passagens.forEach((p, i) => {
    const tf = new Map();
    const add = (texto, peso) => { for (const t of analisar(texto ?? "", lang)) tf.set(t, (tf.get(t) ?? 0) + peso); };
    add(p.title, WEIGHTS.title);
    add(p.heading, WEIGHTS.heading);
    add(p.summary, WEIGHTS.summary);
    for (const [name] of p.trails ?? []) add(name, WEIGHTS.trails);
    add(p.text, WEIGHTS.text);
    let len = 0;
    for (const f of tf.values()) len += f;
    docs.push({ p, len });
    total += len;
    for (const [t, f] of tf) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push([i, f]);
    }
  });
  return { lang, docs, postings, n: docs.length, avg: total / (docs.length || 1) };
}

// BM25 (k1 = 1.2, b = 0.75): the best passages for a query, at most `limite`, ties in the index's order
export function buscar(indice, consulta, limite = 10) {
  const scores = new Map();
  for (const t of termosDaConsulta(consulta, indice.lang)) {
    const list = indice.postings.get(t);
    if (!list) continue;
    const df = list.length;
    const idf = Math.log(1 + (indice.n - df + 0.5) / (df + 0.5));
    for (const [i, f] of list) {
      const dl = indice.docs[i].len;
      const score = idf * f * (K1 + 1) / (f + K1 * (1 - B + B * dl / indice.avg));
      scores.set(i, (scores.get(i) ?? 0) + score);
    }
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limite)
    .map(([i, score]) => ({ passagem: indice.docs[i].p, score }));
}
