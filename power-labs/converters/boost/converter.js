// The synchronous boost of converters/boost/: what the oscilloscope page needs to show its frames,
// and its small-signal model for the Bode window.
import { tr } from "/assets/pcl/i18n.js";
import { edgePlant } from "/assets/pcl/sampled.js";

// Frame columns, as recorded by converters/common/scenario.cpp from converters/boost/netlist.cir:
// t (us from frame start), then the signals.
// Switch 1 is the main switch (low side), switch 2 the synchronous rectifier (high side).
const COL = { t: 0, vout: 1, il: 2, vds1: 3, id1: 4, vds2: 5, id2: 6, g1: 7, g2: 8 };
const CURRENT = { width: 1, alpha: 0.85 };

// Averaged power stage in continuous conduction: inductor with its resistance plus a switch's Ron,
// capacitor with ESR, resistive load. Small signal, from the duty d of the main switch:
//   (sL + Rl)·i = vin − D'·v + V·d        D' = 1 − D, V the output, I the inductor current
//   v = Zo·(D'·i − I·d)                   Zo = load ∥ (ESR + 1/sC)
//   v/d = Zo·(D'·V − I·(sL + Rl)) / (sL + Rl + Zo·D'²)
// The I·(sL + Rl) term is the right-half-plane zero. Rl is the inductor's 15 mΩ and one switch's
// 10 mΩ. The ADC sample is not the average output: it comes just before G1 turns on, when the
// capacitor carries the whole inductor current, so it reads ESR·(D·i + I) more. The duty computed
// from a sample takes effect in the next period, at G1's falling edge.
// plant() is not this averaged form times a delay: it is the sampled-data model of the switched
// circuit in /assets/pcl/sampled.js, derived, with no fitted factor. To first order it is the
// averaged form, with the ESR term, delayed by (1 + D/2)·T. Checked against QSPICE with
// tools/qspice_loop_check.py, adding to the duty a sine that moves the ADC sample by about 10 codes,
// at 12 V in and 12, 24 and 48 Ω (4, 2 and 1 A), across the LC resonance, every point linear at half
// amplitude: within 0.2 dB and 1.4° from 300 Hz to 7 kHz (per point in sampled.js).
// Exported for the notes' figures (discrete-time models). DELAY is the D's factor in the first-order
// delay, (1 + DELAY·D)·T, for the figure that swaps the plant's delay for another (delay.js).
export const PLANT = { L: 33e-6, RL: 0.025, C: 100e-6, ESR: 0.010, DELAY: 0.5 };
const plant = edgePlant("boost", PLANT);

export default {
  COL,
  COLUMNS: 9,
  GATE: COL.g1,  // switching frequency and duty in the measurement table come from this column
  CHARTS: [
    { label: { en: "Output voltage and reference", pt: "Tensão de saída e referência" }, size: "tall",
      left: { unit: "V", series: [["V(out)", COL.vout, "--vout"], ["V(ref)", "vref", "--vref", { dash: [5, 3], width: 1.2, order: -1 }]] } },
    { label: { en: "Inductor current", pt: "Corrente no indutor" }, left: { unit: "A", series: [["I(L)", COL.il, "--il"]] } },
    { label: { en: "Switch 1, low side, the main switch: drain-source voltage and drain current", pt: "Chave 1, inferior, a chave principal: tensão dreno-fonte e corrente de dreno" },
      title: { en: "switch 1 (low side, main)", pt: "chave 1 (inferior, principal)" },
      left: { unit: "V", series: [["Vds1", COL.vds1, "--vds"]] }, right: { unit: "A", series: [["Id1", COL.id1, "--id", CURRENT]] } },
    { label: { en: "Switch 2, high side, the synchronous rectifier: drain-source voltage and drain current", pt: "Chave 2, superior, o retificador síncrono: tensão dreno-fonte e corrente de dreno" },
      title: { en: "switch 2 (high side, rectifier)", pt: "chave 2 (superior, retificador)" },
      left: { unit: "V", series: [["Vds2", COL.vds2, "--vds2"]] }, right: { unit: "A", series: [["Id2", COL.id2, "--id2", CURRENT]] } },
    { label: { en: "Gate signals", pt: "Sinais de gate" }, size: "digital",
      digital: [[{ en: "G1 (switch 1)", pt: "G1 (chave 1)" }, COL.g1, "--hg"], [{ en: "G2 (switch 2)", pt: "G2 (chave 2)" }, COL.g2, "--lg"]] },
  ],

  // ---- loop gain ----
  T: 10e-6,  // PWM and control period
  design: { form: "2p2z", fc: 1.5e3, fz1: 500, fz2: 500, fp: 30e3 },  // the Bode window's starting design
  // The Bode plot's frequency range (up to fs/2) and the design sliders' ranges, in Hz.
  bode: { from: 20, to: 50e3, sliders: { fc: [200, 10e3], fz1: [50, 5e3], fz2: [50, 5e3], fp: [1e3, 50e3] } },

  operatingPoint(initial) {
    const vin = initial.vin, v = initial.vref, r = initial.load;
    // V = Vin·D'·R / (D'²·R + Rl): the larger root, the normal operating point.
    const dp = (vin * r + Math.sqrt(Math.max(0, vin * vin * r * r - 4 * r * v * v * PLANT.RL))) / (2 * r * v);
    return { vin, vref: v, r, duty: 1 - dp, current: v / (r * dp) };
  },

  // The operating point, for the Bode window's title bar; num formats a number for the page's language.
  describe(op, ohms, num = String) {
    const vin = num(op.vin), vout = num(op.vref), load = ohms(op.r), duty = num(op.duty.toFixed(3));
    return tr({ en: `at Vin ${vin} V · Vout ${vout} V · load ${load} · D ${duty}`,
                pt: `em Vin ${vin} V · Vout ${vout} V · carga ${load} · D ${duty}` });
  },

  // The ADC sample per unit of duty, at f Hz up to fs/2: the sampled-data model of sampled.js.
  plant(f, op) { return plant(f, op, this.T); },
};
