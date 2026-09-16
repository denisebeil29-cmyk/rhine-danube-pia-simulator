// Rhine-Danube Corridor: Micro Policy Impact Simulator
// -----------------------------------------------------------------------------
// Behavioral kernel: multinomial logit with alternative-specific coefficients in
// natural units, opt-out normalized to zero, alternative-specific constants
// pivoted onto the reported modal split.
//
// All parameters and baselines are taken from the estimation reported in
// Beil, Putz-Egger and Sys, Tables 2, 3, 4 and 8. Nothing here is a prior.
//
// Verification: with a single measure active, this kernel reproduces the
// conditional road shares of Table 9 to within 0.2 percentage points. The
// residual is the rounding of the published coefficients to three decimals.
// -----------------------------------------------------------------------------

import { useMemo, useState, useEffect } from "react";
import "./App.css";
import "leaflet/dist/leaflet.css";
import CorridorMapLeaflet from "./CorridorMapLeaflet";

type Mode = "Road" | "Rail" | "IWT";
type Attr = "p" | "t" | "r" | "f";
type BlockId = "B1" | "B2" | "B3";
type MeasureId = "M1" | "M2" | "M3" | "M4" | "M5";

const MODES: Mode[] = ["Road", "Rail", "IWT"];

// ---------------------------------------------------------------------------
// 1. Estimated parameters (Table 4), baselines (Table 2), anchor (Table 3)
// ---------------------------------------------------------------------------
// beta: utility units per natural unit
//   p = cost in cent per tonne-kilometer
//   t = transit time in days
//   r = on-time reliability in percentage points
//   f = frequency in departures per week
//
// Channels excluded on the sign of the coefficient (Section 6.2) are set to
// zero here and flagged, so the exclusion is visible rather than silent.

type Vec = Record<Attr, number>;

interface BlockSpec {
  id: BlockId;
  label: string;
  distance: string;
  n: number;
  beta: Record<Mode, Vec>;
  x0: Record<Mode, Vec>;              // baseline attribute vector (Table 2, X0)
  lo: Record<Mode, Vec>;              // lowest level shown in the experiment
  hi: Record<Mode, Vec>;              // highest level shown in the experiment
  anchor: Record<Mode, number>;       // reported tkm shares, conditional
  s0: number;                         // observed opt-out share
  excluded: string[];                 // human-readable list of zeroed channels
}

const BLOCKS: Record<BlockId, BlockSpec> = {
  B1: {
    id: "B1",
    label: "Block 1",
    distance: "300 to under 600 km",
    n: 70,
    beta: {
      Road: { p: -0.120, t: -0.105, r: 0.023, f: 0.005 },
      Rail: { p: -0.165, t: -0.165, r: 0.054, f: 0.020 },
      IWT:  { p: -0.061, t: -0.146, r: 0.037, f: 0.110 },
    },
    x0: {
      Road: { p: 8.0, t: 2, r: 95, f: 15 },
      Rail: { p: 6.1, t: 3, r: 60, f: 6 },
      IWT:  { p: 4.9, t: 5, r: 85, f: 3 },
    },
    lo: {
      Road: { p: 8.0, t: 1, r: 85, f: 9 },
      Rail: { p: 5.2, t: 2, r: 55, f: 6 },
      IWT:  { p: 4.2, t: 3, r: 75, f: 3 },
    },
    hi: {
      Road: { p: 9.2, t: 3, r: 95, f: 15 },
      Rail: { p: 6.4, t: 4, r: 75, f: 8 },
      IWT:  { p: 5.4, t: 8, r: 95, f: 5 },
    },
    anchor: { Road: 0.6833, Rail: 0.2394, IWT: 0.0773 },
    s0: 0.057,
    excluded: [],
  },
  B2: {
    id: "B2",
    label: "Block 2",
    distance: "600 to under 900 km",
    n: 64,
    beta: {
      Road: { p: -0.533, t: -0.109, r: 0.027, f: 0.072 },
      Rail: { p: -0.564, t: -0.238, r: 0.067, f: 0.063 },
      IWT:  { p: 0.0,    t: -0.126, r: 0.046, f: 0.005 }, // cost excluded, sign
    },
    x0: {
      Road: { p: 7.5, t: 2, r: 95, f: 10 },
      Rail: { p: 8.0, t: 4, r: 75, f: 4 },
      IWT:  { p: 4.9, t: 10, r: 90, f: 3 },
    },
    lo: {
      Road: { p: 7.5, t: 2, r: 83, f: 6 },
      Rail: { p: 6.8, t: 3, r: 68, f: 4 },
      IWT:  { p: 4.2, t: 8, r: 81, f: 3 },
    },
    hi: {
      Road: { p: 8.6, t: 4, r: 95, f: 10 },
      Rail: { p: 8.4, t: 6, r: 94, f: 6 },
      IWT:  { p: 5.4, t: 12, r: 95, f: 5 },
    },
    anchor: { Road: 0.6127, Rail: 0.2775, IWT: 0.1098 },
    s0: 0.071,
    excluded: ["Cost IWT (positive sign, +0.081)"],
  },
  B3: {
    id: "B3",
    label: "Block 3",
    distance: "900 km and above",
    n: 64,
    beta: {
      Road: { p: -0.169, t: -0.087, r: 0.005, f: 0.0 },  // freq excluded, sign
      Rail: { p: -0.355, t: -0.218, r: 0.060, f: 0.029 },
      IWT:  { p: 0.0,    t: -0.062, r: 0.025, f: 0.019 }, // cost excluded, sign
    },
    x0: {
      Road: { p: 6.5, t: 2, r: 92, f: 10 },
      Rail: { p: 8.0, t: 6, r: 60, f: 10 },
      IWT:  { p: 2.2, t: 11, r: 85, f: 3 },
    },
    lo: {
      Road: { p: 6.5, t: 2, r: 83, f: 6 },
      Rail: { p: 6.8, t: 4, r: 54, f: 10 },
      IWT:  { p: 2.0, t: 8, r: 77, f: 3 },
    },
    hi: {
      Road: { p: 8.1, t: 4, r: 92, f: 10 },
      Rail: { p: 8.4, t: 9, r: 75, f: 14 },
      IWT:  { p: 2.4, t: 14, r: 94, f: 5 },
    },
    anchor: { Road: 0.6712, Rail: 0.1989, IWT: 0.1298 },
    s0: 0.105,
    excluded: ["Cost IWT (positive sign, +0.501)", "Frequency Road (negative sign, -0.058)"],
  },
};

// ---------------------------------------------------------------------------
// 2. Scenario definitions at full intensity (Table 8)
// ---------------------------------------------------------------------------
// Full intensity is the move from the baseline to the most policy-favorable
// level presented in the experiment for that mode and block. Intermediate
// intensities move every affected attribute proportionally (equation 1):
//     dx = tau * (x_max - x0)
// No scenario leaves the range the respondents actually saw.

type Target = Partial<Record<Mode, Partial<Vec>>>;

const SCENARIOS: Record<MeasureId, Record<BlockId, Target> | null> = {
  M1: {
    B1: { Road: { p: 9.2 }, Rail: { p: 6.4 }, IWT: { p: 5.4 } },
    B2: { Road: { p: 8.6 }, Rail: { p: 8.4 } },
    B3: { Road: { p: 8.1 }, Rail: { p: 8.4 } },
  },
  M2: null, // not simulated, see below
  M3: {
    B1: { Rail: { p: 5.2, t: 2, r: 75, f: 8 }, IWT: { p: 4.2, t: 3, r: 95, f: 5 } },
    B2: { Rail: { p: 6.8, t: 3, r: 94, f: 6 }, IWT: { t: 8, r: 95, f: 5 } },
    B3: { Rail: { p: 6.8, t: 4, r: 75, f: 14 }, IWT: { t: 8, r: 94, f: 5 } },
  },
  M4: {
    B1: { Rail: { t: 2, r: 75 }, IWT: { t: 3, r: 95 } },
    B2: { Rail: { t: 3, r: 94 }, IWT: { t: 8, r: 95 } },
    B3: { Rail: { t: 4, r: 75 }, IWT: { t: 8, r: 94 } },
  },
  M5: {
    B1: { Rail: { p: 5.2, t: 2, r: 75 }, IWT: { p: 4.2, t: 3, r: 95 } },
    B2: { Rail: { p: 6.8, t: 3, r: 94 }, IWT: { t: 8, r: 95 } },
    B3: { Rail: { p: 6.8, t: 4, r: 75 }, IWT: { t: 8, r: 94 } },
  },
};

interface MeasureSpec {
  id: MeasureId;
  code: string;
  title: string;
  kind: "Push" | "Pull";
  color: string;
  channels: string;
  instruments: { key: string; label: string }[];
  disabled?: string;
}

const MEASURES: MeasureSpec[] = [
  {
    id: "M1",
    code: "M-1",
    title: "Internalization of external costs",
    kind: "Push",
    color: "#b91c1c",
    channels: "Cost, all modes, asymmetric",
    instruments: [
      { key: "co2Pricing", label: "CO\u2082 pricing" },
      { key: "roadTolls", label: "Road tolls" },
      { key: "emissionsTrading", label: "Emissions trading" },
    ],
  },
  {
    id: "M2",
    code: "M-2",
    title: "Regulation of speed, routing and driving time",
    kind: "Push",
    color: "#c2410c",
    channels: "Time and frequency, road only",
    instruments: [
      { key: "weekendBans", label: "Weekend bans" },
      { key: "speedRestrictions", label: "Speed restrictions" },
      { key: "truckRestrictions", label: "Truck driving restrictions" },
    ],
    disabled:
      "Not simulated. M-2 acts only through road transit time and road frequency. Neither coefficient is distinguishable from zero in any block, with clustered t ratios between -1.68 and 1.61. Simulating it would assign a response to parameters the data do not identify. The measure is not judged ineffective, it is unidentified.",
  },
  {
    id: "M3",
    code: "M-3",
    title: "Expansion of multimodal capacity",
    kind: "Pull",
    color: "#1d4ed8",
    channels: "Cost, time, reliability and frequency of rail and IWT",
    instruments: [
      { key: "terminalPort", label: "Terminal and port extensions" },
      { key: "railTracks", label: "Rail track expansion" },
      { key: "riverBasins", label: "River engineering" },
      { key: "highSpeedRail", label: "High-speed rail network" },
    ],
  },
  {
    id: "M4",
    code: "M-4",
    title: "Harmonization of the regulatory framework",
    kind: "Pull",
    color: "#4f46e5",
    channels: "Time and reliability of rail and IWT",
    instruments: [
      { key: "railLiberalization", label: "Rail liberalization" },
      { key: "borderHarmonization", label: "Border harmonization" },
      { key: "eFTI", label: "eFTI adoption" },
      { key: "commonStandards", label: "Common European standards" },
    ],
  },
  {
    id: "M5",
    code: "M-5",
    title: "Efficiency improvement",
    kind: "Pull",
    color: "#047857",
    channels: "Cost, time and reliability of rail and IWT",
    instruments: [
      { key: "digitalization", label: "Digitalization" },
      { key: "standardization", label: "Standardization" },
      { key: "terminal24_7", label: "24/7 terminal access" },
    ],
  },
];

// ---------------------------------------------------------------------------
// 3. Origin-destination routes
// ---------------------------------------------------------------------------
// The distance classes are not routes. Respondents were assigned to a block by
// their own dominant haul distance and saw all three modes in every block. The
// five corridor routes anchored the level bands in the calibration study, so a
// route is shown here only as the operational reference for a block.

const ROUTES: { od: string; block: BlockId; km: string }[] = [
  { od: "M\u00fcnchen (DE) \u2013 Bratislava (SK)", block: "B1", km: "approx. 450 km" },
  { od: "Regensburg (DE) \u2013 Budapest (HU)", block: "B2", km: "approx. 700 km" },
  { od: "Wien (AT) \u2013 Constan\u021ba (RO)", block: "B3", km: "approx. 1,100 km" },
  { od: "Linz (AT) \u2013 Gala\u021bi (RO)", block: "B3", km: "approx. 1,250 km" },
];

// ---------------------------------------------------------------------------
// 4. Behavioral kernel
// ---------------------------------------------------------------------------

const ATTRS: Attr[] = ["p", "t", "r", "f"];

function systematicUtility(b: BlockSpec, x: Record<Mode, Vec>): Record<Mode, number> {
  const V = {} as Record<Mode, number>;
  MODES.forEach((m) => {
    V[m] = ATTRS.reduce((s, a) => s + b.beta[m][a] * x[m][a], 0);
  });
  return V;
}

// Equation (4): alpha_j = ln(s_j_obs) - V_j(x0) + c, with c = ln((1 - s0)/s0).
// c enters all three mode utilities equally and cancels from the conditional
// shares, so it fixes only the predicted opt-out share at the baseline.
function pivotConstants(b: BlockSpec): Record<Mode, number> {
  const V0 = systematicUtility(b, b.x0);
  const c = Math.log((1 - b.s0) / b.s0);
  const alpha = {} as Record<Mode, number>;
  MODES.forEach((m) => {
    alpha[m] = Math.log(b.anchor[m]) - V0[m] + c;
  });
  return alpha;
}

// Equation (3): the unit term in the denominator is the normalized opt-out.
function choiceProbabilities(b: BlockSpec, x: Record<Mode, Vec>) {
  const alpha = pivotConstants(b);
  const V = systematicUtility(b, x);
  const e = {} as Record<Mode, number>;
  MODES.forEach((m) => (e[m] = Math.exp(alpha[m] + V[m])));
  const denom = 1 + MODES.reduce((s, m) => s + e[m], 0);
  const P = {} as Record<Mode, number>;
  MODES.forEach((m) => (P[m] = e[m] / denom));
  const optOut = 1 / denom;
  const modal = MODES.reduce((s, m) => s + P[m], 0);
  const conditional = {} as Record<Mode, number>;
  MODES.forEach((m) => (conditional[m] = P[m] / modal));
  return { P, optOut, conditional };
}

// Equation (1) applied per measure, summed across active measures, then
// clamped to the level range the experiment presented. With a single measure
// active the clamp never binds and the result is the paper scenario exactly.
function applyPolicies(b: BlockSpec, taus: Record<MeasureId, number>): Record<Mode, Vec> {
  const x = {} as Record<Mode, Vec>;
  MODES.forEach((m) => (x[m] = { ...b.x0[m] }));

  (Object.keys(SCENARIOS) as MeasureId[]).forEach((k) => {
    const table = SCENARIOS[k];
    if (!table) return;
    const tau = taus[k] ?? 0;
    if (tau <= 0) return;
    const target = table[b.id];
    MODES.forEach((m) => {
      const ch = target[m];
      if (!ch) return;
      (Object.keys(ch) as Attr[]).forEach((a) => {
        const full = ch[a] as number;
        x[m][a] += tau * (full - b.x0[m][a]);
      });
    });
  });

  MODES.forEach((m) =>
    ATTRS.forEach((a) => {
      x[m][a] = Math.min(b.hi[m][a], Math.max(b.lo[m][a], x[m][a]));
    })
  );
  return x;
}

// Intensity, as a share of the tested range, at which the conditional road
// share falls by a given number of percentage points under one measure alone.
function threshold(b: BlockSpec, measure: MeasureId, drop: number): string {
  if (!SCENARIOS[measure]) return "n/a";
  const base = choiceProbabilities(b, b.x0).conditional.Road * 100;
  for (let i = 0; i <= 1000; i++) {
    const tau = i / 1000;
    const taus = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 } as Record<MeasureId, number>;
    taus[measure] = tau;
    const r = choiceProbabilities(b, applyPolicies(b, taus)).conditional.Road * 100;
    if (base - r >= drop) return `${Math.round(tau * 100)}%`;
  }
  return "not reached";
}

// ---------------------------------------------------------------------------
// 5. Corridor utilization, stage 4, NOT COMPUTED
// ---------------------------------------------------------------------------
// The macro stage requires an OD matrix by mode and commodity, section capacity
// for the rail and waterway network, an allocation rule and a feedback from
// utilization onto reliability and transit time. None of these is part of the
// dataset. The indices below are illustrative placeholders that display the
// shape of the missing stage. They are not estimated and carry no result.

const PLACEHOLDER_CAPACITY: Record<BlockId, { rail: number; iwt: number; demand: number }> = {
  B1: { rail: 60, iwt: 40, demand: 130 },
  B2: { rail: 55, iwt: 35, demand: 140 },
  B3: { rail: 50, iwt: 30, demand: 150 },
};

// ---------------------------------------------------------------------------
// 6. Component
// ---------------------------------------------------------------------------

const ZERO_TAUS: Record<MeasureId, number> = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };

const ALL_INSTRUMENTS: Record<string, number> = {};
MEASURES.forEach((m) => m.instruments.forEach((i) => (ALL_INSTRUMENTS[i.key] = 0)));

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [routeIdx, setRouteIdx] = useState(2);
  const [commodity, setCommodity] = useState("Consumer and industry goods");
  const [mode, setMode] = useState<"measure" | "expert">("measure");
  const [measureTaus, setMeasureTaus] = useState<Record<MeasureId, number>>({ ...ZERO_TAUS });
  const [instruments, setInstruments] = useState<Record<string, number>>({ ...ALL_INSTRUMENTS });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const route = ROUTES[routeIdx];
  const block = BLOCKS[route.block];

  // In expert mode the intensity of a measure is the unweighted mean of the
  // intensities of its instruments. That weighting is an assumption of this
  // interface, not an estimation result: the experiment identifies the measure
  // bundle, not the contribution of a single instrument inside it. Because the
  // mean stays in [0, 1], no scenario leaves the tested attribute range.
  const taus: Record<MeasureId, number> = useMemo(() => {
    if (mode === "measure") return measureTaus;
    const out = { ...ZERO_TAUS };
    MEASURES.forEach((m) => {
      if (m.disabled) return;
      const vals = m.instruments.map((i) => instruments[i.key] ?? 0);
      out[m.id] = vals.reduce((a, b2) => a + b2, 0) / vals.length / 100;
    });
    return out;
  }, [mode, measureTaus, instruments]);

  const attrs = useMemo(() => applyPolicies(block, taus), [block, taus]);
  const result = useMemo(() => choiceProbabilities(block, attrs), [block, attrs]);
  const baseline = useMemo(() => choiceProbabilities(block, block.x0), [block]);

  const anyActive = (Object.values(taus) as number[]).some((t) => t > 0);
  const activeCount = (Object.values(taus) as number[]).filter((t) => t > 0).length;

  // Thresholds depend only on the block, so they are computed once per block
  // rather than on every slider move.
  const thresholds = useMemo(() => {
    const out: Record<string, { five: string; ten: string }> = {};
    MEASURES.forEach((m) => {
      if (m.disabled) return;
      out[m.id] = { five: threshold(block, m.id, 5), ten: threshold(block, m.id, 10) };
    });
    return out;
  }, [block]);

  const capacity = useMemo(() => {
    const cap = PLACEHOLDER_CAPACITY[block.id];
    const railUse = (cap.demand * result.conditional.Rail) / cap.rail;
    const iwtUse = (cap.demand * result.conditional.IWT) / cap.iwt;
    return { rail: railUse * 100, iwt: iwtUse * 100 };
  }, [block, result]);

  const reset = () => {
    setMeasureTaus({ ...ZERO_TAUS });
    setInstruments({ ...ALL_INSTRUMENTS });
  };

  const fmt = (v: number, d = 1) => v.toFixed(d);
  const delta = result.conditional.Road * 100 - baseline.conditional.Road * 100;

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1 className="main-title">
            Rhine-Danube Corridor: Micro Policy Impact Simulator
          </h1>
          <p className="subtitle">
            Multinomial logit on estimated parameters. Policy measure to attribute
            change to utility to choice probability, with the mode constants pivoted
            onto the reported modal split.
          </p>
        </div>
        <button
          className="theme-toggle-btn"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? "Dark" : "Light"}
        </button>
      </header>

      <div className="provenance-banner">
        <strong>Parameter provenance.</strong> Coefficients, baselines and calibration
        anchor are the estimates of Tables 2, 3 and 4. Nothing on this page is a
        literature prior. Under a single active measure the predicted shares reproduce
        Table 9 to within 0.2 percentage points, the residual being the rounding of the
        published coefficients to three decimals.
      </div>

      <div className="two-column-layout">
        {/* ------------------------------ LEFT ------------------------------ */}
        <div className="left-column">
          <div className="panel">
            <h2 className="panel-title">Distance block and corridor reference</h2>

            <div className="config-inputs">
              <div className="input-group">
                <label className="input-label">Corridor route, anchors the block</label>
                <select
                  value={routeIdx}
                  onChange={(e) => setRouteIdx(Number(e.target.value))}
                  className="input-select"
                >
                  {ROUTES.map((r, i) => (
                    <option key={r.od} value={i}>
                      {r.od}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Commodity, display only</label>
                <select
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  className="input-select"
                >
                  <option>Consumer and industry goods</option>
                  <option>Time-sensitive or perishable goods</option>
                  <option>Bulk or large-volume goods</option>
                  <option>Machinery and equipment</option>
                </select>
              </div>
            </div>

            <div className="block-strip">
              <span className="block-chip">{block.label}</span>
              <span className="block-meta">
                {block.distance} · n = {block.n} · {route.km}
              </span>
            </div>

            <p className="caveat">
              The distance classes are not routes. Respondents were routed to a block by
              their own dominant haul distance and saw all three modes in every block.
              The route selector sets the block whose attribute levels that relation
              anchored in the calibration study. Commodity does not enter the model, it
              is shown for the map only.
            </p>

            <CorridorMapLeaflet
              od={route.od}
              commodity={commodity}
              shares={result.conditional}
            />
          </div>

          <div className="panel">
            <h2 className="panel-title">Predicted conditional mode shares</h2>

            <div className="headline">
              <div className="headline-item">
                <span className="headline-label">Calibrated baseline, road</span>
                <span className="headline-value">
                  {fmt(baseline.conditional.Road * 100)}%
                </span>
              </div>
              <div className="headline-item">
                <span className="headline-label">Under policy, road</span>
                <span className="headline-value">
                  {fmt(result.conditional.Road * 100)}%
                </span>
              </div>
              <div className="headline-item">
                <span className="headline-label">Change</span>
                <span
                  className="headline-value"
                  style={{ color: delta < -0.05 ? "#16a34a" : delta > 0.05 ? "#dc2626" : undefined }}
                >
                  {delta >= 0 ? "+" : ""}
                  {fmt(delta)} pp
                </span>
              </div>
            </div>

            <div className="share-bars">
              {MODES.map((m, i) => {
                const colors = ["#374151", "#2563eb", "#0891b2"];
                const b0 = baseline.conditional[m] * 100;
                const b1 = result.conditional[m] * 100;
                return (
                  <div key={m} className="share-bar-row">
                    <span className="share-mode">{m}</span>
                    <div className="share-bar-container">
                      <div
                        className="share-bar-fill"
                        style={{ width: `${b1}%`, backgroundColor: colors[i] }}
                      />
                      <div className="share-bar-baseline" style={{ left: `${b0}%` }} />
                    </div>
                    <span className="share-pct">{fmt(b1)}%</span>
                  </div>
                );
              })}
            </div>
            <p className="legend-note">
              The vertical mark is the calibrated baseline share. Shares are conditional
              on selecting a mode. The opt-out is reported separately and never enters a
              modal split.
            </p>

            <div className="optout-row">
              <span>Opt-out probability</span>
              <span>
                {fmt(baseline.optOut * 100)}% &rarr; <strong>{fmt(result.optOut * 100)}%</strong>
              </span>
            </div>

            <h3 className="sub-title">Attribute vector, natural units</h3>
            <div className="results-table-container">
              <table className="results-table-compact">
                <thead>
                  <tr>
                    <th></th>
                    <th>Cost (cent/tkm)</th>
                    <th>Time (days)</th>
                    <th>Reliability (pp)</th>
                    <th>Frequency (dep./wk)</th>
                  </tr>
                </thead>
                <tbody>
                  {MODES.map((m) => (
                    <tr key={m}>
                      <td className="mode-label">{m}</td>
                      {ATTRS.map((a) => {
                        const v = attrs[m][a];
                        const v0 = block.x0[m][a];
                        const moved = Math.abs(v - v0) > 1e-9;
                        return (
                          <td key={a} className={moved ? "cell-moved" : ""}>
                            {fmt(v, a === "p" ? 2 : a === "r" ? 1 : 2)}
                            {moved && (
                              <span className="cell-base"> from {fmt(v0, a === "p" ? 2 : 1)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="sub-title">Estimated coefficients, {block.label}</h3>
            <div className="results-table-container">
              <table className="results-table-compact">
                <thead>
                  <tr>
                    <th></th>
                    <th>&beta; cost</th>
                    <th>&beta; time</th>
                    <th>&beta; reliability</th>
                    <th>&beta; frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {MODES.map((m) => (
                    <tr key={m}>
                      <td className="mode-label">{m}</td>
                      {ATTRS.map((a) => (
                        <td key={a} className={block.beta[m][a] === 0 ? "cell-excluded" : ""}>
                          {block.beta[m][a] === 0 ? "excluded" : block.beta[m][a].toFixed(3)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {block.excluded.length > 0 && (
              <p className="caveat">
                Channels excluded on the sign of the coefficient, not on precision:{" "}
                {block.excluded.join("; ")}. Retaining them would make a mode more
                attractive as it becomes more expensive.
              </p>
            )}
            <p className="caveat">
              Calibration anchor, reported tonne-kilometer shares: road{" "}
              {fmt(block.anchor.Road * 100)}%, rail {fmt(block.anchor.Rail * 100)}%, IWT{" "}
              {fmt(block.anchor.IWT * 100)}%, opt-out {fmt(block.s0 * 100)}%. Standard
              errors are clustered on the respondent, the specification is a
              multinomial logit without random parameters, and the reported shares carry
              no confidence band in this interface.
            </p>
          </div>

          <div className="panel panel-muted">
            <h2 className="panel-title">
              Corridor utilization
              <span className="stage-flag">Stage 4, not computed</span>
            </h2>
            <div className="not-computed-banner">
              These bars are <strong>not a result</strong>. The macro stage requires an
              origin-destination matrix by mode and commodity, section capacity for the
              rail and waterway network, an allocation rule for shifted volumes, and a
              feedback through which utilization degrades the reliability and transit
              time that the choice model treats as exogenous. None of these is in the
              dataset. The placeholders below display the shape of the missing stage so
              that the open feedback is visible in operational form.
            </div>
            <div className="capacity-summary-modes">
              {(["Rail", "IWT"] as const).map((m) => {
                const pct = m === "Rail" ? capacity.rail : capacity.iwt;
                return (
                  <div className="capacity-summary-mode" key={m}>
                    <div className="capacity-summary-header">
                      <span className="capacity-mode-label">{m}</span>
                      <span className="capacity-summary-value">{fmt(pct, 0)}%</span>
                    </div>
                    <div className="capacity-bar-container">
                      <div
                        className="capacity-bar-fill capacity-bar-placeholder"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ------------------------------ RIGHT ----------------------------- */}
        <div className="right-column">
          <div className="panel">
            <div className="panel-title-row">
              <h2 className="panel-title">Policy intensity</h2>
              <div className="mode-switch">
                <button
                  className={mode === "measure" ? "switch-btn active" : "switch-btn"}
                  onClick={() => setMode("measure")}
                >
                  Measure mode
                </button>
                <button
                  className={mode === "expert" ? "switch-btn active" : "switch-btn"}
                  onClick={() => setMode("expert")}
                >
                  Expert mode
                </button>
              </div>
            </div>

            {mode === "measure" ? (
              <div className="info-box">
                Intensity &tau; is the fraction of the range the experiment presented, so
                &tau; = 1 is the most policy-favorable level shown for that mode and
                block, not an arbitrary maximum. Every attribute affected by a measure
                moves proportionally, which treats the measure as a coherent program.
                With one measure active the output reproduces the paper scenario.
              </div>
            ) : (
              <div className="info-box info-box-warn">
                <strong>Assumption, not estimation.</strong> The experiment identifies
                the measure bundle, not the contribution of a single instrument inside
                it. In this mode the intensity of a measure is the unweighted mean of
                its instrument sliders. That weighting is a property of this interface
                and is not supported by the estimation. Use measure mode for any number
                that is reported.
              </div>
            )}

            {activeCount > 1 && (
              <div className="info-box info-box-warn">
                {activeCount} measures active. Attribute changes are summed across
                measures and then clamped to the level range presented in the
                experiment, so the simulation stays inside the estimation domain. The
                paper reports measures singly, so combined figures are an extension of
                its scenarios rather than a reproduction of them.
              </div>
            )}

            <div className="policy-grid-compact">
              {MEASURES.map((ms) => {
                const tau = taus[ms.id];
                const disabled = Boolean(ms.disabled);
                return (
                  <div
                    key={ms.id}
                    className={disabled ? "policy-group policy-group-off" : "policy-group"}
                  >
                    <h3 className="policy-group-title" style={{ color: ms.color }}>
                      <span className="policy-badge">{ms.code}</span>
                      <span className="policy-group-title-text">{ms.title}</span>
                      <span className="kind-chip">{ms.kind}</span>
                    </h3>
                    <p className="policy-group-description">{ms.channels}</p>

                    {disabled ? (
                      <p className="disabled-note">{ms.disabled}</p>
                    ) : mode === "measure" ? (
                      <>
                        <div className="policy-item">
                          <div className="policy-item-header">
                            <span className="policy-item-label">Intensity &tau;</span>
                            <span className="policy-item-value" style={{ color: ms.color }}>
                              {Math.round(tau * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(tau * 100)}
                            onChange={(e) =>
                              setMeasureTaus({
                                ...measureTaus,
                                [ms.id]: Number(e.target.value) / 100,
                              })
                            }
                            className="policy-slider"
                            style={{
                              background: `linear-gradient(to right, ${ms.color} 0%, ${ms.color} ${tau * 100}%, var(--slider-track) ${tau * 100}%, var(--slider-track) 100%)`,
                            }}
                          />
                        </div>
                        <div className="threshold-row">
                          <span>
                            &minus;5 pp road at <strong>{thresholds[ms.id]?.five}</strong>
                          </span>
                          <span>
                            &minus;10 pp road at <strong>{thresholds[ms.id]?.ten}</strong>
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        {ms.instruments.map((inst) => {
                          const v = instruments[inst.key] ?? 0;
                          return (
                            <div key={inst.key} className="policy-item">
                              <div className="policy-item-header">
                                <span className="policy-item-label">{inst.label}</span>
                                <span
                                  className="policy-item-value"
                                  style={{ color: ms.color }}
                                >
                                  {v}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={v}
                                onChange={(e) =>
                                  setInstruments({
                                    ...instruments,
                                    [inst.key]: Number(e.target.value),
                                  })
                                }
                                className="policy-slider"
                                style={{
                                  background: `linear-gradient(to right, ${ms.color} 0%, ${ms.color} ${v}%, var(--slider-track) ${v}%, var(--slider-track) 100%)`,
                                }}
                              />
                            </div>
                          );
                        })}
                        <div className="threshold-row">
                          <span>
                            Implied measure intensity &tau; ={" "}
                            <strong>{Math.round(tau * 100)}%</strong>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={reset} className="reset-button">
              Reset to calibrated baseline
            </button>

            {!anyActive && (
              <p className="caveat">
                At zero intensity the model reproduces the reported modal split by
                construction, since the pivot forces it to.
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="app-footer">
        Beil, D., Putz-Egger, L.-M., Sys, C. From choice behavior to system outcomes.
        Behavioral parameters estimated on 198 corridor decision makers, 2,345 choice
        tasks. Stage 4, the aggregation to origin-destination flows under network
        capacity, is specified but not computed.
      </footer>
    </div>
  );
}
