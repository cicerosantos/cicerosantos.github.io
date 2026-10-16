// The synchronous buck of qspice-wine's examples/cpp-buck: what the oscilloscope page needs to show
// its frames, and its small-signal model for the Bode window.
import { cx, cadd, cdiv, cmul, cscale, cexpj } from "../../complex.js";

// Frame columns, as recorded by buck_live.cpp: t (us from frame start), then the signals.
const COL = { t: 0, vout: 1, il: 2, vds1: 3, id1: 4, vds2: 5, id2: 6, hg: 7, lg: 8 };
const CURRENT = { width: 1, alpha: 0.85 };

// Averaged power stage in continuous conduction (switch Ron plus the inductor's resistance,
// capacitor ESR, load) and a delay of (1 + D)·T: the duty computed from a sample takes effect one
// period later, and the PWM's falling edge comes D·T into it. Checked against QSPICE with
// tools/qspice_loop_check.py, adding a small sine to the duty: within 0.3 dB and 1.5° from 500 Hz to
// 15 kHz, across the LC resonance; 1.4 dB and 4° at 30 kHz.
const PLANT = { L: 22e-6, R: 0.040, C: 47e-6, ESR: 0.005 };

export default {
  COL,
  COLUMNS: 9,
  GATE: COL.hg,  // switching frequency and duty in the measurement table come from this column
  // Each chart: series on the left axis and, optionally, on the right axis. A series' optional style:
  // dash pattern, line width, opacity, and order (lower is drawn first, underneath). "vref" is the
  // reference the firmware uses, rebuilt from the frame's commands.
  CHARTS: [
    { label: "Output voltage and reference", size: "tall",
      left: { unit: "V", series: [["V(out)", COL.vout, "--vout"], ["V(ref)", "vref", "--vref", { dash: [5, 3], width: 1.2, order: -1 }]] } },
    { label: "Inductor current", left: { unit: "A", series: [["I(L)", COL.il, "--il"]] } },
    { label: "Switch 1, high side: drain-source voltage and drain current", title: "switch 1 (high side)",
      left: { unit: "V", series: [["Vds1", COL.vds1, "--vds"]] }, right: { unit: "A", series: [["Id1", COL.id1, "--id", CURRENT]] } },
    { label: "Switch 2, low side: drain-source voltage and drain current", title: "switch 2 (low side)",
      left: { unit: "V", series: [["Vds2", COL.vds2, "--vds2"]] }, right: { unit: "A", series: [["Id2", COL.id2, "--id2", CURRENT]] } },
    { label: "Gate signals", size: "digital", digital: [["HG (switch 1)", COL.hg, "--hg"], ["LG (switch 2)", COL.lg, "--lg"]] },
  ],

  // ---- loop gain ----
  T: 5e-6,  // PWM and control period
  design: { form: "2p2z", fc: 8e3, fz1: 2e3, fz2: 2e3, fp: 60e3 },  // the Bode window's starting design

  operatingPoint(initial) {
    const vin = initial.vin, vref = initial.vref;
    return { vin, vref, r: initial.load, duty: Math.min(vref / vin, 0.9) };
  },

  describe(op, ohms) {
    return `at Vin ${op.vin} V · Vout ${op.vref} V · load ${ohms(op.r)} · D ${op.duty.toFixed(3)}`;
  },

  // Output voltage per unit of duty.
  plant(f, op) {
    const w = 2 * Math.PI * f, s = cx(0, w);
    const zc = cadd(cx(PLANT.ESR), cdiv(cx(1), cscale(s, PLANT.C)));
    const zo = cdiv(cscale(zc, op.r), cadd(cx(op.r), zc));
    const stage = cdiv(cscale(zo, op.vin), cadd(cadd(zo, cx(PLANT.R)), cscale(s, PLANT.L)));
    return cmul(stage, cexpj(-w * (1 + op.duty) * this.T));
  },
};
