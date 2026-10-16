// The four-switch buck-boost of converters/buckboost/: what the oscilloscope page needs to show its
// frames, and its small-signal model for the Bode window.
import { cx, cadd, cdiv, cmul, cscale, cexpj } from "../../complex.js";
import { tr } from "/assets/pcl/i18n.js";

// Frame columns, as recorded by converters/common/scenario.cpp from converters/buckboost/netlist.cir:
// t (us from frame start), then the signals. Switch node A is the input leg's (Q1 high side, Q2 low
// side), switch node B the output leg's (Q3 high side, Q4 low side). G1 drives Q1 and Q4, G2 drives
// Q2 and Q3: buck-boost mode, all four switching.
const COL = { t: 0, vout: 1, il: 2, vswa: 3, iq1: 4, vswb: 5, iq3: 6, g1: 7, g2: 8 };
const CURRENT = { width: 1, alpha: 0.85 };

// Averaged power stage in continuous conduction, in buck-boost mode: on G1 the inductor sees the
// input, on G2 minus the output. Small signal, from the duty d of G1:
//   (sL + Rl)·i = D·vin − D'·v + (Vin + V)·d        D' = 1 − D, I the inductor current
//   v = Zo·(D'·i − I·d)                             Zo = load ∥ (ESR + 1/sC)
//   v/d = Zo·(D'·(Vin + V) − I·(sL + Rl)) / (sL + Rl + Zo·D'²)
// The I·(sL + Rl) term is the right-half-plane zero. Rl is the inductor's 15 mΩ and the 10 mΩ of
// each of the two switches always in the path. The ADC sample is not the average output: it comes
// just before G1 turns on, when the capacitor carries the whole inductor current, so it reads
// ESR·(D·i + I) more (see plant()). The delay, (1 + 0.6·D)·T, is fitted, as in the boost.
// Checked against QSPICE with tools/qspice_loop_check.py, adding a small sine to the duty, at
// 9 V/4 Ω, 12 V/6 Ω and 15 V/12 Ω and across the LC resonance: within 0.9 dB and 3° from 300 Hz to
// 12 kHz.
// Exported for the notes' figures (discrete-time models); DELAY is the D's factor in the delay.
export const PLANT = { L: 22e-6, RL: 0.035, C: 100e-6, ESR: 0.010, DELAY: 0.6 };

export default {
  COL,
  COLUMNS: 9,
  GATE: COL.g1,  // switching frequency and duty in the measurement table come from this column
  CHARTS: [
    { label: { en: "Output voltage and reference", pt: "Tensão de saída e referência" }, size: "tall",
      left: { unit: "V", series: [["V(out)", COL.vout, "--vout"], ["V(ref)", "vref", "--vref", { dash: [5, 3], width: 1.2, order: -1 }]] } },
    { label: { en: "Inductor current", pt: "Corrente no indutor" }, left: { unit: "A", series: [["I(L)", COL.il, "--il"]] } },
    { label: { en: "Input leg: switch node A voltage and the drain current of Q1, the input current", pt: "Braço de entrada: tensão do nó de chaveamento A e corrente de dreno de Q1, a corrente de entrada" },
      title: { en: "input leg (node A, Q1)", pt: "braço de entrada (nó A, Q1)" },
      left: { unit: "V", series: [["V(A)", COL.vswa, "--vds"]] }, right: { unit: "A", series: [["Id(Q1)", COL.iq1, "--id", CURRENT]] } },
    { label: { en: "Output leg: switch node B voltage and the drain current of Q3, the output rectifier", pt: "Braço de saída: tensão do nó de chaveamento B e corrente de dreno de Q3, o retificador de saída" },
      title: { en: "output leg (node B, Q3)", pt: "braço de saída (nó B, Q3)" },
      left: { unit: "V", series: [["V(B)", COL.vswb, "--vds2"]] }, right: { unit: "A", series: [["Id(Q3)", COL.iq3, "--id2", CURRENT]] } },
    { label: { en: "Gate signals", pt: "Sinais de gate" }, size: "digital", digital: [["G1 (Q1, Q4)", COL.g1, "--hg"], ["G2 (Q2, Q3)", COL.g2, "--lg"]] },
  ],

  // ---- loop gain ----
  T: 10e-6,  // PWM and control period
  design: { form: "2p2z", fc: 3e3, fz1: 1e3, fz2: 1e3, fp: 40e3 },  // the Bode window's starting design
  // The Bode plot's frequency range (up to fs/2) and the design sliders' ranges, in Hz.
  bode: { from: 50, to: 50e3, sliders: { fc: [300, 15e3], fz1: [100, 10e3], fz2: [100, 10e3], fp: [2e3, 50e3] } },

  operatingPoint(initial) {
    const vin = initial.vin, v = initial.vref, r = initial.load;
    // (Vin + V)·D'² − Vin·D' + Rl·V/R = 0: the larger root, the normal operating point.
    const dp = (vin + Math.sqrt(Math.max(0, vin * vin - 4 * (vin + v) * PLANT.RL * v / r))) / (2 * (vin + v));
    return { vin, vref: v, r, duty: 1 - dp, current: v / (r * dp) };
  },

  // The operating point, for the Bode window's title bar; num formats a number for the page's language.
  describe(op, ohms, num = String) {
    const vin = num(op.vin), vout = num(op.vref), load = ohms(op.r), duty = num(op.duty.toFixed(3));
    return tr({ en: `at Vin ${vin} V · Vout ${vout} V · load ${load} · D ${duty}`,
                pt: `em Vin ${vin} V · Vout ${vout} V · carga ${load} · D ${duty}` });
  },

  // Output voltage per unit of duty.
  plant(f, op) {
    const w = 2 * Math.PI * f, s = cx(0, w), dp = 1 - op.duty;
    const zc = cadd(cx(PLANT.ESR), cdiv(cx(1), cscale(s, PLANT.C)));
    const zo = cdiv(cscale(zc, op.r), cadd(cx(op.r), zc));
    const zl = cadd(cx(PLANT.RL), cscale(s, PLANT.L));
    const numerator = cmul(zo, cadd(cx(dp * (op.vin + op.vref)), cscale(zl, -op.current)));
    const stage = cdiv(numerator, cadd(zl, cscale(zo, dp * dp)));
    // The ADC samples just before G1 turns on, when the capacitor carries the whole inductor current:
    // ESR·(D·i + I) more than the average. i is the inductor current per unit duty.
    const i = cdiv(cadd(cx(op.vin + op.vref), cscale(stage, -dp)), zl);
    const sampled = cadd(stage, cscale(cadd(cscale(i, op.duty), cx(op.current)), PLANT.ESR));
    return cmul(sampled, cexpj(-w * (1 + PLANT.DELAY * op.duty) * this.T));
  },
};
