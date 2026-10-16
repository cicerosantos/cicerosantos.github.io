// The synchronous boost of converters/boost/: what the oscilloscope page needs to show its frames,
// and its small-signal model for the Bode window.
import { cx, cadd, cdiv, cmul, cscale, cexpj } from "../../complex.js";

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
// capacitor carries the whole inductor current, so it reads ESR·(D·i + I) more (see plant()).
// The delay, (1 + 0.6·D)·T, is fitted: the duty computed from a sample takes effect in the next
// period. Checked against QSPICE with tools/qspice_loop_check.py, adding a small sine to the duty, at
// loads of 12 and 48 Ω and across the LC resonance: within 0.6 dB and 3° from 300 Hz to 6 kHz.
const PLANT = { L: 33e-6, RL: 0.025, C: 100e-6, ESR: 0.010, DELAY: 0.6 };

export default {
  COL,
  COLUMNS: 9,
  GATE: COL.g1,  // switching frequency and duty in the measurement table come from this column
  CHARTS: [
    { label: "Output voltage and reference", size: "tall",
      left: { unit: "V", series: [["V(out)", COL.vout, "--vout"], ["V(ref)", "vref", "--vref", { dash: [5, 3], width: 1.2, order: -1 }]] } },
    { label: "Inductor current", left: { unit: "A", series: [["I(L)", COL.il, "--il"]] } },
    { label: "Switch 1, low side, the main switch: drain-source voltage and drain current", title: "switch 1 (low side, main)",
      left: { unit: "V", series: [["Vds1", COL.vds1, "--vds"]] }, right: { unit: "A", series: [["Id1", COL.id1, "--id", CURRENT]] } },
    { label: "Switch 2, high side, the synchronous rectifier: drain-source voltage and drain current", title: "switch 2 (high side, rectifier)",
      left: { unit: "V", series: [["Vds2", COL.vds2, "--vds2"]] }, right: { unit: "A", series: [["Id2", COL.id2, "--id2", CURRENT]] } },
    { label: "Gate signals", size: "digital", digital: [["G1 (switch 1)", COL.g1, "--hg"], ["G2 (switch 2)", COL.g2, "--lg"]] },
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

  describe(op, ohms) {
    return `at Vin ${op.vin} V · Vout ${op.vref} V · load ${ohms(op.r)} · D ${op.duty.toFixed(3)}`;
  },

  // Output voltage per unit of duty.
  plant(f, op) {
    const w = 2 * Math.PI * f, s = cx(0, w), dp = 1 - op.duty;
    const zc = cadd(cx(PLANT.ESR), cdiv(cx(1), cscale(s, PLANT.C)));
    const zo = cdiv(cscale(zc, op.r), cadd(cx(op.r), zc));
    const zl = cadd(cx(PLANT.RL), cscale(s, PLANT.L));
    const numerator = cmul(zo, cadd(cx(dp * op.vref), cscale(zl, -op.current)));
    const stage = cdiv(numerator, cadd(zl, cscale(zo, dp * dp)));
    // The ADC samples just before G1 turns on, when the capacitor carries the whole inductor current:
    // ESR·(D·i + I) more than the average. i is the inductor current per unit duty.
    const i = cdiv(cadd(cx(op.vref), cscale(stage, -dp)), zl);
    const sampled = cadd(stage, cscale(cadd(cscale(i, op.duty), cx(op.current)), PLANT.ESR));
    return cmul(sampled, cexpj(-w * (1 + PLANT.DELAY * op.duty) * this.T));
  },
};
