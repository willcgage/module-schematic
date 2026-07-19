/**
 * @willcgage/module-schematic — the shared module operations-schematic (track-graph)
 * that the Module Repository authors and Free-Dispatcher imports.
 *
 * Topological, straightened-first: positions are 1-D inches along the module
 * (from endplate A), lanes are integer track indices (0 = primary main). This is
 * the single source of truth for both apps — the doc types, the lenient parser
 * (docs arrive as jsonb / unknown), the pure feature resolver both renderers
 * draw, the N-scale helpers, and the editor <-> doc state machine an authoring
 * UI binds to. See docs/module-schematic-format.md in the free-dispatcher repo.
 *
 * Framework-agnostic and side-effect-free so it can be unit-tested and consumed
 * from Next.js (server + client) and Electron alike.
 */

export type TrackConfig = "single" | "double";
export type TrackRole = "main" | "siding" | "spur" | "yard" | "crossover";
export type TurnoutKind = "left" | "right" | "wye";
export type SignalFacing = "AtoB" | "BtoA";
export type SignalSide = "above" | "below";

export interface SchematicEndplateTrack {
  trackId: string;
  lane: number;
  config?: TrackConfig | null;
}
export interface SchematicEndplate {
  id: string; // "A" (West) | "B" (East) | "C"… (branch, #170)
  label?: string | null;
  tracks?: SchematicEndplateTrack[];
  /** Branch endplates (#170): where a 3rd+ endplate sits — pos inches from A,
   * on the up (north/above) or down side. Absent = axial (A at 0, B at
   * lengthInches). Renderers draw a named connector arrow (the CATS/US&S
   * off-band idiom) until branch spines land. */
  at?: { pos: number; side: "up" | "down" };
  /** Manual pose override (#175 phase 1b) — the endplate's module-local track
   * point (x, y inches) + outward-normal heading (°). Hand-entered for shapes
   * the geometry fields can't derive (wye, freeform, loop); wins over
   * deriveEndplatePoses' derivation. */
  pose?: { x: number; y: number; heading: number };
  /** Free-moN endplate FACE width across the track, inches — the physical size
   * of the standard interface at this end. Free-moN spec: 12″ minimum, 24″
   * recommended. Absent = the recommended default (modules may differ end to
   * end, e.g. a transition). */
  widthInches?: number | null;
}

/** Free-moN endplate face width, inches — the connection interface size. */
export const FREEMO_ENDPLATE_WIDTH_MIN_INCHES = 12;
export const FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES = 24;

/**
 * The authored face width for an endplate, or the recommended default when a
 * module hasn't authored one. The single source of truth both apps read so a
 * module's endplate size is drawn the same in the Repository and the layout.
 */
export function endplateWidthInches(
  ep: { widthInches?: number | null } | null | undefined,
): number {
  const w = ep?.widthInches;
  return typeof w === "number" && w > 0
    ? w
    : FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES;
}
export interface SchematicTrack {
  id: string;
  role: TrackRole;
  lane: number;
  from?: string;
  to?: string;
  fromPos?: number | null;
  toPos?: number | null;
  capacityFeet?: number | null;
  industryRef?: number | null;
  /** The module_tracks row this track is (single source of truth); null = new. */
  moduleTrackId?: number | null;
  /** Owner's track name, mirrored to module_tracks.track_name. */
  trackName?: string;
  /** Inside the balloon of a loop module (#165): pos still measures from
   * endplate A (past the throat = in the loop), lane is the ladder/arc index —
   * one record drives both the unrolled fan and a geometric render. */
  inLoop?: boolean;
  /** Authored 2-D path for this track (module-local inches, open path with
   * arcs) — the PHYSICAL shape a bent/rotated spur draws. Absent = derive from
   * the main centre-line + lane, as before. Physical view only; the operations
   * view stays positional (#2d-track). */
  path?: BenchworkPoint[] | null;
}
export interface SchematicTurnout {
  id: string;
  pos: number;
  onTrack: string;
  divergeTrack: string;
  kind?: TurnoutKind;
  name?: string | null;
  address?: string | null;
  /** Frog number ("size") — #4, #6, #8, etc. Governs the diverging angle. */
  size?: number | null;
}
export interface SchematicSignal {
  id: string;
  pos: number;
  /** Track the signal governs; absent = the primary main (lane 0). */
  track?: string;
  facing?: SignalFacing;
  kind?: "mast" | "dwarf";
  name?: string | null;
  aspects?: string[];
  /** Which side of the track the signal sits on (#122). */
  side?: SignalSide;
  /** Turnout this control point governs; absent = standalone block signal. */
  turnout?: string;
}
export interface SchematicBlock {
  id: string;
  name: string;
  tracks?: string[];
  from: number;
  to: number;
}
/** A grade crossing / diamond (#170): two tracks cross with no route choice —
 * a conflict node, not a turnout. A connected diamond adds normal turnouts
 * alongside. Drawn as an X between the two tracks' lanes. */
export interface SchematicCrossing {
  id: string;
  pos: number;
  /** The two crossing tracks, by id. */
  tracks: [string, string];
  name?: string | null;
}
/**
 * A control point is an interlocking: a named group of one or more signals and
 * zero or more turnouts. A passing siding has two (West/East); a lone block
 * signal is a control point with one signal and no turnouts.
 */
export interface SchematicControlPoint {
  id: string;
  name?: string | null;
  turnouts?: string[];
  /** Crossings this interlocking protects (#170). */
  crossings?: string[];
  signals?: SchematicSignal[];
}
/** What a rendered industry shows beside its name: a car count, a length in
 * inches, or nothing (name only). Authored per industry. */
export type IndustryLabelMode = "none" | "cars" | "inches";

/**
 * An industry — a rail-served customer that spots cars, authored as a SPAN on a
 * track (a spur/siding, or the main). Positional like everything else: it lives
 * in the same module-local inch frame and is rendered into the shared 2-D view,
 * offset to `side`. The span length gives its car capacity; the dispatcher and
 * crews read where cars set out. Mirrors a `freemon_industries` row.
 */
export interface SchematicIndustry {
  id: string;
  name: string;
  /** Industry type value from the lookup (e.g. "team_track", "grain"). */
  type?: string | null;
  /** The track this industry spots cars on (a spur/siding id, or the main). */
  track: string;
  /** The car-spot span along that track, inches from endplate A. */
  fromPos: number;
  toPos: number;
  /** Which side of the track the building + label sit on. */
  side?: SignalSide;
  /** Secondary readout at the label — a car count, a length, or none. */
  labelMode?: IndustryLabelMode;
  /** Car types this industry receives (car-type value strings). */
  carTypes?: string[];
  /** The `freemon_industries` row this is (single source of truth); null = new. */
  moduleIndustryId?: number | null;
}

export interface ModuleSchematicDoc {
  version: number;
  module?: string;
  lengthInches?: number;
  /** Single-endplate turnback (balloon loop): the main enters at A, runs the
   * lead, and turns back — renderers draw a terminal bulb at the far end
   * instead of a second endplate. Also implied by a single-entry endplates
   * array (a category:"loop" module like Seaford). */
  loop?: boolean;
  /** Where the balloon returns (#165): "same" (default) turns back onto the
   * same main; "main2" is a directional return on a double-track main —
   * out on Main 1, back on Main 2 — drawn as a U joining the two lanes
   * (the transit terminal-loop idiom). */
  loopReturn?: "same" | "main2";
  /** Optional rendering override: "bulb" (abstract terminal), "fan" (interior
   * tracks unrolled as a ladder past the throat — the default when inLoop
   * tracks exist), "geometric" (drawn balloon, AL&E-style). */
  loopRender?: "bulb" | "fan" | "geometric";
  endplates: SchematicEndplate[];
  tracks: SchematicTrack[];
  turnouts?: SchematicTurnout[];
  /** Grade crossings / diamonds (#170). */
  crossings?: SchematicCrossing[];
  controlPoints?: SchematicControlPoint[];
  /** Rail-served industries — car-spot spans on a track (#industries). */
  industries?: SchematicIndustry[];
  /** Benchwork FOOTPRINT outline — the module's physical board shape as a
   * polygon in module-local inches, in the same frame as the endplate poses
   * (endplate A's track point at the origin, the mainline along +x, perpendicular
   * +y up). Stored as an open ring; renderers close it. Absent = derive an
   * approximate band from the endplate widths. */
  outline?: BenchworkPoint[];
  /** @deprecated pre-grouping flat signals; read for back-compat. */
  signals?: SchematicSignal[];
  /** Authored mainline centre-line (module-local inches, open path with arcs).
   * Present = the owner drew the real shape; absent = derive from geometry.
   * Physical view only — the operations view stays derived (#2d-track). */
  mainPath?: BenchworkPoint[] | null;
}

/** A benchwork-outline vertex, module-local inches. The edge from this vertex
 * to the NEXT one is a straight line, unless `bulge` is set — then it's a
 * circular arc whose midpoint is offset `bulge` inches (signed: + bows to the
 * left of the P→next direction) perpendicular from the chord. */
export interface BenchworkPoint {
  x: number;
  y: number;
  bulge?: number;
}

/** The authored benchwork outline, or null when a module hasn't drawn one
 * (renderers then fall back to a band derived from the endplate widths). A
 * valid outline needs at least 3 points. Normalises each vertex to {x, y, bulge?}. */
export function benchworkOutline(
  doc: { outline?: BenchworkPoint[] | null } | null | undefined,
): BenchworkPoint[] | null {
  const pts = (doc?.outline ?? [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({
      x: p.x,
      y: p.y,
      ...(Number.isFinite(p.bulge) && p.bulge ? { bulge: p.bulge } : {}),
    }));
  return pts.length >= 3 ? pts : null;
}

/**
 * Expand a benchwork outline (whose edges may be arcs) into a dense closed
 * polyline for rendering — the SAME sampling both the Repository preview and
 * Free-Dispatcher use, so a curve looks identical in both. Straight edges emit
 * just their start vertex; a bulged edge emits `segsPerArc` points along the
 * circular arc through the two endpoints and the bulged midpoint.
 */
export function sampleBenchworkOutline(
  pts: BenchworkPoint[],
  segsPerArc = 20,
): { x: number; y: number }[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    out.push({ x: p0.x, y: p0.y });
    const bulge = p0.bulge ?? 0;
    if (!bulge) continue; // straight edge
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const c = Math.hypot(dx, dy);
    if (c < 1e-6) continue;
    // Arc midpoint = chord midpoint + left-normal * sagitta.
    const nx = -dy / c;
    const ny = dx / c;
    const mid = { x: (p0.x + p1.x) / 2 + nx * bulge, y: (p0.y + p1.y) / 2 + ny * bulge };
    const circ = circleThrough(p0, mid, p1);
    if (!circ) continue; // colinear → treat as straight
    const a0 = Math.atan2(p0.y - circ.cy, p0.x - circ.cx);
    const am = Math.atan2(mid.y - circ.cy, mid.x - circ.cx);
    const a1 = Math.atan2(p1.y - circ.cy, p1.x - circ.cx);
    // Sweep from a0 to a1 the way that passes through the midpoint angle.
    const sweep = arcSweep(a0, a1, am);
    for (let s = 1; s < segsPerArc; s++) {
      const a = a0 + (sweep * s) / segsPerArc;
      out.push({ x: circ.cx + circ.r * Math.cos(a), y: circ.cy + circ.r * Math.sin(a) });
    }
  }
  return out;
}

/**
 * Expand an OPEN track path (whose edges may be arcs) into a dense polyline —
 * the open-ended sibling of sampleBenchworkOutline (which closes the ring).
 * Used for authored track centre-lines (a drawn mainline or spur). The final
 * vertex is always emitted so the path reaches its end.
 */
export function samplePath(
  pts: BenchworkPoint[],
  segsPerArc = 20,
): { x: number; y: number }[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    out.push({ x: p0.x, y: p0.y });
    const bulge = p0.bulge ?? 0;
    if (!bulge) continue; // straight edge
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const c = Math.hypot(dx, dy);
    if (c < 1e-6) continue;
    const nx = -dy / c;
    const ny = dx / c;
    const mid = { x: (p0.x + p1.x) / 2 + nx * bulge, y: (p0.y + p1.y) / 2 + ny * bulge };
    const circ = circleThrough(p0, mid, p1);
    if (!circ) continue;
    const a0 = Math.atan2(p0.y - circ.cy, p0.x - circ.cx);
    const am = Math.atan2(mid.y - circ.cy, mid.x - circ.cx);
    const a1 = Math.atan2(p1.y - circ.cy, p1.x - circ.cx);
    const sweep = arcSweep(a0, a1, am);
    for (let s = 1; s < segsPerArc; s++) {
      const a = a0 + (sweep * s) / segsPerArc;
      out.push({ x: circ.cx + circ.r * Math.cos(a), y: circ.cy + circ.r * Math.sin(a) });
    }
  }
  out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
  return out;
}

/** Normalise an authored track path from a doc, or null if it isn't a real path
 * (needs ≥ 2 valid points). Keeps per-vertex bulge. */
export function trackPath(
  path: BenchworkPoint[] | null | undefined,
): BenchworkPoint[] | null {
  const pts = (path ?? [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({
      x: p.x,
      y: p.y,
      ...(Number.isFinite(p.bulge) && p.bulge ? { bulge: p.bulge } : {}),
    }));
  return pts.length >= 2 ? pts : null;
}

/** Circle through three points, or null if (near-)colinear. */
function circleThrough(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

/** Signed sweep from a0 to a1 that goes through the midpoint angle am. */
function arcSweep(a0: number, a1: number, am: number): number {
  const norm = (x: number) => {
    let v = (x - a0) % (2 * Math.PI);
    if (v < 0) v += 2 * Math.PI;
    return v; // 0..2π, measured CCW from a0
  };
  const m = norm(am);
  const one = norm(a1);
  // If the midpoint is reached before a1 going CCW, sweep CCW (+); else CW (−).
  return m <= one ? one : one - 2 * Math.PI;
}

// ── Physical module footprint (shared by the Repository preview + Free-Dispatcher)
// The single-module geometry both apps draw: the main track centre-line, the
// derived benchwork band (an endplate-width ribbon, the fallback when no outline
// is authored), the endplate FACES, and the authored outline (arcs sampled).
// Module-local inches: endplate A's track point at the origin, mainline +x,
// perpendicular +y up. Free-Dispatcher's composeFootprint stacks these per module
// by the join graph; here we expose the per-module primitive so the Repository
// renders the exact same board.

const DEG_FP = Math.PI / 180;

export interface ModuleFootprintInput {
  /** Mainline length (falls back to footprint length), inches. */
  lengthInches: number;
  geometryType?: string | null;
  geometryDegrees?: number | null;
  geometryOffsetInches?: number | null;
  /** Authored endplate face widths by id ("A"/"B"…), inches; default recommended. */
  endplateWidths?: Record<string, number>;
  /** Authored benchwork outline (module-local inches), or absent for the band. */
  outline?: BenchworkPoint[] | null;
  /** Authored mainline centre-line (module-local inches, open path with arcs).
   * When present it wins over the geometry-derived centre-line — the owner drew
   * the real shape (#2d-track, physical view only). */
  mainPath?: BenchworkPoint[] | null;
}

export interface OutlineFace {
  /** The endplate face's two corners + midpoint (the track point). */
  p1: BenchworkPoint;
  p2: BenchworkPoint;
  mid: BenchworkPoint;
}

export interface ModuleFootprint {
  /** Main track centre-line A→B (arcs sampled). */
  centerline: BenchworkPoint[];
  /** Derived benchwork band (endplate-width ribbon); the outline fallback. */
  band: BenchworkPoint[];
  /** Endplate faces: [A end, B end]. */
  endplateFaces: OutlineFace[];
  /** Authored outline (arc-sampled closed ring) or null → render the band. */
  outline: BenchworkPoint[] | null;
}

/** Module-local main track centre-line (A→B), sampling arcs for curves/corners.
 * An authored `mainPath` wins — the owner drew the real shape; otherwise the
 * centre-line is derived from the geometry fields (length + type/degrees/offset). */
export function moduleCenterline(input: ModuleFootprintInput): BenchworkPoint[] {
  const drawn = trackPath(input.mainPath);
  if (drawn) return samplePath(drawn);
  const L = input.lengthInches > 0 ? input.lengthInches : 24;
  const gt = input.geometryType;
  if (gt === "dead_end") return [{ x: 0, y: 0 }];
  if (gt === "offset") return [{ x: 0, y: 0 }, { x: L, y: input.geometryOffsetInches ?? 0 }];
  const turn =
    gt === "corner_45" ? 45 : gt === "corner_90" ? 90 : gt === "curve" ? (input.geometryDegrees ?? 0) : 0;
  if (turn === 0) return [{ x: 0, y: 0 }, { x: L, y: 0 }];
  const t = turn * DEG_FP;
  const r = L / t;
  const steps = 12;
  const pts: BenchworkPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (t * i) / steps;
    pts.push({ x: r * Math.sin(a), y: r * (1 - Math.cos(a)) });
  }
  return pts;
}

/** Unit left normal of the local direction at each centre-line vertex. */
function centerlineNormals(center: BenchworkPoint[]): BenchworkPoint[] {
  return center.map((_, i) => {
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(center.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { x: -dy, y: dx };
  });
}

/** Fraction 0→1 along the centre-line by arc length (A end = 0, B end = 1). */
function centerlineFractions(center: BenchworkPoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < center.length; i++)
    cum.push(cum[i - 1] + Math.hypot(center[i].x - center[i - 1].x, center[i].y - center[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  return cum.map((d) => d / total);
}

/** Benchwork band: the centre-line offset ±half-width, tapering widthA→widthB. */
export function benchworkBand(
  center: BenchworkPoint[],
  widthA = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  widthB = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
): BenchworkPoint[] {
  if (center.length < 2) return [];
  const n = centerlineNormals(center);
  const f = centerlineFractions(center);
  const half = (i: number) => (widthA * (1 - f[i]) + widthB * f[i]) / 2;
  const left = center.map((p, i) => ({ x: p.x + n[i].x * half(i), y: p.y + n[i].y * half(i) }));
  const right = center.map((p, i) => ({ x: p.x - n[i].x * half(i), y: p.y - n[i].y * half(i) }));
  return [...left, ...right.reverse()];
}

/** The two endplate faces (the band's flat ends): [A end at widthA, B end at widthB]. */
export function endplateFaceSegments(
  center: BenchworkPoint[],
  widthA = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  widthB = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
): OutlineFace[] {
  if (center.length < 2) return [];
  const n = centerlineNormals(center);
  const face = (i: number, w: number): OutlineFace => ({
    p1: { x: center[i].x + n[i].x * (w / 2), y: center[i].y + n[i].y * (w / 2) },
    p2: { x: center[i].x - n[i].x * (w / 2), y: center[i].y - n[i].y * (w / 2) },
    mid: { x: center[i].x, y: center[i].y },
  });
  return [face(0, widthA), face(center.length - 1, widthB)];
}

/**
 * The full single-module physical footprint: centre-line + derived band +
 * endplate faces + the authored outline (arc-sampled), all in module-local
 * inches. Renderers draw `outline ?? band`.
 */
export function moduleFootprint(input: ModuleFootprintInput): ModuleFootprint {
  const centerline = moduleCenterline(input);
  const widthA = endplateWidthFor(input.endplateWidths, "A");
  const widthB = endplateWidthFor(input.endplateWidths, "B");
  const authored = benchworkOutline(input);
  return {
    centerline,
    band: benchworkBand(centerline, widthA, widthB),
    endplateFaces: endplateFaceSegments(centerline, widthA, widthB),
    outline: authored ? sampleBenchworkOutline(authored) : null,
  };
}

function endplateWidthFor(widths: Record<string, number> | undefined, id: string): number {
  const w = widths?.[id];
  return typeof w === "number" && w > 0 ? w : FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES;
}

/** Whether a doc is a single-endplate turnback (explicit flag or one endplate). */
export function isLoopDoc(doc: ModuleSchematicDoc): boolean {
  return doc.loop === true || doc.endplates.length === 1;
}

export const MAIN_TRACK_ID = "main";
/** The second main on double-track modules — a real track entity so turnouts
 * and signals can attach to it (a spur off Main 2 must diverge from lane 1,
 * not draw a crossover from Main 1). Emitted by stateToDoc when either
 * endplate is double; legacy docs without it still parse. */
export const MAIN2_TRACK_ID = "main2";

// North American N scale (1:160): 396 real inches → 5280 scale feet = one mile.
export const N_SCALE_RATIO = 160;
/** Real inches on the module → scale feet of prototype track represented. */
export function inchesToScaleFeet(inches: number, ratio = N_SCALE_RATIO): number {
  return (inches * ratio) / 12;
}
/** Scale feet of prototype track → real inches on the module. */
export function scaleFeetToInches(feet: number, ratio = N_SCALE_RATIO): number {
  return (feet * 12) / ratio;
}

/** Length a spotted car occupies on N-scale track, inches. A 40-ft car body is
 * ~3.0″; ~3.3″ over the couplers — the real spacing a cut of cars takes. The
 * single constant every repo reads so a track's car count matches everywhere. */
export const N_CAR_LENGTH_INCHES = 3.3;

/** How many cars fit in a span, from its drawn length — the derived capacity a
 * siding or an industry spot holds (never typed). */
export function carCapacity(
  fromPos: number,
  toPos: number,
  carLengthInches = N_CAR_LENGTH_INCHES,
): number {
  if (!(carLengthInches > 0)) return 0;
  return Math.max(0, Math.floor(Math.abs(toPos - fromPos) / carLengthInches));
}

/** Parse a jsonb value into a schematic doc, or null if it isn't one. */
export function asModuleSchematic(x: unknown): ModuleSchematicDoc | null {
  if (!x || typeof x !== "object") return null;
  const d = x as Record<string, unknown>;
  if (typeof d.version !== "number") return null;
  if (!Array.isArray(d.endplates) || !Array.isArray(d.tracks)) return null;
  return d as unknown as ModuleSchematicDoc;
}

// ---- Editor state (a flatter shape an authoring form binds to) -------------

export interface EditorTrack {
  id: string;
  role: TrackRole;
  lane: number;
  fromPos: number;
  toPos: number;
  /** module_tracks row id (single source of truth), or null for a new track. */
  moduleTrackId: number | null;
  /** Owner's track name → module_tracks.track_name. */
  trackName: string;
  /** Inside the balloon of a loop module (#165). */
  inLoop?: boolean;
  /** Authored 2-D path (module-local inches) — a bent/rotated spur's real
   * shape. Absent = derive from the main + lane (#2d-track). */
  path?: BenchworkPoint[];
}

/** A module_tracks row as loaded for the editor. */
export interface ModuleTrackRow {
  id: number;
  track_name: string | null;
  capacity_scale_feet: number | null;
}
export interface EditorTurnout {
  id: string;
  name: string;
  pos: number;
  onTrack: string;
  divergeTrack: string;
  kind: TurnoutKind;
  /** Frog number ("size") — #4, #6, #8, etc. Governs the diverging angle. */
  size?: number;
}
export interface EditorCpSignal {
  id: string;
  pos: number;
  track: string;
  facing: SignalFacing;
  side: SignalSide;
}
export interface EditorControlPoint {
  id: string;
  name: string;
  turnouts: string[]; // turnout ids grouped under this control point
  /** Crossing ids this interlocking protects (#170). */
  crossings?: string[];
  signals: EditorCpSignal[];
}
export interface EditorCrossing {
  id: string;
  name: string;
  pos: number;
  trackA: string;
  trackB: string;
}
/** An industry as the authoring form binds it — a car-spot span on a track. */
export interface EditorIndustry {
  id: string;
  name: string;
  type: string;
  track: string;
  fromPos: number;
  toPos: number;
  side: SignalSide;
  labelMode: IndustryLabelMode;
  carTypes: string[];
  /** freemon_industries row (single source of truth), or null for a new one. */
  moduleIndustryId: number | null;
}
/** A 3rd+ endplate — a branch/junction connection off the module (#170).
 * A module may have several (e.g. a set carrying a second railroad through:
 * MoPac enters at one branch endplate and leaves at another). */
export interface EditorBranch {
  label: string;
  pos: number;
  side: "up" | "down";
  config: TrackConfig;
}
/** Endplate B on a loop module: a standard endplate makes the balloon an
 * INTERCHANGE (a second route connects at the loop, e.g. Seaford); "none"
 * makes it a pure turnback. Non-loop modules always have a real B. */
export type EndplateBConfig = TrackConfig | "none";

export interface EditorState {
  lengthInches: number;
  /** Balloon loop: the main runs the lead and turns back; positions past the
   * throat are inside the balloon. Endplate B stays independently available —
   * present = interchange loop, "none" = pure turnback. */
  loop: boolean;
  /** Where the balloon returns: same main, or Main 2 (directional return on a
   * double-track main — drawn as a U joining the two lanes). */
  loopReturn: "same" | "main2";
  configA: TrackConfig;
  configB: EndplateBConfig;
  extraTracks: EditorTrack[]; // sidings/spurs/…; the main track is implicit
  turnouts: EditorTurnout[];
  /** Grade crossings / diamonds (#170). */
  crossings: EditorCrossing[];
  /** Branch endplates C, D, … — junction connections (#170); empty = through
   * module. Emitted in order as endplates "C", "D", "E"… */
  branches: EditorBranch[];
  /** Manual endplate pose overrides by endplate id (#175 phase 1b). */
  poseOverrides: Record<string, { x: number; y: number; heading: number }>;
  /** Authored endplate face widths by endplate id, inches (Free-moN 12″ min,
   * 24″ recommended). Absent id = the recommended default. */
  endplateWidths: Record<string, number>;
  /** Benchwork footprint outline — polygon vertices in module-local inches
   * (endplate A's track point at the origin, mainline +x, perpendicular +y up).
   * Empty = no authored outline (fall back to the endplate-width band). */
  outline: BenchworkPoint[];
  controlPoints: EditorControlPoint[];
  /** Rail-served industries — car-spot spans on a track (#industries). */
  industries: EditorIndustry[];
  /** Authored mainline centre-line (module-local inches) — empty = derive from
   * geometry. The owner-drawn real shape (#2d-track, physical view only). */
  mainPath: BenchworkPoint[];
}

/** Build the empty editor state for a module of the given length. */
export function emptyEditorState(lengthInches: number): EditorState {
  return {
    lengthInches: lengthInches > 0 ? lengthInches : 24,
    loop: false,
    loopReturn: "same",
    configA: "single",
    configB: "single",
    extraTracks: [],
    turnouts: [],
    crossings: [],
    branches: [],
    poseOverrides: {},
    endplateWidths: {},
    outline: [],
    controlPoints: [],
    industries: [],
    mainPath: [],
  };
}

/** Main 2's doc track for a non-loop double module. Full length when both
 * endplates are double; on a transition module (one single, one double) it
 * runs between the mainline transition turnout (the one diverging to main2)
 * and the double end. */
/**
 * A single↔double transition turnout connects Main 1 and Main 2 — where the
 * second main begins/ends. It may be authored either way round: on Main 1
 * diverging to Main 2, or on Main 2 diverging to Main 1 (both describe the same
 * junction). Recognise both so editing the direction doesn't drop the transition.
 */
export function isTransitionTurnout(t: {
  onTrack?: string;
  divergeTrack?: string;
}): boolean {
  return (
    (t.onTrack === MAIN_TRACK_ID && t.divergeTrack === MAIN2_TRACK_ID) ||
    (t.onTrack === MAIN2_TRACK_ID && t.divergeTrack === MAIN_TRACK_ID)
  );
}

function main2Track(state: EditorState): SchematicTrack {
  const bothDouble = state.configA === "double" && state.configB === "double";
  const sw = state.turnouts.find(isTransitionTurnout);
  // Main 2 runs partial only when IT is the branch that ends (turnout diverges
  // TO Main 2). If the turnout sits ON Main 2 (Main 2 is the surviving through
  // main, #FMN-0043), Main 2 runs full and Main 1 is the one that ends.
  if (bothDouble || !sw || sw.divergeTrack !== MAIN2_TRACK_ID) {
    return { id: MAIN2_TRACK_ID, role: "main", lane: 1, from: "A", to: "B" };
  }
  return state.configA === "double"
    ? // Double at A: Main 2 runs from A and ends at the turnout.
      { id: MAIN2_TRACK_ID, role: "main", lane: 1, fromPos: 0, toPos: sw.pos }
    : // Double at B: Main 2 begins at the turnout and runs to B.
      { id: MAIN2_TRACK_ID, role: "main", lane: 1, fromPos: sw.pos, toPos: state.lengthInches };
}

/**
 * Build the single↔double transition as one unit (like buildPassingSiding):
 * the mainline turnout where Main 2 begins/ends, grouped in a control point —
 * an "End of Double Track" is a classic CTC interlocking — with signals both
 * directions. Returns items to merge into the editor state.
 */
export function buildTransition(state: EditorState): {
  turnout: EditorTurnout;
  controlPoint: EditorControlPoint;
} | null {
  const aDouble = state.configA === "double";
  const bDouble = state.configB === "double";
  if (state.loop || aDouble === bDouble) return null; // not a transition module
  const len = state.lengthInches > 0 ? state.lengthInches : 24;
  const inset = Math.max(6, Math.round(len * 0.25));
  // The turnout sits toward the single end so the double track carries most
  // of the module; owner adjusts the position afterwards.
  const pos = aDouble ? len - inset : inset;

  const swId = nextId("sw", state.turnouts.map((t) => t.id));
  const turnout: EditorTurnout = {
    id: swId,
    name: "End of Double Track",
    pos,
    // The turnout sits ON the ending main (Main 2, the upper track) and diverges
    // down to the continuous Main 1 — the modeller's view of the junction. Left
    // hand when the double end is west (Main 2 comes down going east), right
    // when it's east (mirror).
    onTrack: MAIN2_TRACK_ID,
    divergeTrack: MAIN_TRACK_ID,
    kind: aDouble ? "left" : "right",
  };

  const cpId = nextId("cp", state.controlPoints.map((c) => c.id));
  const sig = (facing: SignalFacing): EditorCpSignal => ({
    id: `${cpId}-${facing}`,
    pos,
    track: MAIN_TRACK_ID,
    facing,
    side: facing === "AtoB" ? "above" : "below",
  });
  const controlPoint: EditorControlPoint = {
    id: cpId,
    name: "End of Double Track",
    turnouts: [swId],
    signals: [sig("AtoB"), sig("BtoA")],
  };
  return { turnout, controlPoint };
}

/** Attach manual pose overrides (#175 phase 1b) to endplates by id. */
function withPoses(
  endplates: SchematicEndplate[],
  overrides: Record<string, { x: number; y: number; heading: number }>,
): SchematicEndplate[] {
  return endplates.map((e) =>
    overrides[e.id] ? { ...e, pose: overrides[e.id] } : e,
  );
}

/** Attach authored endplate face widths by id; a non-positive/absent width is
 * left off so it falls back to the recommended default. */
function withWidths(
  endplates: SchematicEndplate[],
  widths: Record<string, number>,
): SchematicEndplate[] {
  return endplates.map((e) => {
    const w = widths[e.id];
    return typeof w === "number" && w > 0 ? { ...e, widthInches: w } : e;
  });
}

/** Assemble a spec-conformant doc from the editor state. */
export function stateToDoc(
  state: EditorState,
  recordNumber: string,
): ModuleSchematicDoc {
  return {
    version: 1,
    module: recordNumber,
    lengthInches: state.lengthInches,
    ...(state.loop ? { loop: true } : {}),
    ...(state.loop && state.loopReturn === "main2" ? { loopReturn: "main2" as const } : {}),
    endplates: withWidths(
      withPoses(
      [
        ...(state.loop
          ? // Balloon loop: A is the entry. A standard endplate B on the balloon
            // makes it an INTERCHANGE (second route connects at the loop, e.g.
            // Seaford); configB "none" makes it a pure turnback.
            [
              { id: "A", label: "Entry", tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configA }] },
              ...(state.configB !== "none"
                ? [{ id: "B", label: "Interchange", tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configB }] }]
                : []),
            ]
          : [
              { id: "A", label: "West", tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configA }] },
              // Non-loop modules always have a real B ("none" never applies).
              {
                id: "B",
                label: "East",
                tracks: [
                  {
                    trackId: MAIN_TRACK_ID,
                    lane: 0,
                    config: state.configB === "none" ? "single" : state.configB,
                  },
                ],
              },
            ]),
        // Branch endplates C, D, … — junction connections at pos, off one side
        // (#170). A set can carry several (e.g. a second railroad through).
        ...state.branches.map((b, i) => ({
          id: String.fromCharCode(67 + i), // C, D, E…
          label: b.label || `Branch ${i + 1}`,
          tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: b.config }],
          at: { pos: b.pos, side: b.side },
        })),
      ],
      state.poseOverrides,
    ),
      state.endplateWidths,
    ),
    tracks: [
      state.loop
        ? // The main runs the lead from A and turns back at the balloon.
          { id: MAIN_TRACK_ID, role: "main" as const, lane: 0, fromPos: 0, toPos: state.lengthInches }
        : { id: MAIN_TRACK_ID, role: "main" as const, lane: 0, from: "A", to: "B" },
      // Double track: Main 2 is a real entity so turnouts/signals can attach.
      // On a loop it exists only for a Main 2 directional return (the U joins
      // the two lanes at the balloon); a same-main loop's parallel lead legs
      // are ONE main. On a TRANSITION module (one endplate single, the other
      // double) Main 2 only runs from the mainline turnout to the double end —
      // the turnout that diverges to main2 is the single source of truth for
      // where the transition sits (fd#175 / FMN-0038).
      ...(!state.loop && (state.configA === "double" || state.configB === "double")
        ? [main2Track(state)]
        : []),
      ...(state.loop && state.loopReturn === "main2"
        ? [{ id: MAIN2_TRACK_ID, role: "main" as const, lane: 1, fromPos: 0, toPos: state.lengthInches }]
        : []),
      ...state.extraTracks.map((t) => ({
        id: t.id,
        role: t.role,
        lane: t.lane,
        fromPos: t.fromPos,
        toPos: t.toPos,
        moduleTrackId: t.moduleTrackId,
        trackName: t.trackName || undefined,
        capacityFeet: Math.round(inchesToScaleFeet(Math.abs(t.toPos - t.fromPos))),
        ...(state.loop && t.inLoop ? { inLoop: true } : {}),
        ...(t.path && t.path.length >= 2 ? { path: t.path } : {}),
      })),
    ],
    turnouts: state.turnouts.map((t) => ({
      id: t.id,
      pos: t.pos,
      onTrack: t.onTrack,
      divergeTrack: t.divergeTrack,
      kind: t.kind,
      name: t.name || undefined,
      ...(t.size ? { size: t.size } : {}),
    })),
    ...(state.crossings.length > 0
      ? {
          crossings: state.crossings.map((x) => ({
            id: x.id,
            pos: x.pos,
            tracks: [x.trackA, x.trackB] as [string, string],
            name: x.name || undefined,
          })),
        }
      : {}),
    controlPoints: state.controlPoints.map((c) => ({
      id: c.id,
      name: c.name,
      turnouts: c.turnouts,
      ...(c.crossings?.length ? { crossings: c.crossings } : {}),
      signals: c.signals.map((s) => ({
        id: s.id,
        pos: s.pos,
        track: s.track,
        facing: s.facing,
        kind: "mast" as const,
        side: s.side,
      })),
    })),
    // Industries — car-spot spans on a track; only when any are authored.
    ...(state.industries.length > 0
      ? {
          industries: state.industries.map((ind) => ({
            id: ind.id,
            name: ind.name,
            ...(ind.type ? { type: ind.type } : {}),
            track: ind.track,
            fromPos: ind.fromPos,
            toPos: ind.toPos,
            side: ind.side,
            ...(ind.labelMode && ind.labelMode !== "none"
              ? { labelMode: ind.labelMode }
              : {}),
            ...(ind.carTypes.length ? { carTypes: ind.carTypes } : {}),
            moduleIndustryId: ind.moduleIndustryId,
          })),
        }
      : {}),
    // Benchwork footprint outline (module-local inches); only when it's a real
    // ring (≥ 3 vertices).
    ...(state.outline.length >= 3 ? { outline: state.outline } : {}),
    // Authored mainline path (module-local inches); only when it's a real path.
    ...(state.mainPath.length >= 2 ? { mainPath: state.mainPath } : {}),
  };
}

/**
 * Derive editor state from the doc and the module's Track section rows. Tracks
 * are the single source of truth for name/capacity (module_tracks), while the
 * schematic doc adds geometry (lane, positions). We merge: doc tracks first
 * (they carry geometry + their moduleTrackId link), then any module_tracks not
 * yet positioned in the schematic.
 */
export function docToState(
  doc: unknown,
  fallbackLength: number,
  moduleTracks: ModuleTrackRow[] = [],
): EditorState {
  const base = emptyEditorState(fallbackLength);
  const d =
    doc && typeof doc === "object" ? (doc as ModuleSchematicDoc) : null;
  const hasDoc = !!d && typeof d.lengthInches === "number" && Array.isArray(d.tracks);
  // The module's length is authoritative (the mainline is the module). If the
  // saved doc used a different length, rescale its feature positions to fit so
  // the mainline always reads as the module's true length.
  const len = fallbackLength > 0 ? fallbackLength : hasDoc ? d!.lengthInches! : 24;
  const docLen = hasDoc && d!.lengthInches! > 0 ? d!.lengthInches! : len;
  const scale = docLen > 0 ? len / docLen : 1;
  const sc = (p: number) => Math.round(p * scale);

  const nameOf = (id: number | null | undefined): string => {
    const mt = id != null ? moduleTracks.find((m) => m.id === id) : undefined;
    return mt?.track_name ?? "";
  };

  const extraTracks: EditorTrack[] = [];
  const usedMt = new Set<number>();
  if (hasDoc) {
    for (const t of d!.tracks) {
      if (t.role === "main") continue;
      const moduleTrackId = t.moduleTrackId ?? null;
      if (moduleTrackId != null) usedMt.add(moduleTrackId);
      extraTracks.push({
        id: t.id,
        role: (t.role as TrackRole) ?? "siding",
        lane: t.lane ?? 1,
        fromPos: sc(t.fromPos ?? 0),
        toPos: t.toPos != null ? sc(t.toPos) : len,
        moduleTrackId,
        trackName: t.trackName ?? nameOf(moduleTrackId),
        ...(t.inLoop ? { inLoop: true } : {}),
        // Authored path kept as-drawn (a physical shape, not rescaled with length).
        ...(trackPath(t.path) ? { path: trackPath(t.path)! } : {}),
      });
    }
  }
  // Link pre-migration doc tracks (no moduleTrackId yet) to unused module_tracks
  // by order — keeping the doc track's id so turnout/signal references stay
  // valid. Only after that do leftover module_tracks become new tracks.
  const unused = moduleTracks.filter((mt) => !usedMt.has(mt.id));
  let ui = 0;
  for (const et of extraTracks) {
    if (et.moduleTrackId == null && ui < unused.length) {
      const mt = unused[ui++];
      et.moduleTrackId = mt.id;
      if (!et.trackName) et.trackName = mt.track_name ?? "";
      usedMt.add(mt.id);
    }
  }
  let lane = Math.max(0, ...extraTracks.map((t) => t.lane));
  for (const mt of moduleTracks) {
    if (usedMt.has(mt.id)) continue;
    lane += 1;
    extraTracks.push({
      id: `mt${mt.id}`,
      role: "siding",
      lane,
      fromPos: Math.round(len * 0.2),
      toPos: Math.round(len * 0.8),
      moduleTrackId: mt.id,
      trackName: mt.track_name ?? "",
    });
  }

  if (!hasDoc) return { ...base, lengthInches: len, extraTracks };

  const configOf = (id: string): TrackConfig => {
    const ep = (d!.endplates ?? []).find((e) => e.id === id);
    return ep?.tracks?.[0]?.config === "double" ? "double" : "single";
  };
  const loop = isLoopDoc(d!);
  const hasB = (d!.endplates ?? []).some((e) => e.id === "B");
  // Branch endplates C, D, … (junction connections, #170).
  const branchEps = (d!.endplates ?? []).filter(
    (e) => e.id !== "A" && e.id !== "B" && e.at,
  );
  const poseOverrides = poseOverridesFromDoc(d!);
  // Authored endplate face widths by id (unscaled — a cross-track dimension,
  // not a position along the module).
  const endplateWidths: Record<string, number> = {};
  for (const e of d!.endplates ?? []) {
    if (typeof e.widthInches === "number" && e.widthInches > 0)
      endplateWidths[e.id] = e.widthInches;
  }
  // Benchwork outline — module-local inches, kept as authored (a physical board
  // shape, not rescaled with the mainline length); per-edge bulge preserved.
  const outline = (d!.outline ?? [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({
      x: p.x,
      y: p.y,
      ...(Number.isFinite(p.bulge) && p.bulge ? { bulge: p.bulge } : {}),
    }));
  // Authored mainline path — kept as drawn (a physical shape, not rescaled).
  const mainPath = trackPath(d!.mainPath) ?? [];
  return {
    lengthInches: len,
    loop,
    loopReturn: loop && d!.loopReturn === "main2" ? "main2" : "same",
    configA: configOf("A"),
    // On a loop, a missing B means pure turnback; present = interchange loop.
    configB: loop && !hasB ? "none" : configOf("B"),
    branches: branchEps.map((ep) => ({
      label: ep.label ?? "Branch",
      pos: sc(ep.at!.pos),
      side: ep.at!.side === "down" ? "down" : "up",
      config: ep.tracks?.[0]?.config === "double" ? "double" : "single",
    })),
    poseOverrides,
    endplateWidths,
    outline,
    mainPath,
    crossings: (d!.crossings ?? []).map((x) => ({
      id: x.id,
      name: x.name ?? "",
      pos: sc(x.pos),
      trackA: x.tracks?.[0] ?? MAIN_TRACK_ID,
      trackB: x.tracks?.[1] ?? MAIN_TRACK_ID,
    })),
    extraTracks,
    turnouts: (d!.turnouts ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? "",
      pos: sc(t.pos),
      onTrack: t.onTrack,
      divergeTrack: t.divergeTrack,
      kind: (t.kind as TurnoutKind) ?? "right",
      ...(t.size ? { size: t.size } : {}),
    })),
    controlPoints: readControlPoints(d!, sc),
    industries: (d!.industries ?? []).map((ind) => ({
      id: ind.id,
      name: ind.name ?? "",
      type: ind.type ?? "",
      track: ind.track,
      fromPos: sc(ind.fromPos ?? 0),
      toPos: ind.toPos != null ? sc(ind.toPos) : len,
      side: (ind.side as SignalSide) ?? "above",
      labelMode: (ind.labelMode as IndustryLabelMode) ?? "none",
      carTypes: Array.isArray(ind.carTypes) ? ind.carTypes : [],
      moduleIndustryId: ind.moduleIndustryId ?? null,
    })),
  };
}

/** Control points from a doc, migrating pre-grouping flat signals into groups. */
function readControlPoints(
  d: ModuleSchematicDoc,
  sc: (p: number) => number = (p) => p,
): EditorControlPoint[] {
  if (Array.isArray(d.controlPoints)) {
    return d.controlPoints.map((c) => ({
      id: c.id,
      name: c.name ?? "",
      turnouts: c.turnouts ?? [],
      ...(c.crossings?.length ? { crossings: c.crossings } : {}),
      signals: (c.signals ?? []).map((s) => ({
        id: s.id,
        pos: sc(s.pos),
        track: s.track ?? MAIN_TRACK_ID,
        facing: (s.facing as SignalFacing) ?? "AtoB",
        side: (s.side as SignalSide) ?? "above",
      })),
    }));
  }
  // Back-compat: group old flat signals by their turnout (or standalone).
  const groups = new Map<string, EditorControlPoint>();
  let n = 0;
  for (const s of d.signals ?? []) {
    const key = s.turnout || `blk-${s.id}`;
    let cp = groups.get(key);
    if (!cp) {
      cp = { id: `cp${++n}`, name: s.name ?? "", turnouts: s.turnout ? [s.turnout] : [], signals: [] };
      groups.set(key, cp);
    }
    cp.signals.push({
      id: s.id,
      pos: sc(s.pos),
      track: s.track ?? MAIN_TRACK_ID,
      facing: (s.facing as SignalFacing) ?? "AtoB",
      side: (s.side as SignalSide) ?? "above",
    });
  }
  return [...groups.values()];
}

/** Find an unused `${prefix}${n}` id given the ones already present. */
export function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Build a passing siding as one unit: the siding track, a switch at each end,
 * and control-point signals for both directions at each end (prototype Station
 * Entering Signal). Returns the new items to merge into the editor state.
 */
export function buildPassingSiding(state: EditorState): {
  track: EditorTrack;
  turnouts: EditorTurnout[];
  controlPoints: EditorControlPoint[];
} {
  const len = state.lengthInches > 0 ? state.lengthInches : 24;
  const inset = Math.max(6, Math.round(len * 0.08));
  const fromPos = inset;
  const toPos = Math.max(fromPos + 1, len - inset);
  // First free lane above the main(s): lane 1 is Main 2 on double modules.
  const baseLane =
    state.configA === "double" || state.configB === "double" ? 2 : 1;
  const lane = Math.max(baseLane, ...state.extraTracks.map((t) => t.lane + 1));

  const trackIds = [MAIN_TRACK_ID, ...state.extraTracks.map((t) => t.id)];
  const sidId = nextId("sid", trackIds);
  const track: EditorTrack = {
    id: sidId,
    role: "siding",
    lane,
    fromPos,
    toPos,
    moduleTrackId: null,
    trackName: "Passing siding",
  };

  const swIds = state.turnouts.map((t) => t.id);
  const swW = nextId("sw", swIds);
  const swE = nextId("sw", [...swIds, swW]);
  // A siding above the main throws LEFT at its west turnout (body runs east) and
  // RIGHT at its east turnout (body runs west) — both resolve to the same side,
  // so `kind` and the drawn lane agree (divergeSideForHand / #bug1).
  const turnouts: EditorTurnout[] = [
    { id: swW, name: "West Siding", pos: fromPos, onTrack: MAIN_TRACK_ID, divergeTrack: sidId, kind: "left" },
    { id: swE, name: "East Siding", pos: toPos, onTrack: MAIN_TRACK_ID, divergeTrack: sidId, kind: "right" },
  ];

  // One control point at each end, each grouping its switch and both-direction
  // signals on the main (prototype Station Entering Signal).
  const cpIds = state.controlPoints.map((c) => c.id);
  const cpW = nextId("cp", cpIds);
  const cpE = nextId("cp", [...cpIds, cpW]);
  const sig = (cpId: string, pos: number, facing: SignalFacing): EditorCpSignal => ({
    id: `${cpId}-${facing}`,
    pos,
    track: MAIN_TRACK_ID,
    facing,
    // opposite directions on opposite sides so they never overlap
    side: facing === "AtoB" ? "above" : "below",
  });
  const controlPoints: EditorControlPoint[] = [
    { id: cpW, name: "West Siding", turnouts: [swW], signals: [sig(cpW, fromPos, "AtoB"), sig(cpW, fromPos, "BtoA")] },
    { id: cpE, name: "East Siding", turnouts: [swE], signals: [sig(cpE, toPos, "AtoB"), sig(cpE, toPos, "BtoA")] },
  ];

  return { track, turnouts, controlPoints };
}

/**
 * Build a crossover as one unit: a short connector track between Main 1 and
 * Main 2, with a turnout on each main. The two turnouts sit on different lanes,
 * so the feature resolver draws it as a diagonal (not a lane-paralleling siding)
 * — this is what connects the two dots (#bug2). Needs a double-track module.
 */
export function buildCrossover(state: EditorState): {
  track: EditorTrack;
  turnouts: EditorTurnout[];
} | null {
  const hasSecond = state.configA === "double" || state.configB === "double";
  if (state.loop || !hasSecond) return null;
  const len = state.lengthInches > 0 ? state.lengthInches : 24;
  const mid = Math.round(len / 2);
  const gap = Math.max(3, Math.round(len * 0.04));
  const w = Math.round(mid - gap / 2);
  const e = Math.round(mid + gap / 2);

  const trackIds = [MAIN_TRACK_ID, MAIN2_TRACK_ID, ...state.extraTracks.map((t) => t.id)];
  const xoId = nextId("xo", trackIds);
  const track: EditorTrack = {
    id: xoId,
    role: "crossover",
    lane: 1,
    fromPos: w,
    toPos: e,
    moduleTrackId: null,
    trackName: "Crossover",
  };

  const swIds = state.turnouts.map((t) => t.id);
  const sw1 = nextId("sw", swIds);
  const sw2 = nextId("sw", [...swIds, sw1]);
  const turnouts: EditorTurnout[] = [
    { id: sw1, name: "Crossover", pos: w, onTrack: MAIN_TRACK_ID, divergeTrack: xoId, kind: "left" },
    { id: sw2, name: "Crossover", pos: e, onTrack: MAIN2_TRACK_ID, divergeTrack: xoId, kind: "right" },
  ];

  return { track, turnouts };
}

// ---- Pure feature resolver (both renderers draw these) --------------------

export interface DrawTrack {
  id: string;
  role: TrackRole;
  lane: number;
  fromFrac: number;
  toFrac: number;
  capacityFeet: number | null;
  /** Lane of the main this track diverges from (via its turnout) — the origin
   * of the diverge diagonal. A spur off Main 2 starts at lane 1, not lane 0;
   * without this, renderers draw what looks like a crossover. */
  divergesFromLane: number;
  /** The end that meets the main at its turnout (throat) and the far stub end,
   * as fractions of length. Direction-preserving: unlike fromFrac/toFrac (always
   * sorted West→East), these keep WHICH end joins, so an east-facing spur draws
   * its throat on the east. A siding meets the main at both ends — there
   * throat=fromFrac, stub=toFrac (the fields are only meaningful for spurs). */
  throatFrac: number;
  stubFrac: number;
  /** Inside the balloon of a loop module (#165). */
  inLoop: boolean;
}
export interface DrawTurnout {
  id: string;
  name: string;
  posFrac: number;
  onLane: number;
  divergeLane: number;
}
export interface DrawSignal {
  id: string;
  name: string;
  posFrac: number;
  lane: number;
  facing: SignalFacing;
  side: SignalSide;
  /** Owning control point's id, when the signal came from a CP group — lets a
   * renderer join the drawn signal back to interlocking-level state (aspects). */
  cp?: string;
  /** 0-based rank among signals that would otherwise land on the exact same
   * spot (same lane + side + position). Renderers offset each further from the
   * track by `stack` so a control point's signals never overlap. */
  stack: number;
}
/** A grade crossing / diamond — draw an X spanning the two lanes (#170). */
export interface DrawCrossing {
  id: string;
  name: string;
  posFrac: number;
  laneA: number;
  laneB: number;
}
/** A crossover — a connector track joining two parallel mains through a turnout
 * on each. Draw a straight diagonal between the two turnout points (unlike a
 * siding, which parallels a lane between its turnouts). Detected structurally:
 * a track whose turnouts sit on two different lanes. */
export interface DrawCrossover {
  id: string;
  name: string;
  fromPosFrac: number;
  fromLane: number;
  toPosFrac: number;
  toLane: number;
}
/** A branch endplate — draw a connector stub + arrow + label off the given
 * side (the CATS/US&S off-band idiom, #170). */
export interface BranchConnector {
  id: string;
  label: string;
  posFrac: number;
  side: "up" | "down";
}
/** An industry — draw a car-spot span beside its track's lane, on `side`, with
 * a name label + an optional car/length readout (#industries). */
export interface DrawIndustry {
  id: string;
  name: string;
  type: string | null;
  /** Span as fractions of module length (sorted West→East). */
  fromFrac: number;
  toFrac: number;
  /** Lane of the track it spots on, so it draws beside the right track. */
  lane: number;
  side: SignalSide;
  labelMode: IndustryLabelMode;
  /** Cars that spot here, derived from the drawn span length. */
  cars: number;
  carTypes: string[];
}
export interface ModuleFeatures {
  /** Whether either endplate declares a double-track main. */
  doubleMain: boolean;
  /** Balloon loop — draw a terminal bulb at the far end. */
  loop: boolean;
  /** Loop with a standard endplate B on the balloon: an interchange — a
   * second route connects at the loop (draw an endplate branch off the bulb). */
  loopInterchange: boolean;
  /** Where the balloon returns: "main2" = directional return on a double-track
   * main — draw a U joining lanes 0 and 1 instead of the bulb (#165). */
  loopReturn: "same" | "main2";
  /** Rendering override from the doc; renderers may ignore modes they don't
   * implement yet ("geometric"). */
  loopRender: "bulb" | "fan" | "geometric" | null;
  /** Non-main tracks (sidings/spurs/yard/crossover). */
  extraTracks: DrawTrack[];
  turnouts: DrawTurnout[];
  signals: DrawSignal[];
  /** Grade crossings / diamonds (#170). */
  crossings: DrawCrossing[];
  /** Crossovers — connector tracks between two mains (drawn as a diagonal). */
  crossovers: DrawCrossover[];
  /** Branch endplates — junction connectors off the module (#170). */
  branchConnectors: BranchConnector[];
  /** Rail-served industries — car-spot spans beside their track (#industries). */
  industries: DrawIndustry[];
  /** Main 2's extent when it doesn't run the full module — a single↔double
   * transition (Main 2 starts/ends at the mainline turnout). Null = full
   * length (or no Main 2). Renderers draw the partial line + its diverge. */
  main2Extent: { fromFrac: number; toFrac: number } | null;
  /** Single↔double transition, fully described (#FMN-0043). The `through` main
   * runs the whole module; the `branch` main exists only on the double side and
   * merges at `atFrac`. EITHER main can be through/branch — the surviving single
   * track follows the transition turnout's onTrack, so the drawn side isn't
   * hard-wired to Main 1. Null when not a transition. */
  transition: {
    throughLane: number;
    branchLane: number;
    atFrac: number;
    doubleSide: "west" | "east";
  } | null;
  /** Lane extents across every feature (mains included; negative = outside
   * Main 1). Renderers size their vertical space from these. */
  laneMin: number;
  laneMax: number;
}

/**
 * Which side of the main a diverging track draws on, given the turnout's HAND
 * and the direction the track body runs along the main from the turnout
 * (`stubDir`: +1 = the body extends east / toward B, −1 = west / toward A).
 * Returns +1 (above the main) or −1 (below); 0 for a wye or unset hand (keep the
 * authored side). A left-hand turnout throws its route to the same side its body
 * runs (facing the frog, left is the inside of a body running that way); a
 * right-hand throws to the opposite side. `kind` is the source of truth for the
 * drawn side (#bug1) — the stored lane's sign is reconciled to match it.
 */
export function divergeSideForHand(
  kind: TurnoutKind | undefined,
  stubDir: number,
): -1 | 0 | 1 {
  if (kind !== "left" && kind !== "right") return 0; // wye / unset → no change
  const s = stubDir >= 0 ? 1 : -1;
  return kind === "left" ? (s as 1 | -1) : ((-s) as 1 | -1);
}

/**
 * Resolve a schematic doc into positioned drawables. `pos` (inches) becomes a
 * fraction of the module length; endplate A = 0, B = length; turnouts sit at
 * their pos. Tracks may carry explicit fromPos/toPos (overriding node lookup).
 * To-scale: a feature renders at its true position, clamped only to the
 * module's own extent — so signals near an end read at their real spot, not
 * bunched at an inset (#122).
 */
export function moduleFeatures(doc: ModuleSchematicDoc): ModuleFeatures {
  const len =
    doc.lengthInches && doc.lengthInches > 0
      ? doc.lengthInches
      : Math.max(
          1,
          ...doc.tracks.map((t) => Math.max(t.fromPos ?? 0, t.toPos ?? 0)),
          ...(doc.turnouts ?? []).map((t) => t.pos),
        );
  const clampFrac = (p: number) => Math.min(1, Math.max(0, p / len));

  const trackLane = new Map<string, number>();
  for (const t of doc.tracks) trackLane.set(t.id, t.lane);

  // Endplate positions: first endplate = West (0), the rest = East (len).
  const endplatePos = new Map<string, number>();
  doc.endplates.forEach((e, i) => endplatePos.set(e.id, i === 0 ? 0 : len));
  const turnoutPos = new Map<string, number>();
  for (const t of doc.turnouts ?? []) turnoutPos.set(t.id, t.pos);
  const posOf = (nodeId?: string): number | null => {
    if (nodeId == null) return null;
    if (endplatePos.has(nodeId)) return endplatePos.get(nodeId)!;
    if (turnoutPos.has(nodeId)) return turnoutPos.get(nodeId)!;
    return null;
  };

  const doubleMain = doc.endplates.some((e) =>
    e.tracks?.some((t) => t.config === "double"),
  );

  // The lane a track diverges from = the main its turnout sits on.
  const divergeOrigin = (trackId: string): number => {
    const sw = (doc.turnouts ?? []).find((t) => t.divergeTrack === trackId);
    return sw ? (trackLane.get(sw.onTrack) ?? 0) : 0;
  };

  // Turnouts grouped by the track they diverge onto (a track's throat/hand).
  const turnoutsByTrack = new Map<string, SchematicTurnout[]>();
  for (const sw of doc.turnouts ?? []) {
    const arr = turnoutsByTrack.get(sw.divergeTrack) ?? [];
    arr.push(sw);
    turnoutsByTrack.set(sw.divergeTrack, arr);
  }
  // A crossover is a connector whose turnouts sit on two different lanes (one on
  // each main) — drawn as a diagonal between them, never as a lane-paralleling
  // siding. A passing siding's two turnouts share one lane, so it isn't one.
  const isCrossover = (trackId: string): boolean => {
    const sws = turnoutsByTrack.get(trackId) ?? [];
    if (sws.length < 2) return false;
    return new Set(sws.map((s) => trackLane.get(s.onTrack) ?? 0)).size >= 2;
  };
  // The in-inches extent of a track (explicit fromPos/toPos or node lookup).
  const extentOf = (t: SchematicTrack): [number, number] | null => {
    const from = t.fromPos ?? posOf(t.from);
    const to = t.toPos ?? posOf(t.to);
    return from == null || to == null ? null : [from, to];
  };

  // Reconcile each diverging track's drawn SIDE from its turnout's hand — `kind`
  // is the source of truth (#bug1) — resolved TOPOLOGICALLY. The hand only picks
  // a side for a turnout sitting on the main CENTERLINE (lane 0); a track
  // diverging off any other track (Main 2, or a ladder rung) stays on its
  // PARENT's side and stacks outward — a ladder turnout's hand is relative to
  // its parent, not the main, so it must never flip a rung across the main. The
  // stored lane's magnitude (stacking slot) is always kept.
  const trackById = new Map(doc.tracks.map((t) => [t.id, t]));
  const resolvedLanes = new Map<string, number>();
  const resolving = new Set<string>();
  const resolveLane = (id: string): number => {
    const trk = trackById.get(id);
    if (!trk) return 0;
    if (trk.role === "main") return trk.lane; // mains are fixed (0, 1, …)
    if (resolvedLanes.has(id)) return resolvedLanes.get(id)!;
    if (resolving.has(id)) return trk.lane; // cycle guard
    resolving.add(id);
    let lane = trk.lane;
    const sw = turnoutsByTrack.get(id)?.[0];
    const ext = extentOf(trk);
    if (sw && (sw.kind === "left" || sw.kind === "right") && !isCrossover(id) && ext) {
      const parentLane = resolveLane(sw.onTrack);
      let sign: number;
      if (parentLane === 0) {
        // On the main centerline — the hand chooses above/below.
        const [from, to] = ext;
        const far = Math.abs(to - sw.pos) >= Math.abs(from - sw.pos) ? to : from;
        const s = divergeSideForHand(sw.kind, far - sw.pos);
        sign = s !== 0 ? s : Math.sign(trk.lane) || 1;
      } else {
        // Off Main 2 / a ladder rung — follow the parent's side.
        sign = Math.sign(parentLane) || 1;
      }
      lane = sign * Math.abs(trk.lane);
    }
    resolving.delete(id);
    resolvedLanes.set(id, lane);
    return lane;
  };
  for (const t of doc.tracks) {
    if (t.role === "main") continue;
    trackLane.set(t.id, resolveLane(t.id));
  }

  const extraTracks: DrawTrack[] = [];
  for (const t of doc.tracks) {
    if (t.role === "main") continue; // the spine draws mains
    if (isCrossover(t.id)) continue; // crossovers draw as diagonals, below
    const ext = extentOf(t);
    if (!ext) continue; // can't place it
    const [from, to] = ext;
    // Throat = the end nearest this track's turnout (the join to the main);
    // with no turnout, keep entry order (from = throat) so the author's chosen
    // joining end is honoured. This is what makes an east-facing spur draw its
    // throat on the east instead of always west (#bug3).
    const sw = turnoutsByTrack.get(t.id)?.[0];
    const throatAtTo = sw != null && Math.abs(to - sw.pos) < Math.abs(from - sw.pos);
    const throat = throatAtTo ? to : from;
    const stub = throatAtTo ? from : to;
    extraTracks.push({
      id: t.id,
      role: t.role,
      lane: trackLane.get(t.id) ?? t.lane,
      fromFrac: clampFrac(Math.min(from, to)),
      toFrac: clampFrac(Math.max(from, to)),
      throatFrac: clampFrac(throat),
      stubFrac: clampFrac(stub),
      capacityFeet: t.capacityFeet ?? null,
      divergesFromLane: divergeOrigin(t.id),
      inLoop: t.inLoop === true,
    });
  }

  // Crossovers — a diagonal between two parallel mains. Two shapes are drawn:
  const crossovers: DrawCrossover[] = [];
  // (1) a dedicated connector track (buildCrossover) with a turnout on each main.
  for (const t of doc.tracks) {
    if (!isCrossover(t.id)) continue;
    const [s1, s2] = turnoutsByTrack.get(t.id)!;
    crossovers.push({
      id: t.id,
      name: t.trackName ?? "",
      fromPosFrac: clampFrac(s1.pos),
      fromLane: trackLane.get(s1.onTrack) ?? 0,
      toPosFrac: clampFrac(s2.pos),
      toLane: trackLane.get(s2.onTrack) ?? 1,
    });
  }
  // (2) modelled as two turnouts each diverging onto the OTHER main (no connector
  // track). Pair a leg with its return leg and connect the two turnout points.
  // A single↔double TRANSITION turnout also connects the two mains but isn't a
  // crossover (Main 2 ends there) — exclude it, and require a matching return
  // leg so a lone main-to-main turnout is never drawn as a crossover.
  const isMainId = (id?: string) => !!id && trackById.get(id)?.role === "main";
  const epDouble = (id: string) =>
    (doc.endplates.find((e) => e.id === id)?.tracks ?? []).some(
      (t) => t.config === "double",
    );
  const aDbl = epDouble("A");
  const bDbl = epDouble("B");
  const transitionSw =
    aDbl !== bDbl ? (doc.turnouts ?? []).find(isTransitionTurnout) : undefined;
  const m2m = (doc.turnouts ?? []).filter(
    (sw) =>
      sw !== transitionSw &&
      isMainId(sw.onTrack) &&
      isMainId(sw.divergeTrack) &&
      (trackLane.get(sw.onTrack) ?? 0) !== (trackLane.get(sw.divergeTrack) ?? 1),
  );
  const usedLegs = new Set<string>();
  for (const t1 of m2m) {
    if (usedLegs.has(t1.id)) continue;
    const t2 = m2m.find(
      (x) =>
        !usedLegs.has(x.id) &&
        x.id !== t1.id &&
        x.onTrack === t1.divergeTrack &&
        x.divergeTrack === t1.onTrack,
    );
    if (!t2) continue; // lone leg → a transition/junction, not a crossover
    usedLegs.add(t1.id);
    usedLegs.add(t2.id);
    crossovers.push({
      id: `${t1.id}-${t2.id}`,
      name: t1.name ?? t2.name ?? "",
      fromPosFrac: clampFrac(t1.pos),
      fromLane: trackLane.get(t1.onTrack) ?? 0,
      toPosFrac: clampFrac(t2.pos),
      toLane: trackLane.get(t2.onTrack) ?? 1,
    });
  }

  const turnouts: DrawTurnout[] = (doc.turnouts ?? []).map((t) => ({
    id: t.id,
    name: t.name ?? "",
    posFrac: clampFrac(t.pos),
    onLane: trackLane.get(t.onTrack) ?? 0,
    divergeLane: trackLane.get(t.divergeTrack) ?? 1,
  }));

  const drawSignal = (
    s: SchematicSignal,
    name: string,
    cp?: string,
  ): DrawSignal => ({
    id: s.id,
    name,
    posFrac: clampFrac(s.pos),
    lane: s.track ? (trackLane.get(s.track) ?? 0) : 0,
    facing: (s.facing as SignalFacing) ?? "AtoB",
    side: s.side === "below" ? "below" : "above",
    ...(cp ? { cp } : {}),
    stack: 0,
  });
  // Signals come from control-point groups; fall back to pre-grouping flat
  // signals for docs authored before the model changed.
  const signals: DrawSignal[] = Array.isArray(doc.controlPoints)
    ? doc.controlPoints.flatMap((c) =>
        (c.signals ?? []).map((s) => drawSignal(s, c.name ?? "", c.id)),
      )
    : (doc.signals ?? []).map((s) => drawSignal(s, s.name ?? ""));
  // De-collide: signals landing on the exact same lane+side+position get a
  // rising stack rank so a renderer can fan them out (a control point often
  // carries several signals at one interlocking).
  const stackCount = new Map<string, number>();
  for (const s of signals) {
    const key = `${s.lane}|${s.side}|${Math.round(s.posFrac * 1000)}`;
    const n = stackCount.get(key) ?? 0;
    s.stack = n;
    stackCount.set(key, n + 1);
  }

  const crossings: DrawCrossing[] = (doc.crossings ?? []).map((x) => ({
    id: x.id,
    name: x.name ?? "",
    posFrac: clampFrac(x.pos),
    laneA: trackLane.get(x.tracks?.[0] ?? "") ?? 0,
    laneB: trackLane.get(x.tracks?.[1] ?? "") ?? 1,
  }));

  // Branch endplates (any beyond A/B with a placement) → connector arrows.
  const branchConnectors: BranchConnector[] = doc.endplates
    .filter((e) => e.id !== "A" && e.id !== "B" && e.at)
    .map((e) => ({
      id: e.id,
      label: e.label ?? e.id,
      posFrac: clampFrac(e.at!.pos),
      side: e.at!.side === "down" ? "down" : "up",
    }));

  // Industries — car-spot spans beside the track they serve.
  const industries: DrawIndustry[] = (doc.industries ?? []).map((ind) => {
    const from = ind.fromPos ?? 0;
    const to = ind.toPos ?? len;
    return {
      id: ind.id,
      name: ind.name ?? "",
      type: ind.type ?? null,
      fromFrac: clampFrac(Math.min(from, to)),
      toFrac: clampFrac(Math.max(from, to)),
      lane: trackLane.get(ind.track) ?? 0,
      side: (ind.side as SignalSide) ?? "above",
      labelMode: (ind.labelMode as IndustryLabelMode) ?? "none",
      cars: carCapacity(from, to),
      carTypes: Array.isArray(ind.carTypes) ? ind.carTypes : [],
    };
  });

  const allLanes = [
    0,
    doubleMain ? 1 : 0,
    ...extraTracks.map((t) => t.lane),
    ...signals.map((s) => s.lane),
    ...crossings.flatMap((x) => [x.laneA, x.laneB]),
    ...crossovers.flatMap((x) => [x.fromLane, x.toLane]),
  ];
  const loop = isLoopDoc(doc);
  // A positioned Main 2 = a transition module (partial second main).
  const main2 = doc.tracks.find((t) => t.id === MAIN2_TRACK_ID);
  const main2Positioned =
    !!main2 && (main2.fromPos != null || main2.toPos != null) && !loop;
  let main2Extent: { fromFrac: number; toFrac: number } | null = null;
  if (main2Positioned) {
    main2Extent = {
      fromFrac: clampFrac(main2!.fromPos ?? 0),
      toFrac: clampFrac(main2!.toPos ?? len),
    };
  } else if (
    main2 &&
    transitionSw &&
    transitionSw.divergeTrack === MAIN2_TRACK_ID &&
    !loop
  ) {
    // Main 2 is the branch but stored full-length — derive its extent from the
    // junction. (When Main 2 is the through main, it stays full: extent null.)
    main2Extent = aDbl
      ? { fromFrac: 0, toFrac: clampFrac(transitionSw.pos) } // double at west
      : { fromFrac: clampFrac(transitionSw.pos), toFrac: 1 }; // double at east
  }
  // Full transition descriptor: the surviving (through) main follows the
  // turnout's onTrack, so either main can be the one that ends (#FMN-0043).
  const transition =
    transitionSw && aDbl !== bDbl && !loop
      ? {
          throughLane: trackLane.get(transitionSw.onTrack) ?? 0,
          branchLane: trackLane.get(transitionSw.divergeTrack) ?? 1,
          atFrac: clampFrac(transitionSw.pos),
          doubleSide: (aDbl ? "west" : "east") as "west" | "east",
        }
      : null;
  return {
    doubleMain,
    loop,
    main2Extent,
    transition,
    loopInterchange: loop && doc.endplates.filter((e) => !e.at).length >= 2,
    loopReturn: loop && doc.loopReturn === "main2" ? "main2" : "same",
    loopRender: loop ? (doc.loopRender ?? null) : null,
    extraTracks,
    turnouts,
    signals,
    crossings,
    crossovers,
    branchConnectors,
    industries,
    laneMin: Math.min(...allLanes),
    laneMax: Math.max(...allLanes),
  };
}

// ---- Endplate geometry & poses (#175) --------------------------------------
//
// Free-moN endplates are one standard interface; a single (x, y, heading) at
// the track-crossing point fully determines mating (any endplate ↔ any
// compatible endplate). Poses are in MODULE-LOCAL inches: endplate A's track
// point at the origin, its OUTWARD normal pointing west (180°), so the module
// body runs toward +X. A layout composes modules by walking joins and stacking
// each pose's rigid transform (rotation + optional reflection for flips).
//
// Poses are DERIVED from the simple fields owners already enter — length +
// geometry type/degrees/offset for the two axial endplates, plus the schematic
// doc's branch endplates (#170). Complex shapes (wye, loop, other) fall back to
// hand-entered overrides. Nothing is stored unless overridden.

export type GeometryType =
  | "straight"
  | "corner_45"
  | "corner_90"
  | "curve"
  | "offset"
  | "dead_end"
  | "wye"
  | "other";

export interface EndplatePose {
  /** Endplate id — "A"/"B" axial, "C"/"D"… branch. */
  id: string;
  /** Module-local inches; endplate A's track point is the origin. */
  x: number;
  y: number;
  /** Outward normal in degrees (0 = +X east, 90 = +Y north). A neighbour mates
   * facing the opposite heading. */
  heading: number;
  trackConfig: "single" | "double";
  /** Lateral track offsets from the crossing anchor (0 = centred single). */
  trackOffsets: number[];
  /** True when the pose was hand-entered, not derived (wye/loop/other). */
  manual?: boolean;
}

export interface ModuleGeometryInput {
  lengthInches: number;
  geometryType?: string | null;
  geometryDegrees?: number | null;
  geometryOffsetInches?: number | null;
  /** Axial endplate configs (A first, then B). Missing → single. */
  endplateConfigs?: ("single" | "double" | null | undefined)[];
  /** Branch endplates (from the schematic doc, #170), positioned along the
   * mainline axis. */
  branches?: {
    id: string;
    atPos: number;
    side: "up" | "down";
    config?: "single" | "double" | null;
  }[];
  /** Hand-entered pose overrides by endplate id — win over derivation. */
  poseOverrides?: Record<string, { x: number; y: number; heading: number }>;
  /** Half the spacing between the two tracks of a double endplate (Free-mo ≈ 1",
   * Free-moN ≈ 9/16"). */
  trackHalfSpacingInches?: number;
}

/** Signed turn a module applies to the through track (CCW/left positive). */
export function geometryTurnDegrees(
  geometryType?: string | null,
  geometryDegrees?: number | null,
): number {
  switch (geometryType) {
    case "corner_45":
      return 45;
    case "corner_90":
      return 90;
    case "curve":
      return geometryDegrees ?? 0;
    default:
      return 0;
  }
}

const DEG = Math.PI / 180;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

function offsetsFor(
  config: "single" | "double",
  half: number,
): number[] {
  return config === "double" ? [-half, half] : [0];
}

/**
 * Derive every endplate's module-local pose. A at the origin facing west; B
 * placed by the module's geometry (straight/offset/corner/curve via a
 * constant-radius arc = arc-length `lengthInches`, turning by the geometry
 * angle); branch endplates positioned along the mainline axis facing out their
 * side. A `dead_end`/loop module has no B. Overrides replace any derived pose.
 */
export function deriveEndplatePoses(geo: ModuleGeometryInput): EndplatePose[] {
  const L = geo.lengthInches > 0 ? geo.lengthInches : 24;
  const half = geo.trackHalfSpacingInches ?? 1;
  const cfg = (i: number): "single" | "double" =>
    geo.endplateConfigs?.[i] === "double" ? "double" : "single";
  const withOverride = (p: EndplatePose): EndplatePose => {
    const o = geo.poseOverrides?.[p.id];
    return o ? { ...p, x: o.x, y: o.y, heading: norm360(o.heading), manual: true } : p;
  };

  const poses: EndplatePose[] = [];

  // Endplate A — origin, outward normal west.
  poses.push(
    withOverride({
      id: "A",
      x: 0,
      y: 0,
      heading: 180,
      trackConfig: cfg(0),
      trackOffsets: offsetsFor(cfg(0), half),
    }),
  );

  // Endplate B — unless the module is a dead end / turnback (single endplate).
  const noB = geo.geometryType === "dead_end";
  if (!noB) {
    const turn = geometryTurnDegrees(geo.geometryType, geo.geometryDegrees);
    let bx: number;
    let by: number;
    let bHeading: number;
    if (geo.geometryType === "offset") {
      // Parallel endplates, jogged sideways over the run.
      bx = L;
      by = geo.geometryOffsetInches ?? 0;
      bHeading = 0;
    } else if (turn === 0) {
      bx = L;
      by = 0;
      bHeading = 0;
    } else {
      // Constant-radius arc of arc-length L turning `turn` (CCW/left).
      const t = turn * DEG;
      const r = L / t;
      bx = r * Math.sin(t);
      by = r * (1 - Math.cos(t));
      bHeading = turn;
    }
    poses.push(
      withOverride({
        id: "B",
        x: bx,
        y: by,
        heading: norm360(bHeading),
        trackConfig: cfg(1),
        trackOffsets: offsetsFor(cfg(1), half),
      }),
    );
  }

  // Branch endplates — at their along-axis position, facing out their side.
  // Position along the (possibly curved) mainline is approximated on the A→B
  // chord; the join solver refines with overrides where a module needs it.
  for (const b of geo.branches ?? []) {
    const frac = L > 0 ? Math.min(1, Math.max(0, b.atPos / L)) : 0;
    const px = frac * L;
    const config = b.config === "double" ? "double" : "single";
    poses.push(
      withOverride({
        id: b.id,
        x: px,
        y: 0,
        heading: b.side === "down" ? 270 : 90,
        trackConfig: config,
        trackOffsets: offsetsFor(config, half),
      }),
    );
  }

  return poses;
}

/** Whether a module shape's poses are fully derivable, or need manual entry
 * (a helpful cue for the authoring UI). */
export function poseNeedsManual(geometryType?: string | null): boolean {
  return geometryType === "wye" || geometryType === "other";
}

/** Extract manual pose overrides from a schematic doc's endplates (#175 phase
 * 1b) — the map deriveEndplatePoses / a footprint solver feeds as overrides. */
export function poseOverridesFromDoc(
  doc: ModuleSchematicDoc,
): Record<string, { x: number; y: number; heading: number }> {
  const out: Record<string, { x: number; y: number; heading: number }> = {};
  for (const e of doc.endplates ?? []) {
    if (
      e.id &&
      e.pose &&
      typeof e.pose.x === "number" &&
      typeof e.pose.y === "number" &&
      typeof e.pose.heading === "number"
    ) {
      out[e.id] = { x: e.pose.x, y: e.pose.y, heading: e.pose.heading };
    }
  }
  return out;
}
