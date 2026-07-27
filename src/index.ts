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
  /** ⭐ THE ENDPLATE'S EDGE OF THE BENCHWORK (ADR 0001). When present it WINS
   * over `pose` and over derivation, and position, heading and width are all
   * read off the polygon — so they cannot drift apart from the board.
   *
   * `pose` remains for modules authored before this and for shapes with no
   * benchwork polygon to bind to. Nothing is auto-converted: guessing which
   * edge an owner's freehand pose meant would be inventing an intent. */
  edge?: EndplateEdge | null;
  /** Manual pose override (#175 phase 1b) — the endplate's module-local track
   * point (x, y inches) + outward-normal heading (°). Hand-entered for shapes
   * the geometry fields can't derive (wye, freeform, loop); wins over
   * deriveEndplatePoses' derivation. */
  pose?: { x: number; y: number; heading: number };
  /** Whether that pose was AUTHORED — placed or typed by the owner — rather
   * than a derived one that found its way into the doc (#182).
   *
   * Authorship used to be inferred from `pose` merely existing, so a derived
   * pose written back silently PINNED the plate: it stopped following the
   * module and went stale the moment the length changed (FMN-0068 ended up with
   * endplate B at x=48 on a 47.9″ board). A pose is only an override when the
   * owner meant it.
   *
   * Absent on A/B = derived residue, ignored. Absent on a placed branch
   * endplate (one with `at`) = still authored — placing it IS the gesture, and
   * docs predate this flag. */
  poseAuthored?: boolean;
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
 * A stretch where a pair of parallel tracks runs at something other than the
 * standard spacing, because a rigid assembly built to another spacing sits in
 * it (#180).
 *
 * The case this exists for: a crossover fixture is machined for ONE track
 * spacing and cannot be built to another. The Fast Tracks N crossovers are
 * 1.09″ where Free-moN §2.0 requires 1.125″, so a module with one genuinely has
 * its two mains 0.035″ closer together across the crossover, opening back to
 * 1.125″ at the endplates — which the standard fixes. That pinch is real, and
 * drawing it is more honest than drawing a straight pair.
 */
export interface LanePinch {
  /** The lane pulled in. Lane 0 is the reference and never moves. */
  lane: number;
  /** Inches from endplate A where the rigid section begins and ends. */
  fromPos: number;
  toPos: number;
  /** Centre-to-centre spacing INSIDE that span, inches. */
  spacingInches: number;
}

/**
 * How far either side of a rigid section the pair takes to reach it.
 *
 * ⚠️ A DRAWING CONVENTION, NOT A MEASUREMENT. Nobody publishes this and it is
 * not a property of any part — in the real world the builder eases the flex over
 * whatever room they have. It exists so the pinch renders as a smooth deviation
 * rather than a kink, and it is deliberately a round number so it never reads as
 * something that was measured.
 */
export const PINCH_EASE_INCHES = 3;

/**
 * The lane offset at a point, honouring any {@link LanePinch} covering it.
 *
 * Eases with a smoothstep, whose slope is zero at both ends, so the deviation
 * leaves and rejoins the straight run tangentially — the way bent flex actually
 * behaves. A linear ramp would put a visible corner at each end.
 *
 * ⚠️ ONLY THE PINCH'S OWN LANE MOVES. The main is the reference every Free-moN
 * measurement is taken from, so it stays put and the parallel track deviates,
 * which is also what a builder does.
 */
export function laneOffsetAt(
  lane: number,
  pos: number,
  pinches?: LanePinch[] | null,
  spacingInches = FREEMO_TRACK_SPACING_INCHES,
): number {
  const base = (lane ?? 0) * spacingInches;
  if (!lane || !pinches?.length) return base;
  const sign = Math.sign(lane);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let off = base;
  for (const p of pinches) {
    if (p.lane !== lane) continue;
    const a = Math.min(p.fromPos, p.toPos);
    const b = Math.max(p.fromPos, p.toPos);
    // The pinch names ONE lane step's spacing. A pinched lane 2 would need to
    // say which of its two gaps closed, and nothing records that: not modelled.
    const target = base - sign * (spacingInches * Math.abs(lane) - p.spacingInches);
    const e = PINCH_EASE_INCHES;
    let t: number | null = null;
    if (pos >= a && pos <= b) t = 1;
    else if (pos > a - e && pos < a) t = smooth((pos - (a - e)) / e);
    else if (pos > b && pos < b + e) t = smooth(1 - (pos - b) / e);
    if (t == null) continue;
    // Where two overlap the DEEPEST wins rather than summing: two crossovers in
    // the same place is a data error, not a doubly-tight pair.
    const candidate = base + (target - base) * t;
    if (Math.abs(candidate - base) > Math.abs(off - base)) off = candidate;
  }
  return off;
}

/**
 * The pinches a document's crossovers impose — one per crossover connector that
 * names a part whose {@link TrackPart.trackSpacing} differs from the standard.
 *
 * A crossover with no part named, or one built to the standard spacing, imposes
 * nothing: an owner who hasn't said what they built gets the straight pair they
 * had before, which is the only honest default.
 */
export function crossoverPinches(
  tracks: Array<{
    role?: string;
    lane?: number;
    fromPos?: number | null;
    toPos?: number | null;
    crossoverPartId?: string | null;
  }>,
  library = BUILT_IN_TRACK_PARTS,
  spacingInches = FREEMO_TRACK_SPACING_INCHES,
): LanePinch[] {
  const out: LanePinch[] = [];
  for (const t of tracks) {
    if (t.role !== "crossover" || !t.crossoverPartId) continue;
    const part = library.find((p) => p.id === t.crossoverPartId);
    const s = part?.trackSpacing?.inches;
    if (typeof s !== "number" || !Number.isFinite(s) || s <= 0) continue;
    if (Math.abs(s - spacingInches) < 1e-9) continue;
    const lane = t.lane ?? 1;
    if (!lane) continue;
    const a = t.fromPos ?? 0;
    const b = t.toPos ?? 0;
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-9) continue;
    const pinch = {
      lane,
      fromPos: Math.min(a, b),
      toPos: Math.max(a, b),
      spacingInches: s,
    };
    // ⚠️ A DOUBLE CROSSOVER IS TWO CONNECTORS AND ONE PINCH. It is built as two
    // diagonals, so the document holds two records over the same
    // span at the same spacing — but the pair of tracks only closes up once.
    // Left un-deduped the geometry is still right (identical pinches agree), so
    // this shows up as a doubled CALLOUT rather than a wrong drawing: the label
    // renders twice, exactly superimposed.
    const same = out.some(
      (p) =>
        p.lane === pinch.lane &&
        Math.abs(p.fromPos - pinch.fromPos) < 1e-9 &&
        Math.abs(p.toPos - pinch.toPos) < 1e-9 &&
        Math.abs(p.spacingInches - pinch.spacingInches) < 1e-9,
    );
    if (!same) out.push(pinch);
  }
  return out;
}

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
  /** The flex product this run is laid with — a slug from the parts library
   * (#193). Absent = the default. Per TRACK, so a module can have its mains in
   * one product and a siding in another. */
  flexPartId?: string | null;
  /** Authored rail joints, inches along this run. Absent = derived from the
   * product's maximum piece length. Present = these are the ONLY joints, so an
   * owner's deliberate cut survives a change elsewhere on the module. */
  flexCuts?: number[] | null;
  /** `role: "crossover"` only — the crossover product this connector was built
   * from, a slug from the parts library.
   *
   * It sits on the CONNECTOR rather than on the turnouts at its ends because a
   * crossover is one assembly: the fixture that set its angle also set its
   * {@link TrackPart.trackSpacing}, and that spacing belongs to the pair of
   * tracks, not to either turnout. Naming it is what lets the physical view draw
   * the crossover at the spacing it was actually built to — the Fast Tracks N
   * fixtures are 1.09″ against Free-moN's 1.125″, and the difference is real. */
  crossoverPartId?: string | null;
  /** The owner's MEASURED usable length, real inches (#20) — for what the
   * drawing can't know: a bumper post short of the drawn end, a structure
   * fouling the track. Absent = derive it from the clearance points (#19). */
  measuredUsableInches?: number | null;
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
  /** The library part this turnout IS — e.g. "atlas-c55-n-7". Binds a drawn
   * turnout to real geometry: with it the renderer can draw the part's own
   * outline instead of a shape derived from `size`. Absent means "just a #N",
   * which is what every turnout authored before the parts library was. */
  partId?: string | null;
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
  /** Benchwork HOLE — an inner boundary punched out of `outline`, making the
   * board a DONUT (a return loop's open middle). Same frame as `outline`; stored
   * as an open ring, renderers close it. Absent = a solid board. */
  outlineInner?: BenchworkPoint[];
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
  /** This board's WEST end (the A side) — see {@link SectionEnd}. */
  endA?: SectionEnd | null;
  /** This board's EAST end (the B side). */
  endB?: SectionEnd | null;
}

/**
 * One end of a board (#130).
 *
 * Owner's question was *"how would I update my section joints to be endplates
 * from within MR?"* — and until now nothing could say it: a section had a
 * length, a shape and an outline, but nothing about its ends.
 *
 * ⚠️ **There is deliberately no "this is an endplate" flag.** An owner could
 * tick it wrongly and the registry would then tell Free-Dispatcher that two
 * boards will physically mate when they won't. The geometry decides — describe
 * the end and {@link assessSectionEnd} works out whether it conforms.
 *
 * Absent means **not described**, which is an ordinary internal joint, not a
 * failing endplate: the standard exempts internal boundaries from the
 * end-interface rules (#96).
 */
export interface SectionEnd {
  /** What this end presents. `"none"` = a closed end (a bumper). */
  config?: TrackConfig | "none" | null;
  /** Face width, inches. Absent = the recommended default. */
  widthInches?: number | null;
  /** Main 1's signed distance from the face centre — the standard's own
   * framing, same as an endplate's (see {@link endplateTrackOffsetInches}). */
  trackOffsetInches?: number | null;
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
        // The board's two ends (#130). Written only when actually described —
        // an absent end is an ordinary internal joint, and an empty object
        // would claim the owner had said something about it.
        ...(sectionEnd(sec.endA) ? { endA: sectionEnd(sec.endA)! } : {}),
        ...(sectionEnd(sec.endB) ? { endB: sectionEnd(sec.endB)! } : {}),
      };
    });
}

/** Normalise one board end, or null when nothing was actually said about it
 * (#130). Keeps `{}` and `{ config: null }` from round-tripping as a described
 * end — see {@link SectionEnd}. */
function sectionEnd(end: SectionEnd | null | undefined): SectionEnd | null {
  if (!end) return null;
  const config =
    end.config === "single" || end.config === "double" || end.config === "none"
      ? end.config
      : null;
  const w = end.widthInches;
  const o = end.trackOffsetInches;
  const out: SectionEnd = {
    ...(config ? { config } : {}),
    ...(typeof w === "number" && Number.isFinite(w) && w > 0 ? { widthInches: w } : {}),
    // Signed, and 0 is meaningful ("explicitly centred", #93) — keep any finite.
    ...(typeof o === "number" && Number.isFinite(o) ? { trackOffsetInches: o } : {}),
  };
  return Object.keys(out).length ? out : null;
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

/**
 * Arc length of an authored path, inches — the path's OWN length, independent of
 * where it sits or which way it runs. A branch route to a third endplate (#181)
 * has no meaningful extent along the module axis (a square 90° exit projects to
 * zero), so its own length is the only honest measure of it.
 */
export function pathLengthInches(
  path: BenchworkPoint[] | null | undefined,
): number {
  const pts = trackPath(path);
  if (!pts) return 0;
  const poly = samplePath(pts);
  let total = 0;
  for (let i = 1; i < poly.length; i++)
    total += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  return total;
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
   * centre-line the plate centre is half a track spacing toward Main 2. Single
   * track crosses at the centre ⇒ 0, and an off-centre track is a signed value.
   * {@link endplateCentreOffsetInches} computes it from what the owner authored.
   *
   * ⚠️ OMITTING an end no longer means 0 — it means "use §2.0", which is a
   * straddle on a double end. Centring a double plate on Main 1 drew its pair
   * wholly to one side, which is what the read-only and catalog views did by
   * passing nothing at all (#190). Pass an explicit number to place a plate. */
  endplateTrackOffsets?: Record<string, number>;
  /** Whether Main 2 runs BELOW Main 1 (`mainsSwapped`, #131). Only affects which
   * way an unauthored double plate straddles. */
  mainsSwapped?: boolean;
  /** Authored benchwork outline (module-local inches), or absent for the band. */
  outline?: BenchworkPoint[] | null;
  /** Authored benchwork HOLE — the inner boundary punched out of `outline` to
   * make a donut. Absent/short = a solid board. */
  outlineInner?: BenchworkPoint[] | null;
  /** The module's sections (#96 phase 2). When any carries an outline, the
   * module's footprint is the union of those — `outline` is then ignored. */
  sections?: SchematicSection[] | null;
  /** Authored mainline centre-line (module-local inches, open path with arcs).
   * When present it wins over the geometry-derived centre-line — the owner drew
   * the real shape (#2d-track, physical view only). */
  mainPath?: BenchworkPoint[] | null;
  /** A balloon / return loop — the centre-line turns back on itself, so its far
   * end is the THROAT, not an endplate; only endplate A's face is emitted (#loop). */
  loop?: boolean;
  /** Axial endplate configs (A first, then B), same as
   * {@link ModuleGeometryInput.endplateConfigs}. `"none"` at B means the module
   * presents no far endplate, so no face is emitted there (#184/#191). */
  endplateConfigs?: ("single" | "double" | "none" | null | undefined)[];
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
  /** Authored HOLE (arc-sampled closed ring) punched out of `outline` → a donut
   * board. Null = solid. Renderers fill `outline` with `outlineInner` cut out. */
  outlineInner: BenchworkPoint[] | null;
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
  // Where each plate's CENTRE sits relative to Main 1. The DEFAULT is §2.0's
  // geometry, not zero — a caller that says nothing about a double end still
  // gets a plate its two tracks straddle (#190).
  const offOf = (i: number, id: string) =>
    input.endplateTrackOffsets?.[id] ??
    endplateCentreOffsetInches({
      config: input.endplateConfigs?.[i],
      main2Below: input.mainsSwapped === true,
    });
  const offA = offOf(0, "A");
  const offB = offOf(1, "B");
  // A module built from shaped sections IS its sections — the whole-module
  // outline stops speaking for it, so don't hand back both and leave renderers
  // to guess which wins (#96 phase 2).
  //
  // EXCEPT a LONE section with no shape of its own: that section IS the module,
  // so its derived band says nothing the authored outline doesn't already say —
  // and letting it win ORPHANED the owner's corners (drawn as faint context,
  // uneditable, while the Objects list still counted them). That's Steve's
  // "benchwork points are set but the benchwork is not drawn" (#173). Two or
  // more sections still own the shape, so a multi-board module keeps its split.
  const secs = input.sections ?? [];
  const sectionsOwnShape =
    secs.length > 1 || secs.some((s) => (s.outline?.length ?? 0) >= 3);
  const sectionOutlines = sectionsOwnShape
    ? sectionFootprints(input, {
        centerline,
        widthA,
        widthB,
        offsetA: offA,
        offsetB: offB,
      })
    : [];
  return {
    centerline,
    band: benchworkBand(centerline, widthA, widthB, offA, offB),
    // Only emit a face where the module actually presents one. A loop's
    // centre-line ends at the THROAT, and an end of the line / pocket simply
    // stops — a far face there is a plate the module hasn't got (#191).
    endplateFaces: hasNoFarEndplate(input)
      ? endplateFaceSegments(centerline, widthA, widthB, offA, offB).slice(0, 1)
      : endplateFaceSegments(centerline, widthA, widthB, offA, offB),
    outline: sectionOutlines.length || !authored ? null : sampleBenchworkOutline(authored),
    // The donut hole, arc-sampled — only when there's a solid outline to punch it
    // out of (a sectioned module isn't a donut). Renderers cut it from `outline`.
    outlineInner:
      sectionOutlines.length || !authored || !input.outlineInner || input.outlineInner.length < 3
        ? null
        : sampleBenchworkOutline(input.outlineInner),
    sectionOutlines,
  };
}

/**
 * Where an endplate's CENTRE sits relative to MAIN 1 — the renderer's framing,
 * and the one number a drawing needs to place the plate.
 *
 * ⭐ THE single definition. Two callers had their own: the builder computed it
 * inline (swap-aware), and the read-only/catalog footprint **passed nothing at
 * all**, so every plate there was centred on Main 1 — a double end drew its pair
 * entirely to one side of the plate instead of straddling it (#190).
 *
 * §2.0 puts a double end's two tracks 0.5625″ either side of the plate centre,
 * so the plate centre is half a track spacing away from Main 1 — **toward Main
 * 2**, which is why the swap matters: with Main 2 below, the plate centre is
 * below too. An authored offset always wins (an off-centre end is legal since
 * the 20220628 revision), and is given in the standard's own framing — Main 1's
 * distance from the plate centre — so it comes back negated here.
 */
export function endplateCentreOffsetInches(input: {
  config?: TrackConfig | "none" | null;
  /** Main 1's signed distance from the plate centre, as authored. */
  authoredTrackOffsetInches?: number | null;
  /** Whether Main 2 runs below Main 1 (the mains are swapped). */
  main2Below?: boolean;
}): number {
  // Simply the other framing of the same fact, so there is ONE default to get
  // right rather than two that can disagree.
  const v = -endplateTrackOffsetInches(
    input.authoredTrackOffsetInches,
    input.config ?? undefined,
    input.main2Below,
  );
  return v === 0 ? 0 : v; // never hand back -0
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
  /** Whether Main 2 runs BELOW Main 1 (the mains are swapped). The pair
   * straddles the plate centre either way, so Main 1 sits on the side AWAY from
   * Main 2 — low when Main 2 is high, high when it's low. Omitting this
   * hard-coded "Main 2 is above", which is the assumption behind #190. */
  main2Below = false,
): number {
  if (typeof authored === "number" && Number.isFinite(authored)) return authored;
  if (config !== "double") return 0;
  const half = FREEMO_TRACK_SPACING_INCHES / 2;
  return main2Below ? half : -half;
}

/** A Free-moN conformance problem with an endplate's width/track placement. */
export interface EndplateWidthIssue {
  /** "narrow" = below the 12″ minimum; "clearance" = a track too near a fascia;
   * "offcentre" = a double end whose pair doesn't straddle the plate centre. */
  code: "narrow" | "clearance" | "offcentre";
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
  /** Whether Main 2 runs BELOW Main 1 (the mains are swapped). Without it a
   * double end's second track was assumed to be one spacing ABOVE Main 1, so a
   * swapped pair was measured on the wrong side of the plate (#190). */
  main2Below?: boolean;
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
  const off = endplateTrackOffsetInches(
    input.trackOffsetInches,
    input.config ?? undefined,
    input.main2Below,
  );
  // Main 2 sits one spacing from Main 1, on Main 2's OWN side — below when the
  // mains are swapped. Assuming "above" put a swapped pair on the wrong side of
  // the plate and demanded a wider end than the geometry needs (#190).
  const second = off + (input.main2Below ? -1 : 1) * FREEMO_TRACK_SPACING_INCHES;
  const centres = input.config === "double" ? [off, second] : [off];
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
  // §2.0 puts a double end's two tracks 0.5625″ EITHER SIDE of the plate centre.
  // Off-centre is legal — the 20220628 revision relaxed centring to a
  // recommendation — but a pair sitting wholly to one side is worth saying out
  // loud, because it's almost always an accident: an authored 0 reads as "centre
  // Main 1", which pushes the whole pair off the plate's middle (#190).
  if (input.config === "double") {
    const mid = (off + second) / 2;
    if (Math.abs(mid) > 0.01) {
      issues.push({
        code: "offcentre",
        message:
          `The two tracks sit ${round2(Math.abs(mid))}″ off the centre of this endplate. ` +
          `The standard recommends they straddle it — Main 1 at ` +
          `${round2((input.main2Below ? 1 : -1) * (FREEMO_TRACK_SPACING_INCHES / 2))}″. ` +
          `Clear the offset to use that.`,
        // Not a width problem — no wider plate fixes it — so hand back the
        // width unchanged rather than imply one would.
        requiredInches: width,
      });
    }
  }
  return issues;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function endplateWidthFor(widths: Record<string, number> | undefined, id: string): number {
  const w = widths?.[id];
  return typeof w === "number" && w > 0 ? w : FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES;
}

/**
 * Whether a module presents NO far endplate — one conforming face only.
 *
 * ⭐ THE single definition. Three places had grown their own answer to this and
 * drifted: `deriveEndplatePoses` (which knew about `dead_end` and `"none"`), the
 * operations preview's end label, and `moduleFootprint`'s endplate faces — the
 * last two using "is it a loop?" as a stand-in for "has it got two ends?", which
 * was true until #184 and silently wrong after. Anything asking this must call
 * THIS.
 *
 * Three ways to have one end, and they are genuinely different things: the
 * geometry is a dead end; it's a balloon loop, whose far end is the throat and
 * not a plate at all; or the owner said this end has no plate, which is how an
 * *end of the line* or a *pocket* is authored — ordinary straight boards that
 * simply stop, so no geometry type would ever say it for them.
 */
export function hasNoFarEndplate(input: {
  geometryType?: string | null;
  loop?: boolean;
  endplateConfigs?: ("single" | "double" | "none" | null | undefined)[];
}): boolean {
  return (
    input.geometryType === "dead_end" ||
    input.loop === true ||
    input.endplateConfigs?.[1] === "none"
  );
}

/**
 * Whether a doc is a balloon loop — **the authored flag, and only that**.
 *
 * ⚠️ This used to ALSO infer a loop from `endplates.length === 1`, which was
 * safe only while the sole way to have one endplate was to be a turnback. #184
 * ended that: an *end of the line* or a *pocket* presents one conforming face
 * too, so every single-ended module was silently classified as a loop — drawn
 * with a bulb, its endplate A relabelled "Entry", and positions past the throat
 * read as being inside a balloon that doesn't exist (#191).
 *
 * A loop is now only ever a loop because someone said so: the Loop checkbox and
 * the return-loop generator both set `loop: true`. Checked before removing the
 * inference — no stored doc relied on it (no module in the catalogue has one
 * endplate without the flag, and none is `category:"loop"` or `dead_end`).
 */
export function isLoopDoc(doc: ModuleSchematicDoc): boolean {
  return doc.loop === true;
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

/**
 * How far the two routes must separate before a car on one clears equipment on
 * the other — the CLEARANCE POINT's defining distance (#19).
 *
 * ⭐ Deliberately the **Free-moN track spacing**, not a second number. §2.0 uses
 * 1.125″ as the distance at which two parallel tracks coexist, so "a car here
 * clears a car there" is the same statement the standard already makes. It's
 * 15 scale feet centre to centre, inside the prototype's usual 13–15 ft range.
 *
 * The alternative — a separate prototype constant — would leave the app holding
 * two spacings that disagree about what "clear" means.
 */
export const CLEARANCE_SPACING_INCHES = FREEMO_TRACK_SPACING_INCHES;

/**
 * How far past the FROG a turnout's diverging route reaches the clearance point
 * (#19) — the point from which usable capacity is measured.
 *
 * Not a measurement and not a guess: it's solved from the closure the drawing
 * already uses, by asking where `offsetAt` first reaches
 * {@link CLEARANCE_SPACING_INCHES}. So it follows the part's real lead, and a
 * better-measured part moves it automatically.
 *
 * Returns the distance PAST THE FROG because `pos` means the frog (#132) — add
 * it to the turnout's position, in the direction the turnout faces.
 */
export function clearancePointPastFrogInches(
  size: number,
  library = BUILT_IN_TRACK_PARTS,
  clearanceInches = CLEARANCE_SPACING_INCHES,
): number {
  const N = size > 0 ? size : 6;
  const lead = leadInchesForSize(N, library);
  const cl = turnoutClosure(N, { leadInches: lead });
  // The profile rises monotonically, so bisect — cheap, and it doesn't care
  // which branch of the closure (switch curve, frog angle, ease) the answer
  // lands in.
  let lo = 0;
  let hi = Math.max(4 * lead, 4 * clearanceInches * N);
  if (cl.offsetAt(hi) < clearanceInches) return hi - lead;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cl.offsetAt(mid) < clearanceInches) lo = mid;
    else hi = mid;
  }
  return Math.max(0, hi - lead);
}

/** A track's usable capacity, measured to the clearance-point standard (#19). */
export interface UsableCapacity {
  /** The stretch a car can actually stand on, inches along the run. */
  fromPos: number;
  toPos: number;
  /** Its length — what capacity is computed from. */
  usableInches: number;
  /** The run's full drawn length, for comparison. */
  drawnInches: number;
  /** How much each end gives up to its governing turnout's clearance point. */
  givenUpInches: number;
  /** Cars that fit in the usable length. */
  cars: number;
  /** Usable length as scale feet. */
  scaleFeet: number;
}

/**
 * A track's USABLE capacity — measured from the governing turnout's clearance
 * point, not from the rail ends (#19/#20).
 *
 * A spur runs clearance point → end of track; a siding, clearance point →
 * clearance point. The difference is not small: FMN-0040's 70″ passing siding
 * has two #7s on it, and loses 5.4″ at each end — 21 cars drawn, 17 usable.
 *
 * `measuredUsableInches` is the owner's override for what the drawing can't
 * know — a bumper post short of the drawn end, a structure fouling the track.
 * Given, it wins outright and the clearance points aren't applied to it: they
 * measured the usable length itself.
 */
export function usableCapacity(input: {
  fromPos: number;
  toPos: number;
  /** Turnouts that DIVERGE ONTO this track — the ones that govern its ends. */
  governing?: { pos: number; size?: number | null }[] | null;
  /** The owner's measured usable length, inches. Wins when present. */
  measuredUsableInches?: number | null;
  library?: TrackPart[];
  carLengthInches?: number;
}): UsableCapacity {
  const lo = Math.min(input.fromPos, input.toPos);
  const hi = Math.max(input.fromPos, input.toPos);
  const drawn = hi - lo;
  const carLen = input.carLengthInches ?? N_CAR_LENGTH_INCHES;

  if (typeof input.measuredUsableInches === "number" && input.measuredUsableInches >= 0) {
    const m = input.measuredUsableInches;
    return {
      fromPos: lo,
      toPos: lo + m,
      usableInches: m,
      drawnInches: drawn,
      givenUpInches: Math.max(0, drawn - m),
      cars: carCapacity(0, m, carLen),
      scaleFeet: Math.round(inchesToScaleFeet(m)),
    };
  }

  // Each governing turnout pushes the END NEAREST IT inward to its clearance
  // point. Nearest, not "the low one": a siding's two turnouts sit at its two
  // ends, and a spur's single turnout may govern either.
  let a = lo;
  let b = hi;
  for (const sw of input.governing ?? []) {
    const c = clearancePointPastFrogInches(sw.size ?? 6, input.library);
    if (Math.abs(sw.pos - lo) <= Math.abs(sw.pos - hi)) a = Math.max(a, lo + c);
    else b = Math.min(b, hi - c);
  }
  const usable = Math.max(0, b - a);
  return {
    fromPos: a,
    toPos: Math.max(a, b),
    usableInches: usable,
    drawnInches: drawn,
    givenUpInches: Math.max(0, drawn - usable),
    cars: carCapacity(0, usable, carLen),
    scaleFeet: Math.round(inchesToScaleFeet(usable)),
  };
}

/** What a board's end is, once the geometry has been asked (#130). */
export interface SectionEndAssessment {
  /** Has the owner described this end at all? Undescribed is an ordinary
   * internal joint — exempt from the end-interface rules (#96) — not a failure. */
  described: boolean;
  /** Does it meet the standard's end-interface rules? Only a described end can. */
  conforming: boolean;
  /** Why it doesn't, when it doesn't. Empty for a conforming or undescribed end. */
  issues: EndplateWidthIssue[];
  /** The resolved values the assessment was made against. */
  config: TrackConfig | "none";
  widthInches: number;
  trackOffsetInches: number;
}

/**
 * Is this end of a board a standard endplate? (#130)
 *
 * ⭐ **Derived, never declared.** The issue is emphatic and the reason is good:
 * a checkbox could be ticked wrongly, and the registry would then promise
 * Free-Dispatcher a mating surface that doesn't exist. So the answer comes from
 * the same rules {@link checkEndplateWidth} already applies to a module's own
 * plates — §1.1's 12″ minimum, and §2.0's 4″ fascia clearance and 1.125″ pair.
 *
 * Two of the standard's conditions aren't checked because they can't be false
 * here: track crosses the face **perpendicular** and a double end's two tracks
 * sit **1.125″ apart** are both true by construction in this model. Inventing
 * fields for them would be inventing ways to be wrong.
 *
 * An end with no config is **undescribed**, which is the ordinary case — most
 * joints inside a module are just joints.
 */
export function assessSectionEnd(
  end: SectionEnd | null | undefined,
  opts: { main2Below?: boolean } = {},
): SectionEndAssessment {
  const config = (end?.config ?? "none") as TrackConfig | "none";
  const widthInches = endplateWidthInches({ widthInches: end?.widthInches });
  const trackOffsetInches = endplateTrackOffsetInches(
    end?.trackOffsetInches,
    config,
    opts.main2Below,
  );
  // "Described" means the owner said what this end PRESENTS. A width alone
  // doesn't make a joint an interface; a track configuration does.
  const described = config === "single" || config === "double";
  if (!described) {
    return { described: false, conforming: false, issues: [], config, widthInches, trackOffsetInches };
  }
  const issues = checkEndplateWidth({
    widthInches: end?.widthInches,
    config,
    trackOffsetInches: end?.trackOffsetInches,
    main2Below: opts.main2Below,
  });
  return { described: true, conforming: issues.length === 0, issues, config, widthInches, trackOffsetInches };
}

/** Two board ends meeting at a joint, and whether that joint is a standard
 * interface (#130). */
export interface SectionJointAssessment {
  west: SectionEndAssessment;
  east: SectionEndAssessment;
  /** Both ends conform AND present the same number of tracks — so these two
   * boards could be separated and each used against any other module. */
  standardInterface: boolean;
  /** Plain-language reason it isn't one, or null when it is. */
  reason: string | null;
}

/**
 * Assess a joint — the two board ends that meet there (#130).
 *
 * ⚠️ Track COUNT is the only compatibility rule. Two conforming ends of
 * differing face WIDTH still mate: the standard lets plates differ in width and
 * be offset, so long as the track lines up. That's a deliberate non-check — see
 * the note on endplate width authoring.
 */
export function assessSectionJoint(
  west: SectionEnd | null | undefined,
  east: SectionEnd | null | undefined,
  opts: { main2Below?: boolean } = {},
): SectionJointAssessment {
  const w = assessSectionEnd(west, opts);
  const e = assessSectionEnd(east, opts);
  let reason: string | null = null;
  if (!w.described || !e.described) {
    reason = "an internal joint — neither end has been described as an interface";
    if (w.described !== e.described)
      reason = `only the ${w.described ? "west" : "east"} side is described as an endplate`;
  } else if (!w.conforming || !e.conforming) {
    const bad = !w.conforming ? w : e;
    reason = bad.issues[0]?.message ?? "an end doesn't meet the standard";
  } else if (w.config !== e.config) {
    // Single↔double is the one real mismatch: the track counts don't line up.
    reason = `${w.config} meets ${e.config} — the track counts differ`;
  }
  return { west: w, east: e, standardInterface: reason === null, reason };
}

/** How much of a car-spot span has no rail under it (#194). */
export interface SpanOverhang {
  /** Inches the span runs past the track's near end (0 = it starts on track). */
  beforeInches: number;
  /** Inches it runs past the far end. */
  afterInches: number;
  /** The part of the span that IS on the track. */
  onTrackInches: number;
  /** Total overhang — `beforeInches + afterInches`. 0 = the span fits. */
  overhangInches: number;
}

/**
 * How far a car-spot span runs past the ends of the track it spots on (#194).
 *
 * An industry is a span with a start and an end, and its capacity is computed
 * from those — but nothing checked that the span fits on the siding it's
 * spotting. FMN-0013's "Team track" claims 29.8″ → 41″ on a track running
 * 30″ → 39″: about a car and a half of capacity with no rail under it.
 *
 * Both spans are given in the same coordinate (inches along the module) and
 * either may run "backwards" — a siding authored east-to-west is ordinary — so
 * both are normalised first.
 */
export function spanOverhang(input: {
  fromPos: number;
  toPos: number;
  trackFromPos: number;
  trackToPos: number;
}): SpanOverhang {
  const lo = Math.min(input.fromPos, input.toPos);
  const hi = Math.max(input.fromPos, input.toPos);
  const tLo = Math.min(input.trackFromPos, input.trackToPos);
  const tHi = Math.max(input.trackFromPos, input.trackToPos);
  const before = Math.max(0, tLo - lo);
  const after = Math.max(0, hi - tHi);
  return {
    beforeInches: before,
    afterInches: after,
    onTrackInches: Math.max(0, Math.min(hi, tHi) - Math.max(lo, tLo)),
    overhangInches: before + after,
  };
}

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

/** Repoint a turnout that diverges into the track it sits on at the OTHER main.
 * A reversed transition whose on-track was later set to the same main stored
 * `onTrack === divergeTrack` (#172): it then had no second route, so
 * `isTransitionTurnout` went false and the module derived as if it had no
 * transition at all — both mains running endplate to endplate. Applied on READ
 * so a doc saved in that state renders correctly everywhere without waiting for
 * its owner to open and re-save it. Returns the same array when nothing needs
 * healing, so untouched docs keep referential identity. */
function healSelfDivergingTurnouts(
  turnouts: SchematicTurnout[] | undefined,
): SchematicTurnout[] | undefined {
  if (!turnouts?.some((t) => t.onTrack === t.divergeTrack)) return turnouts;
  return turnouts.map((t) => {
    if (t.onTrack !== t.divergeTrack) return t;
    if (t.onTrack === MAIN_TRACK_ID) return { ...t, divergeTrack: MAIN2_TRACK_ID };
    if (t.onTrack === MAIN2_TRACK_ID) return { ...t, divergeTrack: MAIN_TRACK_ID };
    return t; // not a main — nothing sensible to repoint it at
  });
}

/** Parse a jsonb value into a schematic doc, or null if it isn't one.
 * EVERY read path goes through here (catalog, module page, my-modules, FD), so
 * it's also where a stored doc gets healed — see healSelfDivergingTurnouts. */
export function asModuleSchematic(x: unknown): ModuleSchematicDoc | null {
  if (!x || typeof x !== "object") return null;
  const d = x as Record<string, unknown>;
  if (typeof d.version !== "number") return null;
  if (!Array.isArray(d.endplates) || !Array.isArray(d.tracks)) return null;
  const doc = d as unknown as ModuleSchematicDoc;
  const healed = healSelfDivergingTurnouts(doc.turnouts);
  return healed === doc.turnouts ? doc : { ...doc, turnouts: healed };
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
  /** Measured usable length, real inches (#20). Absent = derived (#19). */
  measuredUsableInches?: number;
  /** `role: "crossover"` only — the crossover product this connector was built
   * from. Drives the spacing the pair is DRAWN at (see
   * {@link SchematicTrack.crossoverPartId}). */
  crossoverPartId?: string;
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
  /** The library part this turnout IS — see SchematicTurnout.partId. */
  partId?: string;
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
/** Endplate B's configuration — or `"none"`, meaning **the module has no far
 * endplate**: an end of the line, a pocket, or a loop's pure turnback. On a
 * loop, a standard endplate B instead makes the balloon an INTERCHANGE (a second
 * route connects there, e.g. Seaford). A module presents one conforming face,
 * or two, or more; the standard governs the faces it offers, not how many (#184). */
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
  /**
   * Flex track settings by TRACK id (#193) — which product a run is laid with,
   * and where the owner has decided its rail joints fall.
   *
   * One map rather than fields, because the MAINS aren't `extraTracks` (the main
   * IS the centre-line), so per-track settings would otherwise need a separate
   * pair of fields for Main 1 and Main 2 — four ways to say one thing. Round-trips
   * onto each track in the doc, where it's self-describing for Free-Dispatcher.
   */
  flexByTrack: Record<string, { partId?: string; cuts?: number[] }>;
  /** Authored endplate face widths by endplate id, inches (Free-moN 12″ min,
   * 24″ recommended). Absent id = the recommended default. */
  endplateWidths: Record<string, number>;
  /** Authored per-endplate TRACK offsets by id — the primary track's signed
   * distance from the plate centre, inches. Absent id = the §2.0 default. */
  endplateTrackOffsets: Record<string, number>;
  /** Endplate EDGE bindings by id (ADR 0001) — an endplate that is part of the
   * benchwork. Wins over a pose; nothing is auto-converted from one. */
  endplateEdges?: Record<string, EndplateEdge>;
  /** Benchwork footprint outline — polygon vertices in module-local inches
   * (endplate A's track point at the origin, mainline +x, perpendicular +y up).
   * Empty = no authored outline (fall back to the endplate-width band). */
  outline: BenchworkPoint[];
  /** Benchwork HOLE (donut inner boundary), module-local inches. Empty = a solid
   * board. Set by the return-loop generator; punched out of `outline`. */
  outlineInner: BenchworkPoint[];
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
    flexByTrack: {},
    endplateWidths: {},
    endplateTrackOffsets: {},
    outline: [],
    outlineInner: [],
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
  // Everything in the map is an override the owner placed or typed — a derived
  // pose never enters it (poseOverridesFromDoc filters those out on the way in),
  // so it's safe to mark every one authored. That's what stops a derived pose
  // round-tripping into a silent pin, and it cleans an already-affected doc the
  // next time its owner saves (#182).
  return endplates.map((e) =>
    overrides[e.id] ? { ...e, pose: overrides[e.id], poseAuthored: true } : e,
  );
}

/** Attach endplate EDGE bindings by id (ADR 0001).
 *
 * A binding is not an override — it says the endplate IS this edge of the
 * benchwork, so position, heading and width are read off the board and cannot
 * go stale. Written back verbatim; there is deliberately no conversion from a
 * `pose`, because guessing which edge someone's freehand placement meant would
 * be inventing their intent. */
function withEdges(
  endplates: SchematicEndplate[],
  edges: Record<string, EndplateEdge> | undefined,
): SchematicEndplate[] {
  if (!edges) return endplates;
  return endplates.map((e) => (edges[e.id] ? { ...e, edge: edges[e.id] } : e));
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

/**
 * Attach each track's flex settings (#193). Only what the owner has actually
 * chosen is written: an absent product means the default, and absent cuts mean
 * "derive them", which is a different thing from an empty list (that would mean
 * "one uncut piece, however long the run is").
 */
function withFlex(state: EditorState, tracks: SchematicTrack[]): SchematicTrack[] {
  return tracks.map((t) => {
    const f = state.flexByTrack?.[t.id];
    if (!f) return t;
    const cuts = f.cuts?.filter((c) => Number.isFinite(c)).sort((a, b) => a - b);
    return {
      ...t,
      ...(f.partId ? { flexPartId: f.partId } : {}),
      ...(cuts ? { flexCuts: cuts } : {}),
    };
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
      withEdges(
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
              // ⚠️ `configB: "none"` means the module HAS NO FAR ENDPLATE, and
              // that is not loop-only (#184). An *end of the line* or a *pocket*
              // presents one conforming face and the track simply stops. The
              // standard governs the ends a module offers for joining; it never
              // required a module to offer two. This used to coerce "none" to
              // "single" and emit a B regardless, so a single-ended module was
              // impossible to author.
              ...(state.configB !== "none"
                ? [
                    {
                      id: "B",
                      label: "East",
                      tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configB }],
                    },
                  ]
                : []),
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
    ), state.endplateEdges),
      state.endplateWidths,
      state.endplateTrackOffsets,
    ),
    // Flex settings are attached to every track at once, at the end — the array
    // below has half a dozen branches and adding two fields to each of them is
    // how they'd end up disagreeing (#193).
    tracks: withFlex(state, [
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
        // ⚠️ USABLE capacity, measured from the governing turnouts' CLEARANCE
        // POINTS (#19) — not the drawn rail-to-rail length, which counts track
        // a car can't stand on without fouling the route it diverged from.
        // FMN-0040's 70″ siding is 21 cars drawn and 17 usable.
        capacityFeet: usableCapacity({
          fromPos: t.fromPos,
          toPos: t.toPos,
          governing: state.turnouts.filter((sw) => sw.divergeTrack === t.id),
          measuredUsableInches: t.measuredUsableInches,
        }).scaleFeet,
        ...(typeof t.measuredUsableInches === "number" && t.measuredUsableInches >= 0
          ? { measuredUsableInches: t.measuredUsableInches }
          : {}),
        ...(state.loop && t.inLoop ? { inLoop: true } : {}),
        ...(t.crossoverPartId ? { crossoverPartId: t.crossoverPartId } : {}),
        ...(t.path && t.path.length >= 2 ? { path: t.path } : {}),
      })),
    ]),
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
      ...(t.partId ? { partId: t.partId } : {}),
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
    // Benchwork hole (donut inner boundary), when it's a real ring.
    ...(state.outlineInner.length >= 3 ? { outlineInner: state.outlineInner } : {}),
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
  // Keep HUNDREDTHS, not whole inches. Rounding to 1″ silently flattened every
  // authored position on load — Steve's 17.4″ frog read as 17″, Oxnard's 68.4″
  // spur as 68″ — and since the editor autosaves, the rounded value was written
  // back over the owner's measurement. #132 asks owners to type positions taken
  // off XTrkCAD to the tenth, so this was destroying exactly the precision we
  // requested (and left the editor disagreeing with every raw-doc renderer by up
  // to half an inch). Hundredths still absorb float noise from a real rescale.
  const sc = (p: number) => Math.round(p * scale * 100) / 100;

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
        // The crossover product this connector was built from — what makes the
        // physical view draw the pair at the spacing it was really built to.
        ...(typeof t.crossoverPartId === "string" && t.crossoverPartId
          ? { crossoverPartId: t.crossoverPartId }
          : {}),
        // Authored path kept as-drawn (a physical shape, not rescaled with length).
        ...(trackPath(t.path) ? { path: trackPath(t.path)! } : {}),
        // A MEASURED length is a real-world fact about the physical track, so it
        // rescales with the module exactly as its positions do (#20).
        ...(typeof t.measuredUsableInches === "number" && Number.isFinite(t.measuredUsableInches)
          ? { measuredUsableInches: sc(t.measuredUsableInches) }
          : {}),
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
  // ⭐ Edge bindings (ADR 0001) — an endplate that IS part of the benchwork.
  // Carried through unscaled: an edge index is a reference, not a dimension.
  const endplateEdges: Record<string, EndplateEdge> = {};
  for (const e of d!.endplates ?? []) {
    if (e.edge && Number.isFinite(e.edge.index) && e.edge.index >= 0)
      endplateEdges[e.id] = {
        index: Math.trunc(e.edge.index),
        ...(e.edge.section ? { section: e.edge.section } : {}),
        ...(Number.isFinite(e.edge.fromT as number) ? { fromT: e.edge.fromT } : {}),
        ...(Number.isFinite(e.edge.toT as number) ? { toT: e.edge.toT } : {}),
      };
    if (typeof e.widthInches === "number" && e.widthInches > 0)
      endplateWidths[e.id] = e.widthInches;
    // Signed, and 0 is meaningful (explicitly centred) — keep any finite value.
    if (typeof e.trackOffsetInches === "number" && Number.isFinite(e.trackOffsetInches))
      endplateTrackOffsets[e.id] = e.trackOffsetInches;
  }
  // Flex settings by track id (#193). Cuts are positions ALONG the run, so they
  // rescale with the module exactly as fromPos/toPos do — a rescaled module
  // whose joints stayed put would have them landing in different places.
  const flexByTrack: Record<string, { partId?: string; cuts?: number[] }> = {};
  for (const t of d!.tracks ?? []) {
    const partId = typeof t.flexPartId === "string" && t.flexPartId ? t.flexPartId : undefined;
    // An EMPTY authored list is meaningful — "no joints, one uncut piece" — and
    // is a different statement from absent, which means "derive them".
    const cuts = Array.isArray(t.flexCuts)
      ? t.flexCuts.filter((c) => Number.isFinite(c)).map(sc).sort((a, b) => a - b)
      : undefined;
    if (partId || cuts) flexByTrack[t.id] = { ...(partId ? { partId } : {}), ...(cuts ? { cuts } : {}) };
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
  // Benchwork hole (donut inner boundary), kept as authored like the outline.
  const outlineInner = (d!.outlineInner ?? [])
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
    // NO ENDPLATE B ⇒ "none", whatever kind of module this is. On a loop that
    // reads as a pure turnback (a present B makes it an interchange); on an end
    // of the line or a pocket it simply means the module has one face (#184).
    // ⚠️ This used to be `loop && !hasB`, so "none" only survived a round trip on
    // a loop — which passed its test yesterday ONLY because a single-endplate
    // module was still being misclassified as one (#191). The absence of the
    // plate is the fact; why it's absent doesn't change what to read.
    configB: hasB ? configOf("B") : "none",
    branches: branchEps.map((ep) => ({
      label: ep.label ?? "Branch",
      pos: sc(ep.at!.pos),
      side: ep.at!.side === "down" ? "down" : "up",
      config: ep.tracks?.[0]?.config === "double" ? "double" : "single",
      kind: ep.kind === "main" ? "main" : "branch",
      trackId: ep.trackId ?? null,
    })),
    poseOverrides,
    flexByTrack,
    endplateWidths,
    endplateTrackOffsets,
    endplateEdges,
    outline,
    outlineInner,
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
    // Heal a turnout that diverges into the track it sits on (#172) with the
    // same helper the read path uses, so the editor and every renderer agree.
    turnouts: (healSelfDivergingTurnouts(d!.turnouts) ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? "",
      pos: sc(t.pos),
      onTrack: t.onTrack,
      divergeTrack: t.divergeTrack,
      kind: (t.kind as TurnoutKind) ?? "right",
      ...(t.size ? { size: t.size } : {}),
      ...(t.curved ? { curved: true } : {}),
      ...(t.flipped ? { flipped: true } : {}),
      ...(t.partId ? { partId: t.partId } : {}),
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
/**
 * A route leaving the module at a third endplate — and an endplate is an
 * endplate, whatever letter it carries (#183).
 *
 * There is no split in the standard between "the two ends" and "the others": an
 * endplate is the standardised face where a module joins another module, and a
 * module may present two, three, or one. So a route to C is drawn the way a
 * route to A or B is drawn — **it runs to the edge of the module and terminates
 * in an endplate face carrying its letter**, rather than stopping partway along
 * the strip as a stub.
 *
 * ⚠️ Because it runs the full width it would otherwise read as just another
 * parallel main, which is exactly the confusion a dispatcher must not have. Its
 * lane is therefore placed with a clear GAP beyond every other lane (see
 * `laneGapFromOthers`), and it ends at a plate rather than running off the edge.
 * The two requirements — full width, and not-a-parallel-main — are in tension by
 * design, and the separation is what resolves it.
 *
 * The LETTER is the module's own fact and is fine to draw. The DESTINATION
 * ("to Fillmore") depends on which module is physically attached at that
 * junction, so it stays Free-Dispatcher's to derive at runtime.
 */
export interface BranchConnector {
  /** Endplate id — "C", "D", … */
  id: string;
  /** The owner's local name for the plate. NOT the destination — that depends
   * on what's physically attached, so FD derives it at runtime. */
  label: string;
  /** The route's own name, from the track. */
  name: string;
  /** The branch track's id. */
  trackId: string;
  /** Whether the route IS a main (a diverging/split main) or a secondary
   * branch line. Drives drawn weight, not geometry. */
  kind: "branch" | "main";
  /** Where it leaves its host main. */
  posFrac: number;
  /** The host track's lane — a branch need not leave Main 1. Renderers must
   * start the diverge HERE, not at a hard-coded lane 0. */
  fromLane: number;
  /** Which side of the module it exits. */
  side: "up" | "down";
  /** The branch's own lane, signed by `side`, placed a clear GAP beyond every
   * other lane so it can't be mistaken for a parallel main — already folded
   * into laneMin/laneMax. */
  lane: number;
  /** Where the run ends and the endplate face is drawn: the module EDGE, 0 or
   * 1, because this is an end of the module like any other (#183). */
  endFrac: number;
  /** The route's own arc length on this module, inches — for the tooltip. The
   * drawn run is the strip's width, not this. */
  lengthInches: number;
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
  /** Main 2's drawn lane — +1 above Main 1 by default, −1 below when the mains
   * are swapped (#131/#172). Null when there is no Main 2. Renderers must draw
   * Main 2 (and its diverges) at THIS lane, never a hard-coded +1. */
  main2Lane: number | null;
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
  /** Whether the module presents a far endplate at all. False for an *end of
   * the line* or a *pocket*, which offer one conforming face and simply stop
   * (#184) — a renderer must not label that end, or it announces a plate the
   * module hasn't got and invites something to be coupled to it (#191). A loop
   * is separate: see {@link loop} and {@link loopInterchange}. */
  hasEndplateB: boolean;
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
/** N-scale track gauge, inches (9 mm). */
export const RAIL_GAUGE_INCHES = 0.354;
/**
 * ⚠️⚠️ **DEAD — REFUTED *AND* BASELESS. NOTHING SHOULD REACH THIS.** Kept only
 * so a library with no measured leads at all still returns a number, and as a
 * record of how the mistake was made.
 *
 * It was points→frog for a #1 frog: a turnout's LEAD if lead were proportional
 * to frog number, from an Atlas #7 measuring 3⅜″ (Steve Branton, #173) ⇒
 * 3.375 / 7.
 *
 * TWO independent things are wrong with it:
 * 1. **Lead is not proportional to N.** Measured lead ÷ N: #5 = 0.600,
 *    #7 = 0.513, #10 = 0.494. It reads ~20% SHORT at N=5.
 * 2. **Its founding measurement was superseded.** Will Gage re-measured the same
 *    part at 3¹⁹⁄₃₂″, ⁷⁄₃₂″ longer, confirmed against his own points and frog
 *    positions. So 0.482 is not even the right constant for the wrong model.
 *
 * {@link leadInchesForSize} now INTERPOLATES across the measured parts instead.
 * A single measurement can only ever be scaled — which is this rule — so the
 * lesson is that one data point cannot support a shape, only a value.
 *
 * A constant-switch-angle model was also proposed here and is likewise REFUTED:
 * inverting {@link turnoutClosure} gives α = 0.036 (#5), 0.067 (#7), 0.043
 * (#10). Kept as a warning — it was floated when the #7 and #10 agreed to 3%,
 * on a #10 figure that later turned out to be measured to the wrong landmark.
 * TWO AGREEING PARTS ARE NOT A LAW, and neither is a coincidence you haven't
 * checked the provenance of.
 *
 * The pattern that currently fits is on {@link ATLAS_CODE55_N}: the moulding
 * runs past the frog far enough to gain a constant 0.25″ of separation. Note it
 * predicts the FROG POSITION, not the lead — this constant has no successor.
 */
export const TURNOUT_LEAD_INCHES_PER_FROG = 0.482;

// ---- Track parts library (#179 stage 3) ------------------------------------
//
// Real commercial track parts, so a turnout drawn in MR is dimensionally the
// part the owner will actually lay. Two sources, deliberately kept apart:
//
//   1. BUILT-IN parts below — our own data, from manufacturer specs and owner
//      measurements. Dimensions are facts, so this is safe to publish.
//   2. IMPORTED parts — `parseXtpLibrary()` reads an owner's OWN XTrkCAD .xtp.
//      We deliberately DON'T redistribute those files: they ship with a GPL
//      program, carry individual attribution ("Design by …") and no license of
//      their own. Owners who have XTrkCAD already have the data.
//
// ⚠️ Every dimension records WHERE IT CAME FROM. Published specs for N-scale
// turnout leads are scarce — most of what's out there is derived or measured —
// and a derived number that looks like a spec is how bad geometry becomes
// permanent. If you improve a value, update its `source` with it.

/** Where a dimension came from. `derived` = we computed it from another part or
 * a rule of thumb; `unverified` = plausible but unconfirmed — treat with care. */
export type DimensionSource = "manufacturer" | "measured" | "derived" | "unverified";

export interface PartDimension {
  inches: number;
  source: DimensionSource;
  /** Who measured it / which spec, so it can be re-checked. */
  note?: string;
}

/** Same provenance discipline as {@link PartDimension}, for angles. */
export interface PartAngle {
  deg: number;
  source: DimensionSource;
  note?: string;
}

export interface TrackPart {
  /** Stable slug, e.g. "atlas-c55-n-7". */
  id: string;
  manufacturer: string;
  /** Product line — "Code 55", "Code 80". */
  line: string;
  scale: "N";
  name: string;
  /** `flex` is track sold by the length rather than as a fixed geometry — its
   * {@link overallLength} is the LONGEST piece you can lay from it, not a shape
   * (#193). */
  /** ⚠️ `crossover` is an ASSEMBLY, not a single turnout. A Fast Tracks
   * crossover fixture builds ONE SYMMETRICAL HALF; you build a second, rotate it
   * 180° and butt the two together at the through routes and the scissors to get
   * a complete DOUBLE CROSSOVER — four turnouts, two diagonals, and the SCISSORS
   * where they cross.  ⚠️ Will Gage, 2026-07-26: *"A double crossover contains
   * the scissors."* The scissors is that X, not the whole assembly — do not use
   * it as another name for the part. So it carries {@link trackSpacing} and
   * {@link secondaryFrogAngle}, which no single turnout has, and
   * {@link piecesPerAssembly} — because its lengths describe the HALF, not the
   * finished crossover. */
  kind: "turnout" | "wye" | "curved-turnout" | "crossover" | "crossing" | "flex";
  /** Manufacturer part numbers by hand, where the part has a hand. */
  partNumbers?: { left?: string; right?: string; single?: string };
  /** Frog number N (the 1:N ratio). Definitional, so no provenance needed. */
  frogNumber?: number;
  /** The angle the part ACTUALLY diverges at, where that's known to differ from
   * the theoretical `atan(1/N)`. Atlas appear to build to SECTIONAL angles
   * (multiples of 11.25° = 1/32 turn) rather than true frog ratios, so a "#5" is
   * 11.25° not 11.31°. ⚠️ Currently below our drawing resolution — 0.06° over a
   * 6″ turnout is 0.006″ — so nothing uses this yet. Recorded because it's a
   * real property of the product and will matter if we ever check whether a part
   * mates with sectional track. */
  actualAngle?: PartAngle;
  /** Points → frog. The number that decides where a turnout's throat lands. */
  lead?: PartDimension;
  /** End of the tie strip → the point tips. Where the working turnout starts
   * inside its moulding; the rest of that end is plain approach track. Needed to
   * fit a part into a space, and by any renderer drawing the real outline. */
  pointsOffset?: PartDimension;
  /** End of the tie strip → the APEX OF THE FROG V, measured from the same end
   * as {@link pointsOffset}. ⚠️ The apex, NOT the end of the frog casting — on a
   * shallow #10 those are ¾″ apart, which is how this library recorded a wrong
   * #10 lead through two releases. `lead` is the difference of the two, so
   * prefer these when both are known: they're what someone can actually put a
   * rule against. */
  frogOffset?: PartDimension;
  /** End-to-end length of the part.
   *
   * ⚠️ On a {@link buildable} part this is the manufacturer's DEFAULT length,
   * not a property of the part — the modeller cuts the rail, so their turnout
   * is whatever they built between {@link minimumLength} and as long as they
   * like. */
  overallLength?: PartDimension;
  /** True when the product is a FIXTURE or template rather than a finished
   * turnout — Fast Tracks sell jigs, not parts. The distinction is not cosmetic:
   * a buildable part has no single length, so `overallLength` becomes a default
   * and `minimumLength` a floor, and nothing may infer where an owner's actual
   * turnout ends from either of them. */
  buildable?: boolean;
  /** The shortest the part can be built. Buildable parts only. */
  minimumLength?: PartDimension;
  /** How many identical pieces built on this fixture make ONE finished part.
   *
   * ⚠️ WHEN THIS IS SET, `overallLength` AND `minimumLength` DESCRIBE ONE PIECE,
   * NOT THE FINISHED ITEM. A Fast Tracks crossover fixture builds one half of a
   * double crossover: you build it twice, rotate the second 180°, and butt them
   * together. Its 10.07″ is the half. Absent or 1 means the fixture builds the
   * whole part in one go, which is the case for every turnout and wye here. */
  piecesPerAssembly?: number;
  /** The radius of plain curve this turnout can stand in for, as a
   * layout-planning figure. Fast Tracks publish it; Atlas do not. Nothing draws
   * with it — it is here because it is a real published dimension and dropping
   * it would mean the library could not represent what a manufacturer actually
   * says about their own product. */
  substitutionRadius?: PartDimension;
  /** Frog apex → the end of the diverging rail, measured ALONG that rail. The
   * independent cross-check on {@link frogOffset}: it must be slightly LONGER
   * than the axial `overallLength − frogOffset`, because the rail is the
   * hypotenuse of the angle it leaves at. A reading that makes that difference
   * negative means a mis-read frog — which is exactly how the 2057 wye's frog
   * was caught (see its note). Too insensitive to recover the angle from — at
   * these angles ¹⁄₃₂″ of slop swings the implied half-angle by 6° — so use it
   * to falsify a frog position, never to derive one. */
  divergingLength?: PartDimension;
  /** Diverging route radius (straight turnouts). */
  divergingRadius?: PartDimension;
  /** Curved turnouts: the two concentric radii. */
  outerRadius?: PartDimension;
  innerRadius?: PartDimension;
  /** Crossing angle, degrees. */
  crossingAngleDeg?: number;
  /** Centre-to-centre distance of the two parallel tracks a {@link kind}
   * `crossover` joins. A crossover fixture is BUILT for one spacing — it is not
   * adjustable — so this decides whether the part suits a given standard at all.
   *
   * ⚠️ READ {@link FREEMO_TRACK_SPACING_INCHES} ALONGSIDE THIS. Free-moN §2.0
   * fixes double-track spacing at exactly 1.125″; the Fast Tracks N crossovers
   * are built to 1.09″. That 0.035″ is small but it is REAL and it is not a
   * tolerance — the fixture cannot be built to another spacing. Recorded rather
   * than reconciled: it is a fact about the product, and an owner deciding what
   * to buy is better served by the true number than by a convenient one. */
  trackSpacing?: PartDimension;
  /** The SECOND frog angle on a part that has two — the SCISSORS of a double
   * crossover, the X where its two opposite diverging routes meet and cross.
   * Published in degrees. */
  secondaryFrogAngle?: PartAngle;
  /** The part's drawn geometry in its own frame, when it came from a library
   * file. This is the payload worth importing — real outlines we can draw
   * instead of deriving a turnout's shape from a frog number. */
  segments?: PartSegment[];
  /** Connection points, each carrying position AND tangent. The seam a piece
   * graph would snap on (#179 stage 1-2). */
  ends?: PartEnd[];
  /** Set when the part came from an imported library file rather than our own
   * data — names the source so a user can tell where a dimension came from. */
  importedFrom?: string;
}

/** N-scale code 55 rail height, inches — Atlas publish .055″. */
export const CODE55_RAIL_HEIGHT_INCHES = 0.055;

/**
 * Atlas N-scale Code 55 — the Free-moN mainstay.
 *
 * ⚠️ Atlas do not publish leads or overall lengths for the straight turnouts.
 * Everything here traces to physical measurements: Steve Branton's #7 lead
 * (3⅜″ points→frog, #173) and Will Gage's #5/#7/#10 overall lengths plus the
 * #10's lead and points offset. The #5's lead and the wye's are still derived.
 *
 * MEASURED GEOMETRY (all Will Gage's, off physical parts, frog taken at the V):
 *
 *     part   points   frog V    overall   lead       past frog   ÷N
 *     #5     1¾″      4.75″     6.00″     3.00000″   1.25″       0.2500
 *     #7     ⁵⁄₈″     4⁷⁄₃₂″    6.00″     3.59375″   1.78125″    0.2545
 *     #10    ⁹⁄₁₆″    5.50″     8.00″     4.93750″   2.50″       0.2500
 *     wye    points   frog V    overall   lead       past frog   diverging rail
 *     #2.5   1⁵⁄₈″    4⅛″       6.50″     2.50000″   2.375″      2.4375″
 *     #3.5   ¾″       3⁵⁄₃₂″    5.00″     2.40625″   1.84375″    1.9375″
 *
 * ⚠️ THE WYES ARE NOT ON THE ÷N TREND AND MUST NOT BE INTERPOLATED WITH THE
 * TURNOUTS. lead ÷ N is 1.00 and 0.69 against the turnouts' flat 0.25, and the
 * #2.5 is the LONGER part despite the sharper frog. Every size lookup here
 * filters `kind === "turnout"`, which is what keeps them out — do not "fix"
 * that filter to include wyes.
 *
 * Every one of these is Will Gage's, off a physical part, frog taken at the V.
 * ⚠️ The #7 lead SUPERSEDES Steve Branton's 3⅜″ (#173) — the library's founding
 * measurement, ⁷⁄₃₂″ short. Will's single-span reading and his two positions
 * agree exactly, which is why it wins. Steve's number was also the sole basis of
 * {@link TURNOUT_LEAD_INCHES_PER_FROG}; that constant is now baseless as well as
 * refuted, and {@link leadInchesForSize} interpolates across this table instead.
 *
 * ⭐ **THE PART RUNS PAST THE FROG FAR ENOUGH TO GAIN 0.25″ OF SEPARATION.**
 * Past-frog run ÷ N is 0.2500 / 0.2545 / 0.2500 — the #5 and #10 EXACT, the #7
 * within ¹⁄₃₂″ of the tie end (a 4¼″ frog would make it exact too, one tape
 * division away). Provenance note: the measurer was told that prediction BEFORE
 * re-reading and did not return 4¼″, so this is not a confirmation artefact. At the frog
 * the routes are one gauge apart; at the end of the moulding they are
 * 0.354 + 0.25 ≈ 0.6″ apart. So Atlas size the moulding for a constant
 * CLEARANCE, not a constant length — which is what a manufacturer would
 * sensibly do, and why overall length looks arbitrary until you divide by N.
 * ⚠️ It predicts the FROG POSITION from the overall length. It does NOT predict
 * the lead — the points offset is independent and must still be measured.
 * ⚠️ HYPOTHESIS. It is the FOURTH rule fitted to this data; the first three all
 * died. Two exact hits and a near miss is not a law.
 *
 * NOTHING HERE IS PROPORTIONAL TO FROG NUMBER. Three rules assumed otherwise;
 * all three were tested against a physical part and FAILED:
 * - ❌ **Lead ∝ N.** Measured lead ÷ N: #5 = 0.600, #7 = 0.513, #10 = 0.494.
 *   {@link TURNOUT_LEAD_INCHES_PER_FROG} reads ~20% SHORT at N=5 — and its
 *   founding measurement has since been superseded, so it is baseless too.
 * - ❌ **Constant switch angle.** Inverting {@link turnoutClosure} gives α =
 *   0.036 (#5), 0.055 (#7), 0.043 (#10). Not constant.
 * - ❌ **Overall length ∝ N.** #5 = 6.00″ and #7 = 6.00″ — same moulding, two
 *   frog numbers.
 * - ❌ **Frog fixed at 4.75″** (shipped in 0.54.0, retracted in 0.55.0). It
 *   rested on the #5 and #10 both reading 4.75″, but the #10's was the END OF
 *   THE FROG CASTING, not the V. Measured consistently the frogs are at 4.75″,
 *   4³⁄₁₆″ and 5.5″ — all different.
 *
 * The definition is the reason: #N fixes the DIVERGENCE RATE AT THE FROG (1
 * across per N along) and says NOTHING about how much tie strip the manufacturer
 * wraps around it, or where inside it the frog goes. Angle is geometry;
 * everything else is a tooling decision. **Measure the part. Do not model it.**
 */
export const ATLAS_CODE55_N: TrackPart[] = [
  {
    id: "atlas-c55-n-5",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: "#5 Turnout",
    kind: "turnout",
    partNumbers: { left: "2050", right: "2051" },
    frogNumber: 5,
    lead: {
      inches: 3.0,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2050 (#5 LH): points at 1¾″, frog at 4.75″ ⇒ 3″ " +
        "exactly. REFUTED BOTH standing models — the per-frog rule predicted 2.41″, " +
        "the constant-switch-angle model 2.64″; both read short. It also retired my " +
        "earlier ~2.4″ photo estimate, which was 20% under.",
    },
    pointsOffset: {
      inches: 1.75,
      source: "measured",
      note: "Will Gage, physical Atlas 2050 (#5 LH) — end of tie strip to point tips",
    },
    frogOffset: {
      inches: 4.75,
      source: "measured",
      note: "Will Gage, physical Atlas 2050 (#5 LH) — tie end to the apex of the V",
    },
    overallLength: {
      inches: 6.0,
      source: "measured",
      note: "Will Gage, physical Atlas 2050 (#5 LH), end tie to end tie",
    },
    actualAngle: {
      deg: 11.25,
      source: "unverified",
      note:
        "CORROBORATED: XTrkCAD N-atlasn55.xtp gives 11.250152°, and AnyRail-forum " +
        "trial-and-error (glakedylan, 2012) gives 11.25°. Theory atan(1/5) = 11.310°. " +
        "11.25° is exactly 1/32 turn — Atlas appear to build to sectional angles.",
    },
  },
  {
    id: "atlas-c55-n-7",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: "#7 Turnout",
    kind: "turnout",
    partNumbers: { left: "2052", right: "2053" },
    frogNumber: 7,
    lead: {
      inches: 3.59375,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2052 (#7), 3¹⁹⁄₃₂″ points→frog as a single " +
        "span — and it matches his two positions exactly (4⁷⁄₃₂ − ⁵⁄₈), so the " +
        "reading is internally consistent. SUPERSEDES Steve Branton's 3⅜″ (#173), " +
        "which was ⁷⁄₃₂″ short and was the library's founding measurement. " +
        "⚠️ Steve's number was also the SOLE basis of " +
        "TURNOUT_LEAD_INCHES_PER_FROG (3.375/7 = 0.482) — that constant is now " +
        "baseless as well as refuted.",
    },
    pointsOffset: {
      inches: 0.625,
      source: "measured",
      note: "Will Gage, physical Atlas 2052 (#7) — ¹⁰⁄₁₆″ tie end to point tips",
    },
    frogOffset: {
      inches: 4.21875,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2052 (#7) — 4⁷⁄₃₂″, tie end to the apex of the V. " +
        "Supersedes an initial 4³⁄₁₆″. Worth noting for provenance: he was told " +
        "beforehand that the clearance hypothesis predicted 4¼″ and did NOT read " +
        "4¼″ — so this number is not a confirmation artefact, and it sits ¹⁄₃₂″ " +
        "(one tape division) from the predicted value.",
    },
    overallLength: {
      inches: 6.0,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2052 (#7), end tie to end tie — the SAME 6″ " +
        "as the #5, which is what proves length is not a function of frog number",
    },
    actualAngle: {
      deg: 8.13,
      source: "unverified",
      note:
        "DISPUTED: XTrkCAD .xtp says 8.1818°, AnyRail forum says 8.125°, theory " +
        "atan(1/7) = 8.130°. The sources disagree, so theory is used here.",
    },
  },
  {
    id: "atlas-c55-n-10",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: "#10 Turnout",
    kind: "turnout",
    partNumbers: { left: "2054", right: "2055" },
    frogNumber: 10,
    lead: {
      inches: 4.9375,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2054 (#10): 5.5″ frog − 9/16″ points = 4¹⁵⁄₁₆″. " +
        "⚠️ CORRECTED from 4³⁄₁₆″ (0.53.0–0.54.0), which used a 4.75″ frog reading " +
        "taken before we'd agreed the landmark. That earlier figure was the END OF " +
        "THE FROG CASTING; a #10's V is shallow, so the apex is ¾″ back from it.",
    },
    pointsOffset: {
      inches: 0.5625,
      source: "measured",
      note: "Will Gage, physical Atlas 2054 (#10) — end of tie strip to point tips",
    },
    frogOffset: {
      inches: 5.5,
      source: "measured",
      note: "Will Gage, physical Atlas 2054 (#10) — tie end to the apex of the V",
    },
    overallLength: {
      inches: 8.0,
      source: "measured",
      note: "Will Gage, physical Atlas 2054 (#10), end tie to end tie",
    },
    actualAngle: {
      deg: 5.74,
      source: "unverified",
      note:
        "CORROBORATED: XTrkCAD .xtp gives 5.739°, AnyRail forum 5.75° — they agree " +
        "with each other and not with theory atan(1/10) = 5.711°.",
    },
  },
  {
    id: "atlas-c55-n-wye",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: "#2.5 Wye",
    kind: "wye",
    partNumbers: { single: "2056" },
    frogNumber: 2.5,
    lead: {
      inches: 2.5,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2056, 2026-07-26: points at 1⁵⁄₈″, frog at 4⅛″ ⇒ " +
        "2.5″ — the difference of the two offsets, per the rule above. " +
        "⚠️ RETIRES a `derived` 1.205″ (2.5 × TURNOUT_LEAD_INCHES_PER_FROG) — the " +
        "real lead is more than DOUBLE it. Third independent refutation of the " +
        "per-frog rule, and the largest: at low N it is not merely mis-sloped, " +
        "it is nowhere near.",
    },
    pointsOffset: {
      inches: 1.625,
      source: "measured",
      note: "Will Gage, physical Atlas 2056 — end of tie strip to point tips (1¹⁰⁄₁₆″)",
    },
    frogOffset: {
      inches: 4.125,
      source: "measured",
      note: "Will Gage, physical Atlas 2056 — tie end to the apex of the V (4²⁄₁₆″)",
    },
    overallLength: {
      inches: 6.5,
      source: "measured",
      note: "Will Gage, physical Atlas 2056 — end to end",
    },
    divergingLength: {
      inches: 2.4375,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2056 — frog to the end of each diverging rail " +
        "(2⁷⁄₁₆″, both legs equal). ✔ CROSS-CHECKS the frog: axial past-frog is " +
        "6.5 − 4.125 = 2.375″, and the rail is ¹⁄₁₆″ longer than its own " +
        "projection, which is the right sign and the right order of magnitude.",
    },
  },
  {
    // Will Gage, 2026-07-26: "2057 is 3.5, 2056 is 2.5" — the two Atlas Code 55
    // wyes are different FROG NUMBERS, not a left/right pair of one part. The
    // 2056 half of that confirms the entry above; this is the one we didn't have.
    //
    // Fully measured 2026-07-26, after one reading was caught and re-read.
    //
    // ⚠️ WORKED EXAMPLE OF WHY THIS LIBRARY CROSS-CHECKS. The frog first came in
    // at 5⁵⁄₃₂″, which is PAST the part's own 5″ overall length — the apex would
    // have sat beyond the end of the moulding. Two independent lines said ~3⅛″:
    //   · points ¾″ + points→frog 2⅜″           = 3.125″
    //   · overall 5″ − diverging rail 1³⁰⁄₃₂″    ≈ 3.06″ axial
    // Queried, and Will re-read it as 3⁵⁄₃₂″ — a leading-digit slip, exactly what
    // the arithmetic implied. That re-read is the number recorded here; it was
    // NOT inferred. Had it been taken at face value the wye would have drawn its
    // frog off the end of itself.
    id: "atlas-c55-n-wye-35",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: "#3.5 Wye",
    kind: "wye",
    partNumbers: { single: "2057" },
    frogNumber: 3.5,
    lead: {
      inches: 2.40625,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2057, 2026-07-26: points at ¾″, frog at 3⁵⁄₃₂″ ⇒ " +
        "2.40625″ — the difference of the two offsets, per the rule above. His " +
        "direct points→frog reading was 2⅜″, ¹⁄₃₂″ short; the offsets win. " +
        "⚠️ RETIRES the reasoning in this entry's original note, which left the " +
        "lead unset so `leadInchesForSize` would interpolate at the wye's " +
        "effective frog (3.5 × 2 = 7) and land on the measured #7's 3.59375″. " +
        "That substitution was 49% over.",
    },
    pointsOffset: {
      inches: 0.75,
      source: "measured",
      note: "Will Gage, physical Atlas 2057 — end of tie strip to point tips (¾″)",
    },
    frogOffset: {
      inches: 3.15625,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2057 — tie end to the apex of the V (3⁵⁄₃₂″). " +
        "This is his RE-READ after the first reading (5⁵⁄₃₂″) was queried for " +
        "landing past the part's 5″ end; see the comment above this entry.",
    },
    overallLength: {
      inches: 5,
      source: "measured",
      note: "Will Gage, physical Atlas 2057 — end to end",
    },
    divergingLength: {
      inches: 1.9375,
      source: "measured",
      note:
        "Will Gage, physical Atlas 2057 — frog to the end of each diverging rail " +
        "(1³⁰⁄₃₂″, both legs equal). ✔ THE READING THAT CAUGHT THE BAD FROG: " +
        "against the first 5⁵⁄₃₂″ the axial past-frog is NEGATIVE, which a 1.9375″ " +
        "rail flatly contradicts. Against the re-read 3⁵⁄₃₂″ it is 5 − 3.15625 = " +
        "1.84375″, so the rail runs ³⁄₃₂″ longer than its own projection — right " +
        "sign, same order as the 2056's ¹⁄₁₆″. (The two differ because this is a " +
        "cos() residual on a small angle, which is why the field doc says not to " +
        "read an angle back out of it.)",
    },
  },
  {
    id: "atlas-c55-n-curved-21-15",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: 'Curved Turnout 21¼" / 15"',
    kind: "curved-turnout",
    partNumbers: { left: "2058", right: "2059" },
    outerRadius: { inches: 21.25, source: "manufacturer", note: "Atlas product listing" },
    innerRadius: { inches: 15, source: "manufacturer", note: "Atlas product listing" },
  },
];

/**
 * Flex track — the stuff every run that isn't a turnout or a crossing is made
 * of (#193). A length of flex has no fixed geometry, so the only dimension it
 * carries is **how long a piece you can lay from one**: past that you have
 * another length, with a rail joint between them.
 *
 * ⚠️ These lengths are the NOMINAL PRODUCT LENGTHS as reported by Will Gage
 * (2026-07-26), not values read off a spec sheet or measured. They are what the
 * product is sold as — "30 inch flex track" — which is exactly the number a
 * builder plans cuts against, so they're recorded as `manufacturer` with the
 * source named. Correct them if a listing says otherwise.
 *
 * No part numbers here: I don't have them confirmed, and a wrong part number is
 * worse than none — someone would order against it.
 */
export const FLEX_TRACK_PARTS: TrackPart[] = [
  {
    id: "atlas-c55-n-flex",
    manufacturer: "Atlas",
    line: "Code 55",
    scale: "N",
    name: "Code 55 Flex Track",
    kind: "flex",
    overallLength: {
      inches: 30,
      source: "manufacturer",
      note: "nominal product length, reported by Will Gage 2026-07-26",
    },
  },
  {
    id: "me-c55-n-flex",
    manufacturer: "Micro Engineering",
    line: "Code 55",
    scale: "N",
    name: "Code 55 Flex Track",
    kind: "flex",
    overallLength: {
      inches: 36,
      source: "manufacturer",
      note: "nominal product length, reported by Will Gage 2026-07-26",
    },
  },
];

/**
 * Fast Tracks N-scale assembly fixtures, Micro Engineering Code 55 rail.
 *
 * ⚠️ A DIFFERENT MANUFACTURER PUBLISHES DIFFERENT NUMBERS, and the library has
 * to hold what each one actually says rather than a lowest common denominator.
 * Fast Tracks publish none of Atlas's three landmarks — no points offset, no
 * frog offset, no lead — and four things Atlas never state:
 *
 *     straight   angle    div R    default   minimum   substitution R
 *     #4         14.04°    8″       4.57″     3.43″     11″
 *     #4.5       12.53°   11″       5.00″     3.90″     14″
 *     #5         11.31°   14″       5.39″     3.92″     17″
 *     #6          9.46°   23″       6.26″     4.30″     24″
 *     #7          8.13°   27″       7.40″     5.44″     34″
 *     #8          7.13°   36″       8.00″     5.93″     42″
 *     #9          6.34°   50″       8.38″     6.42″     57″
 *     #10         5.71°   64″       9.15″     6.80″     70″
 *     #12         4.76°   82″      10.34″     7.95″     90″
 *
 *     wye        angle    div R    default   minimum   substitution R
 *     #4         14.04°   23″       4.63″     3.48″     27″
 *     #5         11.31°   25″       5.23″     3.81″     30″
 *     #6          9.46°   35″       5.99″     4.30″     47″
 *     #8          7.13°   70″       8.22″     5.93″     94″
 *     #10         5.71°   89″       9.47″     6.97″    130″
 *
 * ⭐ **FAST TRACKS BUILD TO TRUE FROG RATIOS.** Every angle above is `atan(1/N)`
 * to the digits published — 14.04, 11.31, 9.46, 8.13, 7.13, 6.34, 5.71, 4.76.
 * Atlas do NOT: they build to SECTIONAL angles (a "#5" is 11.25°, a 1/32 turn,
 * against theory's 11.310°). Two manufacturers, two different meanings for the
 * same number on the box, and the difference is real if you ever check whether
 * a part mates with sectional track.
 *
 * ⚠️ THESE ARE FIXTURES, SO THEY HAVE NO LENGTH. The modeller cuts the rail:
 * `overallLength` here is the manufacturer's DEFAULT and `minimumLength` the
 * floor. Because Fast Tracks publish no points offset, {@link partExtent}
 * returns null for every one of them, so none claims a body and flex still runs
 * through it (#193). That is the honest answer — we do not know where an
 * owner's hand-built turnout stops, and guessing from a default length would be
 * inventing a measurement. An owner who measures their own build can enter it,
 * and the admin form's cross-checks will catch a bad reading.
 *
 * Source: handlaidtrack.com product pages, "Detailed Specifications" tables,
 * read 2026-07-26. ⚠️ The PDF templates in Will's local reference folder are
 * ENCRYPTED (`/Encrypt /Standard`), so they are deliberately not the source
 * here — the public product pages say the same thing and can be cited.
 */
export const FAST_TRACKS_N_ME55: TrackPart[] = (
  [
    // [kind, N, angle°, divergingR, defaultLength, minLength, substitutionR]
    ["turnout", 4, 14.04, 8, 4.57, 3.43, 11],
    ["turnout", 4.5, 12.53, 11, 5, 3.9, 14],
    ["turnout", 5, 11.31, 14, 5.39, 3.92, 17],
    ["turnout", 6, 9.46, 23, 6.26, 4.3, 24],
    ["turnout", 7, 8.13, 27, 7.4, 5.44, 34],
    ["turnout", 8, 7.13, 36, 8, 5.93, 42],
    ["turnout", 9, 6.34, 50, 8.38, 6.42, 57],
    ["turnout", 10, 5.71, 64, 9.15, 6.8, 70],
    ["turnout", 12, 4.76, 82, 10.34, 7.95, 90],
    ["wye", 4, 14.04, 23, 4.63, 3.48, 27],
    ["wye", 5, 11.31, 25, 5.23, 3.81, 30],
    ["wye", 6, 9.46, 35, 5.99, 4.3, 47],
    ["wye", 8, 7.13, 70, 8.22, 5.93, 94],
    ["wye", 10, 5.71, 89, 9.47, 6.97, 130],
  ] as Array<["turnout" | "wye", number, number, number, number, number, number]>
).map(([kind, n, deg, divR, dflt, min, subR]) => {
  const code = kind === "wye" ? "y" : "t";
  const spec = "handlaidtrack.com Detailed Specifications, read 2026-07-26";
  const manufacturer: DimensionSource = "manufacturer";
  return {
    id: `fast-tracks-n-me55-${code}-${n}`,
    manufacturer: "Fast Tracks",
    line: "Code 55",
    scale: "N" as const,
    // Named for what the OWNER has, not what Fast Tracks sell. They sell a jig;
    // the person picking this in the editor is holding the turnout they built
    // on it. `buildable` and the AF-… part number carry the fixture fact.
    name: `#${n} ${kind === "wye" ? "Wye" : "Turnout"}`,
    kind,
    partNumbers: { single: `AF-N-${code.toUpperCase()}-${n}-ME55` },
    frogNumber: n,
    buildable: true,
    actualAngle: {
      deg,
      source: manufacturer,
      note: `${spec}. Matches atan(1/${n}) to the published digits — Fast Tracks build to TRUE frog ratios, unlike Atlas's sectional angles.`,
    },
    divergingRadius: { inches: divR, source: manufacturer, note: spec },
    overallLength: {
      inches: dflt,
      source: manufacturer,
      note: `${spec}. The DEFAULT length — this is a fixture, so the builder chooses.`,
    },
    minimumLength: { inches: min, source: manufacturer, note: spec },
    substitutionRadius: { inches: subR, source: manufacturer, note: spec },
  } satisfies TrackPart;
});

/**
 * Fast Tracks N-scale CROSSOVER fixtures, ME Code 55.
 *
 *     crossover   angle    2nd frog   HALF: default   minimum   track spacing
 *     #6           9.46°     19°           10.07″      9.31″       1.09″
 *     #8           7.13°     14.3°         13.61″     13.07″       1.09″
 *
 * ⚠️⚠️ **THE LENGTHS ABOVE ARE ONE HALF, NOT THE FINISHED CROSSOVER.** Will
 * Gage, 2026-07-26: *"crossovers are two pieces. the pdf shows half, then you
 * would duplicate this same piece and flip it 180 and butt it up to the through
 * and X."* Fast Tracks say the same — *"Crossovers are constructed by building
 * two symmetrical halves of a crossover in the Assembly Fixture and then joining
 * them to form a complete double crossover"* — and their own gloss on the
 * length is "the length of the turnout on the QuickSticks", i.e. the piece the
 * fixture holds. `piecesPerAssembly: 2` records this so the number cannot be
 * read as the assembly's.
 *
 * ⚠️ THE FINISHED LENGTH IS NOT PUBLISHED, and is deliberately not stored. The
 * two halves are related by a 180° rotation about the scissors, so they cover the
 * same longitudinal span and the finished crossover is plausibly also ~10.07″ —
 * but that is an inference from the symmetry, not a reading, and this library
 * has been burned four times by exactly that kind of plausible reconstruction.
 * If it matters, measure a built one.
 *
 * ⚠️ THESE MAKE A DOUBLE CROSSOVER — four turnouts, two diagonals, and the
 * SCISSORS where the two opposite diverging routes meet and cross in an X.
 * A half carries one full 9.46° frog and HALF of the 19° scissors, which is why
 * the scissors only exists once the second piece is butted up. Not a single
 * crossover: half a scissors is not usable on its own.
 *
 * ⚠️ TERMINOLOGY, from Will Gage 2026-07-26: *"A double crossover contains the
 * scissors. The location where both opposite diverging routes meet and cross
 * like an 'X'."* The scissors is that crossing, NOT another name for the whole
 * part — the assembly is a double crossover. Nor is it this library's
 * `crossing`/diamond kind, which is two tracks crossing with no route choice
 * (#170); the scissors is internal to the crossover.
 *
 * ⚠️⚠️ **THE TRACK SPACING IS 1.09″, AND FREE-moN §2.0 REQUIRES 1.125″.**
 * A crossover fixture is machined for ONE spacing; it is not adjustable. So a
 * crossover hand-built on either of these puts the parallel track 0.035″ closer
 * than the standard, and that difference has to go somewhere — the tracks pinch
 * through the crossover and open back out to meet the endplates, which is fixed
 * at both ends by {@link FREEMO_TRACK_SPACING_INCHES}.
 *
 * Recorded, NOT reconciled. It is 0.9 mm and most builders will absorb it, but
 * it is a property of the product rather than a tolerance, and someone choosing
 * what to buy for a double-track Free-moN module is better served by the true
 * number than a convenient one. Nothing here warns or blocks — that would be a
 * decision for the app, not for a data table.
 *
 * ⭐ THE SECOND FROG IS EXACTLY TWICE THE FIRST — 19° against 2 × 9.46 = 18.92,
 * and 14.3° against 2 × 7.13 = 14.26, both inside the published rounding. That
 * is the diamond, where the two halves' diagonals — each leaving its main at the
 * frog angle, and pointing opposite ways because the second piece is turned
 * 180° — cross each other. It is a free cross-check on the pair, it passes, and
 * it independently corroborates the two-piece build: a part with one frog would
 * have no second angle to publish.
 *
 * ⚠️ A CROSSOVER IS AN ASSEMBLY, so `partExtent` means nothing for it and the
 * turnout size lookups must never see it: `kind` is `"crossover"`, and every
 * one of them filters `kind === "turnout"`.
 *
 * Atlas make crossover parts too — Will has no figures for them as of
 * 2026-07-26, so there are deliberately no Atlas entries here rather than
 * guessed ones.
 *
 * Source: handlaidtrack.com product pages, read 2026-07-26. Their tables also
 * carry tie size and tie spacing; those describe the QuickSticks tie strip's
 * appearance rather than the track's geometry, so they are not carried here.
 */
export const FAST_TRACKS_N_ME55_CROSSOVERS: TrackPart[] = (
  [
    // [N, angle°, secondFrog°, defaultLength, minLength, trackSpacing]
    [6, 9.46, 19, 10.07, 9.31, 1.09],
    [8, 7.13, 14.3, 13.61, 13.07, 1.09],
  ] as Array<[number, number, number, number, number, number]>
).map(([n, deg, second, dflt, min, spacing]) => {
  const spec = "handlaidtrack.com Detailed Specifications, read 2026-07-26";
  const manufacturer: DimensionSource = "manufacturer";
  return {
    id: `fast-tracks-n-me55-c-${n}`,
    manufacturer: "Fast Tracks",
    line: "Code 55",
    scale: "N" as const,
    name: `#${n} Double Crossover`,
    kind: "crossover" as const,
    partNumbers: { single: `AF-N-C-${n}-ME55` },
    frogNumber: n,
    buildable: true,
    piecesPerAssembly: 2,
    actualAngle: { deg, source: manufacturer, note: `${spec}. atan(1/${n}) exactly.` },
    secondaryFrogAngle: {
      deg: second,
      source: manufacturer,
      note: `${spec}. The SCISSORS of a double crossover — the X where its two opposite diverging routes cross — at 2 × ${deg}° within the published rounding.`,
    },
    overallLength: {
      inches: dflt,
      source: manufacturer,
      note:
        `${spec}. ⚠️ ONE HALF, NOT THE FINISHED CROSSOVER — the fixture builds a ` +
        "symmetrical half, which you build twice and butt together after turning " +
        "the second 180°. Fast Tracks gloss it as \"the length of the turnout on " +
        "the QuickSticks\", i.e. the piece in the jig. The DEFAULT for that " +
        "piece; it is a fixture, so the builder chooses.",
    },
    minimumLength: {
      inches: min,
      source: manufacturer,
      note: `${spec}. The shortest ONE HALF can be built — see the overall length's note.`,
    },
    trackSpacing: {
      inches: spacing,
      source: manufacturer,
      note:
        `${spec}. ⚠️ Free-moN §2.0 requires ${FREEMO_TRACK_SPACING_INCHES}″ — this fixture ` +
        `is built to ${spacing}″, ${(FREEMO_TRACK_SPACING_INCHES - spacing).toFixed(3)}″ tighter, ` +
        "and cannot be built to another spacing.",
    },
  } satisfies TrackPart;
});

/** What a track is laid with when nobody has said — the commonest N-scale flex. */
export const DEFAULT_FLEX_PART_ID = "atlas-c55-n-flex";

/** Every built-in part, across manufacturers. */
export const BUILT_IN_TRACK_PARTS: TrackPart[] = [
  ...ATLAS_CODE55_N,
  ...FAST_TRACKS_N_ME55,
  ...FAST_TRACKS_N_ME55_CROSSOVERS,
  ...FLEX_TRACK_PARTS,
];

/** Every flex product a track can be laid with. */
export function flexParts(library = BUILT_IN_TRACK_PARTS): TrackPart[] {
  return library.filter((p) => p.kind === "flex");
}

/**
 * The flex product a track is laid with, falling back to the default rather
 * than to nothing: every non-turnout inch of track IS some product, and a run
 * whose owner hasn't chosen still gets cut into buyable lengths.
 */
export function flexPartFor(
  id: string | null | undefined,
  library = BUILT_IN_TRACK_PARTS,
): TrackPart | null {
  const chosen = id ? library.find((p) => p.id === id && p.kind === "flex") : null;
  return chosen ?? library.find((p) => p.id === DEFAULT_FLEX_PART_ID) ?? flexParts(library)[0] ?? null;
}

/** How long a single piece of this product can be, inches. */
export function maxFlexPieceInches(
  id: string | null | undefined,
  library = BUILT_IN_TRACK_PARTS,
): number {
  return flexPartFor(id, library)?.overallLength?.inches ?? 30;
}

/** Look a part up by its slug. */
export function trackPart(id: string, library = BUILT_IN_TRACK_PARTS): TrackPart | null {
  return library.find((p) => p.id === id) ?? null;
}

/** One length of flex track in a run — a real object you could pick up (#193). */
export interface FlexPiece {
  /** Position in the run, west to east. Stable enough to select and label by. */
  index: number;
  /** Inches along the RUN, not the module — the same coordinate turnouts,
   * industries and signals use, so a piece can be placed without a second
   * geometry to keep in step. */
  fromPos: number;
  toPos: number;
  lengthInches: number;
  /** Longer than the product allows. Only reachable from AUTHORED cuts, or from
   * a run that grew after they were authored — which is precisely when someone
   * needs telling. */
  overlong: boolean;
  /** What this piece butts against at each end: another piece, a part (turnout
   * or crossing), or the end of the run. */
  fromEnd: FlexPieceEnd;
  toEnd: FlexPieceEnd;
}

/** What a flex piece meets at one of its ends. */
export type FlexPieceEnd = "piece" | "part" | "runEnd";

/**
 * A stretch of a run that is NOT flex — a turnout's or a crossing's own body.
 *
 * A **zero-length** span is meaningful: it's a break in the run at a point whose
 * own length we don't know. That's a crossing today — the run stops and starts
 * there, giving a rail joint, but we've measured no crossing part so claiming an
 * extent for it would be inventing one.
 */
export interface OccupiedSpan {
  fromPos: number;
  toPos: number;
}

/** Positions closer than this are the same position — a cut can't be a hair
 * from a turnout's end and mean anything different from being on it. */
const FLEX_EPS = 1e-6;

/**
 * Shorter than this and it isn't a piece of track, it's an offcut — nobody
 * joints a tenth of an inch on. Full lengths from the start of a gap can leave
 * one (72.1″ of 36″ flex leaves 0.1″), so the last two get balanced instead.
 * A 6″ tail off a 30″ length is a real piece and is left alone.
 */
const FLEX_MIN_PIECE_INCHES = 1;

/**
 * Cut a run into lengths of flex track.
 *
 * The model (#193): everything that isn't a turnout or a crossing is flex, flex
 * comes in pieces of a maximum length, and where two pieces meet is a rail
 * joint — the same joint a turnout makes with the track past it (#189). A 96″
 * main isn't one piece of track; it's four lengths of Atlas flex with three
 * joints in it, which is what someone actually buys and lays.
 *
 * Pieces are **spans of the run**, not free-floating geometry. That's deliberate:
 * `pos` — inches along the run — is what every turnout, industry and signal is
 * placed in, so a piece that carried its own shape would be a second geometry to
 * keep in step with the first. As spans they get identity, a length you can
 * change, and ends that meet their neighbours by construction.
 *
 * `cuts` is the owner's authoring and is **complete when present**: those are
 * the only joints, and a piece that ends up too long is flagged rather than
 * silently re-cut. Absent, the cuts are derived — full lengths from the start of
 * each gap, remainder at the end, which is how you lay it. That's what lets
 * every existing module arrive already cut up without anyone touching it.
 */
export function flexPieces(input: {
  fromPos: number;
  toPos: number;
  /** Longest single piece of the product this run is laid with. */
  maxPieceInches: number;
  /** Stretches the run gives up to parts — turnout bodies, crossings. */
  occupied?: OccupiedSpan[] | null;
  /** Authored joint positions, inches along the run. Absent = derive. */
  cuts?: number[] | null;
}): FlexPiece[] {
  const lo = Math.min(input.fromPos, input.toPos);
  const hi = Math.max(input.fromPos, input.toPos);
  if (!(hi - lo > FLEX_EPS)) return [];
  const max = input.maxPieceInches > FLEX_EPS ? input.maxPieceInches : Infinity;

  // The run minus the parts sitting in it. Overlapping bodies are merged first
  // so a crossover's two turnouts don't carve the same inch twice.
  const blocks = (input.occupied ?? [])
    .map((s) => ({
      from: Math.max(lo, Math.min(s.fromPos, s.toPos)),
      to: Math.min(hi, Math.max(s.fromPos, s.toPos)),
    }))
    // Zero-length spans are KEPT — they're breaks at a point of unknown extent
    // (a crossing), and they still end one piece and start the next.
    .filter((s) => s.to - s.from >= -FLEX_EPS && s.from < hi + FLEX_EPS && s.to > lo - FLEX_EPS)
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && b.from <= last.to + FLEX_EPS) last.to = Math.max(last.to, b.to);
    else merged.push({ ...b });
  }
  const gaps: { from: number; to: number }[] = [];
  let cursor = lo;
  for (const b of merged) {
    if (b.from - cursor > FLEX_EPS) gaps.push({ from: cursor, to: b.from });
    cursor = Math.max(cursor, b.to);
  }
  if (hi - cursor > FLEX_EPS) gaps.push({ from: cursor, to: hi });

  const authored = input.cuts != null;
  const out: FlexPiece[] = [];
  for (const g of gaps) {
    // Where this gap gets cut. Authored cuts inside it win outright; otherwise
    // full lengths from its start, remainder at the end.
    let inner: number[];
    if (authored) {
      inner = [...new Set(input.cuts!)]
        .filter((c) => c > g.from + FLEX_EPS && c < g.to - FLEX_EPS)
        .sort((a, b) => a - b);
    } else {
      inner = [];
      for (let at = g.from + max; at < g.to - FLEX_EPS; at += max) inner.push(at);
      // A sliver at the end isn't a piece. Split the last two evenly instead —
      // both stay under the maximum, because together they're at most one full
      // length plus a sliver.
      const tail = g.to - (inner[inner.length - 1] ?? g.from);
      if (inner.length && tail < FLEX_MIN_PIECE_INCHES) {
        const start = inner.length >= 2 ? inner[inner.length - 2] : g.from;
        inner[inner.length - 1] = start + (g.to - start) / 2;
      }
    }
    const bounds = [g.from, ...inner, g.to];
    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i];
      const to = bounds[i + 1];
      out.push({
        index: out.length,
        fromPos: from,
        toPos: to,
        lengthInches: to - from,
        overlong: to - from > max + FLEX_EPS,
        // The run's own ends are runEnd; anything else is a part body, except
        // where a cut put a neighbouring piece there.
        fromEnd: i > 0 ? "piece" : from <= lo + FLEX_EPS ? "runEnd" : "part",
        toEnd:
          i < bounds.length - 2 ? "piece" : to >= hi - FLEX_EPS ? "runEnd" : "part",
      });
    }
  }
  return out;
}

/**
 * Which way a turnout faces along its host track: `+1` = its points look toward
 * increasing pos, `-1` = the other way.
 *
 * ⭐ ONE definition. The canvas had this inline for drawing the leg, and the
 * flex solver needs the same answer to know which side of `pos` the moulding
 * extends — a turnout's body is NOT symmetric about its points (an Atlas #7 is
 * about 0.9″ behind them and 5.1″ ahead), so getting the facing wrong moves a
 * rail joint four inches (#193).
 *
 * The rule: the turnout faces the way its diverging track LEAVES, because that's
 * where the frog is. `flipped` is the owner's override — rotating the part 180°
 * faces the points the other way, which is the only thing that can be right for
 * a siding pinned at a module end where the geometry reads ambiguously.
 *
 * `divergeFarPos` is whatever the caller can measure best: the canvas projects
 * the diverging track's real far end back onto the main, the editor uses its
 * authored extent. Same rule either way; only the precision of the input differs.
 */
export function turnoutFacing(input: {
  pos: number;
  /** Where the diverging track ends up, in the same coordinate as `pos`. */
  divergeFarPos?: number | null;
  flipped?: boolean;
}): 1 | -1 {
  const far = input.divergeFarPos;
  const geometric =
    typeof far === "number" && Number.isFinite(far)
      ? (Math.sign(far - input.pos) as 1 | -1 | 0) || 1
      : 1;
  return (input.flipped ? -geometric : geometric) as 1 | -1;
}

/**
 * The stretch of its host run a turnout's moulding occupies (#193) — what flex
 * track has to stop short of on each side.
 *
 * Null when the part hasn't been measured, exactly as {@link partExtent} is:
 * without a real length we don't know where the moulding stops, and a guessed
 * body would put a rail joint on track nobody has checked.
 */
export function turnoutOccupiedSpan(input: {
  pos: number;
  extent: PartExtent | null | undefined;
  facing: 1 | -1;
}): OccupiedSpan | null {
  const e = input.extent;
  if (!e) return null;
  const a = input.pos - input.facing * e.behindPoints;
  const b = input.pos + input.facing * e.aheadOfPoints;
  return { fromPos: Math.min(a, b), toPos: Math.max(a, b) };
}

/**
 * Retype one piece's length: move the rail joint at its far end, and let its
 * NEIGHBOUR take up the difference (#193).
 *
 * That's what cutting one piece longer actually does — the run doesn't grow, so
 * the next piece gets shorter by the same amount. The pair's total is fixed,
 * which is why the value is clamped to it: without that, asking for a length
 * past the next joint silently reorders the cuts and you get back something you
 * didn't ask for.
 *
 * Returns the run's COMPLETE new cut list (`flexCuts`), or null when the piece
 * has no neighbour to trade with — the last piece in a gap butts a turnout or
 * the endplate, and its length is set by what it meets, not by preference.
 */
export function resizeFlexPiece(
  pieces: FlexPiece[],
  index: number,
  nextLengthInches: number,
): number[] | null {
  const piece = pieces[index];
  const next = pieces[index + 1];
  if (!piece || !next) return null;
  if (piece.toEnd !== "piece") return null; // butts a part or the run's end
  if (!Number.isFinite(nextLengthInches)) return null;
  const pair = piece.lengthInches + next.lengthInches;
  if (pair < 2 * FLEX_MIN_PIECE_INCHES) return null;
  const want = Math.max(
    FLEX_MIN_PIECE_INCHES,
    Math.min(pair - FLEX_MIN_PIECE_INCHES, nextLengthInches),
  );
  const moved = piece.fromPos + want;
  return pieces
    .filter((p) => p.toEnd === "piece")
    .map((p) => (p.index === index ? moved : p.toPos))
    .map((v) => Math.round(v * 1000) / 1000)
    .sort((a, b) => a - b);
}

/** What a run costs in flex, for someone about to order it (#193). */
export function flexUsage(pieces: FlexPiece[]): {
  /** How many separate lengths have to be cut. */
  pieces: number;
  /** Total flex laid, inches — the run minus whatever the parts occupy. */
  totalInches: number;
  /** Pieces the product can't actually supply in one length. */
  overlong: number;
} {
  return {
    pieces: pieces.length,
    totalInches: pieces.reduce((a, p) => a + p.lengthInches, 0),
    overlong: pieces.filter((p) => p.overlong).length,
  };
}

/** Half an N-scale tie, inches — a 8′6″ tie is 102″ prototype, /160 ≈ 0.638″.
 * The half-width a tie strip extends either side of the rail it carries, which
 * is what gives a drawn turnout body its width. */
export const TIE_HALF_LENGTH_INCHES = 0.319;

/** Where a turnout part physically starts and stops, relative to its POINTS.
 * All inches; `aheadOfPoints` is the end of the tie strip, which is essentially
 * where the diverging rail stops and the owner's flex track begins. */
export interface PartExtent {
  /** Points → the near end of the tie strip. Positive = the strip starts this
   * far BEHIND the points (it always does — that end is plain approach track). */
  behindPoints: number;
  /** Points → the far end of the tie strip. */
  aheadOfPoints: number;
  /** Frog → the far end. How much turnout there still is past the frog. */
  pastFrog: number;
}

/**
 * A part's real extent, or **null when it hasn't been measured**.
 *
 * ⚠️ This deliberately does NOT fall back to a frog-number rule, unlike
 * {@link leadInchesForSize}. Overall length is not a function of N — the #5 and
 * the #7 are BOTH 6.00″, same tie strip, different frog. Angle is geometry;
 * length is packaging, and packaging can only be looked up. A renderer that
 * gets null should draw no part boundary rather than invent one: the absence is
 * a truthful signal that the library has a gap, and inventing a length here is
 * how hand-built geometry once reached owners as if it were part data.
 *
 * Requires `pointsOffset` and `overallLength`; `pastFrog` additionally needs
 * `frogOffset`. Every dimension must be `measured` — a derived one would launder
 * a guess into a drawing that says "this is where your turnout ends".
 */
export function partExtent(part: TrackPart | null | undefined): PartExtent | null {
  const pts = part?.pointsOffset;
  const overall = part?.overallLength;
  if (!pts || !overall) return null;
  if (pts.source !== "measured" || overall.source !== "measured") return null;
  const frog = part?.frogOffset;
  const aheadOfPoints = overall.inches - pts.inches;
  return {
    behindPoints: pts.inches,
    aheadOfPoints,
    pastFrog:
      frog && frog.source === "measured" ? overall.inches - frog.inches : aheadOfPoints,
  };
}

/** The extent of the part a turnout of this frog number IS, or null when no
 * measured part matches EXACTLY. A #6 is not a #5 or a #7 — the nearest part's
 * length says nothing about it (see {@link partExtent}). */
export function partExtentForSize(
  size: number,
  library = BUILT_IN_TRACK_PARTS,
): PartExtent | null {
  const part = turnoutPartForSize(size, library);
  return part && part.frogNumber === size ? partExtent(part) : null;
}

/**
 * The closest built-in turnout for a frog number — what a bare `size` maps to
 * when a turnout names no part. Exact match wins; otherwise the nearest frog.
 *
 * ⚠️ TIES ARE BROKEN TOWARD A PART WE CAN ACTUALLY DRAW. Two parts can share a
 * frog number — Atlas sell a #5 and Fast Tracks make a #5 fixture — and only one
 * of them may carry the measured offsets {@link partExtent} needs. Picking by
 * frog number alone would let a part with no geometry win on array order and
 * take the other's body away with it, which is the #193 failure (a turnout that
 * claims no extent has flex drawn straight through it). So: nearest frog first,
 * and among equals, one with a real extent.
 */
export function turnoutPartForSize(
  size: number,
  library = BUILT_IN_TRACK_PARTS,
): TrackPart | null {
  const turnouts = library.filter((p) => p.kind === "turnout" && p.frogNumber != null);
  if (!turnouts.length) return null;
  const dist = (p: TrackPart) => Math.abs((p.frogNumber as number) - size);
  return turnouts.reduce((best, p) => {
    const d = dist(p);
    const bd = dist(best);
    if (d !== bd) return d < bd ? p : best;
    // Same frog number: prefer the one that can be drawn at its real size.
    if (!partExtent(best) && partExtent(p)) return p;
    return best;
  });
}

/** Measured leads, ascending by frog number — the interpolation basis. Only
 * `measured` counts: interpolating through a derived value would launder a guess
 * into the sizes either side of it. */
function measuredLeadPoints(library: TrackPart[]): Array<{ n: number; lead: number }> {
  return library
    .filter(
      (p) => p.kind === "turnout" && p.frogNumber != null && p.lead?.source === "measured",
    )
    .map((p) => ({ n: p.frogNumber as number, lead: p.lead!.inches }))
    .sort((a, b) => a.n - b.n);
}

/**
 * The lead to draw a turnout of this size with. Keeps `frogLegOf` honest without
 * it needing to know the library exists.
 *
 * 1. An exact part match wins — a #7's measurement says nothing about a #4.
 * 2. Otherwise INTERPOLATE piecewise-linearly across the measured parts. This
 *    replaced `size × TURNOUT_LEAD_INCHES_PER_FROG`, which was refuted (its
 *    error changes sign across the measured range) and is now baseless besides,
 *    its founding #7 measurement having been superseded.
 * 3. ⚠️ Outside the measured range the end segments EXTRAPOLATE. Measured leads
 *    span N = 5…10, so a #4 or #12 is a projection, not a reading, and the #2.5
 *    wye is a long way out. Treat those as placeholders until a part is measured.
 */
export function leadInchesForSize(size: number, library = BUILT_IN_TRACK_PARTS): number {
  // An exact part match wins — but it has to be an exact part that HAS a lead.
  // Several makers can sell the same frog number and only some publish a lead:
  // Fast Tracks state an angle and a radius and no landmarks at all, so asking
  // `turnoutPartForSize` for "the #6" and reading its (absent) lead would skip
  // straight past an Atlas #6 that had one. Search for the dimension, not the
  // part.
  const exact = library.find(
    (p) => p.kind === "turnout" && p.frogNumber === size && p.lead != null,
  );
  if (exact) return exact.lead!.inches;

  const pts = measuredLeadPoints(library);
  if (!pts.length) return size * TURNOUT_LEAD_INCHES_PER_FROG;
  // One measurement can only be scaled; that IS the refuted rule, so say so.
  if (pts.length === 1) return (size / pts[0].n) * pts[0].lead;

  let i: number;
  if (size >= pts[pts.length - 1].n) i = pts.length - 2;
  else i = Math.max(0, pts.findIndex((p) => p.n >= size) - 1);
  const lo = pts[i];
  const hi = pts[i + 1];
  const t = (size - lo.n) / (hi.n - lo.n);
  return lo.lead + t * (hi.lead - lo.lead);
}

/**
 * How far a turnout of this size keeps going PAST its frog — the rest of the
 * moulding, after which the owner's flex track begins.
 *
 * The companion to {@link leadInchesForSize}, and it follows the same rule: an
 * exact measured part wins, otherwise interpolate across the measured ones. Both
 * numbers describe *how long to draw a turnout*, which is a question that always
 * has to be answered — you cannot draw nothing — so a reasoned interpolation is
 * the honest floor, and it is a far better answer than the alternative it
 * replaced (running the diverging route until it arrived parallel with the track
 * it fed, which was 10.79″ on a 6.00″ part).
 *
 * ⚠️ Do NOT confuse this with {@link partExtent}, which returns null rather than
 * guess. The difference is what is being claimed. `partExtent` says "THIS part
 * stops HERE" — a statement about a specific product, which may only be made
 * from a measurement. This says "a turnout of about this frog number runs about
 * this far past its frog", which is a drawing approximation and is labelled as
 * one: renderers draw the part's boundary only where {@link partExtent} answers.
 */
export function pastFrogInchesForSize(
  size: number,
  library = BUILT_IN_TRACK_PARTS,
): number {
  const measured = library
    .filter((p) => p.kind === "turnout" && p.frogNumber != null)
    .map((p) => ({ n: p.frogNumber as number, ext: partExtent(p) }))
    .filter((p): p is { n: number; ext: PartExtent } => p.ext != null)
    .map((p) => ({ n: p.n, past: p.ext.pastFrog }))
    .sort((a, b) => a.n - b.n);

  // Nothing measured at all: fall back to the frog angle itself. A turnout
  // whose rails have separated by about a gauge past the frog is short, but it
  // is bounded and it never claims a length nobody has checked.
  if (!measured.length) return RAIL_GAUGE_INCHES * size;
  if (measured.length === 1) return measured[0].past;

  let i: number;
  if (size >= measured[measured.length - 1].n) i = measured.length - 2;
  else i = Math.max(0, measured.findIndex((p) => p.n >= size) - 1);
  const lo = measured[i];
  const hi = measured[i + 1];
  const t = (size - lo.n) / (hi.n - lo.n);
  return Math.max(0, lo.past + t * (hi.past - lo.past));
}

/** One drawn piece of a part's geometry, in the part's own local frame. */
export type PartSegment =
  | { kind: "straight"; x0: number; y0: number; x1: number; y1: number }
  | {
      kind: "curve";
      radius: number;
      cx: number;
      cy: number;
      startDeg: number;
      extentDeg: number;
    };

/** A connection point on an imported part: position plus the tangent it faces. */
export interface PartEnd {
  x: number;
  y: number;
  angleDeg: number;
}

export interface ImportedPart {
  /** Raw title, tab-separated in the file: manufacturer, name, part number. */
  title: string;
  manufacturer?: string;
  name?: string;
  partNumber?: string;
  scale?: string;
  ends: PartEnd[];
  segments: PartSegment[];
}

/**
 * Parse an XTrkCAD `.xtp` parameter file into parts.
 *
 * The format is plain text, record-per-line inside `TURNOUT … END` blocks:
 *   `E x y angle`                         an endpoint
 *   `S layer width x0 y0 x1 y1`           a straight segment
 *   `C layer width radius cx cy a0 ext`   a curved segment (radius signed by hand)
 *
 * We parse an owner's OWN file — nothing from XTrkCAD is redistributed. Their
 * geometry is taken as authoritative for part OUTLINES; ⚠️ don't infer frog
 * positions from it, the shipped Atlas file is internally inconsistent (it puts
 * the #5's frog further out than the #7's, which is physically impossible).
 */
export function parseXtpLibrary(text: string): ImportedPart[] {
  const parts: ImportedPart[] = [];
  let cur: ImportedPart | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TURNOUT")) {
      // TURNOUT <scale> "<manufacturer>\t<name>\t<part no.>"
      const quoted = line.match(/"([^"]*)"/);
      const scale = line.split(/\s+/)[1];
      const title = quoted?.[1] ?? "";
      const bits = title.split("\t").map((s) => s.trim()).filter(Boolean);
      cur = {
        title,
        scale,
        manufacturer: bits[0],
        name: bits[1],
        partNumber: bits[2],
        ends: [],
        segments: [],
      };
      continue;
    }
    if (!cur) continue;
    if (line === "END") {
      if (cur.ends.length || cur.segments.length) parts.push(cur);
      cur = null;
      continue;
    }
    const n = line.split(/\s+/);
    const num = (i: number) => Number(n[i]);
    if (n[0] === "E" && n.length >= 4) {
      cur.ends.push({ x: num(1), y: num(2), angleDeg: num(3) });
    } else if (n[0] === "S" && n.length >= 7) {
      cur.segments.push({ kind: "straight", x0: num(3), y0: num(4), x1: num(5), y1: num(6) });
    } else if (n[0] === "C" && n.length >= 8) {
      cur.segments.push({
        kind: "curve",
        radius: num(3),
        cx: num(4),
        cy: num(5),
        startDeg: num(6),
        extentDeg: num(7),
      });
    }
  }
  return parts;
}

/** Sample an imported part's segments into polylines, in the part's own frame —
 * XTrkCAD angles run CLOCKWISE FROM NORTH, so a point on a curve is
 * `(cx + r·sin a, cy + r·cos a)`, not the usual cos/sin. */
export function samplePartSegments(
  segments: PartSegment[],
  stepsPerCurve = 16,
): BenchworkPoint[][] {
  return segments.map((s) => {
    if (s.kind === "straight") {
      return [
        { x: s.x0, y: s.y0 },
        { x: s.x1, y: s.y1 },
      ];
    }
    const r = Math.abs(s.radius);
    const out: BenchworkPoint[] = [];
    for (let i = 0; i <= stepsPerCurve; i++) {
      const a = ((s.startDeg + (s.extentDeg * i) / stepsPerCurve) * Math.PI) / 180;
      out.push({ x: s.cx + r * Math.sin(a), y: s.cy + r * Math.cos(a) });
    }
    return out;
  });
}

/** Signed difference between two XTrkCAD headings, normalised to (-180, 180]. */
function angleDeltaDeg(a: number, b: number): number {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** Pull a frog number out of a part name — "#5", "No. 5", "Number 7 Left".
 * Identification, not measurement: it reads the label the maker printed. */
export function frogNumberFromName(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const m = name.match(/(?:#|no\.?\s*|number\s+)(\d+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function importedKind(name: string | undefined): TrackPart["kind"] {
  const s = (name ?? "").toLowerCase();
  if (s.includes("wye")) return "wye";
  if (s.includes("crossing")) return "crossing";
  if (s.includes("curved")) return "curved-turnout";
  return "turnout";
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Convert a parsed `.xtp` part into a library {@link TrackPart}.
 *
 * ⚠️⚠️ **DELIBERATELY DERIVES NO `lead` AND NO `frogOffset`.** The shipped Atlas
 * file's frog positions are internally inconsistent — it puts the #5's frog
 * FURTHER OUT than the #7's, which cannot be true of physical parts. Every lead
 * in this library is a physical measurement and must stay that way; an imported
 * lead would silently outrank {@link leadInchesForSize}'s interpolation across
 * those measurements, which is exactly the wrong trade.
 *
 * What IS taken: identity (manufacturer, name, part number, frog number), the
 * drawn `segments` and `ends`, and two dimensions the geometry states directly —
 * overall length along the through axis, and the actual divergence angle. Both
 * land as `unverified`, because a community CAD file is not a measurement.
 */
export function importedPartToTrackPart(
  part: ImportedPart,
  sourceName = "imported .xtp",
): TrackPart {
  const name = part.name ?? part.title ?? "Imported part";
  const manufacturer = part.manufacturer ?? "Unknown";
  const note = `from ${sourceName} — community CAD data, not a measurement`;
  const out: TrackPart = {
    id: `xtp-${slug(manufacturer)}-${slug(part.partNumber || name)}`,
    manufacturer,
    name,
    line: "",
    scale: "N",
    kind: importedKind(name),
    frogNumber: frogNumberFromName(name),
    segments: part.segments,
    ends: part.ends,
    importedFrom: sourceName,
  };
  if (part.partNumber) out.partNumbers = { single: part.partNumber };

  const ends = part.ends;
  if (ends.length >= 2) {
    // Span along the axis the part faces at its first end. XTrkCAD headings run
    // CLOCKWISE FROM NORTH, so the unit vector is (sin, cos).
    const a = (ends[0].angleDeg * Math.PI) / 180;
    const ux = Math.sin(a);
    const uy = Math.cos(a);
    const proj = ends.map((e) => (e.x - ends[0].x) * ux + (e.y - ends[0].y) * uy);
    const span = Math.max(...proj) - Math.min(...proj);
    if (span > 0) out.overallLength = { inches: span, source: "unverified", note };
  }
  if (ends.length >= 3) {
    // The through end faces opposite the points end; the other one diverges, and
    // the gap between their headings IS the frog angle.
    const rest = ends.slice(1);
    const opposite = rest
      .map((e) => ({ e, off: Math.abs(angleDeltaDeg(e.angleDeg, ends[0].angleDeg + 180)) }))
      .sort((p, q) => p.off - q.off);
    const through = opposite[0].e;
    const diverging = opposite[opposite.length - 1].e;
    const deg = Math.abs(angleDeltaDeg(diverging.angleDeg, through.angleDeg));
    if (deg > 0.01) out.actualAngle = { deg, source: "unverified", note };
  }
  return out;
}

/**
 * A part as an application stores it — one flat row, so the package needs to
 * know nothing about any particular database. Dimensions are plain numbers with
 * a `source` beside each, mirroring {@link PartDimension}.
 */
export interface StoredTrackPart {
  slug: string;
  manufacturer: string;
  line: string;
  scale?: string | null;
  name: string;
  kind?: string | null;
  partNumberLeft?: string | null;
  partNumberRight?: string | null;
  partNumberSingle?: string | null;
  frogNumber?: number | null;
  pointsOffsetInches?: number | null;
  pointsOffsetSource?: string | null;
  frogOffsetInches?: number | null;
  frogOffsetSource?: string | null;
  overallLengthInches?: number | null;
  overallLengthSource?: string | null;
  divergingLengthInches?: number | null;
  divergingLengthSource?: string | null;
  minimumLengthInches?: number | null;
  minimumLengthSource?: string | null;
  substitutionRadiusInches?: number | null;
  substitutionRadiusSource?: string | null;
  trackSpacingInches?: number | null;
  trackSpacingSource?: string | null;
  secondaryFrogAngleDeg?: number | null;
  secondaryFrogAngleSource?: string | null;
  buildable?: boolean | null;
  piecesPerAssembly?: number | null;
  leadInches?: number | null;
  leadSource?: string | null;
  outerRadiusInches?: number | null;
  innerRadiusInches?: number | null;
  radiusSource?: string | null;
  actualAngleDeg?: number | null;
  actualAngleSource?: string | null;
  measurementNote?: string | null;
}

const asSource = (s: string | null | undefined): DimensionSource =>
  s === "manufacturer" || s === "measured" || s === "derived" ? s : "unverified";

/**
 * Convert a stored row into a {@link TrackPart}.
 *
 * The LEAD is derived from the two offsets whenever both are present, rather
 * than read from its own column: they're measured from the same tie end, so
 * their difference is the lead by construction, and a separately-entered lead
 * could silently disagree with the positions it's supposed to summarise. A
 * stored `leadInches` is used only for a part whose offsets aren't known.
 */
export function storedPartToTrackPart(row: StoredTrackPart): TrackPart {
  const note = row.measurementNote ?? undefined;
  const dim = (
    inches: number | null | undefined,
    source: string | null | undefined,
  ): PartDimension | undefined =>
    typeof inches === "number" && Number.isFinite(inches)
      ? { inches, source: asSource(source), ...(note ? { note } : {}) }
      : undefined;

  const points = dim(row.pointsOffsetInches, row.pointsOffsetSource);
  const frog = dim(row.frogOffsetInches, row.frogOffsetSource);
  // Both offsets ⇒ the lead is their difference, and it is only as good as the
  // weaker of the two readings.
  const lead: PartDimension | undefined =
    points && frog
      ? {
          inches: frog.inches - points.inches,
          source:
            points.source === "measured" && frog.source === "measured"
              ? "measured"
              : "derived",
          ...(note ? { note } : {}),
        }
      : dim(row.leadInches, row.leadSource);

  const kind = row.kind;
  const part: TrackPart = {
    id: row.slug,
    manufacturer: row.manufacturer,
    line: row.line,
    scale: "N",
    name: row.name,
    kind:
      kind === "wye" || kind === "curved-turnout" || kind === "crossing"
        ? kind
        : "turnout",
  };
  const numbers = {
    ...(row.partNumberLeft ? { left: row.partNumberLeft } : {}),
    ...(row.partNumberRight ? { right: row.partNumberRight } : {}),
    ...(row.partNumberSingle ? { single: row.partNumberSingle } : {}),
  };
  if (Object.keys(numbers).length) part.partNumbers = numbers;
  if (typeof row.frogNumber === "number") part.frogNumber = row.frogNumber;
  if (points) part.pointsOffset = points;
  if (frog) part.frogOffset = frog;
  const overall = dim(row.overallLengthInches, row.overallLengthSource);
  if (overall) part.overallLength = overall;
  const diverging = dim(row.divergingLengthInches, row.divergingLengthSource);
  if (diverging) part.divergingLength = diverging;
  const minimum = dim(row.minimumLengthInches, row.minimumLengthSource);
  if (minimum) part.minimumLength = minimum;
  const substitution = dim(row.substitutionRadiusInches, row.substitutionRadiusSource);
  if (substitution) part.substitutionRadius = substitution;
  const spacing = dim(row.trackSpacingInches, row.trackSpacingSource);
  if (spacing) part.trackSpacing = spacing;
  if (typeof row.secondaryFrogAngleDeg === "number")
    part.secondaryFrogAngle = {
      deg: row.secondaryFrogAngleDeg,
      source: asSource(row.secondaryFrogAngleSource),
      ...(note ? { note } : {}),
    };
  if (row.buildable) part.buildable = true;
  if (typeof row.piecesPerAssembly === "number" && row.piecesPerAssembly > 1)
    part.piecesPerAssembly = row.piecesPerAssembly;
  if (lead) part.lead = lead;
  const outer = dim(row.outerRadiusInches, row.radiusSource);
  const inner = dim(row.innerRadiusInches, row.radiusSource);
  if (outer) part.outerRadius = outer;
  if (inner) part.innerRadius = inner;
  if (typeof row.actualAngleDeg === "number")
    part.actualAngle = {
      deg: row.actualAngleDeg,
      source: asSource(row.actualAngleSource),
      ...(note ? { note } : {}),
    };
  return part;
}

/**
 * Fold an application's STORED library over the built-in one, by slug.
 *
 * ⚠️ Unlike {@link mergeImportedParts}, a stored part **replaces** a built-in
 * outright. That difference is deliberate, and the reason is who is speaking: an
 * import is a third-party file that may have been fitted in someone else's CAD
 * program, so it may only fill gaps. The stored library is seeded FROM these
 * built-ins and edited by an admin with the part in their hand — it is the same
 * library, later. Refusing their correction would mean a wrong dimension could
 * only be fixed by shipping a release, which is exactly the limitation the
 * stored library exists to remove.
 *
 * The built-ins remain the floor: a part nobody has stored still resolves, so
 * geometry keeps working with no database at all.
 *
 * ⛔ THE TRAP THIS CREATES, and it has already been sprung once. Replacement is
 * WHOLESALE, so a stored row that is merely INCOMPLETE deletes every dimension
 * the built-in had. When both Atlas wyes were measured in 0.78.0 their stored
 * rows still held null offsets from the original seed — so in production the
 * new measurements were invisible and the 2056 still carried a `derived` lead
 * the release had just retired. Nothing failed; the parts simply had no
 * dimensions, which is indistinguishable from never having measured them.
 *
 * **Measuring a built-in is therefore not finished until the stored row is
 * updated too.** Adding a dimension here and stopping ships nothing.
 */
export function mergeStoredParts(
  stored: StoredTrackPart[],
  library: TrackPart[] = BUILT_IN_TRACK_PARTS,
): TrackPart[] {
  const bySlug = new Map(library.map((p) => [p.id, p]));
  for (const row of stored) bySlug.set(row.slug, storedPartToTrackPart(row));
  return [...bySlug.values()];
}

/**
 * Fold imported parts into a library.
 *
 * **Imports never overwrite. Ever.** They may only fill a gap — attach geometry
 * a built-in lacks, or add a part we have no entry for. A dimension already
 * present wins regardless of its source, because our worst built-in value is at
 * least one we can trace, and this library has already been burned once by a
 * plausible number from a CAD file (the constant-switch-angle model was fitted
 * to an `.xtp` figure that turned out to be measured to the wrong landmark).
 *
 * Matching is by manufacturer part number first, then manufacturer + frog number.
 */
export function mergeImportedParts(
  imported: ImportedPart[],
  library: TrackPart[] = BUILT_IN_TRACK_PARTS,
  sourceName = "imported .xtp",
): TrackPart[] {
  const out = library.map((p) => ({ ...p }));
  const numbersOf = (p: TrackPart) =>
    [p.partNumbers?.left, p.partNumbers?.right, p.partNumbers?.single]
      .filter(Boolean)
      .map((s) => (s as string).trim().toLowerCase());

  for (const raw of imported) {
    const conv = importedPartToTrackPart(raw, sourceName);
    const pn = raw.partNumber?.trim().toLowerCase();
    const match =
      (pn ? out.find((p) => numbersOf(p).includes(pn)) : undefined) ??
      (conv.frogNumber != null
        ? out.find(
            (p) =>
              p.frogNumber === conv.frogNumber &&
              p.kind === conv.kind &&
              p.manufacturer.toLowerCase() === conv.manufacturer.toLowerCase(),
          )
        : undefined);

    if (!match) {
      out.push(conv);
      continue;
    }
    // Geometry is the point of importing — take it when we have none.
    if (!match.segments?.length && conv.segments?.length) match.segments = conv.segments;
    if (!match.ends?.length && conv.ends?.length) match.ends = conv.ends;
    if (!match.importedFrom && (conv.segments?.length || conv.ends?.length)) {
      match.importedFrom = sourceName;
    }
    if (!match.overallLength && conv.overallLength) match.overallLength = conv.overallLength;
    if (!match.actualAngle && conv.actualAngle) match.actualAngle = conv.actualAngle;
  }
  return out;
}

/**
 * A part's drawn outline in TURNOUT-LOCAL coordinates, ready for MR to map onto
 * a lane: `x` = inches along the through route measured **from the frog**
 * (negative back toward the points), `y` = lateral offset with the DIVERGING
 * side positive. That is the same frame {@link turnoutClosure} works in, so a
 * renderer can swap one for the other.
 *
 * ⚠️ **Anchored on OUR measured lead, not the file's frog.** The part is placed
 * so its points sit `leadInches` back from the frog, because `pos` means the
 * frog (#132) and our leads are physical measurements while the shipped Atlas
 * `.xtp`'s frog positions are internally inconsistent. A consequence worth
 * knowing: if the file's own geometry disagrees, its drawn V will not land on
 * the frog marker — and that visible gap IS the validation. Don't "fix" it by
 * anchoring on the file.
 *
 * Returns null when the part carries no geometry to draw.
 */
export function partOutlineAtFrog(
  part: TrackPart,
  leadInches: number,
  stepsPerCurve = 16,
): BenchworkPoint[][] | null {
  const ends = part.ends ?? [];
  const segs = part.segments ?? [];
  if (!segs.length || ends.length < 2) return null;

  // The two EXIT ends sit close together at the far end; the points end is the
  // odd one out. More robust than assuming the file lists points first.
  let points = ends[0];
  if (ends.length >= 3) {
    let bestPair = Infinity;
    let pairIdx: [number, number] = [1, 2];
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const d = Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y);
        if (d < bestPair) {
          bestPair = d;
          pairIdx = [i, j];
        }
      }
    }
    const odd = ends.findIndex((_, k) => k !== pairIdx[0] && k !== pairIdx[1]);
    if (odd >= 0) points = ends[odd];
  }

  // Ends face OUTWARD, so the through direction is the inward normal. XTrkCAD
  // headings run clockwise from north ⇒ the heading vector is (sin, cos).
  const a = (points.angleDeg * Math.PI) / 180;
  const ux = -Math.sin(a);
  const uy = -Math.cos(a);
  // Left-perpendicular, so `y` is a consistent lateral before we fix its sign.
  const toLocal = (p: BenchworkPoint): BenchworkPoint => {
    const dx = p.x - points.x;
    const dy = p.y - points.y;
    return { x: dx * ux + dy * uy, y: dx * -uy + dy * ux };
  };

  // Whichever exit end is off-axis is the diverging one; flip so it reads +y.
  let sign = 1;
  const offAxis = ends
    .filter((e) => e !== points)
    .map(toLocal)
    .sort((p, q) => Math.abs(q.y) - Math.abs(p.y))[0];
  if (offAxis && offAxis.y < 0) sign = -1;

  return samplePartSegments(segs, stepsPerCurve).map((poly) =>
    poly.map((p) => {
      const l = toLocal(p);
      return { x: l.x - leadInches, y: l.y * sign };
    }),
  );
}

/** A turnout's CLOSURE — the diverging route's lateral offset from the through
 * route, from the points (s = 0) to the frog (s = lead) and beyond.
 *
 * Anchored on one geometric fact: the FROG is where the two routes' inner rails
 * cross, which happens where the centre-lines are exactly ONE GAUGE apart. So
 * `pos` (which means the frog, #132) must be where d = gauge — otherwise the
 * drawn crossing and the frog marker disagree.
 *
 * The curve is `d(s) = α·s + k·s²`, fixed by three conditions:
 *   d(0)      = 0      — the points start ON the stock rail
 *   d(lead)   = gauge  — the frog lands exactly on `pos`
 *   d'(lead)  = 1/N    — it leaves at the frog angle
 *
 * ⚠️ `α` is the SWITCH ANGLE and is deliberately non-zero. A curve leaving
 * TANGENT to the stock rail only reaches `lead/2N` of lateral by the frog
 * (0.24″ on a #7) — it could never reach a gauge within a commercial lead; you'd
 * need `lead = 2·gauge·N` ≈ the prototype figure. Real points leave the stock
 * rail at a finite angle, which is exactly why a commercial turnout can be
 * shorter than prototype. Valid while `lead < 2·gauge·N`; α is clamped at 0
 * otherwise so an absurd lead degrades to a tangent start instead of bending
 * backwards. */
export interface TurnoutClosure {
  /** Lateral offset from the through route at arc length `s` past the points. */
  offsetAt: (s: number) => number;
  /** Points→frog, inches. */
  lead: number;
  /** Slope at the points (the switch angle), rise over run. */
  switchSlope: number;
  /** Slope at and beyond the frog — the frog angle, 1/N. */
  frogSlope: number;
  /** Total run from the points to where the route arrives PARALLEL at
   * `arriveAtInches`. Infinity when no target was given (the legacy
   * straight-forever behaviour). Use this rather than solving for the offset:
   * solving finds where the route REACHES the lane, not where it arrives
   * parallel, and the difference is a visible kink. */
  span: number;
  /** Length of the easing curve, 0 when not easing. */
  easeInches: number;
}

export function turnoutClosure(
  size: number,
  opts: {
    leadInches?: number;
    gaugeInches?: number;
    /**
     * Lateral offset the diverging route must ARRIVE AT, PARALLEL — normally
     * one lane spacing, i.e. the track it feeds.
     *
     * ⚠️ Without this the route runs straight at the frog angle forever, and a
     * caller can only solve for where it first REACHES the offset. Reaching is
     * not arriving: it gets there still climbing at 1/N while the track it
     * joins runs parallel, so the two meet with an instantaneous change of
     * direction. That KINK is what reads as "the rails don't line up" — each
     * rail is offset perpendicular to its own heading, so at a kink the two
     * rails meet at different points.
     */
    arriveAtInches?: number;
    /** Length of the easing curve. Defaults to one lead, which puts the radius
     * around 25″ on a #7 — clear of the Free-moN 22″ minimum. */
    easeInches?: number;
  } = {},
): TurnoutClosure {
  const N = size > 0 ? size : 6;
  const g = opts.gaugeInches ?? RAIL_GAUGE_INCHES;
  const lead = Math.max(0.01, opts.leadInches ?? N * TURNOUT_LEAD_INCHES_PER_FROG);
  const frogSlope = 1 / N;
  const k = (lead / N - g) / (lead * lead);
  const switchSlope = Math.max(0, frogSlope - 2 * k * lead);

  // Post-frog profile. Straight at the frog angle for `a`, then ease the slope
  // from 1/N to ZERO over `b`, arriving parallel at the target.
  //   straight gains  m·a        ease gains  m·b/2   (parabolic, slope m → 0)
  const target = opts.arriveAtInches;
  let a = Infinity;
  let b = 0;
  if (target != null && target > g) {
    b = Math.max(0.01, opts.easeInches ?? lead);
    a = (target - g) / frogSlope - b / 2;
    if (a < 0) {
      // Too close to ease over a full lead — shorten the ease instead of
      // starting it before the frog, which would move the crossing.
      a = 0;
      b = (2 * (target - g)) / frogSlope;
    }
  }
  const span = target != null && target > g ? lead + a + b : Infinity;

  return {
    lead,
    switchSlope,
    frogSlope,
    span,
    easeInches: b,
    offsetAt: (s: number) => {
      if (s <= lead) return switchSlope * s + k * s * s;
      const past = s - lead;
      if (past <= a) return g + frogSlope * past;
      if (target == null) return g + frogSlope * past;
      const u = Math.min(past - a, b);
      // slope m at u=0 falling linearly to 0 at u=b
      const eased = g + frogSlope * a + frogSlope * u - (frogSlope * u * u) / (2 * b);
      return past - a >= b ? target : eased;
    },
  };
}

// ─── PIECE GEOMETRY (ADR 0001) ───────────────────────────────────────────────
// A part's ENDS, in the part's own frame, so a piece graph has something to
// snap. `PartEnd` already carried position and tangent for imported .xtp files;
// what a graph also needs is WHICH end is which, and which ends a train can run
// between. That is what this section derives, from measurements we already have.

/** Which end of a part this is. A graph connects joints; a walk uses `routes`. */
export type PartJointRole = "throat" | "through" | "diverge" | "divergeB";

/** One end of a part, in part-local inches: `x` along the through route from
 * the tie end, `y` lateral toward the diverging side, `angleDeg` the OUTWARD
 * tangent (0 = +x). Named, unlike {@link PartEnd}, because a graph has to know
 * a throat from a frog. */
export interface PartJoint extends PartEnd {
  id: string;
  role: PartJointRole;
}

export interface PartGeometry {
  joints: PartJoint[];
  /** Joint id pairs a train can run between. A turnout has two routes sharing
   * its throat; flex has one; a double crossover has four. */
  routes: [string, string][];
  /** The weakest provenance among the dimensions used — so a caller can tell a
   * placed-from-measurement part from a placed-from-a-catalogue-figure one. */
  source: DimensionSource;
  /** True when the diverging end came from a measured {@link
   * TrackPart.divergingLength} rather than from assuming the diverging rail
   * leaves the moulding at the same place the through route does. */
  divergingEndMeasured: boolean;
}

/**
 * Why a part has no derivable geometry — null when it has.
 *
 * Worth its own function because "we cannot place this yet" is a fact an owner
 * should see in the picker, not a silent absence. It is also the parts-library
 * backlog in machine-readable form: every string this returns is a measurement
 * someone could take.
 */
export function partGeometryGap(part: TrackPart): string | null {
  if (part.kind === "flex") return null;
  if (part.kind === "crossover")
    return (
      "a crossover fixture builds one HALF of the assembly (piecesPerAssembly), " +
      "so its published lengths describe a piece, not the finished part — the " +
      "geometry of the whole crossover is not yet derivable from them"
    );
  if (part.kind === "crossing") return "crossing geometry is not modelled yet";
  if (part.kind === "curved-turnout")
    return "a curved turnout needs both radii AND its points/frog landmarks; only the radii are published";
  if (!part.pointsOffset)
    // ⚠️ CONSIDERED AND REJECTED for buildable parts: a fixture's frame could be
    // anchored at the POINTS instead of the tie end, which would make its
    // geometry derivable from the published radius and angle alone. Rejected
    // because it would give one library two different meanings for x=0 — and
    // because a hand-built turnout's tie end is wherever the builder cut, so an
    // owner measuring their own build is the honest source. One reading per
    // size unblocks all fourteen Fast Tracks parts.
    return "no points offset — without it there is nowhere for the diverging route to begin";
  if (!part.overallLength) return "no overall length — the part has no end to put a joint on";
  if (part.frogNumber == null) return "no frog number — the diverging angle is unknown";
  return null;
}

/**
 * A part's joints and routes, in its own frame.
 *
 * The through route runs along +x from the tie end; the diverging side is +y.
 * A placed piece is this, transformed — which is the whole point: the geometry
 * belongs to the PART, and placement is a rotation and a translation.
 *
 * ⚠️ THE DIVERGING END IS MEASURED WHERE WE HAVE A MEASUREMENT. `divergingLength`
 * (frog → end of the diverging rail, along the rail) says exactly where that end
 * is. Without it we fall back to assuming the diverging rail leaves the moulding
 * at the same x as the through route — which is what `partExtent` has always
 * assumed, and is an assumption, not a reading. `divergingEndMeasured` says
 * which you got.
 */
export function partGeometry(
  part: TrackPart,
  library = BUILT_IN_TRACK_PARTS,
): PartGeometry | null {
  if (partGeometryGap(part)) return null;

  if (part.kind === "flex") {
    // Flex has no fixed geometry — it is the one piece a builder cuts. Its ends
    // are a and b; where b sits is the placed piece's business, not the part's.
    return {
      joints: [
        { id: "a", role: "throat", x: 0, y: 0, angleDeg: 180 },
        { id: "b", role: "through", x: 0, y: 0, angleDeg: 0 },
      ],
      routes: [["a", "b"]],
      source: "derived",
      divergingEndMeasured: false,
    };
  }

  const N = part.frogNumber as number;
  const points = part.pointsOffset!;
  const overall = part.overallLength!;
  const frog = part.frogOffset;
  const lead = part.lead?.inches ?? (frog ? frog.inches - points.inches : undefined);
  if (lead == null || !(lead > 0)) return null;

  // A wye splits SYMMETRICALLY: each leg takes HALF the divergence, so each
  // behaves as a #2N. Same rule `frogLegOf` uses — one definition, two callers.
  const isWye = part.kind === "wye";
  const effN = isWye ? N * 2 : N;
  const closure = turnoutClosure(effN, { leadInches: lead });

  /** The diverging route's end: measured along the rail when we have it. */
  const divergingEnd = (): { x: number; y: number; measured: boolean } => {
    const frogX = frog ? frog.inches : points.inches + lead;
    const slope = closure.frogSlope;
    const dir = 1 / Math.hypot(1, slope); // unit x-component along the rail
    if (part.divergingLength) {
      // Frog → end of the diverging rail, ALONG the rail.
      const L = part.divergingLength.inches;
      return {
        x: frogX + L * dir,
        y: closure.offsetAt(frogX - points.inches) + L * slope * dir,
        measured: true,
      };
    }
    return {
      x: overall.inches,
      y: closure.offsetAt(overall.inches - points.inches),
      measured: false,
    };
  };

  const weakest = (...ds: (PartDimension | undefined)[]): DimensionSource => {
    const rank: DimensionSource[] = ["measured", "manufacturer", "derived", "unverified"];
    let worst = 0;
    for (const d of ds) if (d) worst = Math.max(worst, rank.indexOf(d.source));
    return rank[worst];
  };

  const de = divergingEnd();
  const legAngle = (Math.atan(closure.frogSlope) * 180) / Math.PI;

  if (isWye) {
    // Both legs diverge, mirrored. There is no straight through route — which is
    // exactly why a wye has no hand.
    return {
      joints: [
        { id: "throat", role: "throat", x: 0, y: 0, angleDeg: 180 },
        { id: "legA", role: "diverge", x: de.x, y: de.y, angleDeg: legAngle },
        { id: "legB", role: "divergeB", x: de.x, y: -de.y, angleDeg: -legAngle },
      ],
      routes: [
        ["throat", "legA"],
        ["throat", "legB"],
      ],
      source: weakest(points, overall, frog, part.divergingLength),
      divergingEndMeasured: de.measured,
    };
  }

  return {
    joints: [
      { id: "throat", role: "throat", x: 0, y: 0, angleDeg: 180 },
      { id: "through", role: "through", x: overall.inches, y: 0, angleDeg: 0 },
      { id: "diverge", role: "diverge", x: de.x, y: de.y, angleDeg: legAngle },
    ],
    routes: [
      ["throat", "through"],
      ["throat", "diverge"],
    ],
    source: weakest(points, overall, frog, part.divergingLength),
    divergingEndMeasured: de.measured,
  };
}

/** Every part that can be PLACED on a board today, and every one that can only
 * be named — with the reason. The gap list is the parts backlog. */
export function partsPlaceable(library = BUILT_IN_TRACK_PARTS): {
  placeable: TrackPart[];
  blocked: { part: TrackPart; why: string }[];
} {
  const placeable: TrackPart[] = [];
  const blocked: { part: TrackPart; why: string }[] = [];
  for (const p of library) {
    const why = partGeometryGap(p);
    if (why) blocked.push({ part: p, why });
    else if (partGeometry(p, library)) placeable.push(p);
    else blocked.push({ part: p, why: "dimensions present but inconsistent" });
  }
  return { placeable, blocked };
}

// ─── THE TRACK GRAPH (ADR 0001) ──────────────────────────────────────────────
// Pieces placed on the board; joints that coincide are connected. Everything
// positional — `pos`, a siding's extent, which track hosts a turnout — is READ
// OFF this by walking it, rather than authored separately and reconciled.

/** A part placed on the benchwork. */
export interface TrackPiece {
  id: string;
  /** A slug from the parts library. */
  partId: string;
  /** Where the part's own origin sits, in module-local inches. */
  x: number;
  y: number;
  /** Rotation about that origin, degrees. */
  rotationDeg: number;
  /** Mirrored across its own through route — a left-hand turnout from a right. */
  flipped?: boolean;
  /** FLEX ONLY: how long this run is. The one piece a builder cuts (ADR 0001). */
  lengthInches?: number;
  /** Owner's label, carried onto whatever route this piece ends up in. */
  name?: string;
}

/** A piece's joint, in MODULE coordinates. */
export interface PlacedJoint {
  /** `"<pieceId>.<jointId>"` — stable, and what connections refer to. */
  key: string;
  piece: string;
  joint: string;
  role: PartJointRole;
  x: number;
  y: number;
  headingDeg: number;
}

/** Two joints in the same place. That is the entire connection rule. */
export interface GraphConnection {
  a: string;
  b: string;
}

/**
 * More than two joints in one place — REFUSED, not resolved.
 *
 * ⚠️ THIS IS THE GAP THE SPIKE FOUND, and the one that would bite owners. With
 * three ends stacked on a point, picking a pair silently drops a piece out of
 * the layout: the walk never reaches it, and nothing says so. So none of them
 * connect and the ambiguity is reported. Refusing is the only honest answer —
 * the model cannot know which two the owner meant.
 */
export interface GraphConflict {
  x: number;
  y: number;
  joints: string[];
  reason: string;
}

export interface TrackGraph {
  joints: PlacedJoint[];
  connections: GraphConnection[];
  /** Joints connected to nothing — an unfinished layout, which is a real thing
   * to show an owner rather than quietly draw as if it were joined. */
  open: string[];
  conflicts: GraphConflict[];
  /** Pieces whose part has no derivable geometry (see {@link partGeometryGap}). */
  unplaceable: { piece: string; partId: string; why: string }[];
}

/** How close two joints must be to count as connected. A hundredth of an inch:
 * tight enough that nothing joins by accident, loose enough to absorb the
 * rounding of a drag. */
export const JOINT_SNAP_INCHES = 0.01;

/** Every piece's joints, transformed onto the board. */
export function placedJoints(
  pieces: TrackPiece[],
  library = BUILT_IN_TRACK_PARTS,
): PlacedJoint[] {
  const out: PlacedJoint[] = [];
  const RAD = Math.PI / 180;
  for (const p of pieces) {
    const part = library.find((x) => x.id === p.partId);
    if (!part) continue;
    const geo = partGeometry(part, library);
    if (!geo) continue;
    const c = Math.cos(p.rotationDeg * RAD);
    const s = Math.sin(p.rotationDeg * RAD);
    for (const j of geo.joints) {
      // Flex is the ONE piece whose geometry the builder sets, so its far end is
      // wherever they cut it. Everything else is rigid.
      const lx = part.kind === "flex" && j.id === "b" ? (p.lengthInches ?? 0) : j.x;
      const ly = p.flipped ? -j.y : j.y;
      const h = (p.flipped ? -j.angleDeg : j.angleDeg) + p.rotationDeg;
      out.push({
        key: `${p.id}.${j.id}`,
        piece: p.id,
        joint: j.id,
        role: j.role,
        x: p.x + lx * c - ly * s,
        y: p.y + lx * s + ly * c,
        headingDeg: norm360(h),
      });
    }
  }
  return out;
}

/**
 * Build the graph: which joints are connected, which are open, and where the
 * layout is ambiguous.
 *
 * ⭐ A JOINT HOLDS AT MOST ONE CONNECTION. Rail has two ends; a place where
 * three meet is a mistake, not a junction — a junction is a TURNOUT, which is a
 * part carrying three joints of its own.
 */
export function buildTrackGraph(
  pieces: TrackPiece[],
  library = BUILT_IN_TRACK_PARTS,
  snapInches = JOINT_SNAP_INCHES,
): TrackGraph {
  const joints = placedJoints(pieces, library);
  const unplaceable: TrackGraph["unplaceable"] = [];
  for (const p of pieces) {
    const part = library.find((x) => x.id === p.partId);
    if (!part) {
      unplaceable.push({ piece: p.id, partId: p.partId, why: "no such part in the library" });
      continue;
    }
    const why = partGeometryGap(part);
    if (why) unplaceable.push({ piece: p.id, partId: p.partId, why });
  }

  // Group coincident joints FIRST. Pairing greedily would connect two of three
  // and hide the third, which is exactly the failure this rule exists to stop.
  const groups: PlacedJoint[][] = [];
  const taken = new Set<string>();
  for (const j of joints) {
    if (taken.has(j.key)) continue;
    const g = [j];
    taken.add(j.key);
    for (const k of joints) {
      if (taken.has(k.key) || k.piece === j.piece) continue;
      if (Math.hypot(k.x - j.x, k.y - j.y) <= snapInches) {
        g.push(k);
        taken.add(k.key);
      }
    }
    groups.push(g);
  }

  const connections: GraphConnection[] = [];
  const open: string[] = [];
  const conflicts: GraphConflict[] = [];
  for (const g of groups) {
    if (g.length === 1) open.push(g[0].key);
    else if (g.length === 2) connections.push({ a: g[0].key, b: g[1].key });
    else {
      conflicts.push({
        x: g[0].x,
        y: g[0].y,
        joints: g.map((j) => j.key),
        reason:
          `${g.length} track ends are stacked in one place. Rail has two ends, ` +
          "so a junction of three is a turnout, not a joint — none of these are " +
          "joined until one is moved.",
      });
      for (const j of g) open.push(j.key);
    }
  }
  return { joints, connections, open, conflicts, unplaceable };
}

/** A route the walk found: a continuous run of pieces a train can travel. */
export interface GraphRoute {
  id: string;
  /** Inches from endplate A, ALONG THE RAIL, to where this route begins. */
  fromPos: number;
  toPos: number;
  /** The turnout this route branched from; null for the main. */
  bornAt: string | null;
  /** The turnout it runs back into. Set = a SIDING; null = it dead-ends. */
  endsAt: string | null;
  pieces: string[];
  /** Furthest lateral offset reached — what gives a lane its side. */
  lateral: number;
}

export interface GraphTurnout {
  id: string;
  /** ⚠️ The FROG's distance from endplate A (#132), measured along the rail. */
  pos: number;
  onRoute: string;
  divergeRoute: string | null;
}

export interface GraphWalk {
  routes: GraphRoute[];
  turnouts: GraphTurnout[];
  /** Every reason this walk is not the whole layout. */
  warnings: string[];
}

/**
 * Walk the graph from an endplate and read the topology off it.
 *
 * ⚠️ POSITIONS ARE ARC LENGTH ALONG THE RAIL, never x. On a curved module the
 * two differ by inches — a 90°/R30 corner runs 47.1″ of rail across a 42.4″
 * chord — and it is the rail a train travels.
 *
 * Nesting falls out for free: a turnout found on a branch queues the branch IT
 * opens, so a yard ladder resolves to whatever depth it actually has. That is
 * the case the 1-D model can only approximate.
 */
export function walkTrackGraph(
  graph: TrackGraph,
  pieces: TrackPiece[],
  startAt: { piece: string; joint: string },
  library = BUILT_IN_TRACK_PARTS,
): GraphWalk {
  const byKey = new Map(graph.joints.map((j) => [j.key, j]));
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const link = new Map<string, string>();
  for (const c of graph.connections) {
    link.set(c.a, c.b);
    link.set(c.b, c.a);
  }
  const partOf = (pid: string) => {
    const p = pieceById.get(pid);
    return p ? library.find((x) => x.id === p.partId) : undefined;
  };
  const geoOf = (pid: string) => {
    const part = partOf(pid);
    return part ? partGeometry(part, library) : null;
  };
  const gap = (a?: PlacedJoint, b?: PlacedJoint) =>
    a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;

  const routes: GraphRoute[] = [];
  const turnouts: GraphTurnout[] = [];
  const warnings: string[] = [];
  const queued = new Set<string>();
  const pending: { from: string; at: number; joint: string; skew: number }[] = [];

  const walk = (
    startKey: string,
    startPos: number,
    id: string,
    bornAt: string | null,
  ): GraphRoute => {
    const route: GraphRoute = {
      id, fromPos: startPos, toPos: startPos, bornAt, endsAt: null, pieces: [], lateral: 0,
    };
    let cur: string | undefined = startKey;
    let pos = startPos;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const here = byKey.get(cur);
      if (!here) break;
      const geo = geoOf(here.piece);
      if (!geo) break;
      // Where this route leaves the piece: whichever of its routes uses the
      // joint we came in by. At a turnout prefer the THROUGH route, so the walk
      // stays on the line it is on and the diverging leg becomes a branch.
      const opts = geo.routes.filter((r) => r.includes(here.joint));
      if (!opts.length) break;
      const pick = opts.find((r) => r.includes("through")) ?? opts[0];
      const exitJoint = pick[0] === here.joint ? pick[1] : pick[0];
      const exit = byKey.get(`${here.piece}.${exitJoint}`);
      const part = partOf(here.piece);

      if (part && (part.kind === "turnout" || part.kind === "wye")) {
        const throat = byKey.get(`${here.piece}.throat`);
        const through =
          byKey.get(`${here.piece}.through`) ?? byKey.get(`${here.piece}.legA`);
        const body = gap(throat, through);
        const lead = part.lead?.inches ?? body / 2;
        // ⚠️ ENTERED FROM EITHER END. A turnout facing the other way is entered
        // at its `through` joint, so the frog is `body − lead` along, not
        // `lead`. Assuming the throat put an east-end frog 1.8" out in the spike.
        // The frog, in the piece's own frame — where the diverging rail has
        // climbed one gauge and the two routes truly cross.
        const dvj = byKey.get(`${here.piece}.diverge`) ?? byKey.get(`${here.piece}.legB`);
        const frogPt =
          throat && body > 0 && dvj
            ? {
                x: throat.x + ((dvj.x - throat.x) * lead) / body,
                y: throat.y + ((dvj.y - throat.y) * lead) / body,
              }
            : null;
        // ⚠️ HOW FAR THE FROG IS DEPENDS ON WHICH END YOU CAME IN BY, and there
        // are THREE answers, not two. From the throat it is the lead. From the
        // through end it is `body − lead`. From a DIVERGING end it is neither:
        // that rail runs at an angle, so it is longer than the axial distance —
        // measure it. Using `body − lead` there put a siding's far end 0.01"
        // out, which is small only because the angle is.
        const toFrog =
          here.joint === "throat"
            ? lead
            : here.joint === "diverge" || here.joint === "legB"
              ? frogPt && dvj
                ? Math.hypot(dvj.x - frogPt.x, dvj.y - frogPt.y)
                : Math.max(0, body - lead)
              : Math.max(0, body - lead);
        const frogPos = pos + toFrog;
        if (here.joint === "diverge" || here.joint === "legB") {
          // Arrived by a diverging end: this route has run into the far switch
          // of a siding, which is what makes it a siding rather than a spur.
          //
          // ⚠️ ITS EXTENT IS THE FAR TURNOUT'S POSITION, not this branch's
          // accumulated arc. A siding climbs away from the main and back, so
          // its own rail is genuinely longer than the span it covers — reading
          // the arc here put a 13→73 siding's far end at 73.02. `fromPos`/
          // `toPos` mean where a track sits ALONG THE MODULE, so use the
          // position the main walk already established for that turnout.
          route.endsAt = here.piece;
          const known = turnouts.find((t) => t.id === here.piece);
          route.toPos = known ? known.pos : frogPos;
          break;
        }
        turnouts.push({ id: here.piece, pos: frogPos, onRoute: id, divergeRoute: null });
        for (const dj of ["diverge", "legB"]) {
          const dk = `${here.piece}.${dj}`;
          const d = byKey.get(dk);
          if (!d || queued.has(dk)) continue;
          queued.add(dk);
          // A branch BEGINS at the frog, but its joint is further along the
          // diverging rail. Losing that stretch makes every position downstream
          // creep, and on a ladder the error compounds.
          const fp =
            throat && body > 0
              ? {
                  x: throat.x + ((d.x - throat.x) * lead) / body,
                  y: throat.y + ((d.y - throat.y) * lead) / body,
                }
              : null;
          pending.push({
            from: here.piece,
            at: frogPos,
            joint: dk,
            skew: fp ? Math.hypot(d.x - fp.x, d.y - fp.y) : 0,
          });
        }
      }

      route.pieces.push(here.piece);
      for (const j of graph.joints)
        if (j.piece === here.piece && Math.abs(j.y) > Math.abs(route.lateral))
          route.lateral = j.y;
      pos += gap(here, exit);
      route.toPos = pos;
      const next = exit ? link.get(exit.key) : undefined;
      if (!next) break;
      cur = next;
    }
    return route;
  };

  routes.push(walk(`${startAt.piece}.${startAt.joint}`, 0, "main", null));

  let n = 0;
  while (pending.length) {
    const b = pending.shift()!;
    const start = link.get(b.joint);
    if (!start) {
      warnings.push(`the route diverging at ${b.from} is not connected to anything`);
      continue;
    }
    // ⚠️ A SIDING IS FOUND TWICE — once from each of its turnouts. Both queue a
    // diverging branch, and the second walks the same rail back the other way.
    // Walking it again would put the same track in the layout twice, on two
    // lanes, with the far turnout diverging onto the copy. A piece belongs to
    // exactly ONE route, so if this branch starts on a piece a route already
    // holds, the answer is that route: the far switch diverges onto the siding
    // that is already there.
    const already = routes.find((r) => r.pieces.includes(byKey.get(start)!.piece));
    if (already) {
      const swFar = turnouts.find((t) => t.id === b.from);
      if (swFar && !swFar.divergeRoute) swFar.divergeRoute = already.id;
      continue;
    }
    n += 1;
    const r = walk(start, b.at + b.skew, `route${n}`, b.from);
    r.fromPos = b.at; // it begins at the frog, whatever its first joint is
    routes.push(r);
    const sw = turnouts.find((t) => t.id === b.from);
    if (sw && !sw.divergeRoute) sw.divergeRoute = r.id;
  }

  const reached = new Set(routes.flatMap((r) => r.pieces));
  for (const p of pieces)
    if (!reached.has(p.id) && !graph.unplaceable.some((u) => u.piece === p.id))
      warnings.push(`${p.id} is not reachable from the endplate — nothing connects it`);
  for (const c of graph.conflicts) warnings.push(c.reason);

  return { routes, turnouts, warnings };
}

// ─── GRAPH → DOCUMENT (ADR 0001) ─────────────────────────────────────────────
// The claim the whole decision rests on: the 1-D document becomes a DERIVED
// artifact, so `moduleFeatures`, the dispatcher view and Free-Dispatcher are
// unaffected. This is where that claim is demonstrated IN THE PACKAGE — the
// graph emits an ordinary `ModuleSchematicDoc` and the same pure function reads
// it. Nothing downstream is told which way a module was authored.

/** What the graph cannot know, and therefore never invents. */
export interface GraphDocInput {
  /** Where the main begins: the joint endplate A's track arrives at. */
  startAt: { piece: string; joint: string };
  /**
   * The rest of the document — module id, endplate identities, the benchwork,
   * industries and signals. Merged UNDERNEATH the derived keys, so the graph
   * wins on length, tracks and turnouts and on nothing else.
   *
   * ⏸️ Industries, signals and control points are PASSED THROUGH untouched.
   * Where they live in a graph is deliberately still open (ADR 0001 defers it
   * to persistence); carrying them is honest, re-deriving them would be a guess.
   */
  base?: Partial<ModuleSchematicDoc>;
  /**
   * Owner metadata for a run, keyed by the piece the run STARTS at — the piece
   * they select and name. Held here rather than on {@link TrackPiece} because
   * it describes the whole run, not the one piece.
   */
  meta?: Record<
    string,
    { trackName?: string; capacityFeet?: number | null; moduleTrackId?: number | null }
  >;
  library?: TrackPart[];
}

export interface GraphDocResult {
  doc: ModuleSchematicDoc;
  graph: TrackGraph;
  walk: GraphWalk;
  /** The walk's warnings, plus anything the emission itself had to leave out. */
  warnings: string[];
}

/**
 * Derive a `ModuleSchematicDoc` from placed pieces.
 *
 * ⭐ **NO HAND IS EMITTED.** A turnout's `kind` is left unset on purpose. The
 * graph knows which side the diverging route is on — it is where the piece IS —
 * so the lane carries the side and `moduleFeatures` keeps the lane it is given
 * (`resolveLane` only overrides the sign for a stated left/right). Emitting a
 * hand as well would be a second source for one fact, which is the ~120 lines
 * of reconciliation this model exists to remove.
 *
 * ⚠️ ONE MAIN. The walk starts at one endplate, so a double-track module's
 * second main is not reached — it surfaces in `warnings` as unreachable pieces
 * rather than vanishing quietly. Emitting Main 2 needs a second start point and
 * is not built yet.
 */
export function graphToDoc(pieces: TrackPiece[], input: GraphDocInput): GraphDocResult {
  const library = input.library ?? BUILT_IN_TRACK_PARTS;
  const graph = buildTrackGraph(pieces, library);
  const walk = walkTrackGraph(graph, pieces, input.startAt, library);
  const warnings = [...walk.warnings];
  const round = (n: number) => Math.round(n * 100) / 100;

  const base = input.base ?? {};
  const endplates: SchematicEndplate[] =
    base.endplates && base.endplates.length
      ? base.endplates
      : [{ id: "A", label: "West" }, { id: "B", label: "East" }];
  const epA = endplates[0];
  const epB = endplates[1];

  const main = walk.routes.find((r) => r.id === "main")!;
  const lengthInches = round(main.toPos);

  // A branch takes the id of the piece it STARTS at — the run's own first piece.
  // It is the piece an owner selects, so it is the thing their name belongs to.
  // ⚠️ Not stable against inserting a piece at the throat: that changes the id.
  // Persisting the graph will need a run identity of its own; nothing yet reads
  // these ids back.
  const branches = walk.routes.filter((r) => r.id !== "main" && r.pieces.length);
  const trackIdOf = new Map<string, string>([["main", MAIN_TRACK_ID]]);
  for (const r of branches) trackIdOf.set(r.id, r.pieces[0]);

  // LANE is an ordinal: which side, and how many tracks out. The side is the
  // sign of how far the run reaches laterally; the magnitude is its rank among
  // the runs on that side, so a spur off a spur stacks OUTSIDE its parent.
  const laneOf = (r: GraphRoute): number => {
    const side = Math.sign(r.lateral) || 1;
    const sameSide = branches
      .filter((x) => (Math.sign(x.lateral) || 1) === side)
      .sort((a, b) => Math.abs(a.lateral) - Math.abs(b.lateral));
    return side * (sameSide.indexOf(r) + 1);
  };

  const tracks: SchematicTrack[] = [
    {
      id: MAIN_TRACK_ID,
      role: "main",
      lane: 0,
      from: epA?.id ?? "A",
      ...(epB ? { to: epB.id } : {}),
    },
  ];
  for (const r of branches) {
    const id = trackIdOf.get(r.id)!;
    const meta = input.meta?.[id] ?? {};
    tracks.push({
      id,
      // It runs back into a second turnout, or it doesn't. That is the whole
      // difference between a siding and a spur, and it is read, not declared.
      role: r.endsAt ? "siding" : "spur",
      lane: laneOf(r),
      fromPos: round(Math.min(r.fromPos, r.toPos)),
      toPos: round(Math.max(r.fromPos, r.toPos)),
      ...(meta.trackName ? { trackName: meta.trackName } : {}),
      ...(meta.capacityFeet != null ? { capacityFeet: meta.capacityFeet } : {}),
      ...(meta.moduleTrackId != null ? { moduleTrackId: meta.moduleTrackId } : {}),
    });
  }

  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const turnouts: SchematicTurnout[] = [];
  for (const t of walk.turnouts) {
    const diverge = t.divergeRoute ? trackIdOf.get(t.divergeRoute) : undefined;
    if (!diverge) {
      // A switch whose diverging route reaches nothing is an unfinished layout,
      // not an operating turnout. Said out loud rather than emitted with a
      // dangling reference for the dispatcher view to trip over.
      warnings.push(
        `${t.id} is placed but its diverging route goes nowhere, so it is not in the operations view`,
      );
      continue;
    }
    const piece = pieceById.get(t.id);
    const part = piece ? library.find((p) => p.id === piece.partId) : undefined;
    turnouts.push({
      id: t.id,
      pos: round(t.pos),
      onTrack: trackIdOf.get(t.onRoute) ?? MAIN_TRACK_ID,
      divergeTrack: diverge,
      ...(piece?.name ? { name: piece.name } : {}),
      ...(part?.frogNumber != null ? { size: part.frogNumber } : {}),
      ...(part ? { partId: part.id } : {}),
    });
  }
  turnouts.sort((a, b) => a.pos - b.pos);

  const doc: ModuleSchematicDoc = {
    version: 1,
    ...base,
    lengthInches,
    endplates,
    tracks,
    turnouts,
  };
  return { doc, graph, walk, warnings };
}

/** A frog casting's parts, in TURNOUT-LOCAL inches: `x` = distance past the
 * points, `y` = lateral offset from the through route. */
export interface FrogCasting {
  /** The point rail — the acute V, apex at the crossing, opening toward the
   * diverging end. Three points: through leg, apex, diverging leg. */
  point: Array<{ x: number; y: number }>;
  /** The two wing rails flanking the point, each a short polyline. */
  wings: Array<Array<{ x: number; y: number }>>;
  /** The apex — where the two inner rails actually cross. */
  apex: { x: number; y: number };
}

/**
 * The frog casting at a turnout's crossing.
 *
 * The apex is where the two INNER rails cross, which is HALF a gauge off the
 * through centre-line (the through inner rail sits at +g/2, the diverging inner
 * rail at d−g/2, and d = g at the frog). Not one full gauge — that is the
 * diverging CENTRE-line, and putting the casting there floats it clear of the
 * rails it is made of.
 *
 * ⚠️ **The flangeway is EXAGGERATED and that is deliberate.** True scale in N is
 * about 0.011″ (prototype 1¾″ ÷ 160) — one pixel in a close-up render and
 * invisible at module zoom. Drawn to scale the wing rails would sit exactly on
 * the running rails and add nothing. `flangewayInches` defaults to a readable
 * fraction of the gauge instead; pass the true figure if you ever need it.
 */
export function frogCasting(
  cl: TurnoutClosure,
  opts: {
    gaugeInches?: number;
    /** How far the casting runs either side of the apex. */
    reachInches?: number;
    /** See the warning above — exaggerated for legibility by default. */
    flangewayInches?: number;
  } = {},
): FrogCasting {
  const g = opts.gaugeInches ?? RAIL_GAUGE_INCHES;
  const w = opts.reachInches ?? g * 1.5;
  const fw = opts.flangewayInches ?? g * 0.12;
  const m = cl.frogSlope;
  const lead = cl.lead;
  const apex = { x: lead, y: g / 2 };

  // Past the apex the two inner rails separate: the through one stays at +g/2,
  // the diverging one climbs at the frog angle. That divergence IS the V.
  const point = [
    { x: lead + w, y: g / 2 },
    apex,
    { x: lead + w, y: g / 2 + m * w },
  ];

  // Approaching the frog those same two rails converge. The wing rails are that
  // incoming pair, bent out by a flangeway so a wheel is carried across the gap
  // rather than dropping into it — so each runs past the apex, not up to it.
  const wings = [
    [
      { x: lead - w, y: g / 2 - fw },
      { x: lead - w * 0.35, y: g / 2 - fw },
      { x: lead + w * 0.35, y: g / 2 - fw * 0.5 },
    ],
    [
      { x: lead - w, y: g / 2 + m * -w + fw },
      { x: lead - w * 0.35, y: g / 2 + m * -w * 0.35 + fw },
      { x: lead + w * 0.35, y: g / 2 + m * w * 0.35 + fw * 0.5 },
    ],
  ];
  return { point, wings, apex };
}

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
        // ⚠️ `flipped` MUST be passed. Rotating a turnout 180° swaps the side
        // its route leaves on — that is what divergeSideForHand's third
        // argument is for. Omitting it made the operations view honour the
        // author's HAND but silently ignore their FLIP, so a flipped turnout
        // drew on opposite sides in the 2-D and the dispatcher views. The
        // three authored facts — host track, hand, flip — must all reach the
        // drawing, and both views must read them through THIS function.
        const s = divergeSideForHand(sw.kind, far - sw.pos, sw.flipped);
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
    // A branch route to a placed endplate (#170) leaves the main at 90° — it
    // can't be drawn in this straightened, positional view, and the endplate it
    // reaches already shows as a labelled connector arrow. The physical view
    // draws its real authored path; here it would only smear a degenerate stub.
    if (t.role === "branch") continue;
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

  // Main 2's actual drawn lane — −1 (below) when the mains are swapped, +1
  // otherwise. Sizing the canvas off a hard-coded +1 clipped a swapped Main 2 at
  // the bottom (#172); the renderer likewise must draw it here, not at +1.
  const main2Lane = trackLane.has(MAIN2_TRACK_ID)
    ? (trackLane.get(MAIN2_TRACK_ID) as number)
    : null;
  // Every lane in use BEFORE the branches — the branch routes are then placed
  // clear of all of them, so a branch can never land on top of a siding.
  const baseLanes = [
    0,
    main2Lane ?? (doubleMain ? 1 : 0),
    ...extraTracks.map((t) => t.lane),
    ...signals.map((s) => s.lane),
    ...crossings.flatMap((x) => [x.laneA, x.laneB]),
    ...crossovers.flatMap((x) => [x.fromLane, x.toLane]),
  ];

  // Branch endplates → a route leaving the module in the operating view — but
  // ONLY once track actually reaches one. Placing a bare 3rd+ endplate must not
  // conjure a junction; the route follows the drawn branch track that links to
  // it (its trackId), so it appears when you connect track, not when you add the
  // endplate (#170).
  //
  // This is where a branch stops being decoration and becomes Main 3 (#181): it
  // gets a lane of its own and a run of its own length, which together are the
  // axis anything positioned along the branch needs. NB the return-loop
  // generator also emits role:"branch" tracks — they're excluded here (and only
  // here) because no endplate's trackId points at them, so loops keep their bulb.
  // Branch lanes start a clear GAP beyond the outermost drawn lane. One empty
  // lane is what stops a route that runs the full width of the strip reading as
  // just another main alongside (#183) — it is an END of the module, and it has
  // to look like one.
  const LANE_GAP_FROM_OTHERS = 2;
  let upLane = Math.max(...baseLanes, 0) + (LANE_GAP_FROM_OTHERS - 1);
  let downLane = Math.min(...baseLanes, 0) - (LANE_GAP_FROM_OTHERS - 1);
  const branchConnectors: BranchConnector[] = doc.endplates
    .filter(
      (e) =>
        e.id !== "A" &&
        e.id !== "B" &&
        e.at &&
        !!e.trackId &&
        (doc.tracks ?? []).some((t) => t.id === e.trackId),
    )
    .map((e) => {
      const trk = (doc.tracks ?? []).find((t) => t.id === e.trackId)!;
      // The branch leaves the main at its FEEDING turnout, not the endplate's
      // own along-axis spot — draw it there so it meets the main where it really
      // diverges (the endplate can sit well off to one side, #170).
      const sw = (doc.turnouts ?? []).find((t) => t.divergeTrack === e.trackId);
      const startPos = sw ? sw.pos : e.at!.pos;
      const side = e.at!.side === "down" ? "down" : "up";
      const lane = side === "down" ? --downLane : ++upLane;
      // The run is the route's OWN length, straightened onto the strip. Its
      // projection on the module axis would be the "natural" span, but a square
      // 90° exit projects to zero — the very case that made branches invisible.
      // A path is always shorter along the axis than along itself, so the length
      // is also the larger, safer number.
      const runInches =
        pathLengthInches(trk.path) ||
        Math.abs(e.at!.pos - startPos) ||
        FREEMO_ENDPLATE_WIDTH_MIN_INCHES;
      // ⚠️ The route runs to the EDGE of the module, not for its own length.
      // This is an endplate: a train leaves the module here, exactly as it does
      // at A or B, and the straightened view says so by taking the route to the
      // end of the strip and terminating it at a plate (#183). Its real
      // on-module length is still reported, for the tooltip.
      //
      // Which edge is the one the plate actually sits toward — a junction near
      // the west end exits west.
      const toB = e.at!.pos >= startPos;
      return {
        id: e.id,
        label: e.label ?? e.id,
        name: trk.trackName ?? "",
        trackId: trk.id,
        kind: (e.kind === "main" ? "main" : "branch") as "branch" | "main",
        posFrac: clampFrac(startPos),
        fromLane: (sw ? (trackLane.get(sw.onTrack) ?? 0) : 0) as number,
        side: side as "up" | "down",
        lane,
        endFrac: toB ? 1 : 0,
        lengthInches: runInches,
      };
    });

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

  // Branch lanes are part of the drawn extent, so renderers size their canvas
  // from laneMin/laneMax alone — no "leave a lane spare if there's a branch"
  // headroom hack at either end (#181).
  const allLanes = [...baseLanes, ...branchConnectors.map((b) => b.lane)];
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
    main2Lane,
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
    hasEndplateB: doc.endplates.some((e) => e.id === "B"),
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

/**
 * An endplate bound to a BENCHWORK EDGE (ADR 0001).
 *
 * Will Gage, 2026-07-26: *"Endplates are a part of the benchwork. We have
 * separated them causing some challenges."* A {@link SchematicEndplate.pose} is
 * a point floating in module space, so it can disagree with the board — and has:
 * a junction plate landed on the module CENTRE LINE rather than the fascia, a
 * derived pose written back silently PINNED a plate so it went stale when the
 * length changed (which is the only reason `poseAuthored` exists), and a face
 * drawn flat across a tapered edge is flush only at its midpoint.
 *
 * Bind it to an edge and none of those are expressible. Position, heading and
 * WIDTH all come from the edge, so they cannot drift apart.
 */
export interface EndplateEdge {
  /** The section whose outline owns this edge; absent = the module outline. */
  section?: string | null;
  /** Which edge: the segment from vertex `index` to vertex `index + 1`. */
  index: number;
  /** Optional span along that edge, 0…1. Absent = the whole edge — which is the
   * common case, because a board's end IS the endplate. */
  fromT?: number | null;
  toT?: number | null;
}

/** What an {@link EndplateEdge} resolves to. Everything here is READ OFF the
 * polygon; nothing is stored, so nothing can go stale. */
export interface EndplateEdgePose {
  x: number;
  y: number;
  /** The edge's OUTWARD normal, degrees. */
  heading: number;
  /** The span's length — the face's real width, not a separate number that
   * might disagree with the board. */
  widthInches: number;
  /** The face's two ends. On a tapered board this follows the slope, which a
   * stored pose + width could never do. */
  face: [{ x: number; y: number }, { x: number; y: number }];
}

/**
 * Resolve an endplate's edge binding against a benchwork polygon.
 *
 * ⚠️ REFUSES A CURVED EDGE. Free-moN §2.0 requires the track crossing an
 * endplate to be perpendicular, straight and level for 4″ — so an endplate face
 * is flat by the standard, and a bulged edge is not somewhere one can go. That
 * is a rule, not a missing feature.
 *
 * Returns null when the edge doesn't exist or isn't usable, so a caller can say
 * why rather than drawing something wrong.
 */
export function endplateEdgePose(
  outline: BenchworkPoint[] | null | undefined,
  edge: EndplateEdge,
): EndplateEdgePose | null {
  if (!outline || outline.length < 3) return null;
  const n = outline.length;
  const i = Math.trunc(edge.index);
  if (!Number.isFinite(i) || i < 0 || i >= n) return null;
  const p0 = outline[i];
  const p1 = outline[(i + 1) % n];
  if (p0.bulge) return null; // a curved fascia is not an endplate face

  const t0 = Math.max(0, Math.min(1, edge.fromT ?? 0));
  const t1 = Math.max(0, Math.min(1, edge.toT ?? 1));
  const a = { x: p0.x + (p1.x - p0.x) * Math.min(t0, t1), y: p0.y + (p1.y - p0.y) * Math.min(t0, t1) };
  const b = { x: p0.x + (p1.x - p0.x) * Math.max(t0, t1), y: p0.y + (p1.y - p0.y) * Math.max(t0, t1) };
  const w = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(w > 0)) return null;

  // Outward = away from the polygon's centroid. Same rule `snapPoseToOutline`
  // uses, so a dragged plate and a bound one agree on which way is out.
  let cx = 0;
  let cy = 0;
  for (const v of outline) {
    cx += v.x;
    cy += v.y;
  }
  cx /= n;
  cy /= n;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ex = (b.x - a.x) / w;
  const ey = (b.y - a.y) / w;
  let nx = ey;
  let ny = -ex;
  if ((mid.x - cx) * nx + (mid.y - cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    x: mid.x,
    y: mid.y,
    heading: norm360((Math.atan2(ny, nx) * 180) / Math.PI),
    widthInches: w,
    face: [a, b],
  };
}

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
  /** Set when this pose came from an {@link EndplateEdge} — read off the
   * benchwork rather than stored. Its width and face are the board's own. */
  boundToEdge?: boolean;
  /** The face's real width, when bound to an edge. */
  widthInches?: number;
  /** The face's two ends, when bound to an edge — follows a tapered board. */
  face?: [{ x: number; y: number }, { x: number; y: number }];
  /** True when the pose was hand-entered, not derived (wye/loop/other). */
  manual?: boolean;
}

export type ReturnLoopShape = "circle" | "teardrop" | "offset-teardrop" | "square";

/** A computed return-loop: a mainline LEAD to the throat, a WYE that splits into
 * two legs, and the LOOP track those legs form, closing back at the throat. Pure
 * geometry, module-local inches, endplate A at the origin, lead heading +x. All
 * shapes are built so the loop CLOSES exactly at the throat and the two wye legs
 * diverge symmetrically about the lead — the piece the earlier eyeballed versions
 * kept getting wrong (#loop). */
export interface ReturnLoopGeometry {
  throat: BenchworkPoint;
  /** The loop track, throat → around → throat (starts and ends at the throat). */
  loop: BenchworkPoint[];
  /** The two diverging wye legs at the throat (each throat → its tangent point). */
  wyeLegs: [BenchworkPoint[], BenchworkPoint[]];
  /** Half the angle between the two wye legs, degrees (0 = tangent/no wye). */
  wyeHalfAngleDeg: number;
  /** Benchwork fascia: outer boundary, and an inner boundary for a donut (empty
   * when the board is solid). */
  outlineOuter: BenchworkPoint[];
  outlineInner: BenchworkPoint[];
}

export function returnLoop(
  shape: ReturnLoopShape,
  opts: {
    leadInches: number;
    radius: number;
    /** Half-width of the board UNDER the loop track (the donut ring), inches. */
    boardHalfWidth?: number;
    /** Half the endplate face width, inches. The lead/interface board is sized to
     * this so the benchwork is never narrower than the endplate (Free-moN §2.0);
     * the track crosses the endplate centred on a full-width board. */
    endplateHalfWidth?: number;
  },
): ReturnLoopGeometry {
  const L = Math.max(1, opts.leadInches);
  const R = Math.max(1, opts.radius);
  // Two widths: the ring under the loop track, and the lead/interface board — the
  // latter at least the endplate half-width, so benchwork ≥ endplate at the face.
  const hw = Math.min(opts.boardHalfWidth ?? 6, R - 1); // ring half-width (keeps a hole)
  const leadHalf = Math.max(hw, opts.endplateHalfWidth ?? hw);
  const T: BenchworkPoint = { x: L, y: 0 };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const rd = (pts: BenchworkPoint[]) => pts.map((p) => ({ x: r2(p.x), y: r2(p.y) }));
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, steps: number) => {
    const out: BenchworkPoint[] = [];
    for (let i = 0; i <= steps; i++) out.push({ x: cx + r * Math.cos(a0 + ((a1 - a0) * i) / steps), y: cy + r * Math.sin(a0 + ((a1 - a0) * i) / steps) });
    return out;
  };

  // circle / teardrop / offset-teardrop / square: the LOOP TRACK is always a
  // proper circle whose centre C sits ahead of the throat — real track can't turn
  // a square corner, so a "square" module is a curved loop inside a square board,
  // never a square track. The wye legs are the two tangent lines from the throat
  // to the circle; the loop is the MAJOR (far) arc between the tangent points, so
  // the legs diverge symmetrically (the wye) and the loop closes at the throat.
  const D = shape === "circle" || shape === "square" ? R * 1.15 : R * 1.6; // throat → centre
  const offY = shape === "offset-teardrop" ? R * 0.7 : 0;
  const C = { x: L + D, y: offY };
  const dist = Math.hypot(C.x - T.x, C.y - T.y);
  const ac = Math.acos(Math.min(1, R / dist)); // tangent-point angle at C
  const base = Math.atan2(T.y - C.y, T.x - C.x); // C → T
  const a1 = base + ac; // upper tangent point angle (at C)
  const a2 = base - ac; // lower
  const P1 = { x: C.x + R * Math.cos(a1), y: C.y + R * Math.sin(a1) };
  const P2 = { x: C.x + R * Math.cos(a2), y: C.y + R * Math.sin(a2) };
  // loop: throat → P1 (leg) → major arc → P2 → throat (leg)
  const loop = [T, P1, ...arc(C.x, C.y, R, a1, a2 + 2 * Math.PI, 64).slice(1), T];
  // wye half-angle: angle between the two legs (T→P1, T→P2), halved
  const legDir = (P: BenchworkPoint) => Math.atan2(P.y - T.y, P.x - T.x);
  const half = Math.abs(((legDir(P1) - legDir(P2) + Math.PI) % (2 * Math.PI)) - Math.PI) / 2;

  // Donut benchwork: outer ring (R+hw) and inner ring (R-hw) around C, the outer
  // meeting the lead's edges. Inner hole = the open middle of the loop.
  const ringOuter = (rr: number) => {
    // The lead/interface board runs at ±leadHalf (≥ the endplate) until it meets
    // the outer ring; the ring itself is radius rr. Using leadHalf here is what
    // keeps the benchwork at least as wide as the endplate at the face.
    const xTop = C.x - Math.sqrt(Math.max(0, rr * rr - (leadHalf - C.y) ** 2));
    const xBot = C.x - Math.sqrt(Math.max(0, rr * rr - (-leadHalf - C.y) ** 2));
    const tTop = Math.atan2(leadHalf - C.y, xTop - C.x);
    const tBot = Math.atan2(-leadHalf - C.y, xBot - C.x);
    // Sweep CLOCKWISE from tTop down to tBot (the FAR arc, away from the lead
    // notch) as a SINGLE traversal. A fixed `tBot − 2π` double-wraps the circle
    // when tTop/tBot straddle ±π (the symmetric shapes), which a solid fill hides
    // but an even-odd donut fill inverts. Normalise instead so 0 > sweep > −2π.
    let end = tBot;
    while (end >= tTop) end -= 2 * Math.PI;
    return [
      { x: 0, y: leadHalf },
      { x: xTop, y: leadHalf },
      ...arc(C.x, C.y, rr, tTop, end, 48).slice(1, -1),
      { x: xBot, y: -leadHalf },
      { x: 0, y: -leadHalf },
    ];
  };
  const Ri = R - hw;

  // A "square" module frames that same circular loop in a SQUARE DONUT: a
  // rectangular loop board (a lead strip + a square around the circle) with a
  // square hole in the open middle. The hole's corners are kept inside the track
  // circle (half-diagonal ≤ R − hw) so the board is at least hw wide under the rail.
  if (shape === "square") {
    const xL = C.x - R - hw; // square board's left edge
    const xR = C.x + R + hw; // right edge
    const yT = R + hw;
    // Lead/interface strip at ±leadHalf (≥ the endplate) sticking out of the square.
    const outerSquare = [
      { x: 0, y: leadHalf },
      { x: xL, y: leadHalf },
      { x: xL, y: yT },
      { x: xR, y: yT },
      { x: xR, y: -yT },
      { x: xL, y: -yT },
      { x: xL, y: -leadHalf },
      { x: 0, y: -leadHalf },
    ];
    const iHalf = (R - hw) / Math.SQRT2; // inner-square half-side (corners inside R)
    const holeSquare =
      iHalf > 2
        ? [
            { x: C.x - iHalf, y: iHalf },
            { x: C.x + iHalf, y: iHalf },
            { x: C.x + iHalf, y: -iHalf },
            { x: C.x - iHalf, y: -iHalf },
          ]
        : [];
    return {
      throat: T,
      loop: rd(loop),
      wyeLegs: [rd([T, P1]), rd([T, P2])],
      wyeHalfAngleDeg: r2((half * 180) / Math.PI),
      outlineOuter: rd(outerSquare),
      outlineInner: rd(holeSquare),
    };
  }

  return {
    throat: T,
    loop: rd(loop),
    wyeLegs: [rd([T, P1]), rd([T, P2])],
    wyeHalfAngleDeg: r2((half * 180) / Math.PI),
    outlineOuter: rd(ringOuter(R + hw)),
    outlineInner: Ri > 2 ? rd(arc(C.x, C.y, Ri, 0, 2 * Math.PI, 40)) : [],
  };
}

export interface ModuleGeometryInput {
  lengthInches: number;
  geometryType?: string | null;
  geometryDegrees?: number | null;
  geometryOffsetInches?: number | null;
  /** Axial endplate configs (A first, then B). Missing → single. `"none"` at B
   * means the module has no far endplate at all — an end of the line, a pocket,
   * or a turnback (#184). */
  endplateConfigs?: ("single" | "double" | "none" | null | undefined)[];
  /** Branch endplates (from the schematic doc, #170), positioned along the
   * mainline axis. */
  branches?: {
    id: string;
    atPos: number;
    side: "up" | "down";
    config?: "single" | "double" | null;
  }[];
  /** ⭐ Endplate EDGE bindings by id (ADR 0001) — an endplate that is part of
   * the benchwork rather than a point floating beside it. Wins over
   * `poseOverrides` and over derivation. */
  endplateEdges?: Record<string, EndplateEdge>;
  /** The module's benchwork polygon, needed to resolve `endplateEdges`. */
  outline?: BenchworkPoint[] | null;
  /** Hand-entered pose overrides by endplate id — win over derivation. */
  poseOverrides?: Record<string, { x: number; y: number; heading: number }>;
  /** Authored endplate FACE widths by id ("A"/"B"), inches — the board's depth.
   * Needed to place a branch endplate on the benchwork edge rather than on the
   * centre line; absent ends use the recommended default. */
  endplateWidths?: Record<string, number>;
  /** Half the spacing between the two tracks of a double endplate (Free-mo ≈ 1",
   * Free-moN ≈ 9/16"). */
  trackHalfSpacingInches?: number;
  /** The module's sections. When present they define the module's real shape,
   * so endplate B lands at the end of the CHAINED boards rather than where a
   * single module-level geometry would have put it (#108). */
  sections?: SchematicSection[] | null;
  /** A balloon / return loop: the main runs out and turns back on itself, so the
   * module has ONE endplate (A). No far endplate B is derived — the chain closes
   * back near the throat, and a B there would just be a spurious plate on the
   * loop. An interchange endplate on the balloon is placed separately (#loop). */
  loop?: boolean;
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
    // ⭐ AN EDGE BINDING WINS OVER EVERYTHING (ADR 0001). It is not an override
    // in the sense a pose is — it is where the endplate IS, read off the board,
    // so it can never go stale and can never sit somewhere the benchwork isn't.
    // `manual` stays FALSE: nothing was hand-placed, and treating it as manual
    // is what pinned plates and made them stop following the module (#182).
    const bound = geo.endplateEdges?.[p.id];
    if (bound) {
      const outline =
        (bound.section
          ? geo.sections?.find((s) => s.id === bound.section)?.outline
          : geo.outline) ?? geo.outline;
      const e = endplateEdgePose(outline, bound);
      if (e)
        return {
          ...p,
          x: e.x,
          y: e.y,
          heading: e.heading,
          widthInches: e.widthInches,
          face: e.face,
          boundToEdge: true,
        };
      // The edge named nothing usable — a curved fascia, or an outline that has
      // since changed shape. Fall through rather than draw a lie; the caller can
      // see `boundToEdge` is absent and say so.
    }
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

  // Endplate B — unless the module presents only ONE face. See
  // hasNoFarEndplate for the three ways to say so and why they differ (#184).
  const noB = hasNoFarEndplate(geo);
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

  // Branch endplates — ON THE BENCHWORK EDGE of their side, facing out.
  //
  // ⚠️ This used to derive `y: 0`, putting the plate on the module's CENTRE
  // LINE. An endplate is where a train leaves the module, so a side-facing one
  // belongs on the board's border — at y = 0 it sat buried mid-board and any
  // track drawn to it stopped in the middle of nowhere. It only ever looked
  // right on modules whose branch pose had been hand-authored to the edge.
  //
  // The depth is the endplate-width band's half-width at that point, which is
  // exactly what the derived board is drawn as. A module with an AUTHORED
  // outline may have its real edge elsewhere; that's the case the note below
  // covers — drag the plate and the override wins.
  //
  // Position along the (possibly curved) mainline is approximated on the A→B
  // chord; the join solver refines with overrides where a module needs it.
  const widthAt = (frac: number) => {
    const wa = endplateWidthFor(geo.endplateWidths, "A");
    const wb = endplateWidthFor(geo.endplateWidths, "B");
    return (wa * (1 - frac) + wb * frac) / 2;
  };
  for (const b of geo.branches ?? []) {
    const frac = L > 0 ? Math.min(1, Math.max(0, b.atPos / L)) : 0;
    const px = frac * L;
    const config = b.config === "double" ? "double" : "single";
    const depth = widthAt(frac);
    poses.push(
      withOverride({
        id: b.id,
        x: px,
        y: b.side === "down" ? -depth : depth,
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

/** Whether a pose sits on the module's own axis — on the centre line, facing
 * straight out either end. That's the shape plain derivation produces for A and
 * B, so an unflagged axial pose can't be told apart from derived residue (#182).
 * Anything off-axis had to be put there by hand. */
function isAxialPose(p: { y: number; heading: number }): boolean {
  const h = norm360(p.heading);
  return Math.abs(p.y) < 1e-6 && (Math.abs(h) < 1e-6 || Math.abs(h - 180) < 1e-6);
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
      typeof e.pose.heading === "number" &&
      // Only an AUTHORED pose overrides derivation (#182) — but docs written
      // before the flag existed have to keep working, so authorship is inferred
      // for the two cases that can only BE authored:
      //   · a placed branch endplate (`at`) — dropping it on the board is the
      //     gesture, and it has no derivable position at all;
      //   · an OFF-AXIS pose on A/B — a hand-placed plate is off-axis by
      //     definition (that's why it needed hand placing, e.g. a wye's B).
      // What's left is an axial A/B pose, which is exactly the shape plain
      // derivation produces — residue. Honouring it silently pins the plate so
      // it stops following the module and goes stale (FMN-0068's B sat at 48 on
      // a 47.9″ board). Anything saved from now on carries the flag, so this
      // guesswork only ever applies to old docs.
      (e.poseAuthored === true || !!e.at || !isAxialPose(e.pose))
    ) {
      out[e.id] = { x: e.pose.x, y: e.pose.y, heading: e.pose.heading };
    }
  }
  return out;
}
