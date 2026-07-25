import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { turnoutClosure, leadInchesForSize, RAIL_GAUGE_INCHES } from "./index";

// RENDER HARNESS — not an assertion. Draws turnouts with the SAME geometry the
// canvas uses, so they can be LOOKED AT without running MR or logging in.
//
// ⚠️ Draws SEVERAL COMPOSITIONS, not one ideal turnout. The easement was
// verified here in isolation, was correct, and still broke in production
// against a spur too short to hold it — the track's near end is pulled out to
// the leg's join, so an overlong join inverts the body and the track vanishes.
// Isolation cannot catch that. Every case below is a composition.
const OUT = process.env.HARNESS_OUT ?? "harness";
const G = RAIL_GAUGE_INCHES;
const LANE = 1.125;
const S = 54;

/** The ease MR settles on for a track with this much room past the frog. */
function easeFor(N: number, lead: number, available: number) {
  const straightSpan = lead + Math.max(0, (LANE - G) * N);
  return Math.max(0, Math.min(lead, 2 * (available - straightSpan)));
}

function panel(N: number, available: number, label: string, top: number) {
  const lead = leadInchesForSize(N);
  const ease = easeFor(N, lead, available);
  const cl = turnoutClosure(N, { leadInches: lead, arriveAtInches: LANE, easeInches: ease });
  const span = Math.min(cl.span, available);
  const X = (i: number) => 150 + i * S;
  const Y = (o: number) => top + o * S;
  const L = available + 1.5;

  const steps = 120;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (span * i) / steps;
    pts.push([s, cl.offsetAt(s)]);
  }
  const norm = (i: number) => {
    const k = Math.max(1, Math.min(pts.length - 1, i));
    const dx = pts[k][0] - pts[k - 1][0];
    const dy = pts[k][1] - pts[k - 1][1];
    const m = Math.hypot(dx, dy) || 1;
    return [-dy / m, dx / m] as const;
  };
  const leg = (side: 1 | -1) =>
    pts
      .map(([s, o], i) => {
        const [nx, ny] = norm(i);
        return `${X(s + (nx * side * G) / 2)},${Y(o + (ny * side * G) / 2)}`;
      })
      .join(" ");

  // The track it feeds: from the join to its far end, parallel at one lane.
  // If the join ran past the far end this is where it would invert.
  const bodyFrom = span;
  const bodyTo = available;
  const body = (side: 1 | -1) =>
    `<line x1="${X(bodyFrom)}" y1="${Y(LANE + (side * G) / 2)}" x2="${X(bodyTo)}" y2="${Y(
      LANE + (side * G) / 2,
    )}" stroke="#a33" stroke-width="2"/>`;

  // Two DIFFERENT failures, and conflating them hides the dangerous one.
  // Consumed = the leg uses the whole spur and no body is left: correct, the
  // rails still reach the end. Inverted = the join ran PAST the far end, which
  // is the v0.15.44 regression where the track disappeared.
  const consumed = Math.abs(bodyTo - bodyFrom) < 1e-6;
  const inverted = bodyTo < bodyFrom - 1e-6;
  return `
<line x1="${X(-0.4)}" y1="${Y(-G / 2)}" x2="${X(L)}" y2="${Y(-G / 2)}" stroke="#334" stroke-width="2"/>
<line x1="${X(-0.4)}" y1="${Y(G / 2)}" x2="${X(L)}" y2="${Y(G / 2)}" stroke="#334" stroke-width="2"/>
<polyline points="${leg(1)}" fill="none" stroke="#334" stroke-width="2"/>
<polyline points="${leg(-1)}" fill="none" stroke="#334" stroke-width="2"/>
${body(1)}${body(-1)}
<circle cx="${X(lead)}" cy="${Y(G / 2)}" r="4" fill="none" stroke="#0284c7" stroke-width="2"/>
<text x="16" y="${top - 14}" font-family="sans-serif" font-size="13" fill="#334">${label}</text>
<text x="16" y="${top + 6}" font-family="monospace" font-size="11" fill="#667">room ${available}" · ease ${ease.toFixed(
    2,
  )}" · span ${span.toFixed(2)}"${inverted ? "  ⚠⚠ BODY INVERTED — track lost" : consumed ? "  · body fully consumed by the leg" : ""}</text>`;
}

it("renders turnout compositions for inspection", () => {
  const cases: Array<[number, number, string]> = [
    [7, 20, "#7 · plenty of room — full ease, smooth join"],
    [7, 12, "#7 · tight — ease shortened to fit"],
    [7, 9.5, "#7 · SHORT SPUR — no room to ease, runs straight (the v0.15.44 regression)"],
    [5, 9.5, "#5 · same short spur — a sharper frog needs less run"],
  ];
  const H = 150;
  const body = cases.map(([n, a, l], i) => panel(n, a, l, 90 + i * H)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="${
    90 + cases.length * H
  }"><rect width="100%" height="100%" fill="#f6f3ec"/>${body}</svg>`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/turnout.svg`, svg);
});
