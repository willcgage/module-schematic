import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { turnoutClosure, leadInchesForSize, RAIL_GAUGE_INCHES } from "./index";

// RENDER HARNESS — not an assertion. Draws a turnout with the SAME geometry the
// canvas uses, so it can be LOOKED AT without running MR or logging in. Every
// visual bug in this thread survived because it was checked by coordinates.
const OUT = process.env.HARNESS_OUT ?? "harness";

it("renders a turnout for inspection", () => {
  const N = 7;
  const S = 90;            // px per inch
  const g = RAIL_GAUGE_INCHES;
  const lead = leadInchesForSize(N);
  const cl = turnoutClosure(N, { leadInches: lead });
  const span = lead + (1.125 - g) * N;   // as frogLegOf solves it
  const L = span + 2;
  const X = (i: number) => 40 + i * S;
  const Y = (o: number) => 200 + o * S;

  const steps = 96;
  const div: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (span * i) / steps;
    div.push([s, cl.offsetAt(s)]);
  }
  const norm = (i: number) => {
    const k = Math.max(1, Math.min(div.length - 1, i));
    const dx = div[k][0] - div[k - 1][0];
    const dy = div[k][1] - div[k - 1][1];
    const m = Math.hypot(dx, dy) || 1;
    return [-dy / m, dx / m] as const;
  };
  const railOf = (side: 1 | -1) =>
    div
      .map(([s, o], i) => {
        const [nx, ny] = norm(i);
        return `${X(s + (nx * side * g) / 2)},${Y(o + (ny * side * g) / 2)}`;
      })
      .join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${X(L) + 40}" height="440">
<rect width="100%" height="100%" fill="#f6f3ec"/>
<line x1="${X(-0.3)}" y1="${Y(-g / 2)}" x2="${X(L)}" y2="${Y(-g / 2)}" stroke="#334" stroke-width="2"/>
<line x1="${X(-0.3)}" y1="${Y(g / 2)}" x2="${X(L)}" y2="${Y(g / 2)}" stroke="#334" stroke-width="2"/>
<polyline points="${railOf(1)}" fill="none" stroke="#334" stroke-width="2"/>
<polyline points="${railOf(-1)}" fill="none" stroke="#334" stroke-width="2"/>
<circle cx="${X(lead)}" cy="${Y(g)}" r="5" fill="none" stroke="#0284c7" stroke-width="2"/>
<text x="40" y="410" font-family="sans-serif" font-size="15" fill="#334">#${N}  lead ${lead.toFixed(3)}"  span ${span.toFixed(3)}"  gauge ${g}"  (circle = frog)</text>
</svg>`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/turnout.svg`, svg);
});
