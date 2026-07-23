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
export type TrackRole = "main" | "siding" | "spur" | "yard" | "crossover" | "branch";
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
  /** Where this end's PRIMARY track (Main 1) crosses, as a signed distance from
   * the plate's CENTRE in inches — the standard's own framing ("each track
   * 0.5625 inches from the center of the endplate"). §2.0 requires only that
   * every track stay ≥4″ from either fascia; centring is a recommendation the
   * 20220628 revision relaxed, so an offset is legal — a transition SECTION
   * commonly offsets its single-track end so the through main lines up with one
   * of the two tracks at its double end. Absent = the recommended default
   * (single centred; double straddling at ∓ half the track spacing). */
  trackOffsetInches?: number | null;
  /** Branch endplates (#170) only — what the route reaching this endplate IS:
   * a secondary "branch" line, or a "main" (a diverging / split main). Drives
   * labels + drawn weight, not geometry. Absent = "branch". */
  kind?: "branch" | "main" | null;
  /** Branch endplates only — the id of the drawn diverging track that reaches
   * this endplate (its authored path ends at the plate face). Lets remove/
   * round-trip pair the endplate with its track. Absent = not yet connected. */
  trackId?: string | null;
}

/** Free-moN endplate face width, inches — the connection interface size. */
export const FREEMO_ENDPLATE_WIDTH_MIN_INCHES = 12;
/** NB: our own default, NOT from the standard — §1.1 states only the 12″ minimum
 * ("Endplates shall be 6 inches high and a minimum 12 inches wide"). 24″ is
 * simply a common real-world width. Don't present it as required. */
export const FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES = 24;
/** Free-moN §2.0 **standard**: "Double track endplates must have a track spacing
 * of 1.125 inches (1 1/8 inches). Track spacing shall be measured along the
 * track center line." The one definition both apps read. */
export const FREEMO_TRACK_SPACING_INCHES = 1.125;
/** Free-moN §2.0 **standard**: track crossing an endplate must be "not less than
 * 4 inches from either fascia" (and perpendicular, straight and level for 4″). */
export const FREEMO_ENDPLATE_TRACK_FASCIA_CLEARANCE_INCHES = 4;

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
  /** A curved turnout — the diverging route bows into an arc (both routes curve
   * the same way) instead of leaving as a straight diagonal. Physical-render
   * only; the operations view stays topological. */
  curved?: boolean | null;
  /** Rotate the turnout 180° — the points face the other way along the track.
   * HAND is which turnout you own; how it's INSTALLED is a separate choice, and
   * the drawn orientation can't always be inferred from where the diverging
   * track happens to run. A siding at the far end of a module is the case that
   * forces it: the body has nowhere to go but back toward the module, so the
   * derived facing comes out backwards. */
  flipped?: boolean | null;
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
/** One car-spot span of an industry on a track — an industry may have several
 * (a house track serving one customer across multiple spot tracks, #54). */
export interface IndustrySpot {
  track: string;
  fromPos: number;
  toPos: number;
  side?: SignalSide;
}

export interface SchematicIndustry {
  id: string;
  name: string;
  /** Industry type value from the lookup (e.g. "team_track", "grain"). */
  type?: string | null;
  /** The primary track this industry spots cars on (a spur/siding id or main).
   * Additional spots (other tracks) live in `spots`. */
  track: string;
  /** The primary car-spot span along `track`, inches from endplate A. */
  fromPos: number;
  toPos: number;
  /** Extra car-spot spans on other tracks — the industry's house-track spots. */
  spots?: IndustrySpot[];
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
  /** The two mains' positions are swapped: Main 1 draws above (lane 1), Main 2
   * on the centre line (lane 0). Absent/false = the default (Main 1 below).
   * Identities are unchanged — only which lane each is drawn in (#FMN-0043). */
  mainsSwapped?: boolean;
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
  /** Internal section joints — inches from endplate A where the module's boards
   * split into sections. Operationally one unit; these mark construction/transport
   * seams (exempt from the end-interface standards). Empty/absent = one section.
   * Describes only sections that are full-depth SLICES; a section with a shape
   * of its own lives in `sections` below. */
  sectionBreaks?: number[];
  /** The module's sections as real objects — named, each with a bench-work
   * outline of its own (#96 phase 2). A module is a kit: the same sections can
   * be set up in different combinations, so its footprint is the UNION of the
   * sections present rather than an independently authored shape.
   *
   * Needed because sections are not slices. Real modules hang a deep section
   * off the BACK of a shallow main band — a peninsula carrying an industry —
   * which no single position along the main can describe.
   *
   * Absent = the module keeps using its own `outline` exactly as before; this
   * is purely additive and nothing migrates on read. */
  sections?: SchematicSection[];
  /** @deprecated pre-grouping flat signals; read for back-compat. */
  signals?: SchematicSignal[];
  /** Authored mainline centre-line (module-local inches, open path with arcs).
   * Present = the owner drew the real shape; absent = derive from geometry.
   * Physical view only — the operations view stays derived (#2d-track). */
  mainPath?: BenchworkPoint[] | null;
  /** Authored centre-line for MAIN 2 on a double-track module (module-local
   * inches, open path with arcs). Present = the owner bent Main 2 to its real
   * shape; absent = derive it as a lane offset from Main 1. Physical view only
   * (#131). */
  main2Path?: BenchworkPoint[] | null;
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

/** NB: a module has NO compass direction of its own, deliberately. It has ends
 * A and B. Direction is a property of the LAYOUT — the same board can be
 * installed running either way round, or on either axis, so a compass label
 * stored here could only ever contradict the layout that placed it. Railroads
 * do the same thing with timetable direction: the railroad declares which way
 * is "east", not any one piece of track. Free-Dispatcher owns direction. */

/** One bench-work section of a module (#96 phase 2). */
export interface SectionFootprint {
  id: string;
  name?: string;
  outline: { x: number; y: number }[];
  /** True when this shape is DERIVED from the section's span rather than
   * authored — a derived outline follows the board when it's resized, an
   * authored one stays exactly as drawn (#96 phase 2b). */
  derived: boolean;
}

export interface SchematicSection {
  id: string;
  /** What the owner calls this board — "west transition", "double #3". */
  name?: string | null;
  /** This section's own footprint polygon, module-local inches, same frame as
   * the module outline. Absent = the section has no shape of its own yet (it's
   * described only by the joints in `sectionBreaks`). */
  outline?: BenchworkPoint[] | null;
  /** How far this board runs along the main, inches. The module's length is the
   * SUM of these — it isn't authored separately (#108). */
  lengthInches?: number | null;
  /** This board's own shape: straight | curve | corner_45 | corner_90 | offset |
   * dead_end. Geometry belongs to the SECTION, not the module — a module like
   * One Mile is 384″ of mostly-straight boards with two 24″ CURVED sections in
   * the middle, which no single module-level geometry can describe (#108).
   * Absent = straight. */
  geometryType?: string | null;
  /** Degrees turned, for curve/corner sections. */
  geometryDegrees?: number | null;
  /** Lateral jog, for offset sections. */
  geometryOffsetInches?: number | null;
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

/** The module's sections, normalised — id required, name trimmed away when
 * blank, outline kept only when it's a usable polygon (#96 phase 2). */
export function moduleSections(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
): SchematicSection[] {
  return (doc?.sections ?? [])
    .filter((sec) => sec && typeof sec.id === "string" && sec.id !== "")
    .map((sec) => {
      const outline = benchworkOutline({ outline: sec.outline });
      const name = typeof sec.name === "string" ? sec.name.trim() : "";
      const len = sec.lengthInches;
      const deg = sec.geometryDegrees;
      const off = sec.geometryOffsetInches;
      return {
        id: sec.id,
        ...(name ? { name } : {}),
        ...(outline ? { outline } : {}),
        ...(typeof len === "number" && Number.isFinite(len) && len > 0
          ? { lengthInches: len }
          : {}),
        ...(sec.geometryType ? { geometryType: sec.geometryType } : {}),
        ...(typeof deg === "number" && Number.isFinite(deg) ? { geometryDegrees: deg } : {}),
        ...(typeof off === "number" && Number.isFinite(off) ? { geometryOffsetInches: off } : {}),
      };
    });
}

/** Every section outline that's actually a shape, arc-sampled for drawing.
 * Drawing all of them IS the module's footprint — the union of its sections.
 * No polygon boolean is computed: a renderer painting each ring gives the same
 * picture, and an approximate union would be worse than none. If something
 * ever needs a single ring (an export, a collision test), that's the point to
 * bring in real clipping. */
export function sectionFootprints(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
  /** The module's spine and dimensions. Given these, a section with no
   * authored polygon gets a band derived from its own span, so every section
   * has a shape and a resized board reshapes with it (#96 phase 2b). Omit to
   * get authored outlines only. */
  derive?: {
    centerline: BenchworkPoint[];
    widthA: number;
    widthB: number;
    offsetA: number;
    offsetB: number;
  },
): SectionFootprint[] {
  const spans = derive ? sectionSpans(doc) : [];
  const spanOf = new Map(spans.map((sp) => [sp.id, sp]));
  return moduleSections(doc)
    .map((sec): SectionFootprint | null => {
      const name = sec.name ? { name: sec.name } : {};
      if (sec.outline)
        return { id: sec.id, ...name, outline: sampleBenchworkOutline(sec.outline), derived: false };
      const sp = spanOf.get(sec.id);
      if (!sp || !derive) return null;
      const band = sectionBand(
        derive.centerline,
        sp.fromPos,
        sp.toPos,
        derive.widthA,
        derive.widthB,
        derive.offsetA,
        derive.offsetB,
      );
      return band.length >= 3 ? { id: sec.id, ...name, outline: band, derived: true } : null;
    })
    .filter((x): x is SectionFootprint => x !== null);
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
  /** Where each endplate's CENTRE sits relative to the main centre-line at that
   * end, inches (signed, along the +normal). Free-moN puts a **double**-track
   * plate's two tracks 9/16″ either side of its centre, so with Main 1 on the
   * centre-line the plate centre is half a track spacing up — pass
   * `FREEMO_TRACK_SPACING_INCHES / 2`. Single track crosses at the centre ⇒ 0
   * (the default), and an off-centre track is a signed value. */
  endplateTrackOffsets?: Record<string, number>;
  /** Authored benchwork outline (module-local inches), or absent for the band. */
  outline?: BenchworkPoint[] | null;
  /** The module's sections (#96 phase 2). When any carries an outline, the
   * module's footprint is the union of those — `outline` is then ignored. */
  sections?: SchematicSection[] | null;
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
  /** Authored outline (arc-sampled closed ring) or null → render the band.
   * Null too when `sectionOutlines` is non-empty — the sections ARE the shape. */
  outline: BenchworkPoint[] | null;
  /** Per-section footprints, arc-sampled (#96 phase 2b). Draw every one: together
   * they are the module's footprint. Empty = this module doesn't use sections,
   * so fall back to `outline ?? band` exactly as before. */
  sectionOutlines: SectionFootprint[];
}

/** Module-local main track centre-line (A→B), sampling arcs for curves/corners.
 * An authored `mainPath` wins — the owner drew the real shape; otherwise the
 * centre-line is derived from the geometry fields (length + type/degrees/offset). */
export function moduleCenterline(input: ModuleFootprintInput): BenchworkPoint[] {
  const drawn = trackPath(input.mainPath);
  if (drawn) return samplePath(drawn);
  // Sections own the shape when there are any (#108) — a multi-section module
  // has no single geometry, so its spine is its boards chained end to end.
  const chained = sectionedCenterline(input);
  if (chained.length >= 2) return chained;
  // No drawn main and no geometry → the owner hasn't established the mainline
  // yet. A fresh module opens as a blank board; the main is drawn as a layer,
  // not auto-derived. (Legacy modules carry a geometry, so they still derive.)
  if (!input.geometryType) return [];
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

/** One section's centre-line in ITS OWN frame — starting at the origin heading
 * +x — plus where it leaves off. Same geometry vocabulary the module level has
 * always used, just applied per board (#108). */
function sectionCenterlineLocal(sec: SchematicSection): {
  points: BenchworkPoint[];
  endX: number;
  endY: number;
  endHeadingDeg: number;
} {
  const L = typeof sec.lengthInches === "number" && sec.lengthInches > 0 ? sec.lengthInches : 0;
  const gt = sec.geometryType || "straight";
  if (L <= 0) return { points: [{ x: 0, y: 0 }], endX: 0, endY: 0, endHeadingDeg: 0 };
  if (gt === "offset") {
    const dy = sec.geometryOffsetInches ?? 0;
    // A jog returns to the original heading, so the next board carries on square.
    return { points: [{ x: 0, y: 0 }, { x: L, y: dy }], endX: L, endY: dy, endHeadingDeg: 0 };
  }
  const turn =
    gt === "corner_45" ? 45 : gt === "corner_90" ? 90 : gt === "curve" ? (sec.geometryDegrees ?? 0) : 0;
  if (turn === 0) return { points: [{ x: 0, y: 0 }, { x: L, y: 0 }], endX: L, endY: 0, endHeadingDeg: 0 };
  const t = turn * DEG_FP;
  const r = L / t; // constant-radius arc of arc-length L
  const steps = 12;
  const points: BenchworkPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (t * i) / steps;
    points.push({ x: r * Math.sin(a), y: r * (1 - Math.cos(a)) });
  }
  const last = points[points.length - 1];
  return { points, endX: last.x, endY: last.y, endHeadingDeg: turn };
}

/** The module's length as the SUM of its sections, or null when it has none
 * (then the authored module length still speaks). */
export function moduleLengthFromSections(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
): number | null {
  const secs = moduleSections(doc).filter(
    (sec) => typeof sec.lengthInches === "number" && sec.lengthInches! > 0,
  );
  if (!secs.length) return null;
  return secs.reduce((a, sec) => a + sec.lengthInches!, 0);
}

/** Where each section starts and ends along the main, inches from endplate A.
 * This is what `sectionBreaks` used to author by hand — now derived, so a
 * length is just a number you type and nothing steals from its neighbour. */
export function sectionSpans(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
): { id: string; name?: string; fromPos: number; toPos: number }[] {
  let acc = 0;
  const out: { id: string; name?: string; fromPos: number; toPos: number }[] = [];
  for (const sec of moduleSections(doc)) {
    const L = typeof sec.lengthInches === "number" && sec.lengthInches > 0 ? sec.lengthInches : 0;
    if (L <= 0) continue;
    out.push({ id: sec.id, ...(sec.name ? { name: sec.name } : {}), fromPos: acc, toPos: acc + L });
    acc += L;
  }
  return out;
}

/** A position expressed against the board it sits on, rather than as inches
 * from endplate A (#109). */
export interface SectionRelativePos {
  sectionId: string;
  /** Inches from that section's own west end. */
  offsetInches: number;
}

/**
 * Section spans that ALWAYS cover the whole module. The owner's insight is
 * what makes #109 tractable: every module has at least one section, even if
 * that one section IS the whole module. So a module with no authored sections
 * gets a single implicit span 0→length, every position falls inside exactly
 * one span, and absolute ↔ relative becomes a total, lossless mapping with no
 * un-convertible module and no orphan positions.
 *
 * The last span is also stretched to the module length when the sections come
 * up short, so a position past the end still lands somewhere real.
 */
export function sectionSpansOrWhole(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
  lengthInches: number,
): { id: string; name?: string; fromPos: number; toPos: number }[] {
  const L = lengthInches > 0 ? lengthInches : 0;
  const spans = sectionSpans(doc);
  if (!spans.length) return [{ id: WHOLE_MODULE_SECTION_ID, fromPos: 0, toPos: L }];
  const out = spans.map((sp) => ({ ...sp }));
  const last = out[out.length - 1];
  if (L > last.toPos) last.toPos = L;
  return out;
}

/** The id a module with no authored sections uses for its single implicit one. */
export const WHOLE_MODULE_SECTION_ID = "module";

/**
 * Absolute inches → the board it sits on plus an offset along it (#109).
 * Total: given spans from `sectionSpansOrWhole`, every position resolves.
 *
 * A position exactly ON a joint is assigned to the section that STARTS there,
 * at offset 0 — a joint is the west end of the next board, and that keeps the
 * mapping single-valued. The module's own east end is the exception: nothing
 * starts there, so it belongs to the last board.
 */
export function toSectionRelative(
  pos: number,
  spans: { id: string; fromPos: number; toPos: number }[],
): SectionRelativePos | null {
  if (!spans.length) return null;
  const p = Math.max(spans[0].fromPos, Math.min(spans[spans.length - 1].toPos, pos));
  for (const sp of spans) {
    if (p >= sp.fromPos && p < sp.toPos)
      return { sectionId: sp.id, offsetInches: round3(p - sp.fromPos) };
  }
  const last = spans[spans.length - 1];
  return { sectionId: last.id, offsetInches: round3(last.toPos - last.fromPos) };
}

/** …and back. Null when the section is gone — which is the caller's cue that
 * the thing it positioned has lost its board (#96 phase 3). */
export function fromSectionRelative(
  rel: SectionRelativePos,
  spans: { id: string; fromPos: number; toPos: number }[],
): number | null {
  const sp = spans.find((x) => x.id === rel.sectionId);
  if (!sp) return null;
  return round3(sp.fromPos + Math.max(0, Math.min(sp.toPos - sp.fromPos, rel.offsetInches)));
}

/** Re-derive an absolute position after the sections have moved: read it
 * against the OLD spans, write it against the NEW ones. This is the whole
 * point of #109 — reorder or resize a board and everything on it comes along
 * instead of silently pointing at a different board. */
export function remapPos(
  pos: number,
  before: { id: string; fromPos: number; toPos: number }[],
  after: { id: string; fromPos: number; toPos: number }[],
): number | null {
  const rel = toSectionRelative(pos, before);
  return rel ? fromSectionRelative(rel, after) : null;
}

/** The joints implied by the sections — the interior boundaries, in inches from
 * endplate A. Replaces the authored `sectionBreaks` for a sectioned module. */
export function sectionBreaksFromSections(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
): number[] {
  const spans = sectionSpans(doc);
  return spans.slice(0, -1).map((sp) => sp.toPos);
}

/** The module's centre-line built by CHAINING its sections — each board starts
 * where the previous one ended, at the heading it ended on. This is what makes
 * a module like One Mile expressible: straight boards with two 24″ curved ones
 * in the middle, which no single module-level geometry can describe (#108).
 * Returns [] when the module has no sections with lengths. */
/** Where the chained boards finish, and on what heading — computed from the
 * section geometry itself rather than read off the sampled polyline. A curve
 * is sampled in steps, so the last chord lags the true tangent by half a step
 * (a 90° board sampled 12 ways reads 86.25°). That error would land straight
 * in endplate B's heading and throw off face-to-face snapping, so the exact
 * value is accumulated here instead. Null when there are no sections. */
export function sectionedEndPose(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
): { x: number; y: number; heading: number } | null {
  const secs = moduleSections(doc).filter(
    (sec) => typeof sec.lengthInches === "number" && sec.lengthInches! > 0,
  );
  if (!secs.length) return null;
  let ox = 0;
  let oy = 0;
  let heading = 0;
  for (const sec of secs) {
    const local = sectionCenterlineLocal(sec);
    const c = Math.cos(heading * DEG_FP);
    const sn = Math.sin(heading * DEG_FP);
    ox += local.endX * c - local.endY * sn;
    oy += local.endX * sn + local.endY * c;
    heading += local.endHeadingDeg;
  }
  return { x: ox, y: oy, heading };
}

export function sectionedCenterline(
  doc: { sections?: SchematicSection[] | null } | null | undefined,
): BenchworkPoint[] {
  const secs = moduleSections(doc).filter(
    (sec) => typeof sec.lengthInches === "number" && sec.lengthInches! > 0,
  );
  if (!secs.length) return [];
  const out: BenchworkPoint[] = [];
  let ox = 0;
  let oy = 0;
  let heading = 0; // degrees, +x at endplate A
  for (const sec of secs) {
    const local = sectionCenterlineLocal(sec);
    const c = Math.cos(heading * DEG_FP);
    const sn = Math.sin(heading * DEG_FP);
    for (let i = 0; i < local.points.length; i++) {
      // The first vertex of every board but the first repeats the previous
      // board's end point — skip it so the spine has no duplicate vertices.
      if (i === 0 && out.length) continue;
      const p = local.points[i];
      out.push({ x: ox + p.x * c - p.y * sn, y: oy + p.x * sn + p.y * c });
    }
    ox += local.endX * c - local.endY * sn;
    oy += local.endX * sn + local.endY * c;
    heading += local.endHeadingDeg;
  }
  return out;
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
  offsetA = 0,
  offsetB = 0,
): BenchworkPoint[] {
  if (center.length < 2) return [];
  const n = centerlineNormals(center);
  const f = centerlineFractions(center);
  const half = (i: number) => (widthA * (1 - f[i]) + widthB * f[i]) / 2;
  // The board is centred on the plate centre, which need not be the main
  // centre-line — a double-track end sits half a track spacing up (#93).
  const off = (i: number) => offsetA * (1 - f[i]) + offsetB * f[i];
  const left = center.map((p, i) => ({
    x: p.x + n[i].x * (off(i) + half(i)),
    y: p.y + n[i].y * (off(i) + half(i)),
  }));
  const right = center.map((p, i) => ({
    x: p.x + n[i].x * (off(i) - half(i)),
    y: p.y + n[i].y * (off(i) - half(i)),
  }));
  return [...left, ...right.reverse()];
}

/** The sub-polyline of a centre-line between two arc-length positions, with
 * the cut ends interpolated so a slice starts and finishes exactly on them. */
export function sliceCenterline(
  center: BenchworkPoint[],
  fromPos: number,
  toPos: number,
): BenchworkPoint[] {
  if (center.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < center.length; i++)
    cum.push(cum[i - 1] + Math.hypot(center[i].x - center[i - 1].x, center[i].y - center[i - 1].y));
  const total = cum[cum.length - 1];
  const a = Math.max(0, Math.min(total, Math.min(fromPos, toPos)));
  const b = Math.max(0, Math.min(total, Math.max(fromPos, toPos)));
  if (b - a <= 0) return [];
  const at = (d: number): BenchworkPoint => {
    for (let i = 1; i < center.length; i++) {
      if (d <= cum[i] || i === center.length - 1) {
        const seg = cum[i] - cum[i - 1] || 1;
        const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
        return {
          x: center[i - 1].x + (center[i].x - center[i - 1].x) * t,
          y: center[i - 1].y + (center[i].y - center[i - 1].y) * t,
        };
      }
    }
    return center[center.length - 1];
  };
  const out: BenchworkPoint[] = [at(a)];
  for (let i = 0; i < center.length; i++) {
    if (cum[i] > a && cum[i] < b) out.push({ x: center[i].x, y: center[i].y });
  }
  out.push(at(b));
  return out;
}

/** One section's bench-work as a band over its own stretch of centre-line —
 * the per-section equivalent of `benchworkBand` (#96 phase 2b). Width and
 * plate offset are interpolated from the module's ends exactly as the whole
 * band does, so a section's derived shape lines up with its neighbours.
 *
 * This is what makes an outline BELONG to the section: a section without an
 * authored polygon gets one derived from its span, so resizing the board
 * reshapes it instead of leaving a hand-drawn outline stranded. */
export function sectionBand(
  center: BenchworkPoint[],
  fromPos: number,
  toPos: number,
  widthA = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  widthB = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  offsetA = 0,
  offsetB = 0,
): BenchworkPoint[] {
  const slice = sliceCenterline(center, fromPos, toPos);
  if (slice.length < 2) return [];
  // Fractions must be taken along the WHOLE module, not the slice, or every
  // section would taper from widthA to widthB over its own short length.
  let total = 0;
  for (let i = 1; i < center.length; i++)
    total += Math.hypot(center[i].x - center[i - 1].x, center[i].y - center[i - 1].y);
  total = total || 1;
  const lo = Math.min(fromPos, toPos);
  let acc = 0;
  const fr: number[] = [0];
  for (let i = 1; i < slice.length; i++) {
    acc += Math.hypot(slice[i].x - slice[i - 1].x, slice[i].y - slice[i - 1].y);
    fr.push(acc);
  }
  const f = fr.map((d) => Math.max(0, Math.min(1, (lo + d) / total)));
  const n = centerlineNormals(slice);
  const half = (i: number) => (widthA * (1 - f[i]) + widthB * f[i]) / 2;
  const off = (i: number) => offsetA * (1 - f[i]) + offsetB * f[i];
  const left = slice.map((p, i) => ({
    x: p.x + n[i].x * (off(i) + half(i)),
    y: p.y + n[i].y * (off(i) + half(i)),
  }));
  const right = slice.map((p, i) => ({
    x: p.x + n[i].x * (off(i) - half(i)),
    y: p.y + n[i].y * (off(i) - half(i)),
  }));
  return [...left, ...right.reverse()];
}

/** Two sections that physically meet, and how much edge they share. */
export interface SectionAdjacency {
  a: string;
  b: string;
  /** Inches of shared edge — a butt joint across a 24″ board reads ~24. */
  lengthInches: number;
}

/** Closed-ring edges of a polygon, including the wrap-around. */
function ringEdges(pts: { x: number; y: number }[]): [
  { x: number; y: number },
  { x: number; y: number },
][] {
  const out: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (let i = 0; i < pts.length; i++) out.push([pts[i], pts[(i + 1) % pts.length]]);
  return out;
}

/** How much of two near-collinear segments actually overlap, in inches. 0 when
 * they're skew, too far apart, or merely touching at a point. */
function sharedEdgeLength(
  e1: [{ x: number; y: number }, { x: number; y: number }],
  e2: [{ x: number; y: number }, { x: number; y: number }],
  gap: number,
  angleDeg: number,
): number {
  const ux = e1[1].x - e1[0].x;
  const uy = e1[1].y - e1[0].y;
  const ul = Math.hypot(ux, uy);
  const vx = e2[1].x - e2[0].x;
  const vy = e2[1].y - e2[0].y;
  const vl = Math.hypot(vx, vy);
  if (ul < 1e-6 || vl < 1e-6) return 0;
  const dx = ux / ul;
  const dy = uy / ul;
  // Parallel either way round — a shared joint has the two boards' edges
  // running in OPPOSITE directions, since each ring winds around its own board.
  const cross = Math.abs((dx * vy - dy * vx) / vl);
  if (cross > Math.sin((angleDeg * Math.PI) / 180)) return 0;
  // Both endpoints of e2 must lie within `gap` of e1's infinite line.
  const perp = (q: { x: number; y: number }) =>
    Math.abs((q.x - e1[0].x) * -dy + (q.y - e1[0].y) * dx);
  if (perp(e2[0]) > gap || perp(e2[1]) > gap) return 0;
  const proj = (q: { x: number; y: number }) => (q.x - e1[0].x) * dx + (q.y - e1[0].y) * dy;
  const t1 = proj(e2[0]);
  const t2 = proj(e2[1]);
  return Math.max(0, Math.min(ul, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)));
}

/**
 * Which sections physically MEET, derived from shared polygon edges rather
 * than list order (#96 phase 2c).
 *
 * Order is the wrong model as soon as a module stops being a row of boards: a
 * peninsula hangs off the BACK of a shallow band over part of its length, so
 * it neighbours a board it isn't next to in any list. Geometry is the only
 * thing that knows.
 */
export function sectionAdjacency(
  footprints: SectionFootprint[],
  opts?: { gapInches?: number; angleDegrees?: number; minOverlapInches?: number },
): SectionAdjacency[] {
  const gap = opts?.gapInches ?? 0.5;
  const angle = opts?.angleDegrees ?? 3;
  const min = opts?.minOverlapInches ?? 1;
  const edges = footprints.map((f) => ringEdges(f.outline));
  const out: SectionAdjacency[] = [];
  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) {
      let total = 0;
      for (const e1 of edges[i])
        for (const e2 of edges[j]) total += sharedEdgeLength(e1, e2, gap, angle);
      if (total >= min)
        out.push({
          a: footprints[i].id,
          b: footprints[j].id,
          lengthInches: Math.round(total * 1000) / 1000,
        });
    }
  }
  return out;
}

/** The sections each one touches. */
export function sectionNeighbours(id: string, adj: SectionAdjacency[]): string[] {
  return adj.filter((x) => x.a === id || x.b === id).map((x) => (x.a === id ? x.b : x.a));
}

/**
 * Groups of sections that hang together, as connected components. One group
 * means the module is a single piece of bench work; more than one means some
 * board is floating free — an authoring mistake now, and the test #96 phase 3
 * needs before it can say whether dropping a section leaves the rest intact.
 */
export function sectionComponents(ids: string[], adj: SectionAdjacency[]): string[][] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const nx = parent.get(x)!;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  for (const { a, b } of adj) {
    if (!parent.has(a) || !parent.has(b)) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  // Keep the caller's ordering so the first group is the one containing the
  // first section — the piece with endplate A on it.
  return [...groups.values()];
}

/** The two endplate faces (the band's flat ends): [A end at widthA, B end at widthB]. */
export function endplateFaceSegments(
  center: BenchworkPoint[],
  widthA = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  widthB = FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  offsetA = 0,
  offsetB = 0,
): OutlineFace[] {
  if (center.length < 2) return [];
  const n = centerlineNormals(center);
  // `mid` stays the TRACK point (what joints and drawn track key off); the face
  // spans ±w/2 about the PLATE centre, which a double-track end offsets (#93).
  const face = (i: number, w: number, o: number): OutlineFace => ({
    p1: { x: center[i].x + n[i].x * (o + w / 2), y: center[i].y + n[i].y * (o + w / 2) },
    p2: { x: center[i].x + n[i].x * (o - w / 2), y: center[i].y + n[i].y * (o - w / 2) },
    mid: { x: center[i].x, y: center[i].y },
  });
  return [face(0, widthA, offsetA), face(center.length - 1, widthB, offsetB)];
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
  const offA = input.endplateTrackOffsets?.["A"] ?? 0;
  const offB = input.endplateTrackOffsets?.["B"] ?? 0;
  // A module built from shaped sections IS its sections — the whole-module
  // outline stops speaking for it, so don't hand back both and leave renderers
  // to guess which wins (#96 phase 2).
  const sectionOutlines = sectionFootprints(input, {
    centerline,
    widthA,
    widthB,
    offsetA: offA,
    offsetB: offB,
  });
  return {
    centerline,
    band: benchworkBand(centerline, widthA, widthB, offA, offB),
    endplateFaces: endplateFaceSegments(centerline, widthA, widthB, offA, offB),
    outline: sectionOutlines.length || !authored ? null : sampleBenchworkOutline(authored),
    sectionOutlines,
  };
}

/**
 * The offset from the main centre-line to an endplate's CENTRE, inches — the
 * Free-moN geometry. A **double**-track end carries its two tracks 9/16″ either
 * side of the plate centre (§2.0 RP), and Main 1 sits on the centre-line, so the
 * plate centre is half a track spacing up. A single track crosses at the centre.
 */
export function endplateTrackOffsetFor(
  config: TrackConfig | "none" | undefined,
  authoredTrackOffset?: number | null,
): number {
  const v = -endplateTrackOffsetInches(authoredTrackOffset, config);
  return v === 0 ? 0 : v; // never hand back -0 (it leaks into JSON and compares oddly)
}

/**
 * Where an endplate's PRIMARY track (Main 1) crosses, as a signed distance from
 * the plate's CENTRE — the standard's own framing. Authored value wins; absent
 * falls back to the §2.0 recommendations: a single track centred (0), a double
 * straddling so its two tracks land ∓ half the track spacing (Main 1 low).
 */
export function endplateTrackOffsetInches(
  authored: number | null | undefined,
  config: TrackConfig | "none" | undefined,
): number {
  if (typeof authored === "number" && Number.isFinite(authored)) return authored;
  return config === "double" ? -FREEMO_TRACK_SPACING_INCHES / 2 : 0;
}

/** A Free-moN conformance problem with an endplate's width/track placement. */
export interface EndplateWidthIssue {
  /** "narrow" = below the 12″ minimum; "clearance" = a track too near a fascia. */
  code: "narrow" | "clearance";
  /** Plain-language problem, for the author. */
  message: string;
  /** The width that would satisfy this rule, inches. */
  requiredInches: number;
}

/**
 * Check an endplate against the two Free-moN **standards** that bound its width:
 *
 * - §1.1 "Endplates shall be 6 inches high and a **minimum 12 inches wide**."
 * - §2.0 "At the endplate, track shall cross near center on the width, **not less
 *   than 4 inches from either fascia**."
 *
 * With the tracks centred (the §2.0 recommendation) a double-track end needs
 * 4 + 1.125 + 4 = 9.125″ for clearance alone, so the 12″ minimum governs — but an
 * **off-centre** track can breach the 4″ rule on a plate that is otherwise wide
 * enough, which is why both are checked. `trackOffsetInches` is the signed
 * distance from the plate's centre to the main's crossing point (0 = centred).
 */
export function checkEndplateWidth(input: {
  widthInches?: number | null;
  config?: TrackConfig | "none" | null;
  trackOffsetInches?: number | null;
}): EndplateWidthIssue[] {
  const width = endplateWidthInches(input as { widthInches?: number | null });
  const issues: EndplateWidthIssue[] = [];
  if (width < FREEMO_ENDPLATE_WIDTH_MIN_INCHES) {
    issues.push({
      code: "narrow",
      message: `Endplate is ${round2(width)}″ wide — the standard requires at least ${FREEMO_ENDPLATE_WIDTH_MIN_INCHES}″.`,
      requiredInches: FREEMO_ENDPLATE_WIDTH_MIN_INCHES,
    });
  }
  // Track centres relative to the plate centre. `trackOffsetInches` locates
  // MAIN 1 (the same framing the authoring field and the renderer use); a
  // double end carries Main 2 one spacing further out, so check whichever of
  // the two sits nearest a fascia. Unauthored falls back to the §2.0 default,
  // which straddles the centre — so a plain double end still measures ±9/16″.
  const off = endplateTrackOffsetInches(input.trackOffsetInches, input.config ?? undefined);
  const centres =
    input.config === "double" ? [off, off + FREEMO_TRACK_SPACING_INCHES] : [off];
  const worst = Math.max(...centres.map((c) => Math.abs(c)));
  const clearance = width / 2 - worst;
  if (clearance < FREEMO_ENDPLATE_TRACK_FASCIA_CLEARANCE_INCHES) {
    const required = 2 * (worst + FREEMO_ENDPLATE_TRACK_FASCIA_CLEARANCE_INCHES);
    issues.push({
      code: "clearance",
      message:
        `Track sits ${round2(clearance)}″ from the fascia — the standard requires at least ` +
        `${FREEMO_ENDPLATE_TRACK_FASCIA_CLEARANCE_INCHES}″. Widen this end to ${round2(required)}″` +
        (off !== 0 ? " or move the track back toward the centre." : "."),
      requiredInches: required,
    });
  }
  return issues;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

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
  /** Rotate the turnout 180° — the points face the other way (#turnout-flip). */
  flipped?: boolean;
  /** A curved turnout — the diverging route bows into an arc rather than a
   * straight diagonal. Physical-render only (the operations view is topological). */
  curved?: boolean;
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
  /** Extra car-spot spans on other tracks (house-track spots, #54). */
  spots: IndustrySpot[];
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
  /** What the route to this endplate is — a secondary "branch" or a diverging
   * "main". Drives labels/weight, not geometry. Default "branch". */
  kind?: "branch" | "main";
  /** The drawn diverging track that reaches this endplate (set when the owner
   * draws track to it; the plate is placed first, connected later). */
  trackId?: string | null;
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
  /** Swap the two mains' POSITIONS: Main 1 draws above (lane 1) and Main 2 on
   * the centre line (lane 0). The module decides which physical track is which
   * main — on some modules the upper track is the through/primary main
   * (#FMN-0043). Identities and references are unchanged; only the lanes swap. */
  mainsSwapped: boolean;
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
  /** Authored per-endplate TRACK offsets by id — the primary track's signed
   * distance from the plate centre, inches. Absent id = the §2.0 default. */
  endplateTrackOffsets: Record<string, number>;
  /** Benchwork footprint outline — polygon vertices in module-local inches
   * (endplate A's track point at the origin, mainline +x, perpendicular +y up).
   * Empty = no authored outline (fall back to the endplate-width band). */
  outline: BenchworkPoint[];
  /** Internal section joints — inches from endplate A where the boards split
   * into sections. Empty = a single section (#48). */
  sectionBreaks: number[];
  /** The module's sections as named objects, each optionally carrying its own
   * outline (#96 phase 2). Empty = fall back to `outline` + `sectionBreaks`. */
  sections: SchematicSection[];
  controlPoints: EditorControlPoint[];
  /** Rail-served industries — car-spot spans on a track (#industries). */
  industries: EditorIndustry[];
  /** Authored mainline centre-line (module-local inches) — empty = derive from
   * geometry. The owner-drawn real shape (#2d-track, physical view only). */
  mainPath: BenchworkPoint[];
  /** Authored Main 2 centre-line (double-track only) — empty = lane offset (#131). */
  main2Path: BenchworkPoint[];
}

/** Build the empty editor state for a module of the given length. */
export function emptyEditorState(lengthInches: number): EditorState {
  return {
    lengthInches: lengthInches > 0 ? lengthInches : 24,
    loop: false,
    loopReturn: "same",
    configA: "single",
    configB: "single",
    mainsSwapped: false,
    extraTracks: [],
    turnouts: [],
    crossings: [],
    branches: [],
    poseOverrides: {},
    endplateWidths: {},
    endplateTrackOffsets: {},
    outline: [],
    sectionBreaks: [],
    sections: [],
    controlPoints: [],
    industries: [],
    mainPath: [],
    main2Path: [],
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

/**
 * Main 1's extent. Normally it's the through main, A→B. But on a transition
 * module where MAIN 2 is the surviving through main (the turnout sits ON Main 2
 * and diverges to Main 1, #FMN-0043), Main 1 is the one that ENDS — it must stop
 * at the turnout, or both mains draw endplate-to-endplate and the single-track
 * end shows two tracks reaching it.
 */
function main1Track(state: EditorState): SchematicTrack {
  // Main 1 is the through mainline: always the full module, always on the
  // centre line. The swap moves MAIN 2 to the other side; Main 1 never moves
  // (Steve Branton, #131). A legacy doc where the turnout sits ON Main 2 (Main 2
  // was the through main) still truncates Main 1 so old modules don't break.
  const sw = state.turnouts.find(isTransitionTurnout);
  const legacyThroughMain2 =
    !!sw && sw.onTrack === MAIN2_TRACK_ID && sw.divergeTrack === MAIN_TRACK_ID;
  const isDouble = state.configA === "double" || state.configB === "double";
  const bothDouble = state.configA === "double" && state.configB === "double";
  if (!isDouble || bothDouble || !legacyThroughMain2) {
    return { id: MAIN_TRACK_ID, role: "main", lane: 0, from: "A", to: "B" };
  }
  return state.configA === "double"
    ? { id: MAIN_TRACK_ID, role: "main", lane: 0, fromPos: 0, toPos: sw!.pos }
    : { id: MAIN_TRACK_ID, role: "main", lane: 0, fromPos: sw!.pos, toPos: state.lengthInches };
}

function main2Track(state: EditorState): SchematicTrack {
  const bothDouble = state.configA === "double" && state.configB === "double";
  // EVERY turnout that opens Main 2, west to east — not just the first. A module
  // that's single at both ends with a double stretch in the middle (the ordinary
  // passing-siding module) has TWO, and Main 2 lives between them. Taking only
  // the first ran Main 2 on to the far endplate, so a single-track end drew two
  // tracks reaching it (#118).
  const sws = state.turnouts
    .filter((t) => isTransitionTurnout(t) && t.divergeTrack === MAIN2_TRACK_ID)
    .sort((a, b) => a.pos - b.pos);
  // Main 2 runs partial only when IT is the branch that ends (turnout diverges
  // TO Main 2). If the turnout sits ON Main 2 (Main 2 is the surviving through
  // main, #FMN-0043), Main 2 runs full and Main 1 is the one that ends.
  // Main 2's side: above Main 1 by default, below when swapped (Steve, #131).
  // Main 1 stays on the centre line; only Main 2 changes side.
  const lane = state.mainsSwapped ? -1 : 1;
  // A bent Main 2 draws along its authored path instead of a lane offset (#131).
  const authored = state.main2Path.length >= 2 ? { path: state.main2Path } : {};
  if (bothDouble || !sws.length) {
    return { id: MAIN2_TRACK_ID, role: "main", lane, from: "A", to: "B", ...authored };
  }
  const track = (fromPos: number, toPos: number): SchematicTrack => ({
    id: MAIN2_TRACK_ID,
    role: "main",
    lane,
    fromPos,
    toPos,
    ...authored,
  });
  // Double at A: Main 2 runs from A and ends at the turnout that closes it.
  if (state.configA === "double") return track(0, sws[0].pos);
  // Double at B: it begins where it FIRST appears and runs through to B.
  if (state.configB === "double") return track(sws[0].pos, state.lengthInches);
  // Single at both ends — the ordinary passing-siding module. Main 2 lives
  // between the outermost turnouts.
  if (sws.length >= 2) return track(sws[0].pos, sws[sws.length - 1].pos);
  // One turnout and neither end double: a half-drawn siding. Nothing says
  // where it ends, so let it run out rather than collapsing it to nothing.
  return track(sws[0].pos, state.lengthInches);
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
    // The turnout sits ON the through mainline (Main 1) and diverges TO Main 2,
    // the second main being added to start the double track — the modeller's
    // view of the junction, and the direction an owner authors it (Steve
    // Branton, #131). Main 1 runs the full module; Main 2 is the branch.
    onTrack: MAIN_TRACK_ID,
    divergeTrack: MAIN2_TRACK_ID,
    // Hand so the diverging leg lands on Main 2's side. Main 2 extends toward
    // the double end (sign −1 west / +1 east) and sits above (+1) or, when the
    // mains are swapped, below (−1). divergeSideForHand(left)=sign(toward),
    // (right)=−sign(toward), so pick the hand whose side matches Main 2's (#131).
    kind:
      (aDouble ? -1 : 1) === (state.mainsSwapped ? -1 : 1) ? "left" : "right",
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
  offsets: Record<string, number> = {},
): SchematicEndplate[] {
  return endplates.map((e) => {
    const w = widths[e.id];
    const o = offsets[e.id];
    let out = e;
    if (typeof w === "number" && w > 0) out = { ...out, widthInches: w };
    if (typeof o === "number" && Number.isFinite(o)) out = { ...out, trackOffsetInches: o };
    return out;
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
    ...(state.mainsSwapped ? { mainsSwapped: true } : {}),
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
          kind: b.kind ?? "branch",
          ...(b.trackId ? { trackId: b.trackId } : {}),
        })),
      ],
      state.poseOverrides,
    ),
      state.endplateWidths,
      state.endplateTrackOffsets,
    ),
    tracks: [
      state.loop
        ? // The main runs the lead from A and turns back at the balloon.
          { id: MAIN_TRACK_ID, role: "main" as const, lane: 0, fromPos: 0, toPos: state.lengthInches }
        : // Normally A→B; partial when MAIN 2 is the through main and Main 1 is
          // the one that ends at the transition turnout (#FMN-0043).
          main1Track(state),
      // Double track: Main 2 is a real entity so turnouts/signals can attach.
      // On a loop it exists only for a Main 2 directional return (the U joins
      // the two lanes at the balloon); a same-main loop's parallel lead legs
      // are ONE main. On a TRANSITION module (one endplate single, the other
      // double) Main 2 only runs from the mainline turnout to the double end —
      // the turnout that diverges to main2 is the single source of truth for
      // where the transition sits (fd#175 / FMN-0038).
      // …and on a module that's SINGLE at both ends but goes double in the
      // middle to form a siding: the turnouts are what make Main 2 exist, so a
      // pair of them is reason enough to emit it (#118). Without this the
      // second main simply wasn't in the doc, and neither the board nor the
      // dispatcher panel could draw it.
      ...(!state.loop &&
      (state.configA === "double" ||
        state.configB === "double" ||
        state.turnouts.some((t) => isTransitionTurnout(t) && t.divergeTrack === MAIN2_TRACK_ID))
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
      ...(t.curved ? { curved: true } : {}),
      ...(t.flipped ? { flipped: true } : {}),
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
            ...(ind.spots?.length ? { spots: ind.spots } : {}),
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
    // Internal section joints (inches from A), when the module has more than one.
    ...(state.sectionBreaks.length ? { sectionBreaks: state.sectionBreaks } : {}),
    // Sections as objects — emitted only once the owner has some, so a module
    // that never used them keeps exactly the doc it had before (#96 phase 2).
    ...(state.sections.length ? { sections: moduleSections({ sections: state.sections }) } : {}),
    // Authored mainline path (module-local inches); only when it's a real path.
    ...(state.mainPath.length >= 2 ? { mainPath: state.mainPath } : {}),
    ...(state.main2Path.length >= 2 ? { main2Path: state.main2Path } : {}),
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
  const endplateTrackOffsets: Record<string, number> = {};
  for (const e of d!.endplates ?? []) {
    if (typeof e.widthInches === "number" && e.widthInches > 0)
      endplateWidths[e.id] = e.widthInches;
    // Signed, and 0 is meaningful (explicitly centred) — keep any finite value.
    if (typeof e.trackOffsetInches === "number" && Number.isFinite(e.trackOffsetInches))
      endplateTrackOffsets[e.id] = e.trackOffsetInches;
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
  // Main 2's authored path may sit on the doc top-level or on its track record.
  const main2Track_ = (d!.tracks ?? []).find((t) => t.id === MAIN2_TRACK_ID);
  const main2Path = trackPath(d!.main2Path ?? main2Track_?.path) ?? [];
  return {
    lengthInches: len,
    loop,
    loopReturn: loop && d!.loopReturn === "main2" ? "main2" : "same",
    mainsSwapped: d!.mainsSwapped === true,
    configA: configOf("A"),
    // On a loop, a missing B means pure turnback; present = interchange loop.
    configB: loop && !hasB ? "none" : configOf("B"),
    branches: branchEps.map((ep) => ({
      label: ep.label ?? "Branch",
      pos: sc(ep.at!.pos),
      side: ep.at!.side === "down" ? "down" : "up",
      config: ep.tracks?.[0]?.config === "double" ? "double" : "single",
      kind: ep.kind === "main" ? "main" : "branch",
      trackId: ep.trackId ?? null,
    })),
    poseOverrides,
    endplateWidths,
    endplateTrackOffsets,
    outline,
    sectionBreaks: (d!.sectionBreaks ?? [])
      .filter((n) => Number.isFinite(n))
      .map((n) => sc(n)),
    sections: moduleSections(d),
    mainPath,
    main2Path,
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
      ...(t.curved ? { curved: true } : {}),
      ...(t.flipped ? { flipped: true } : {}),
    })),
    controlPoints: readControlPoints(d!, sc),
    industries: (d!.industries ?? []).map((ind) => ({
      id: ind.id,
      name: ind.name ?? "",
      type: ind.type ?? "",
      track: ind.track,
      fromPos: sc(ind.fromPos ?? 0),
      toPos: ind.toPos != null ? sc(ind.toPos) : len,
      spots: (ind.spots ?? []).map((s) => ({
        track: s.track,
        fromPos: sc(s.fromPos ?? 0),
        toPos: s.toPos != null ? sc(s.toPos) : len,
        ...(s.side ? { side: s.side as SignalSide } : {}),
      })),
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
  /** The turnout is installed the other way round — the points face the far
   * direction, which swaps the side the diverging route leaves on. */
  flipped?: boolean | null,
): -1 | 0 | 1 {
  if (kind !== "left" && kind !== "right") return 0; // wye / unset → no change
  const s = (stubDir >= 0 ? 1 : -1) * (flipped ? -1 : 1);
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
  const industries: DrawIndustry[] = (doc.industries ?? []).flatMap((ind) => {
    // Each spot (the primary track + any house-track spots) draws beside its
    // own track; they share the industry's name, type and car types (#54).
    const spots = [
      { track: ind.track, fromPos: ind.fromPos, toPos: ind.toPos, side: ind.side },
      ...(ind.spots ?? []),
    ];
    return spots.map((sp, i) => {
      const from = sp.fromPos ?? 0;
      const to = sp.toPos ?? len;
      return {
        id: i === 0 ? ind.id : `${ind.id}-s${i}`,
        name: ind.name ?? "",
        type: ind.type ?? null,
        fromFrac: clampFrac(Math.min(from, to)),
        toFrac: clampFrac(Math.max(from, to)),
        lane: trackLane.get(sp.track) ?? 0,
        side: (sp.side as SignalSide) ?? "above",
        labelMode: (ind.labelMode as IndustryLabelMode) ?? "none",
        cars: carCapacity(from, to),
        carTypes: Array.isArray(ind.carTypes) ? ind.carTypes : [],
      };
    });
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
  /** The module's sections. When present they define the module's real shape,
   * so endplate B lands at the end of the CHAINED boards rather than where a
   * single module-level geometry would have put it (#108). */
  sections?: SchematicSection[] | null;
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
  // A sectioned module's real end is where its boards finish, which no single
  // module-level geometry can predict — chain them and read the last point and
  // its closing tangent (#108).
  const end = sectionedEndPose({ sections: geo.sections });
  if (!noB && end) {
    poses.push(
      withOverride({
        id: "B",
        x: end.x,
        y: end.y,
        heading: norm360(end.heading),
        trackConfig: cfg(1),
        trackOffsets: offsetsFor(cfg(1), half),
      }),
    );
  } else if (!noB) {
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

/** Free-moN §2.0 — track crossing an endplate must be perpendicular, straight
 * and level for at least this many inches from the outside face. */
export const ENDPLATE_LEAD_INCHES = 4;
/** Free-moN §2.0 — the crossing must stay at least this far from either fascia. */
export const ENDPLATE_FASCIA_CLEAR_INCHES = 4;

/** The mandated straight, perpendicular lead a connecting track must follow
 * leaving an endplate (§2.0). Given the endplate's track point + outward-normal
 * heading, returns the face point and the point `leadInches` inboard, plus the
 * inward heading. A track meeting this plate must be collinear with face→inboard
 * for its first `leadInches`. */
export function endplateLead(
  pose: { x: number; y: number; heading: number },
  leadInches: number = ENDPLATE_LEAD_INCHES,
): { face: BenchworkPoint; inboard: BenchworkPoint; inwardHeading: number } {
  const inwardHeading = norm360(pose.heading + 180);
  const r = inwardHeading * DEG;
  return {
    face: { x: pose.x, y: pose.y },
    inboard: { x: pose.x + Math.cos(r) * leadInches, y: pose.y + Math.sin(r) * leadInches },
    inwardHeading,
  };
}

export interface EndplateTrackIssue {
  /** "not-perpendicular" — the track doesn't cross square to the face;
   *  "short-lead" — it curves/bends within the required lead;
   *  "fascia-clearance" — the crossing is <4″ from a fascia. */
  code: "not-perpendicular" | "short-lead" | "fascia-clearance";
  message: string;
}

/**
 * Validate a drawn path meeting an endplate against Free-moN §2.0: perpendicular
 * crossing, straight + level for ≥4″ from the face, ≥4″ from either fascia.
 * `end` says which end of the authored path touches the plate ("last" default).
 * Fascia clearance is checked only when both the face width and the track's
 * offset from the plate centre are supplied. Pure; empty array = compliant.
 */
export function trackMeetsEndplateIssues(
  path: BenchworkPoint[],
  pose: { x: number; y: number; heading: number },
  opts?: {
    end?: "first" | "last";
    faceWidthInches?: number;
    trackOffsetInches?: number;
    leadInches?: number;
    toleranceDeg?: number;
  },
): EndplateTrackIssue[] {
  const issues: EndplateTrackIssue[] = [];
  const lead = opts?.leadInches ?? ENDPLATE_LEAD_INCHES;
  const tol = opts?.toleranceDeg ?? 5;
  if (path && path.length >= 2) {
    // Order the path plate→inboard so seq[0] is the endplate end.
    const seq = (opts?.end ?? "last") === "last" ? [...path].reverse() : path.slice();
    const p0 = seq[0];
    const p1 = seq[1];
    const wantIn = norm360(pose.heading + 180); // inboard = opposite the outward normal
    const inHead = norm360(Math.atan2(p1.y - p0.y, p1.x - p0.x) / DEG);
    const diff = Math.abs(((inHead - wantIn + 540) % 360) - 180);
    if (diff > tol)
      issues.push({
        code: "not-perpendicular",
        message: `Track must cross the endplate square (within ${tol}°); it is off by ${Math.round(diff)}°.`,
      });
    // Straight + level for the first `lead` inches: no arc, and the near
    // vertices must lie on the lead line (little lateral drift).
    const r = wantIn * DEG;
    const ux = Math.cos(r);
    const uy = Math.sin(r);
    let curved = false;
    let acc = 0;
    for (let i = 1; i < seq.length && acc < lead; i++) {
      const a = seq[i - 1];
      const b = seq[i];
      if (a.bulge) curved = true;
      const rx = b.x - p0.x;
      const ry = b.y - p0.y;
      const along = rx * ux + ry * uy;
      const lat = Math.abs(rx * -uy + ry * ux);
      if (along <= lead + 0.01 && lat > 0.25) curved = true;
      acc += Math.hypot(b.x - a.x, b.y - a.y);
    }
    if (curved)
      issues.push({
        code: "short-lead",
        message: `The first ${lead}″ from the endplate must be straight and perpendicular.`,
      });
  }
  const w = opts?.faceWidthInches;
  const off = opts?.trackOffsetInches;
  if (typeof w === "number" && w > 0 && typeof off === "number") {
    const clear = w / 2 - Math.abs(off);
    if (clear < ENDPLATE_FASCIA_CLEAR_INCHES)
      issues.push({
        code: "fascia-clearance",
        message: `Track must stay ≥${ENDPLATE_FASCIA_CLEAR_INCHES}″ from either fascia; it is ${clear.toFixed(1)}″.`,
      });
  }
  return issues;
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
