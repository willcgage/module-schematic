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
/**
 * Free-moN §2.0 **standard**: "Double track endplates must have a track spacing
 * of 1.125 inches (1 1/8 inches). Track spacing shall be measured along the
 * track center line." The one definition both apps read.
 *
 * ⚠️⚠️ **READ THE SCOPE, NOT JUST THE NUMBER.** This governs a **double-track
 * ENDPLATE**, and reaches **4″ inboard** of it — §2.0's other standard is that
 * track crossing an endplate be "perpendicular, straight, and level for at least
 * 4 inches from the outside face". **Beyond those 4 inches the standard says
 * nothing about how far apart the mains run**, and every real crossover draws
 * them closer than this (the Fast Tracks N fixtures are 1.09″).
 *
 * ⛔ So this is a value to BUILD TO at an endplate, and **never a test to
 * measure mid-module track against**. Used as one it amber-flagged ordinary,
 * correctly built trackwork as departing from the standard (Will, 2026-07-28).
 * It is also the default LANE PITCH for drawing parallel track, which is a
 * separate job — a drawing convention, not a rule anything conforms to.
 */
export const FREEMO_TRACK_SPACING_INCHES = 1.125;
/** Free-moN §2.0 **standard**: track crossing an endplate must be "not less than
 * 4 inches from either fascia" (and perpendicular, straight and level for 4″). */
export const FREEMO_ENDPLATE_TRACK_FASCIA_CLEARANCE_INCHES = 4;
/**
 * Free-moN **standard**: minimum MAIN-LINE radius, 22″.
 *
 * ⚠️ The main line only. A spur, a yard lead or an industrial track may be
 * tighter, and telling an owner their yard is out of spec because it is not a
 * main would be worse than saying nothing.
 */
export const FREEMO_MAIN_MIN_RADIUS_INCHES = 22;
/** Free-moN **standard**: at least 6″ of straight track between REVERSE curves,
 * so a train is never asked to change hands instantly. */
export const FREEMO_REVERSE_CURVE_STRAIGHT_INCHES = 6;

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
 * The pinches a document's crossovers impose — one per crossover connector whose
 * part is built to a different spacing from the mains either side of it.
 *
 * ⚠️ A PINCH IS GEOMETRY, NOT A FAULT. §2.0 fixes the 1.125″ spacing AT THE
 * ENDPLATE; what the mains do in between is the builder's business, and every
 * real crossover draws them closer. This says where the drawing must narrow, and
 * nothing about conformance.
 *
 * A crossover with no part named, or one built to the same spacing as the mains,
 * imposes nothing: an owner who hasn't said what they built gets the straight
 * pair they had before, which is the only honest default.
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
  /**
   * ⛔⛔ A STORED FIGURE HERE MAY BE ONE THE APP MADE UP. DO NOT TRUST IT.
   *
   * Nothing writes this any more (modulerepo#310): a track has no car capacity,
   * which belongs to the rail assigned to an INDUSTRY, and an owner's stored
   * number is deliberately left exactly as they left it.
   *
   * But for years two different code paths DID write it — `stateToDoc`
   * recomputed it on every save from the span between clearance points, and
   * MR's save path filled a missing one from `inchesToScaleFeet(toPos−fromPos)`.
   * Both measured along the MODULE, which on a curve is not the rail. So the
   * figures sitting in owners' documents today are a mix of numbers they typed
   * and numbers the app invented, **and they cannot be told apart**: the
   * arithmetic is wrong in both directions (a value matching a formula may
   * still be one they chose, and FMN-0040's matches no formula yet was
   * app-written by an older one).
   *
   * ⚠️ THEY WERE LEFT IN PLACE ON PURPOSE (Will, 2026-08-22, modulerepo#319):
   * clearing them would delete real owners' figures to remove fabricated ones.
   * Nothing displays this field, so today it is inert.
   *
   * ⇒ **If you are about to read this field for a new feature, it stops being
   * inert.** Flag it as unverified rather than presenting it as fact — that is
   * the house rule (flag it, don't correct it), and reopening modulerepo#319 is
   * the right move before shipping anything that depends on it.
   */
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
  /**
   * This run's positions are arc length along its OWN {@link path}, not inches
   * from endplate A — see {@link measuredAlongPath}, which reads this.
   *
   * ⭐⭐ EXPLICIT BECAUSE THE FRAME IS NOT DERIVABLE FROM THE NUMBERS ANY MORE.
   * It used to be inferred from `fromPos === toPos`: a route across the board
   * was written with the turnout's position at both ends, so a degenerate
   * along-module extent WAS the signal. Since `fromPos` became the track's own
   * start (#253) that identity is gone — a cross-board route now has two real,
   * different positions like everything else, and nothing in the numbers
   * distinguishes it from a siding.
   *
   * ⛔ Do NOT reintroduce a geometric guess (path length vs along-module
   * extent). Any gently curved siding has one longer than the other, so a
   * threshold there is a number that merely CORRELATES with the frame — the
   * shape that has already made this repo's warnings lie (#229). The author
   * knows which frame a run is in; the document records it.
   *
   * Absent = fall back to the legacy identity, for documents written before
   * #253 and not yet re-saved.
   */
  alongOwnPath?: boolean | null;
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
  /**
   * Which end of this track is CLOSED BY A BUMPER — deliberately the end of the
   * line, rather than track that merely stops.
   *
   * ⭐ The difference is operational, not decorative: a bumpered end is where a
   * cut of cars can be shoved to, and it is where usable length runs out. An
   * end that just stops might only be unfinished.
   */
  bumperAt?: "from" | "to" | null;
  /** The owner's MEASURED usable length, real inches (#20) — for what the
   * drawing can't know: a bumper post short of the drawn end, a structure
   * fouling the track. Absent = derive it from the clearance points (#19). */
  measuredUsableInches?: number | null;
}
/**
 * A turnout.
 *
 * ⭐ **THE WORD IS "TURNOUT", NOT "SWITCH".** They were used interchangeably
 * across both apps; this is the one name. The Free-moN standard says turnout
 * ("main-line turnouts at least #6") and so does the NMRA, every user-facing
 * string already said it, and "switch" is ambiguous three ways for us — the
 * points assembly, an electrical switch, and *switching*, the operation of
 * moving cars, which we need as its own word.
 *
 * ⚠️ TWO DELIBERATE EXCEPTIONS, both still correct usage:
 * 1. **A manufacturer's own product name, quoted as they sell it.** Atlas sells
 *    a "#7 LH Switch" (2052). Renaming their product makes it un-findable in a
 *    catalogue, which is the opposite of what a parts library is for.
 * 2. **The points assembly and its geometry** — "switch points", and the
 *    "switch angle" that {@link TurnoutClosure.switchSlope} carries. That is a
 *    part OF a turnout, not another word FOR one.
 */
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
  /** Hold this signal by the piece it stands beside (ADR 0001). See
   * {@link GraphAnchor} — a mast is planted next to a particular bit of rail. */
  anchor?: GraphAnchor | null;
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
/**
 * ⭐ A PLACE ON THE TRACK, HELD BY THE PIECE THAT IS THERE (ADR 0001).
 *
 * `pos` — inches from endplate A — is a fine way to *read* where something is
 * and a poor way to *hold* it: it is a number about the whole module, so every
 * edit anywhere upstream silently changes what it means. A car spot belongs to
 * the rail it is beside. Anchored to the piece, moving that piece takes the
 * industry with it and moving anything else leaves it alone, which is what an
 * owner dragging track expects to happen.
 *
 * Present = `pos` / `fromPos` / `toPos` are DERIVED from this by
 * {@link graphToDoc}. Absent = the authored numbers stand, exactly as before —
 * nothing migrates (ADR 0001).
 */
export interface GraphAnchor {
  /** The {@link TrackPiece} it sits on. */
  piece: string;
  /**
   * Inches along that piece from its OWN origin end — joint `a` on flex, the
   * throat on a turnout, and in every case the part's x=0.
   *
   * ⚠️ Deliberately NOT "from the end the walk came in by". Which end that is
   * depends on where the module's endplate A happens to be, so the same spot
   * beside the same rail would mean two different numbers on two modules.
   */
  atInches: number;
}

export interface IndustrySpot {
  track: string;
  fromPos: number;
  toPos: number;
  /**
   * How many cars the industry supports ON THIS TRACK — the OWNER'S figure.
   *
   * ⭐ Will, 2026-08-22: "the owner should put the number of cars that the
   * industry supports per track." Not derived from the span: a dock with three
   * doors holds three cars whether or not the rail beside it could take five,
   * and the app has no way to know that. Absent = not recorded, which is a
   * different statement from zero.
   */
  cars?: number | null;
  side?: SignalSide;
  /** Hold this spot by the piece it is beside (ADR 0001). See {@link GraphAnchor}. */
  anchor?: GraphAnchor | null;
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
  /**
   * How many cars the industry supports on its PRIMARY track — the owner's
   * figure. See {@link IndustrySpot.cars}; each spot carries its own, because
   * the question is per track.
   */
  cars?: number | null;
  /** Hold this span by the piece it is beside (ADR 0001). See {@link GraphAnchor}.
   * The span's LENGTH stays authored — a dock face is as long as it is built;
   * only where it begins is read off the track. */
  anchor?: GraphAnchor | null;
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
  /**
   * ⭐⭐ THE AUTHORED TRACK, when this module was drawn as PIECES (ADR 0001).
   *
   * Present = this is the source, and `tracks`, `turnouts` and every anchored
   * feature's position are DERIVED from it by {@link deriveGraphDoc} — they are
   * still written into the document so that everything downstream, Free-
   * Dispatcher included, reads an ordinary document and is never told which way
   * the module was authored.
   *
   * Absent = the module is authored the way it always was, and nothing about it
   * changes. No document is converted (ADR 0001): converting one would mean
   * inventing the leads, frogs and radii nobody measured.
   */
  graph?: {
    pieces: TrackPiece[];
    /** Where the main starts: the joint endplate A's track arrives at. */
    startAt: { piece: string; joint: string };
    /** Where MAIN 2 starts, on a double-track module — the joint the endplate's
     * SECOND track arrives at. Absent = single track.
     *
     * Two starts rather than a list because a document has exactly two mains,
     * `main` and `main2`. This mirrors the thing downstream instead of inventing
     * a generality nothing can read. */
    start2?: { piece: string; joint: string } | null;
  } | null;
}

/** A benchwork-outline vertex, module-local inches. The edge from this vertex
 * to the NEXT one is a straight line, unless `bulge` is set — then it's a
 * circular arc whose midpoint is offset `bulge` inches (signed: + bows to the
 * left of the P→next direction) perpendicular from the chord. */
export interface BenchworkPoint {
  x: number;
  y: number;
  bulge?: number;
  /**
   * A SECOND bend on the same edge, at its far end — which turns one edge from a
   * single arc into an **S**.
   *
   * ⭐ **BECAUSE THAT IS WHAT FLEX TRACK IS FOR** (Will, 2026-07-30). A length of
   * flex is most often used to step a route across to a line parallel to the one
   * it left — out of a turnout and into its lane, around an obstruction and back.
   * That shape needs curvature in BOTH directions, and one `bulge` is one
   * circular arc, so a single edge could never draw it. This type came from
   * benchwork OUTLINES, where a polygon of straight edges with the odd arc is
   * exactly right; track is not a polygon.
   *
   * `bulge` bows the first half of the edge, `bulgeEnd` the second, both signed
   * the same way (+ to the left of the P→next direction). **Equal and opposite
   * gives the S**; equal and alike gives a bow that matches what `bulge` alone
   * always drew.
   *
   * ⚠️ **OPTIONAL, AND ABSENT MEANS EXACTLY WHAT IT USED TO.** Omit it and the
   * edge is the same circular arc as before, sampled by the same code — so every
   * stored document, every benchwork outline and every consumer keeps its current
   * shape with nothing to migrate.
   */
  bulgeEnd?: number;
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
    const bulgeEnd = p0.bulgeEnd;
    if (!bulge && !bulgeEnd) continue; // straight edge
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const c = Math.hypot(dx, dy);
    if (c < 1e-6) continue;
    const nx = -dy / c;
    const ny = dx / c;
    if (bulgeEnd != null) {
      /**
       * TWO BENDS ON ONE EDGE — a cubic whose controls sit a third and two
       * thirds along, pushed out by each end's own bulge. Opposite signs give
       * the S a length of flex actually makes; matching signs give a bow.
       *
       * ⭐ **`bulge` KEEPS ITS MEANING.** The 4/3 is not a fudge: a symmetric
       * cubic with both controls offset by `h` bows `3h/4` at its middle, so
       * `h = 4·bulge/3` makes an edge with `bulgeEnd === bulge` bow by `bulge`
       * — the same distance the circular arc below has always bowed. One
       * number, one meaning, whichever branch draws it.
       *
       * ⭐ **AND IT IS SMOOTH FOR *ANY* PAIR OF BENDS.** An S could always be
       * faked with a middle vertex and two opposing arcs — but measured, that
       * is smooth at exactly ONE configuration: equal chords with equal and
       * opposite bulges (1.5° at the join). Move either handle off that and a
       * corner appears — bulges 1/−2 turn 29.9° at the join, chords 4+8 turn
       * 24.5°, and two bends the SAME way turn 72°. Nobody dragging by hand
       * lands on the one symmetric case, so the two-arc S was a corner in
       * practice. A cubic has no join to kink.
       */
      const k = 4 / 3;
      const cx1 = p0.x + dx / 3 + nx * bulge * k;
      const cy1 = p0.y + dy / 3 + ny * bulge * k;
      const cx2 = p0.x + (dx * 2) / 3 + nx * bulgeEnd * k;
      const cy2 = p0.y + (dy * 2) / 3 + ny * bulgeEnd * k;
      for (let s = 1; s < segsPerArc; s++) {
        const t = s / segsPerArc;
        const u = 1 - t;
        out.push({
          x: u * u * u * p0.x + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * p1.x,
          y: u * u * u * p0.y + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * p1.y,
        });
      }
      continue;
    }
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

/**
 * ⭐ IS THIS RUN MEASURED ALONG ITS OWN PATH, rather than along the module?
 *
 * A route to a third endplate leaves the main and crosses the board, so the
 * stretch of MODULE it covers is degenerate — FMN-0068's runs 27.8 → 27.8. Every
 * position on such a run — how long it is, where a rail joint falls — has to be
 * measured along the line that was drawn, because projecting back onto the main
 * collapses: a square 90° exit projects to ZERO, the documented reason these
 * routes were invisible to begin with (#181).
 *
 * ⚠️ **THIS IS NOT A TEST ON `role`.** What a route MEANS operationally is the
 * layout's question, not the module's (#226) — `role: "branch"` is the owner's
 * label, and the return-loop generator emits it too. What decides the frame is
 * geometry: a drawn path, and no usable axis along the module to measure it
 * against. That is equally true of a loop and of a route to endplate C, which is
 * why keying off the label kept getting the loop right by luck.
 *
 * ⭐ ONE DEFINITION, because two places ask the same question: the editor, to cut
 * the run into buyable lengths, and {@link docToState}, to know that those cuts
 * must NOT rescale with the module. Two answers to this would put a module's
 * joints in one place and its drawing in another.
 */
export function measuredAlongPath(
  t: Pick<SchematicTrack, "path" | "fromPos" | "toPos" | "alongOwnPath">,
): boolean {
  if (!trackPath(t.path)) return false;
  // ⭐ THE AUTHORED ANSWER WINS. Since #253 made `fromPos` the track's own start,
  // the identity below can no longer tell these routes apart — see
  // {@link SchematicTrack.alongOwnPath}.
  if (typeof t.alongOwnPath === "boolean") return t.alongOwnPath;
  // ── Legacy fallback, for documents written before #253 and not re-saved ────
  // Fails CLOSED: without two real positions to compare there is no evidence the
  // module axis is unusable, and the along-module frame is what everything else
  // already assumes.
  if (typeof t.fromPos !== "number" || !Number.isFinite(t.fromPos)) return false;
  if (typeof t.toPos !== "number" || !Number.isFinite(t.toPos)) return false;
  // An identity test, not a tolerance. These routes were written with the SAME
  // number at both ends — the turnout they leave from — so a run with any real
  // extent along the module is one that can be measured along the module.
  return Math.abs(t.toPos - t.fromPos) < 0.01;
}

/**
 * Where a module-local point falls along the main centre-line, as inches from
 * endplate A — the inverse of sampling the centre-line at a position.
 *
 * ⚠️ ARC LENGTH, NOT `x`. On a curved or cornered module the two are different
 * quantities: a 90°/R30 corner measures 47.124″ along its centre-line where the
 * chord loses 4.69″ of it. `fromPos`/`toPos` have always been arc length, so a
 * derivation that reached for `x` would be right on every straight module and
 * quietly wrong on every curve.
 *
 * Null when there is no centre-line to measure against.
 */
export function posAlongCenterline(
  center: { x: number; y: number }[],
  pt: { x: number; y: number },
): number | null {
  if (!Array.isArray(center) || center.length < 2) return null;
  if (!Number.isFinite(pt?.x) || !Number.isFinite(pt?.y)) return null;
  let bestD2 = Infinity;
  let bestPos = 0;
  let acc = 0;
  for (let i = 1; i < center.length; i++) {
    const a = center[i - 1];
    const b = center[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-9) continue;
    // Clamped, so a point off either END of the line lands on the nearer end
    // rather than being extrapolated onto track that does not exist.
    const t = Math.max(
      0,
      Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (segLen * segLen)),
    );
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d2 = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestPos = acc + t * segLen;
    }
    acc += segLen;
  }
  return bestD2 === Infinity ? null : round3(bestPos);
}

/**
 * ⭐⭐ A DRAWN TRACK'S POSITIONAL PAIR, READ OFF THE LINE THAT WAS DRAWN (#253).
 *
 * `fromPos` is THE TRACK'S OWN START — where its rail begins — and not the frog
 * of the turnout that opens it (Will, 2026-08-15). Those were the same number
 * for every drawn track on prod, which is exactly why the drift was invisible:
 * the pair was written from the turnout's `pos` (the frog, #132) while the path
 * was snapped to the RAIL END (#235/#239), leaving the two a turnout's reach
 * apart — 1.5–2.1″ on all ten drawn tracks in the catalogue.
 *
 * ⚠️ Meaningless for a run that is measured along its own path
 * ({@link measuredAlongPath}) — projecting a cross-board route onto the module
 * axis is the collapse this model already refuses. Callers must skip those.
 */
export function trackExtentFromPath(
  t: Pick<SchematicTrack, "path">,
  centerline: { x: number; y: number }[],
): { fromPos: number; toPos: number } | null {
  const pts = trackPath(t.path);
  if (!pts) return null;
  const poly = samplePath(pts);
  const fromPos = posAlongCenterline(centerline, poly[0]);
  const toPos = posAlongCenterline(centerline, poly[poly.length - 1]);
  if (fromPos == null || toPos == null) return null;
  return { fromPos, toPos };
}

/**
 * The track's OWN rail as a polyline — its drawn path where it has one, else the
 * module centre-line offset to its lane.
 *
 * A positional track has no path of its own; its rail IS the centre-line offset
 * by {@link laneOffsetAt}, which is also what the renderer draws, so a pinch is
 * honoured here for free.
 */
function trackRailPolyline(
  t: Pick<SchematicTrack, "path" | "lane">,
  centerline: BenchworkPoint[] | null | undefined,
  pinches?: LanePinch[] | null,
): { x: number; y: number }[] | null {
  const drawn = trackPath(t.path);
  if (drawn) return samplePath(drawn);
  const cen = trackPath(centerline) ? samplePath(centerline!) : null;
  if (!cen || cen.length < 2) return null;
  const norms = centerlineNormals(cen);
  let acc = 0;
  return cen.map((p, i) => {
    if (i) acc += Math.hypot(p.x - cen[i - 1].x, p.y - cen[i - 1].y);
    const off = laneOffsetAt(t.lane ?? 0, acc, pinches);
    return { x: p.x + norms[i].x * off, y: p.y + norms[i].y * off };
  });
}

/**
 * ⭐⭐ HOW MUCH RAIL a track actually has between two module positions (#310).
 *
 * `toPos - fromPos` is a distance along the MODULE, and on a curve that is not
 * the rail. A lane on the INSIDE of a bend has less rail than the span it
 * covers and one on the outside has more — at lane 1 on a 90° board, 16.000″ of
 * module is **15.104″** of rail, and it scales with lane offset and curvature.
 * Reporting the module span as though it were rail overstates what fits on the
 * inside of every curve and understates it on the outside.
 *
 * ⚠️ Positions stay along-module — that is deliberate and unchanged (#253).
 * This answers a different question: given that span, how long is the rail?
 *
 * Returns null when there is nothing to measure against (no centre-line and no
 * drawn path), rather than falling back to the module span — a silent fallback
 * is exactly how the axis figure came to be read as rail in the first place.
 */
export function railLengthBetween(
  t: Pick<SchematicTrack, "path" | "lane">,
  fromPos: number,
  toPos: number,
  centerline: BenchworkPoint[] | null | undefined,
  pinches?: LanePinch[] | null,
): number | null {
  if (!Number.isFinite(fromPos) || !Number.isFinite(toPos)) return null;
  const rail = trackRailPolyline(t, centerline, pinches);
  if (!rail || rail.length < 2) return null;
  const cen = trackPath(centerline) ? samplePath(centerline!) : null;
  if (!cen || cen.length < 2) return null;

  const lo = Math.min(fromPos, toPos);
  const hi = Math.max(fromPos, toPos);
  if (hi - lo < 1e-9) return 0;

  // ⛔ MEASURED BY WHERE THE RAIL CROSSES lo AND hi, not by clipping each segment
  // to its own module span. Clipping drops rail that runs PERPENDICULAR to the
  // module axis — a leg heading straight across the board projects to a single
  // position, so its inches would vanish — and that rail is exactly the rail a
  // car occupies. Walk the rail to the arc at which it first reaches each end
  // and take what lies between.
  const posOf = rail.map((p) => posAlongCenterline(cen, p) ?? 0);
  const arcAtPos = (target: number): number => {
    if (posOf[0] >= target) return 0;
    let acc = 0;
    for (let i = 1; i < rail.length; i++) {
      const segLen = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
      const a = posOf[i - 1];
      const b = posOf[i];
      if ((a < target && b >= target) || (a > target && b <= target)) {
        const t = Math.abs(b - a) < 1e-9 ? 0 : (target - a) / (b - a);
        return acc + segLen * Math.max(0, Math.min(1, t));
      }
      acc += segLen;
    }
    return acc;
  };
  return Math.abs(arcAtPos(hi) - arcAtPos(lo));
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
      // ⚠️ KEPT EVEN WHEN ZERO, unlike `bulge`. A zero `bulgeEnd` is not the
      // same statement as no `bulgeEnd`: it says this edge's far half is
      // deliberately straight — half of an S whose other half bends — and
      // dropping it would turn that edge back into a plain circular arc.
      ...(Number.isFinite(p.bulgeEnd) ? { bulgeEnd: p.bulgeEnd } : {}),
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
  /**
   * The document already places track along a main (see {@link
   * moduleCenterline}). Set from the doc's own `tracks`; without it a module
   * whose track was authored before it had a geometry draws as a bare board.
   */
  hasPlacedTrack?: boolean;
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
  /**
   * The BENCHWORK's own centre-line — the same line, but computed with
   * `mainPath` withheld, so the board never chases the drawn track (0.127.0).
   * Identical to `centerline` when no main is drawn.
   *
   * ⭐⭐ EXPOSED BECAUSE THE BENCHWORK MAY NOT READ THE TRACK. A layer may read
   * the layers below it, never above (modulerepo#47): anything shaping the
   * board — the band, the endplate faces, a section's derived rectangle — has
   * to sample THIS, not `centerline`. MR was seeding its section band off
   * `centerline`, which is layer 2 reading into layer 1, and it only looked
   * right because the two lines coincide on a module with no drawn main
   * (modulerepo#255).
   *
   * ⚠️ This is a READOUT of what the footprint already used internally, not a
   * new derivation — `band`, `endplateFaces` and `sectionOutlines` have been
   * built from it since 0.127.0. Nothing about the geometry changes.
   */
  spine: BenchworkPoint[];
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
  /**
   * ⭐⭐ HAS THE OWNER ACTUALLY DRAWN A BOARD? (Will, 2026-08-01, modulerepo#268)
   *
   * `band` is always produced, so `outline ?? band` always draws *something* —
   * which meant a module with no benchwork at all was indistinguishable from
   * one with a real board. **An endplate is part of the benchwork**, so a
   * module without benchwork has nothing for its plates to belong to, and the
   * honest response is to TELL THE OWNER rather than quietly stand a derived
   * ribbon in for the board they never drew.
   *
   * False ⇒ `band` is a derived stand-in, not the module's real shape.
   * ⚠️ Deliberately NOT used to suppress the band: half the catalogue has no
   * outline, and blanking their boards would be rewriting owners' modules
   * rather than asking them. Renderers keep drawing; the apps warn.
   */
  benchworkAuthored: boolean;
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
  //
  // ⚠️ UNLESS THE DOCUMENT ALREADY PLACES TRACK. `pos` means inches from
  // endplate A ALONG THE MAIN, so a document with tracks on it is asserting
  // that a main exists — refusing one then draws the board and silently none of
  // its track, which is what a card for such a module did. The blank-module
  // rule is about a module with NOTHING on it, and a module with track is not
  // that. Callers pass `hasPlacedTrack` from the document they already hold.
  if (!input.geometryType && !input.hasPlacedTrack) return [];
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
  /**
   * ⭐⭐ THE BENCHWORK'S SPINE, WHICH IS NOT THE TRACK'S PATH.
   *
   * Will, 2026-08-01: *"The Endplate is a part of the benchwork. This keeps
   * causing issues that we end up having circular issues with."* This is where
   * the circularity actually lived: `moduleCenterline` lets an authored
   * `mainPath` WIN (it is the main *track* centre-line, as its own name says),
   * and the band + endplate faces were built from it — so the drawn TRACK
   * defined the BENCHWORK, which defined the ENDPLATE. Exactly inverted from
   * the build order the app is organised around (modulerepo#47: benchwork is
   * layer 1, trackwork layer 2).
   *
   * Two different things were sharing one name:
   *   - the BOARD's axis — what the benchwork is shaped around, and where its
   *     ends (and therefore its endplates) are. Comes from the module's own
   *     geometry: length, type/degrees/offset, sections, outline.
   *   - the TRACK's path — what `pos` is measured along, so turnouts, signals
   *     and industries follow the shape the owner actually drew.
   *
   * `centerline` stays the track's path, so nothing positional moves. Only the
   * benchwork stops chasing it.
   */
  const spine = input.mainPath ? moduleCenterline({ ...input, mainPath: undefined }) : centerline;
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
        // Sections ARE benchwork — boards chained end to end — so they take the
        // spine for the same reason the band and the faces do.
        centerline: spine,
        widthA,
        widthB,
        offsetA: offA,
        offsetB: offB,
      })
    : [];
  return {
    centerline,
    // Handed back so CALLERS can obey the same rule the band and the faces
    // already do — see the note on `spine` in ModuleFootprint.
    spine,
    // ⭐ Both of these are BENCHWORK, so both read the spine — never the drawn
    // track. See the note on `spine` above.
    band: benchworkBand(spine, widthA, widthB, offA, offB),
    // Only emit a face where the module actually presents one. A loop's
    // centre-line ends at the THROAT, and an end of the line / pocket simply
    // stops — a far face there is a plate the module hasn't got (#191).
    endplateFaces: hasNoFarEndplate(input)
      ? endplateFaceSegments(spine, widthA, widthB, offA, offB).slice(0, 1)
      : endplateFaceSegments(spine, widthA, widthB, offA, offB),
    outline: sectionOutlines.length || !authored ? null : sampleBenchworkOutline(authored),
    // The donut hole, arc-sampled — only when there's a solid outline to punch it
    // out of (a sectioned module isn't a donut). Renderers cut it from `outline`.
    outlineInner:
      sectionOutlines.length || !authored || !input.outlineInner || input.outlineInner.length < 3
        ? null
        : sampleBenchworkOutline(input.outlineInner),
    sectionOutlines,
    // Either a real ring the owner drew, or sections that own the shape — both
    // are benchwork somebody authored. Anything else and `band` is a stand-in.
    benchworkAuthored: !!authored || sectionOutlines.length > 0,
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
  /**
   * ⛔⛔ THE DOC'S TRACKS — because a heal must not INVENT one (modulerepo#325).
   *
   * This used to repoint MAIN → MAIN2 unconditionally. On a module that has no
   * Main 2 that is not a repair, it is a fabrication: the turnout then names a
   * track nobody authored and the derivation materialises it, so a SINGLE-track
   * module comes back double-track. Measured on a one-main document, feeding it
   * exactly what MR's "+ Turnout" wrote: `tracks: ["main"]` → `["main","main2"]`.
   *
   * The function's own last line already had the right instinct for the
   * non-main case — "nothing sensible to repoint it at". A main that does not
   * exist is equally nothing sensible.
   */
  tracks: SchematicTrack[] | undefined,
): SchematicTurnout[] | undefined {
  if (!turnouts?.some((t) => t.onTrack === t.divergeTrack)) return turnouts;
  const exists = (id: string) => (tracks ?? []).some((t) => t?.id === id);
  let changed = false;
  const out = turnouts.map((t) => {
    if (t.onTrack !== t.divergeTrack) return t;
    // Only onto a main that is REALLY THERE. Otherwise leave the turnout as it
    // is: a self-diverging turnout is wrong, but it is the document's own
    // wrongness, and saying so is the caller's job — inventing a second main to
    // hide it is the app authoring a fact nobody asked for.
    if (t.onTrack === MAIN_TRACK_ID && exists(MAIN2_TRACK_ID)) {
      changed = true;
      return { ...t, divergeTrack: MAIN2_TRACK_ID };
    }
    if (t.onTrack === MAIN2_TRACK_ID && exists(MAIN_TRACK_ID)) {
      changed = true;
      return { ...t, divergeTrack: MAIN_TRACK_ID };
    }
    return t; // nothing that exists to repoint it at
  });
  // Keep the referential identity this function has always promised: an
  // untouched doc must come back as the very same array.
  return changed ? out : turnouts;
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
  const healed = healSelfDivergingTurnouts(doc.turnouts, doc.tracks);
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
  /** This run is measured along its own path, not along the module — see
   * {@link SchematicTrack.alongOwnPath}. Round-trips so the frame survives a
   * save; without it every cross-board route would be re-read as a siding. */
  alongOwnPath?: boolean;
  /** Measured usable length, real inches (#20). Absent = derived (#19). */
  measuredUsableInches?: number;
  /**
   * The AUTHORED capacity figure, carried through untouched (#310).
   *
   * ⛔ NOT derived here, and deliberately not recomputed on save. Will's call,
   * 2026-08-22: capacity belongs to INDUSTRY-assigned rail, so a track's stored
   * number is no longer something this app computes — and the house rule is
   * flag it, don't correct it, so an owner's figure is left exactly as they
   * left it rather than being silently rewritten.
   */
  capacityFeet?: number | null;
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
  /** Cars the industry supports on its PRIMARY track — the owner's figure.
   * See {@link SchematicIndustry.cars}. Each spot carries its own. */
  cars?: number | null;
  side: SignalSide;
  labelMode: IndustryLabelMode;
  carTypes: string[];
  /** freemon_industries row (single source of truth), or null for a new one. */
  moduleIndustryId: number | null;
  /** The piece this span is held by (ADR 0001). See {@link GraphAnchor}. */
  anchor?: GraphAnchor | null;
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
  /** The owner's NAME for an endplate, by id — "UP Spokane N", "South EP".
   *
   * A/B used to be labelled by a constant here ("West"/"East", "Entry"/
   * "Interchange" on a loop), so a name could be typed on the module detail
   * page but never reached the document: the next save overwrote the row from
   * the doc's hard-coded word. Absent or blank id = keep that default, which is
   * what an unnamed end has always shown. Branch endplates (C+) carry their own
   * name in `branches[].label` and are unaffected. */
  endplateLabels: Record<string, string>;
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
  /** ⭐ The track as PLACED PIECES (ADR 0001), when the owner drew it that way.
   * Absent = authored the way it always was, and nothing changes. See
   * {@link ModuleSchematicDoc.graph} and {@link deriveGraphDoc}. */
  graph?: ModuleSchematicDoc["graph"];
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
    endplateLabels: {},
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
 * What endplate A or B is called when its owner has not named it.
 *
 * ⭐ ONE DEFINITION, because this word is needed in two places that must agree:
 * `stateToDoc` writes it, and `docToState` uses it to tell a default apart from
 * a name someone actually typed. Two copies would drift, and the failure would
 * be silent — a doc labelled "West" read back as an authored name.
 */
export function defaultEndplateLabel(id: "A" | "B", loop: boolean): string {
  if (loop) return id === "A" ? "Entry" : "Interchange";
  return id === "A" ? "West" : "East";
}

/**
 * Replace an endplate's label with the owner's own name for it (#120).
 *
 * ⚠️ The label passed in is a DEFAULT, not a value — `stateToDoc` writes the
 * constant "West"/"East" (or "Entry"/"Interchange" on a loop) for A and B. So a
 * name only lands when the owner has actually given one; a blank map entry
 * leaves the default word standing rather than emptying the label, because an
 * unnamed end has always read as "West"/"East" and nothing should change for
 * the modules that never named theirs.
 */
function withLabels(
  endplates: SchematicEndplate[],
  labels: Record<string, string> | undefined,
): SchematicEndplate[] {
  if (!labels) return endplates;
  return endplates.map((e) => {
    const name = labels[e.id]?.trim();
    return name ? { ...e, label: name } : e;
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
  opts?: {
    /**
     * The module's main centre-line, for reading a drawn run's start and end off
     * the line that was drawn (#253). See {@link trackExtentFromPath}.
     *
     * ⚠️ OPTIONAL, AND ITS ABSENCE MEANS "DON'T TOUCH THE NUMBERS". A position
     * is arc length along this line, so without it there is no frame to measure
     * in — and a straight one assumed on a curved module would move every drawn
     * track by the difference between an arc and its chord. Fails closed: no
     * centre-line, no correction, exactly as before this shipped.
     */
    centerline?: BenchworkPoint[] | null;
  },
): ModuleSchematicDoc {
  const center = trackPath(opts?.centerline) ? samplePath(opts!.centerline!) : null;
  /**
   * ⭐⭐ WHERE A DRAWN RUN ACTUALLY STARTS AND ENDS (#253).
   *
   * `fromPos` is the track's own start, not the frog of the turnout that opens
   * it (Will, 2026-08-15). The pair was written from the turnout's `pos` while
   * the path snapped to the RAIL END, leaving the two a reach apart on every
   * drawn track in the catalogue. The drawing is the truth; this reads the pair
   * back off it.
   *
   * Null — leave the authored pair alone — when:
   * - there is no centre-line to measure against;
   * - the track has no pair to correct (it positions itself by endplate refs,
   *   so there is no number to drift);
   * - the run is measured along its OWN path, where projecting onto the module
   *   axis is the collapse this model refuses ({@link measuredAlongPath});
   * - the module is authored as PIECES, whose positions are derived from their
   *   anchors instead (ADR 0001) and must not be second-guessed here.
   */
  const drawnExtent = (
    t: Pick<SchematicTrack, "path" | "fromPos" | "toPos" | "alongOwnPath">,
  ): { fromPos: number; toPos: number } | null => {
    if (!center) return null;
    if ((state.graph?.pieces?.length ?? 0) > 0) return null;
    if (typeof t.fromPos !== "number" || typeof t.toPos !== "number") return null;
    if (!trackPath(t.path)) return null;
    if (measuredAlongPath(t)) return null;
    return trackExtentFromPath(t, center);
  };
  const withDrawnExtent = (t: SchematicTrack): SchematicTrack => {
    const ext = drawnExtent(t);
    return ext ? { ...t, ...ext } : t;
  };
  return {
    version: 1,
    module: recordNumber,
    lengthInches: state.lengthInches,
    ...(state.loop ? { loop: true } : {}),
    ...(state.loop && state.loopReturn === "main2" ? { loopReturn: "main2" as const } : {}),
    ...(state.mainsSwapped ? { mainsSwapped: true } : {}),
    endplates: withLabels(
      withWidths(
      withEdges(
      withPoses(
      [
        ...(state.loop
          ? // Balloon loop: A is the entry. A standard endplate B on the balloon
            // makes it an INTERCHANGE (second route connects at the loop, e.g.
            // Seaford); configB "none" makes it a pure turnback.
            [
              { id: "A", label: defaultEndplateLabel("A", true), tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configA }] },
              ...(state.configB !== "none"
                ? [{ id: "B", label: defaultEndplateLabel("B", true), tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configB }] }]
                : []),
            ]
          : [
              { id: "A", label: defaultEndplateLabel("A", false), tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configA }] },
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
                      label: defaultEndplateLabel("B", false),
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
      state.endplateLabels,
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
        ? [withDrawnExtent(main2Track(state))]
        : []),
      ...(state.loop && state.loopReturn === "main2"
        ? [{ id: MAIN2_TRACK_ID, role: "main" as const, lane: 1, fromPos: 0, toPos: state.lengthInches }]
        : []),
      ...state.extraTracks.map((t) => {
        // #253 — a drawn run begins and ends where its LINE does. Taken before
        // capacity, which is measured from this run's ends and so has to move
        // with them rather than describe where it used to start.
        const ext = drawnExtent(t) ?? { fromPos: t.fromPos, toPos: t.toPos };
        return {
        id: t.id,
        role: t.role,
        lane: t.lane,
        fromPos: ext.fromPos,
        toPos: ext.toPos,
        moduleTrackId: t.moduleTrackId,
        trackName: t.trackName || undefined,
        /**
         * ⛔⛔ THE OWNER'S FIGURE, CARRIED THROUGH UNTOUCHED (#310).
         *
         * This used to RECOMPUTE the figure on every save, from the span
         * between the governing turnouts' clearance points (#19). Two problems
         * with that, and Will settled both on 2026-08-22:
         *
         * 1. **The span is along the MODULE, and on a curve that is not the
         *    rail** — inside of a bend it overstates what fits, outside it
         *    understates, ±12 scale ft per lane of offset. Capacity now belongs
         *    to INDUSTRY-assigned rail, measured with {@link railLengthBetween};
         *    a plain track's car count is not this app's to compute.
         * 2. **Recomputing it REWROTE owners' documents on open.** A save is not
         *    a licence to restate a number nobody edited — the same shape as
         *    #220/#222 — and it made `stateToDoc(docToState(doc))` differ from
         *    `doc` whenever the stored and derived figures disagreed.
         *
         * Left exactly as authored: flag it, don't correct it.
         */
        capacityFeet: t.capacityFeet ?? null,
        ...(typeof t.measuredUsableInches === "number" && t.measuredUsableInches >= 0
          ? { measuredUsableInches: t.measuredUsableInches }
          : {}),
        ...(state.loop && t.inLoop ? { inLoop: true } : {}),
        ...(t.crossoverPartId ? { crossoverPartId: t.crossoverPartId } : {}),
        ...(t.path && t.path.length >= 2 ? { path: t.path } : {}),
        // ⭐ The frame this run is measured in, carried explicitly since the
        // numbers no longer imply it (#253) — and WRITTEN whenever the legacy
        // identity still recognises one, so every save upgrades the document to
        // the explicit form and the fallback quietly goes out of use. Without
        // this the flag would only ever exist on data a migration touched, and
        // the next route an owner drew would have no frame recorded at all.
        ...(measuredAlongPath(t) ? { alongOwnPath: true } : {}),
        };
      }),
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
            // Carried, not interpreted. An anchor is what HOLDS the span (ADR
            // 0001); dropping it here would quietly convert an anchored
            // industry back into a typed number the next time anyone saved.
            ...(ind.anchor ? { anchor: ind.anchor } : {}),
            ...(ind.cars != null ? { cars: ind.cars } : {}),
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
    // The pieces the owner drew, carried verbatim (ADR 0001). This function
    // stays dumb about them on purpose: deriving here would put the derivation
    // in every save path in both apps. `deriveGraphDoc` is the one place.
    ...(state.graph?.pieces?.length ? { graph: state.graph } : {}),
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
  // to half an inch).
  //
  // ⭐⭐ AND WHEN NOTHING IS BEING RESCALED, DON'T TOUCH THE NUMBER AT ALL (#220).
  // The rounding is a guard against float noise *from the multiply*, so it has a
  // job only when `scale !== 1`. At `scale === 1` there is no noise to absorb and
  // `p * 1` is exactly `p`, so rounding is pure loss — and because the editor
  // autosaves, that loss is written back. It cost FMN-0078 its crossover: the
  // app's own derived frog positions carry THOUSANDTHS (40.104 / 42.396, from
  // {@link crossoverAssembly}), so opening the module rewrote them as 40.1 /
  // 42.4. An app that cannot hold a number it computed itself will keep
  // disagreeing with its own geometry, one save at a time.
  //
  // ⚠️ `scale` is `len / docLen`, so equal lengths give EXACTLY 1 — this is an
  // identity test on the multiply, not a tolerance on the positions.
  const sc = (p: number) => (scale === 1 ? p : Math.round(p * scale * 100) / 100);

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
        // Read so the authored figure survives the round trip untouched (#310).
        // Without this the save path has nothing to write back and the owner's
        // number would be DELETED on their next save rather than left alone.
        capacityFeet: t.capacityFeet ?? null,
        ...(t.inLoop ? { inLoop: true } : {}),
        // The crossover product this connector was built from — what makes the
        // physical view draw the pair at the spacing it was really built to.
        ...(typeof t.crossoverPartId === "string" && t.crossoverPartId
          ? { crossoverPartId: t.crossoverPartId }
          : {}),
        // Authored path kept as-drawn (a physical shape, not rescaled with length).
        ...(trackPath(t.path) ? { path: trackPath(t.path)! } : {}),
        // ⭐ The FRAME this run is measured in, carried through the round trip
        // (#253). Dropping it here would silently re-read every cross-board
        // route as an ordinary siding on the next save — the identity that used
        // to say so is gone.
        ...(t.alongOwnPath === true ? { alongOwnPath: true } : {}),
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
  const endplateLabels: Record<string, string> = {};
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
    // The owner's own name for this end (#120). A/B only — a branch endplate
    // carries its name in `branches[].label`, and reading it here too would
    // give one value two homes.
    //
    // ⚠️ THE DEFAULT WORD IS NOT A NAME. Every doc ever written by `stateToDoc`
    // carries the constant "West"/"East" (or "Entry"/"Interchange"), so reading
    // the label unconditionally would mark every module as having named its
    // ends — the same silent promotion of a derived value to an authored one
    // that pinned endplates in #182. Only a label the emitter would not itself
    // have produced is the owner's.
    if ((e.id === "A" || e.id === "B") && typeof e.label === "string") {
      const name = e.label.trim();
      if (name && name !== defaultEndplateLabel(e.id, loop)) endplateLabels[e.id] = name;
    }
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
    // ⚠️ A RUN MEASURED ALONG ITS OWN PATH KEEPS ITS CUTS AS AUTHORED. Cuts
    // normally rescale with the module exactly as fromPos/toPos do. But these
    // index into the track's `path`, and a path is kept as authored — never
    // rescaled, like the benchwork outline it was drawn on. Scaling them would
    // slide every joint along a line that did not move (#226).
    const asAuthored = measuredAlongPath(t);
    const cuts = Array.isArray(t.flexCuts)
      ? t.flexCuts
          .filter((c) => Number.isFinite(c))
          .map((c) => (asAuthored ? c : sc(c)))
          .sort((a, b) => a - b)
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
    endplateLabels,
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
    // ⚠️ NOT scaled by `sc()` like every position above it. A piece is placed in
    // real inches on the board; stretching the module's length does not move it,
    // and the length is DERIVED from the pieces anyway when a graph is present.
    ...(d!.graph?.pieces?.length ? { graph: d!.graph } : {}),
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
    turnouts: (healSelfDivergingTurnouts(d!.turnouts, d!.tracks) ?? []).map((t) => ({
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
      // ⚠️ `cars` IS A COUNT, NOT A LENGTH — it must NOT go through `sc()`.
      // Rescaling a module would otherwise change how many cars an industry
      // holds, which is a fact about the industry, not about the board.
      ...(ind.cars != null ? { cars: ind.cars } : {}),
      spots: (ind.spots ?? []).map((s) => ({
        track: s.track,
        fromPos: sc(s.fromPos ?? 0),
        toPos: s.toPos != null ? sc(s.toPos) : len,
        // Carried explicitly: this mapping REBUILDS each spot field by field,
        // so anything not named here is dropped on load.
        ...(s.cars != null ? { cars: s.cars } : {}),
        ...(s.side ? { side: s.side as SignalSide } : {}),
        ...(s.anchor ? { anchor: s.anchor } : {}),
      })),
      side: (ind.side as SignalSide) ?? "above",
      labelMode: (ind.labelMode as IndustryLabelMode) ?? "none",
      carTypes: Array.isArray(ind.carTypes) ? ind.carTypes : [],
      moduleIndustryId: ind.moduleIndustryId ?? null,
      ...(ind.anchor ? { anchor: ind.anchor } : {}),
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
 * Build a passing siding as one unit: the siding track, a turnout at each end,
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

  // One control point at each end, each grouping its turnout and both-direction
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
  /**
   * Cars that spot here — the OWNER'S figure, or null when they have not said.
   *
   * ⛔ NO LONGER DERIVED FROM THE SPAN. It used to be `carCapacity(from, to)`,
   * which measured along the MODULE — and on a curve that is not the rail, so
   * it over-counted on the inside of every bend and under-counted on the
   * outside (#310). More fundamentally it was answering the wrong question:
   * how much rail is there, rather than how many cars the industry can take.
   * ⚠️ NULL IS "NOT RECORDED", NOT ZERO. Renderers must not print "0 cars" for
   * an industry nobody has counted yet.
   */
  cars: number | null;
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
  kind:
    | "turnout"
    | "wye"
    | "curved-turnout"
    | "crossover"
    | "crossing"
    | "flex"
    /** ⚠️ A SECTIONAL PIECE IS NOT FLEX CUT TO LENGTH, even though the rail ends
     * up in the same place. Its length belongs to the PART and cannot be
     * changed, because an owner has a box of them and cannot cut one — which is
     * the whole reason to model it separately from flex. */
    | "straight"
    | "curve"
    | "bumper";
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
  /**
   * This part stands in for one nobody has identified — its shape is
   * interpolated, not read off anything.
   *
   * ⛔ A provisional part must never be adopted automatically, offered beside
   * real products as an equal, or allowed to look measured. It exists so an
   * owner who cannot answer "which turnout is this?" is not blocked, and so that
   * what they could not answer stays visible afterwards.
   */
  provisional?: boolean;
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
  /**
   * SECTIONAL CURVE only: the radius it is built to.
   *
   * ⚠️ Distinct from {@link outerRadius}/{@link innerRadius}, which are the two
   * routes of a CURVED TURNOUT. A plain curve has one radius, and giving it the
   * "outer" one would say there is another.
   */
  radius?: PartDimension;
  /**
   * SECTIONAL CURVE only: how much of a circle the piece covers, degrees.
   *
   * ⭐ Radius and arc are how curves are SOLD ("19″ radius, 10°"), so they are
   * what an owner can read off the box. The piece's length is the arc between
   * them and is never stored — a chord recorded as a length would quietly
   * shorten every curve on the module.
   */
  arcDegrees?: number;
  /** Curved turnouts: the two concentric radii. */
  outerRadius?: PartDimension;
  innerRadius?: PartDimension;
  /** Crossing angle, degrees. */
  crossingAngleDeg?: number;
  /** Centre-to-centre distance of the two parallel tracks a {@link kind}
   * `crossover` joins. A crossover fixture is BUILT for one spacing — it is not
   * adjustable — so this is what the mains must pinch to where it sits.
   *
   * ⚠️ **NOT A CONFORMANCE TEST.** {@link FREEMO_TRACK_SPACING_INCHES} is fixed
   * by §2.0 **at the endplate** — "double track endplates must have a track
   * spacing of 1.125 inches", perpendicular, straight and level for 4″ from the
   * outside face. What the two mains do in between is the module builder's
   * business, and EVERY real crossover pinches them closer: the Fast Tracks N
   * fixtures are 1.09″. Earlier wording here said this "decides whether the part
   * suits a given standard at all", which is wrong and put an amber
   * non-conformance note on ordinary, correctly built trackwork.
   *
   * Recorded because it is a fact about the product an owner needs when buying,
   * and because the drawing has to pinch the mains to it. */
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
/**
 * ⭐⭐ MEASURED POINTS OFFSETS, one per fixture actually built and read.
 *
 * Fast Tracks publish a length, an angle and a radius, but NOT where the points
 * sit along the tie strip — and that is the landmark the app needs to say where
 * a turnout physically stops. It is also the only one a catalogue cannot give:
 * a fixture is cut by its builder, so the answer is on the part in your hand.
 *
 * ⚠️ Keyed by `kind-N`, so a fixture with no entry simply has no `pointsOffset`
 * and keeps drawing no tie strip and no rail joints — the honest default, rather
 * than one part's reading standing in for its neighbours (a #6 is not a #5).
 */
const FAST_TRACKS_MEASURED_POINTS: Record<string, { inches: number; note: string }> = {
  "turnout-6": {
    inches: 1.19,
    note:
      "Will Gage, physical Fast Tracks #6 build, 2026-07-31 — tie end to point tips. " +
      "✓ CROSS-CHECKS its neighbours: Atlas's measured #5 is 1.75″ and its #7 is " +
      "0.625″, so a #6 belongs between them and 1.19″ is almost exactly the midpoint. " +
      "⚠️ NO FROG READING YET — the tie strip and its rail joints draw (both are " +
      "measured from the POINTS), but `turnoutOccupiedSpan` still refuses, because a " +
      "document's `pos` is the FROG and the published angle+radius put it ~3.78″ " +
      "further along. Guessing it would cut the flex to fit a turnout that isn't there.",
  },
};

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
    // Present only for a fixture somebody has actually measured — see the map.
    ...(FAST_TRACKS_MEASURED_POINTS[`${kind}-${n}`]
      ? {
          pointsOffset: {
            inches: FAST_TRACKS_MEASURED_POINTS[`${kind}-${n}`].inches,
            source: "measured" as DimensionSource,
            note: FAST_TRACKS_MEASURED_POINTS[`${kind}-${n}`].note,
          },
        }
      : {}),
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
        `${spec}. ${spacing}″, and the fixture cannot be built to another spacing. ` +
        `⚠️ THIS IS NOT A DEPARTURE FROM THE STANDARD. Free-moN §2.0 fixes ` +
        `${FREEMO_TRACK_SPACING_INCHES}″ at the ENDPLATE — "double track endplates must ` +
        `have a track spacing of 1.125 inches", with track perpendicular, straight and ` +
        `level for 4″ from the outside face. What the two mains do in between is the ` +
        `module builder's business, and every real double crossover pinches them ` +
        `closer. Earlier wording here called the fixture "tighter than the standard", ` +
        `which reads as non-conformance and is wrong.`,
    },
  } satisfies TrackPart;
});

/** What a track is laid with when nobody has said — the commonest N-scale flex. */
export const DEFAULT_FLEX_PART_ID = "atlas-c55-n-flex";

/** Every built-in part, across manufacturers. */
/**
 * A bumper that is not a product.
 *
 * ⭐ DELIBERATELY GENERIC, AND CARRYING NO DIMENSIONS AT ALL. Owners build these
 * out of a tie and a scrap of rail as often as they buy them, and what a bumper
 * MEANS — this end of the track is closed on purpose — does not depend on which
 * one it is. Recording an invented length here would be exactly the mistake the
 * rest of this library exists to avoid; a named product can be added with its
 * own measurement, and will draw at it.
 */
/** Frog numbers a placeholder is offered for. #6 is the standard's floor for a
 * main line; #4 and #5 are ordinary in yards. Outside the measured 5–10 range
 * the interpolators extrapolate, which is acceptable in a part that already
 * says it is a stand-in. */
export const GENERIC_TURNOUT_FROG_NUMBERS = [4, 5, 6, 7, 8, 10] as const;

/**
 * A turnout nobody has identified — "it's a #6, I don't know whose".
 *
 * ⭐⭐ **IT IS THE TURNOUT'S WORKING GEOMETRY AND NOTHING ELSE**: points → frog
 * → end, with **no moulded approach track in front of the points**. That is not
 * a shortcut, it is the only honest shape available. `pointsOffset` is the one
 * dimension a frog number cannot yield — the measured Atlas parts read 1.75″,
 * 0.625″ and 0.5625″ for #5, #7 and #10, which is a moulding decision and not
 * geometry, so there is nothing to interpolate along. Zero is therefore not a
 * guess about the owner's part; it says we are modelling the turnout and not
 * some product's tie strip. It is also what a hand-laid turnout actually is.
 *
 * ⭐ **The lead and the length past the frog ARE derivable**, by interpolating
 * the measured parts ({@link leadInchesForSize}, {@link pastFrogInchesForSize})
 * — the same interpolation the 1-D model has always drawn an unidentified `#N`
 * with. Nothing new is invented here; what changes is that it is now labelled.
 *
 * ⚠️ **EVERY DIMENSION IS `derived`.** Two things follow, both wanted:
 * {@link partGeometry} reports `source: "derived"`, so any surface can say the
 * shape is provisional; and {@link partExtent} returns **null**, so the drawing
 * declines to claim where this turnout's body ends rather than laundering an
 * interpolation into a boundary an owner would read as measured.
 *
 * ⛔ **NEVER ADOPTED AUTOMATICALLY.** A placeholder is something an owner
 * chooses when they cannot answer; resolving a bare `#6` to one behind their
 * back would be exactly the invention ADR 0001 forbids. See
 * {@link moduleConversionReport}, which excludes provisional parts from both
 * automatic resolution and its candidate list.
 */
export function genericTurnoutPart(
  frogNumber: number,
  library = ATLAS_CODE55_N,
): TrackPart {
  const derived: DimensionSource = "derived";
  const lead = leadInchesForSize(frogNumber, library);
  const past = pastFrogInchesForSize(frogNumber, library);
  const why =
    `Interpolated across the measured parts by frog number — a stand-in, not a reading. ` +
    `No points offset: it is not a function of the frog number (the measured #5, #7 and #10 ` +
    `read 1.75″, 0.625″ and 0.5625″), so this part begins AT the points, as a hand-laid ` +
    `turnout does.`;
  return {
    id: `generic-turnout-${frogNumber}`,
    manufacturer: "Generic",
    line: "N scale",
    scale: "N",
    name: `#${frogNumber} Turnout (make unknown)`,
    kind: "turnout",
    frogNumber,
    provisional: true,
    pointsOffset: { inches: 0, source: derived, note: why },
    lead: { inches: lead, source: derived, note: why },
    frogOffset: { inches: lead, source: derived, note: why },
    overallLength: { inches: lead + past, source: derived, note: why },
  };
}

/** The placeholders, one per {@link GENERIC_TURNOUT_FROG_NUMBERS}. */
export const GENERIC_TURNOUTS: TrackPart[] = GENERIC_TURNOUT_FROG_NUMBERS.map((n) =>
  genericTurnoutPart(n),
);

/**
 * ⏳ **THERE IS DELIBERATELY NO GENERIC DIAMOND.** A placeholder turnout works
 * because its guessed numbers are interpolated from turnouts we HAVE measured;
 * there is no measured crossing to interpolate from, so a placeholder's arm
 * length would be a number with nothing behind it. Every candidate rule was
 * tried and each models a TOOLING decision, which this library forbids in as
 * many words (see {@link ATLAS_CODE55_N}: *"Angle is geometry; everything else
 * is a tooling decision. Measure the part. Do not model it."*) — running the arm
 * out to the clearance point gives a #6 a 13.7″ body when the real part is about
 * 2.5″, and real shallow crossings end while their ties still interlace, so no
 * clearance rule reproduces one.
 *
 * Will chose to measure a real one instead (2026-07-30). A crossing becomes
 * placeable the moment a part carries an angle and an end-to-end length.
 */

/** Parts that stand in for one nobody has identified — offered only where an
 * owner is being asked what something is, and never mixed in with real products
 * as though they were equivalent. */
export function provisionalParts(library = BUILT_IN_TRACK_PARTS): TrackPart[] {
  return library.filter((p) => p.provisional);
}

export const GENERIC_END_OF_TRACK: TrackPart[] = [
  {
    id: "generic-bumper",
    manufacturer: "Generic",
    line: "N scale",
    scale: "N",
    name: "Bumper",
    kind: "bumper",
  },
];

export const BUILT_IN_TRACK_PARTS: TrackPart[] = [
  ...ATLAS_CODE55_N,
  ...FAST_TRACKS_N_ME55,
  ...FAST_TRACKS_N_ME55_CROSSOVERS,
  ...FLEX_TRACK_PARTS,
  ...GENERIC_END_OF_TRACK,
  // ⚠️ LAST, AND PROVISIONAL. These are stand-ins, not products; every path that
  // resolves a turnout automatically filters them out, and every picker that
  // offers them must say what they are.
  ...GENERIC_TURNOUTS,
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
  /**
   * ⛔ NO FROG READING, NO SPAN. `pos` marks the FROG, so this places the moulding
   * by measuring back from it — and without a frog offset the extent's
   * `behindFrog`/`pastFrog` are a placeholder that pretends the frog IS the
   * points. On a Fast Tracks #6 measured only at its points that is **3.78″
   * out**: the span would come back 22.73→28.99 where the part really sits
   * 26.51→32.77, and the flex either side would be cut to fit a turnout that
   * isn't there.
   *
   * ⭐ The tie strip and its rail joints are unaffected — they are measured from
   * the POINTS and stay correct on a points-only part. This refuses only the one
   * thing that genuinely needs the third reading, rather than withholding the two
   * that don't (#189: never a joint on track nobody has checked).
   */
  if (!e.frogKnown) return null;
  // ⭐⭐ ANCHORED ON THE FROG, because that is what a document's `pos` is (Will,
  // 2026-07-27). This read `behindPoints`/`aheadOfPoints`, which put the whole
  // moulding `lead` too far along the run — 3.59″ on an Atlas #7 — so the flex
  // was cut to stop where the turnout was not.
  const a = input.pos - input.facing * e.behindFrog;
  const b = input.pos + input.facing * e.pastFrog;
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
 *
 * ⭐⭐ **A PIECE CAN NEVER BE LONGER THAN ITS STOCK LENGTH** (Will, 2026-08-07):
 * *"A piece can never be longer than its maximum, however, it can be cut to
 * shrink it. Flagging is ok, but it should auto split and create a new piece."*
 * Given `maxInches`, a request past it is CUT INTO LENGTHS rather than left as
 * one piece nobody can buy — asking for 40″ of a 30″ product gives you a 30″
 * and a 10″, because that is what you would actually lay.
 *
 * ⛔ This REVERSES what MR #271 originally specified ("do not silently split");
 * Will overruled it when asked directly. Splitting here is not the fill-a-run
 * gesture — it adds joints only inside the span the owner just resized, and the
 * run's length never changes.
 *
 * ⚠️ Both spans either side of the moved joint are subdivided, because BOTH are
 * changed by the move: shrinking a piece lengthens its neighbour, and leaving
 * that neighbour 40″ long would just move the impossible piece along one.
 * Nothing outside those two spans is touched — a gesture may fix what it
 * breaks, not tidy the rest of the run behind the owner's back.
 */
export function resizeFlexPiece(
  pieces: FlexPiece[],
  index: number,
  nextLengthInches: number,
  /** The stock length of the product this run is laid with, from
   * {@link maxFlexPieceInches}. Omit for the old unbounded behaviour. */
  maxInches?: number,
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
  // Every joint a span longer than one stock length needs, so no piece the
  // owner just touched comes out longer than the product they named.
  const split: number[] = [];
  const max = Number.isFinite(maxInches) && (maxInches ?? 0) > FLEX_EPS ? (maxInches as number) : 0;
  if (max > 0) {
    for (const [from, to] of [
      [piece.fromPos, moved],
      [moved, next.toPos],
    ] as const) {
      for (let at = from + max; at < to - FLEX_EPS; at += max) split.push(at);
    }
  }
  return pieces
    .filter((p) => p.toEnd === "piece")
    .map((p) => (p.index === index ? moved : p.toPos))
    .concat(split)
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
/**
 * Where a part's moulding sits, relative to its own landmarks.
 *
 * ⭐⭐ A DISCRIMINATED UNION ON PURPOSE. The two halves are known independently:
 * `behindPoints`/`aheadOfPoints` need only the points and the overall length,
 * which is enough to draw the tie strip and its rail joints (both are measured
 * from the points). Anchoring a body on the FROG needs a third reading — and a
 * document's `pos` IS the frog.
 *
 * This used to hand back a `pastFrog`/`behindFrog` pair that silently fell back
 * to the points when no frog had been measured. Nothing exercised it while every
 * measured part happened to have a frog reading; the moment one didn't, that
 * fallback leaked into the leg geometry and moved a #6's rail end by 3.55″. So
 * the pair is now ABSENT unless it is real, and reading it without checking
 * `frogKnown` is a compile error rather than a plausible wrong number.
 */
export type PartExtent =
  | {
      /** Points → the near end of the tie strip. Positive = the strip starts this
       * far BEHIND the points (it always does — that end is plain approach track). */
      behindPoints: number;
      /** Points → the far end of the tie strip. */
      aheadOfPoints: number;
      frogKnown: false;
    }
  | {
      behindPoints: number;
      aheadOfPoints: number;
      frogKnown: true;
      /** Frog → the far end. How much turnout there still is past the frog. */
      pastFrog: number;
      /**
       * Frog → the NEAR end of the tie strip.
       *
       * ⭐⭐ **THIS IS THE ONE A BODY IS MEASURED BACK FROM.** A document's `pos`
       * is the FROG (Will, 2026-07-27), so a turnout occupies
       * `[pos − behindFrog, pos + pastFrog]`. Anchoring on the points instead put
       * every turnout body `lead` too far along — 3.59″ on an Atlas #7.
       */
      behindFrog: number;
    };

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
  /**
   * ⭐ A MANUFACTURER'S PUBLISHED FIGURE COUNTS; A DERIVED ONE STILL DOES NOT
   * (Will, 2026-07-31: *"For fast tracks, run with the default."*).
   *
   * The rule this replaces demanded `measured` for everything, and it was
   * written against `derived` — a per-frog formula laundered into a drawing that
   * asserts "your turnout ends HERE". A maker's own spec is not that: Fast Tracks
   * publish to two decimals and build to TRUE frog ratios, which is a better
   * number than most tape measures give.
   *
   * ⚠️ `derived` and `unverified` are still refused, so the generic turnouts —
   * whose offsets are a formula — keep drawing no tie strip and no rail joints.
   * That distinction is the whole point of the rule; only its scope changed.
   *
   * ⚠️ ON ITS OWN THIS UNBLOCKS NOTHING, and that is worth knowing rather than
   * discovering: not one of the 16 Fast Tracks parts publishes a `pointsOffset`,
   * so they still return null here. What it does is halve what has to be
   * measured — a single points-offset reading now completes a part, because its
   * overall length is already published.
   */
  const usable = (d: PartDimension | undefined | null): d is PartDimension =>
    !!d && (d.source === "measured" || d.source === "manufacturer");
  const pts = part?.pointsOffset;
  const overall = part?.overallLength;
  if (!usable(pts) || !usable(overall)) return null;
  const frog = part?.frogOffset;
  const aheadOfPoints = overall.inches - pts.inches;
  return {
    behindPoints: pts.inches,
    aheadOfPoints,
    ...(usable(frog)
      ? { frogKnown: true as const, pastFrog: overall.inches - frog.inches, behindFrog: frog.inches }
      : { frogKnown: false as const }),
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
  // ⛔ A PROVISIONAL PART IS NEVER WHAT A BARE `#N` MEANS. It is a stand-in an
  // owner chooses; adopting one here would answer a question nobody asked.
  const turnouts = library.filter(
    (p) => p.kind === "turnout" && p.frogNumber != null && !p.provisional,
  );
  if (!turnouts.length) return null;
  const dist = (p: TrackPart) => Math.abs((p.frogNumber as number) - size);
  /**
   * ⭐ HOW COMPLETELY A PART CAN BE DRAWN — the tie-break, graded.
   *
   * Two parts can share a frog number (Atlas sell a #5; Fast Tracks make a #5
   * fixture), and this used to be a yes/no: does it have an extent at all? That
   * discriminated while at most one of any pair was measured. Will's Fast Tracks
   * #6 (2026-07-31) broke it — measured at its POINTS only, it has an extent too,
   * so a stored, fully-measured Peco #6 and the fixture both scored 1 and ARRAY
   * ORDER decided which a bare `#6` became. A coin flip where a rule belongs.
   *
   * The grades answer the question the old comment already asked, in degrees:
   * 2 = its routes can be placed (the frog is known, so `pos` means something) ·
   * 1 = it knows where it starts and stops, enough for a tie strip and its rail
   * joints · 0 = nothing drawable.
   */
  const drawnness = (p: TrackPart): number => {
    const e = partExtent(p);
    if (!e) return 0;
    return e.frogKnown ? 2 : 1;
  };
  return turnouts.reduce((best, p) => {
    const d = dist(p);
    const bd = dist(best);
    if (d !== bd) return d < bd ? p : best;
    // Same frog number: prefer the one we can draw MORE of. Ties beyond that
    // keep the earlier entry.
    return drawnness(p) > drawnness(best) ? p : best;
  });
}

/** Measured leads, ascending by frog number — the interpolation basis. Only
 * `measured` counts: interpolating through a derived value would launder a guess
 * into the sizes either side of it. */
function measuredLeadPoints(library: TrackPart[]): Array<{ n: number; lead: number }> {
  return library
    .filter(
      (p) =>
        p.kind === "turnout" &&
        p.frogNumber != null &&
        p.lead?.source === "measured" &&
        !p.provisional,
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
    (p) => p.kind === "turnout" && p.frogNumber === size && p.lead != null && !p.provisional,
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
    // ⛔ ONLY parts whose FROG was actually read. A part measured at its points
    // alone knows where it starts and stops but not where its frog sits, and its
    // extent says so (`frogKnown: false`). Interpolating across one of those
    // would drag the whole curve toward a number that isn't a past-frog distance
    // at all — Will's #6, measured at its points, would have contributed 5.07″
    // where the real figure is nearer 1.5″, moving every drawn rail end.
    .flatMap((p) => (p.ext && p.ext.frogKnown ? [{ n: p.n, past: p.ext.pastFrog }] : []))
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
  /** Sectional curve: its single radius, and how far it turns. */
  radiusInches?: number | null;
  arcDegrees?: number | null;
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

  // ⚠️ EVERY KIND, not a hand-picked few. This allow-list had three entries and
  // silently turned everything else into a TURNOUT — so a stored crossover,
  // flex, bumper or sectional piece came back claiming to be a turnout and was
  // then blocked for having no points offset, blaming a measurement that was
  // never going to exist. Kinds are added to the type often enough that the
  // list has to live next to it.
  const kind = TRACK_PART_KINDS.includes(row.kind as TrackPart["kind"])
    ? (row.kind as TrackPart["kind"])
    : "turnout";
  const part: TrackPart = {
    id: row.slug,
    manufacturer: row.manufacturer,
    line: row.line,
    scale: "N",
    name: row.name,
    kind,
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
  // ⚠️ A SECTIONAL CURVE'S OWN RADIUS, not one of a curved turnout's pair.
  // Without this an admin could enter a curve's radius and arc and the part
  // would still come back unplaceable, with the palette blaming a missing
  // radius that had just been typed in.
  const radius = dim(row.radiusInches, row.radiusSource);
  if (radius) part.radius = radius;
  if (typeof row.arcDegrees === "number") part.arcDegrees = row.arcDegrees;
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

// ─── A TURNOUT'S DIVERGING LEG ───────────────────────────────────────────────

/** One sample of a host polyline: a point and its unit normal. Whatever the
 * caller walks — the module's centre-line, a spur's own drawn path — has to be
 * able to answer this at an arc length. */
export interface HostSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface TurnoutDivergingLegInput {
  /**
   * Sample the host polyline at an arc length along it.
   *
   * ⭐ THE HOST STAYS WITH THE CALLER, deliberately. Which polyline a turnout
   * sits on — a straight main, a curved one, a spur's authored path — is a fact
   * about the MODULE's shape, not about the turnout, and the two renderers build
   * it differently (one from the benchwork centre-line and its lane pinches, one
   * from a stored path). What belongs here is the turnout geometry that both of
   * them were otherwise obliged to reimplement.
   */
  sampleAt: (relInches: number) => HostSample;
  /** Arc length along the host where the FROG sits. A turnout's `pos` marks its
   * frog (Will, 2026-07-27), and the closure below is built so the rails cross
   * exactly there. */
  relFrogInches: number;
  /** Which way along the host the turnout faces — the direction its points look. */
  toward: 1 | -1;
  /** Which side the diverging route throws to. */
  side: 1 | -1;
  size: number;
  /** A wye splits SYMMETRICALLY, so each route takes HALF the divergence — each
   * leg leaves at half the frog angle, i.e. behaves as a #2N. */
  wye?: boolean;
  /** A curved turnout is drawn stretched, so its diverging route reads as a
   * pronounced arc rather than a subtle bow. */
  curved?: boolean;
  library?: TrackPart[];
  /**
   * The points→frog distance, when the caller knows it better than the per-frog
   * rule does. A crossover's turnouts are NOT generic turnouts: the assembly
   * publishes where its own points sit relative to its frogs, and using the
   * generic lead instead started every leg outside its own point-set (#224).
   */
  leadOverrideInches?: number | null;
  /**
   * Track spacing of the assembly this leg belongs to, when it is one half of a
   * crossover. The leg then stops where it MEETS ITS PARTNER rather than running
   * its full body: two full bodies want more lateral than the gap has, so they
   * overshoot and the band bridging them slopes backwards (#196).
   *
   * ⚠️ The gap is the PART's own spacing, never something re-measured off the
   * host — through a crossover the mains pinch, so a host normal is tilted and a
   * tiny tilt multiplies into a real error over the connector's length (#225).
   */
  meetAtSpacingInches?: number | null;
  /** How many segments to walk. The curve near the points has to read as a
   * curve, so this is not 2. */
  steps?: number;
}

export interface TurnoutDivergingLeg {
  /** The leg itself, throat → rail end, in host space. */
  points: { x: number; y: number }[];
  /** Where the two INNER RAILS cross — half a gauge off the through centre-line,
   * NOT the diverging centre-line's position at the lead (which is a full gauge
   * out; that is the definition of the lead). Using the latter put the frog
   * marker 0.177″ off the rails it marks. */
  frog: { x: number; y: number };
  /** The end of the turnout's own diverging rail — where the part stops and the
   * owner's flex begins. This is what a track end snaps to (#189), and what a
   * route's flex has to start from if it is not to count moulding as track. */
  railEnd: { x: number; y: number };
  leadInches: number;
  /** The lead the CLOSURE was built from, before the ramp clamp. A caller easing
   * the route on past the part (the owner's flex bending onto its lane) has to
   * build its longer closure from the same number, or the two profiles disagree
   * where they meet. */
  closureLeadInches: number;
  /** Frog → the end of the diverging rail, along the host axis. */
  pastFrogInches: number;
  /** Points → rail end, along the host axis. */
  spanInches: number;
  /** Lateral offset from the through route at arc length `s` past the points. */
  offsetAt: (s: number) => number;
}

/**
 * ⭐⭐ WHERE A TURNOUT'S DIVERGING ROUTE GOES — one definition, for every caller.
 *
 * This was written inside MR's canvas, which meant the only way to know where a
 * turnout's rail actually ENDS was to be the canvas. The snap that joins track to
 * a turnout, the ring that says nothing is joined, and the flex derivation that
 * needs to know a route starts at the rail rather than at the frog were therefore
 * three different answers to one question — and two of them did not exist.
 *
 * ⚠️ NOTHING IS INVENTED HERE. The lead and the past-frog length are the same
 * {@link leadInchesForSize} and {@link pastFrogInchesForSize} the drawing already
 * used, and the profile is {@link turnoutClosure}. The leg stops at the END OF THE
 * PART and reaches for nothing beyond it: a turnout is as long as the turnout is,
 * and the gap between its rail and the owner's track is REAL — it is their flex
 * (#189).
 */
export function turnoutDivergingLeg(
  input: TurnoutDivergingLegInput,
): TurnoutDivergingLeg {
  const {
    sampleAt,
    relFrogInches,
    toward,
    side,
    size,
    wye = false,
    curved = false,
    library = BUILT_IN_TRACK_PARTS,
    leadOverrideInches = null,
    meetAtSpacingInches = null,
    steps = 16,
  } = input;

  const n = size > 0 ? size : 6;
  const stretch = curved ? 2.2 : 1;
  const effN = wye ? n * 2 : n;
  // The RAMP: how far the diverging route runs to reach one full track spacing.
  // Its slope is the frog ratio 1:N, which is what makes the leg leave at the
  // right angle. It is NOT points→frog — that mistake put the throat a whole
  // ramp-length back, so facing turnouts 11″ apart drew overlapping (#173).
  const ramp = n * FREEMO_TRACK_SPACING_INCHES * stretch;
  const leadIn = leadOverrideInches ?? leadInchesForSize(effN, library) * stretch;
  const cl = turnoutClosure(effN, { leadInches: leadIn });
  const lead = Math.min(ramp, cl.lead);
  const pastFrog = pastFrogInchesForSize(effN, library) * stretch;
  const bodySpan = lead + pastFrog;
  // Past the frog the closure is straight at 1/N, so the distance at which it
  // has reached a given offset is exact rather than fitted. Never LENGTHENS a
  // leg — a turnout whose body already stops short of the meeting point is
  // untouched.
  const span = (() => {
    if (meetAtSpacingInches == null) return bodySpan;
    const half = meetAtSpacingInches / 2;
    if (!(half > RAIL_GAUGE_INCHES)) return bodySpan;
    return Math.min(bodySpan, lead + (half - RAIL_GAUGE_INCHES) * effN);
  })();

  const relThroat = relFrogInches - toward * lead;
  const at = (s: number) => {
    const p = sampleAt(Math.max(0, relThroat + toward * s));
    const off = side * cl.offsetAt(s);
    return { x: p.x + off * p.nx, y: p.y + off * p.ny };
  };

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) points.push(at((span * i) / steps));

  const frog = (() => {
    const p = sampleAt(Math.max(0, relThroat + toward * lead));
    const off = side * (RAIL_GAUGE_INCHES / 2);
    return { x: p.x + off * p.nx, y: p.y + off * p.ny };
  })();

  return {
    points,
    frog,
    railEnd: points[points.length - 1],
    leadInches: lead,
    closureLeadInches: leadIn,
    pastFrogInches: span - lead,
    spanInches: span,
    offsetAt: cl.offsetAt,
  };
}

// ─── PIECE GEOMETRY (ADR 0001) ───────────────────────────────────────────────
// A part's ENDS, in the part's own frame, so a piece graph has something to
// snap. `PartEnd` already carried position and tangent for imported .xtp files;
// what a graph also needs is WHICH end is which, and which ends a train can run
// between. That is what this section derives, from measurements we already have.

/** Which end of a part this is. A graph connects joints; a walk uses `routes`. */
export type PartJointRole =
  | "throat"
  | "through"
  | "diverge"
  | "divergeB"
  /** An end of one of the two parallel tracks THROUGH a crossover assembly.
   * A double crossover has four, and none of them is a throat: every end is
   * both a straight route and a crossing route, which is exactly why it is one
   * moulding and not four turnouts. */
  | "crossoverEnd"
  /** An end of one of the two routes through a CROSSING (a diamond). Four of
   * them, and — unlike a crossover's — no route joins one pair to the other:
   * the two tracks cross, and a train cannot change between them. That absence
   * is the whole definition of a diamond. */
  | "crossingEnd";

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
 * A double crossover's geometry, every number of it PUBLISHED rather than
 * guessed — or null when the part does not carry them.
 *
 * ⭐⭐ **A DOUBLE CROSSOVER IS ONE ASSEMBLY, NOT FOUR TURNOUTS** (Will,
 * 2026-07-28). Modelling it as four independent turnout mouldings is what made a
 * rebuild of FMN-0078 collapse: two Atlas #7s 2.5″ apart overlap by 3.5″, so the
 * pieces intersected and the walk emitted a module nobody has. The real thing is
 * a single moulding whose four point-sets sit closer together than four separate
 * turnouts ever could — which is precisely why it is sold as one fixture.
 *
 * ⚠️ **ITS SPACING IS NOT A DEPARTURE FROM THE STANDARD.** Free-moN §2.0 fixes
 * {@link FREEMO_TRACK_SPACING_INCHES} **at the endplate** — "double track
 * endplates must have a track spacing of 1.125 inches", perpendicular, straight
 * and level for 4″ from the outside face. What the mains do in between is the
 * builder's business, and every real double crossover pinches them closer.
 *
 * The derivation:
 * - **Length IS `overallLength`.** ⚠️ `piecesPerAssembly` counts BUILDS, not
 *   length: you make the fixture's half twice and turn the second 180°, and the
 *   two diagonals then SUPERIMPOSE into the scissors — they occupy the same
 *   stretch of track, they do not sit end to end. Multiplying by it gave a #6 a
 *   20.14″ body with **6.8″ of plain approach track moulded on each end**.
 *   `minimumLength` settles it independently: the shortest #6 build is 9.31″,
 *   which reads as "trim the approach to 1.38″" — and only reads that way if the
 *   assembly is L. Under 2L a "minimum" would still carry a 6″ approach.
 * - **The crossing run** `W = spacing / tan θ` is how far along the track a route
 *   takes to cross to the other one. The two point-sets on the SAME track are
 *   therefore `W` apart — 6.54″ for a #6 at 1.09″, not the 2.5″ my own FMN-0078
 *   fixture claimed.
 * - **The approach**, `(length − W) / 2`, is what is left over at each end: the
 *   straight tie strip from the start of the moulding to the start of the points.
 *   ⭐ Will named this as the measurement that has to be right (2026-07-28), and
 *   it is where the through routes take their rail joints. 1.76″ on a #6, 2.45″
 *   on a #8 — it grows with the frog, as it must.
 * - Both crossing routes are centred on the assembly, so they meet in the middle
 *   at `2θ` — which is exactly the {@link TrackPart.secondaryFrogAngle} Fast
 *   Tracks publish, an independent check that this reading is right.
 */
export function crossoverAssembly(part: TrackPart): {
  /** End to end along the track, both halves. */
  lengthInches: number;
  spacingInches: number;
  /** Along-track distance a crossing route takes to reach the other track. */
  crossingRunInches: number;
  /**
   * Start of the moulding → start of the points, at each end.
   *
   * ⭐ The measurement that has to be right for the drawing to read as track:
   * it is the plain tie strip a crossover begins and ends with, and therefore
   * where the through routes are jointed.
   */
  approachInches: number;
  /** Where the four point-sets sit along the assembly. */
  pointsAtInches: [number, number];
  /**
   * Points → frog along the track, for ONE point-set.
   *
   * ⭐ **THE FROG IS ONE GAUGE OF LATERAL IN FROM THE POINTS**, where the two
   * inner rails actually cross. At slope tan θ that is `gauge / tan θ` along the
   * track — 2.124″ on a #6, i.e. `gauge × N` for a true 1:N frog. This is the
   * number that makes frog-to-frog `(spacing − 2×gauge) / tan θ` rather than the
   * crossing run, and it is the SAME relationship {@link turnoutClosure} already
   * models for a single turnout.
   *
   * ⚠️ It exists because a crossover's turnouts are NOT generic turnouts: a
   * document's `pos` marks a frog (#132), so anything drawing the diverging rail
   * has to start it here and not at a per-frog formula's lead.
   */
  pointsToFrogInches: number;
  /** Where the four FROGS sit along the assembly — what a document's turnout
   * `pos` values must agree with, since `pos` IS the frog. */
  frogsAtInches: [number, number];
  /** The X where the two crossing routes meet — a real diamond in the middle. */
  scissorsAtInches: number;
} | null {
  const overall = part.overallLength?.inches;
  const spacing = part.trackSpacing?.inches;
  const n = part.frogNumber;
  if (!overall || !spacing || !n) return null;
  // ⚠️ NOT × piecesPerAssembly — see the note above. That counts builds.
  const lengthInches = overall;
  // tan θ = 1/N for a frog of number N. Use the part's own measured angle where
  // it has one — Atlas build to sectional angles rather than true frog ratios.
  const tan = part.actualAngle ? Math.tan((part.actualAngle.deg * Math.PI) / 180) : 1 / n;
  if (!(tan > 0)) return null;
  const crossingRunInches = spacing / tan;
  const mid = lengthInches / 2;
  const half = crossingRunInches / 2;
  // One gauge of lateral, taken at the frog angle — see `pointsToFrogInches`.
  const pointsToFrogInches = RAIL_GAUGE_INCHES / tan;
  return {
    lengthInches,
    spacingInches: spacing,
    crossingRunInches,
    approachInches: mid - half,
    pointsAtInches: [mid - half, mid + half],
    pointsToFrogInches,
    // Each frog sits INSIDE its own point-set, so the pair closes toward the
    // scissors — which is why frog-to-frog is shorter than the crossing run.
    frogsAtInches: [mid - half + pointsToFrogInches, mid + half - pointsToFrogInches],
    scissorsAtInches: mid,
  };
}

/** The weakest provenance among some dimensions — a placed part is only as
 * trustworthy as the softest number under it. */
function weakestOf(...ds: (PartDimension | undefined)[]): DimensionSource {
  const rank: DimensionSource[] = ["measured", "manufacturer", "derived", "unverified"];
  let worst = 0;
  for (const d of ds) if (d) worst = Math.max(worst, rank.indexOf(d.source));
  return rank[worst];
}

/**
 * Why a part has no derivable geometry — null when it has.
 *
 * Worth its own function because "we cannot place this yet" is a fact an owner
 * should see in the picker, not a silent absence. It is also the parts-library
 * backlog in machine-readable form: every string this returns is a measurement
 * someone could take.
 */
/**
 * How steeply a crossing's two tracks cross, in degrees — or null when the part
 * doesn't say.
 *
 * ⭐ **THE ANGLE IS A CROSSING'S ENTIRE GEOMETRY.** A turnout needs a lead, a
 * points offset and a frog offset because it has a moving path through it; a
 * diamond is two straight tracks and the angle between them. Everything else
 * about the part — how much tie strip is moulded on — is packaging.
 *
 * Both trade conventions are accepted, because both are how these are sold:
 * Atlas and Peco sell a crossing by its **angle** ("19° crossing"), Fast Tracks
 * build one by **frog number**. A published angle wins; otherwise it comes from
 * the frog number as `atan(1/N)` — {@link turnoutClosure}'s `frogSlope = 1/N`,
 * the same definition the rest of the library uses. Deriving it a second way
 * here would be how the two drift apart.
 */
export function crossingAngleDeg(part: TrackPart): number | null {
  if (part.actualAngle) return part.actualAngle.deg;
  const n = part.frogNumber;
  if (n == null || !(n > 0)) return null;
  return (Math.atan(1 / n) * 180) / Math.PI;
}

export function partGeometryGap(part: TrackPart): string | null {
  if (part.kind === "flex") return null;
  // ⭐ A BUMPER NEEDS NO MEASUREMENT TO BE PLACEABLE. Its job is to say that an
  // end of track is closed deliberately, and that is true of a hand-built tie
  // bumper as much as of a product. Blocking it for want of a dimension would
  // withhold the one piece whose whole meaning is independent of its size.
  if (part.kind === "bumper") return null;
  if (part.kind === "straight")
    return part.overallLength ? null : "no overall length — a sectional straight IS its length";
  if (part.kind === "curve") {
    if (!part.radius) return "no radius — a sectional curve is a radius and an arc";
    if (part.arcDegrees == null) return "no arc — the radius alone does not say how far it turns";
    return null;
  }
  if (part.kind === "crossover") {
    // ⭐ IT IS DERIVABLE AFTER ALL. The published half-length, the fixture's
    // track spacing and its frog angle fix the whole assembly between them —
    // see {@link crossoverAssembly}. What was missing was reading the half as a
    // half, not the geometry.
    if (!part.overallLength) return "no overall length — nothing says how long the assembly is";
    if (!part.trackSpacing)
      return "no track spacing — a crossover is defined by how far apart the two tracks it joins are";
    if (part.frogNumber == null) return "no frog number — the crossing angle is unknown";
    return null;
  }
  if (part.kind === "crossing") {
    if (crossingAngleDeg(part) == null)
      return "no crossing angle — nothing says how steeply the two tracks cross";
    if (!part.overallLength)
      return "no overall length — the part has no ends to put joints on";
    return null;
  }
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
  /**
   * ⭐ THE LEAD IS THE LAST LANDMARK, and it needs the FROG.
   *
   * Points and overall length are enough to say where a part starts and stops —
   * the tie strip and its rail joints draw from those alone. They are NOT enough
   * to place its routes: the diverging one leaves at the points and crosses at
   * the frog, so without a frog reading (or a published lead) there is no
   * geometry to build.
   *
   * ⚠️ This case had never occurred, because every part measured at its points
   * had also been measured at its frog. Will's Fast Tracks #6 (2026-07-31) is the
   * first with one and not the other, and it came out of `partsPlaceable` as
   * "dimensions present but inconsistent" — which is wrong and unactionable.
   * Nothing is inconsistent; one reading is missing, and this says which.
   */
  if (!part.lead && !part.frogOffset)
    return "no frog offset — the points are known but not where the rails cross, so the routes cannot be placed";
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

  if (part.kind === "straight" || part.kind === "curve") {
    // ⭐ THE SAME ARC DEFINITION BENT FLEX USES (`flexRunEnd`), so a sectional
    // curve and a bent run of flex of the same radius land in exactly the same
    // place. Two definitions of an arc in one library would be a bug waiting
    // for someone to lay one against the other.
    const end =
      part.kind === "curve"
        ? flexRunEnd(sectionalArcInches(part), part.radius!.inches)
        : { x: part.overallLength!.inches, y: 0, headingDeg: 0 };
    return {
      joints: [
        { id: "a", role: "throat", x: 0, y: 0, angleDeg: 180 },
        { id: "b", role: "through", x: end.x, y: end.y, angleDeg: end.headingDeg },
      ],
      routes: [["a", "b"]],
      source: (part.kind === "curve" ? part.radius : part.overallLength)?.source ?? "unverified",
      divergingEndMeasured: false,
    };
  }

  if (part.kind === "bumper") {
    // ⭐ ONE JOINT, AND NO ROUTE THROUGH IT — which is the entire point. A
    // bumper is where track STOPS, so the graph closes that end by
    // construction: the joint it takes is no longer open, and the walk that
    // reaches it has nowhere further to go. Nothing has to be flagged.
    return {
      joints: [{ id: "a", role: "throat", x: 0, y: 0, angleDeg: 180 }],
      routes: [],
      source: part.overallLength?.source ?? "unverified",
      divergingEndMeasured: false,
    };
  }

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

  if (part.kind === "crossover") {
    const g = crossoverAssembly(part);
    if (!g) return null;
    return {
      joints: [
        { id: "a1", role: "crossoverEnd", x: 0, y: 0, angleDeg: 180 },
        { id: "b1", role: "crossoverEnd", x: g.lengthInches, y: 0, angleDeg: 0 },
        { id: "a2", role: "crossoverEnd", x: 0, y: g.spacingInches, angleDeg: 180 },
        { id: "b2", role: "crossoverEnd", x: g.lengthInches, y: g.spacingInches, angleDeg: 0 },
      ],
      // ⭐ FOUR ROUTES, and that is the whole point. From either end of either
      // track a train can run straight on or cross to the other — which is what
      // makes this ONE assembly rather than four turnouts that happen to be near
      // each other.
      routes: [
        ["a1", "b1"],
        ["a2", "b2"],
        ["a1", "b2"],
        ["a2", "b1"],
      ],
      source: weakestOf(part.overallLength, part.trackSpacing),
      divergingEndMeasured: false,
    };
  }

  if (part.kind === "crossing") {
    // ⭐⭐ FOUR ENDS, TWO ROUTES, AND THEY DO NOT MEET. A crossover's four ends
    // are joined by four routes because a train can change tracks there; here
    // the two routes share a point on the drawing and nothing else. A diamond
    // is defined by what it does NOT connect, so the routes list is where that
    // fact lives — and the walk gets it for free: arriving on one route, the
    // only way on is the far end of that same route.
    const theta = crossingAngleDeg(part)!;
    const rad = (theta * Math.PI) / 180;
    // Length is measured ALONG A ROUTE, as every length in this library is —
    // never a bounding box. ⚠️ A symmetric moulding is assumed: the tracks
    // cross at the middle and both routes are the same length. Every crossing
    // sold is symmetric; an asymmetric one would need its own dimension rather
    // than a fudge here, and would announce itself by not fitting.
    const L = part.overallLength!.inches;
    const half = L / 2;
    const cx = half;
    const dx = half * Math.cos(rad);
    const dy = half * Math.sin(rad);
    return {
      joints: [
        { id: "a1", role: "crossingEnd", x: 0, y: 0, angleDeg: 180 },
        { id: "a2", role: "crossingEnd", x: L, y: 0, angleDeg: 0 },
        { id: "b1", role: "crossingEnd", x: cx - dx, y: -dy, angleDeg: norm360(180 + theta) },
        { id: "b2", role: "crossingEnd", x: cx + dx, y: dy, angleDeg: norm360(theta) },
      ],
      routes: [
        ["a1", "a2"],
        ["b1", "b2"],
      ],
      // An angle taken off the frog number is DERIVED, however well measured the
      // length is — so a caller can still tell "we know this crossing" from "we
      // worked its angle out from a ratio".
      source: weakestOf(part.overallLength, {
        inches: 0,
        source: part.actualAngle?.source ?? "derived",
      }),
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

/**
 * The SHAPE of every route through a placed piece, in MODULE inches — the
 * polyline a renderer draws.
 *
 * ⭐ The shape belongs to the PART, so it lives here rather than in either app's
 * canvas. A diverging route drawn as a straight chord from throat to diverging
 * end cuts the corner the closure actually turns; every renderer would have to
 * rebuild that curve, and they would drift.
 *
 * ⚠️ Each polyline ENDS EXACTLY ON ITS JOINTS, by construction — the samples in
 * between follow the closure, but the ends are the joint positions themselves.
 * Track that stops short of its own joint would draw a gap at a connection that
 * the graph considers made.
 */
export function pieceRoutePaths(
  piece: TrackPiece,
  library = BUILT_IN_TRACK_PARTS,
): { route: [string, string]; points: { x: number; y: number }[] }[] {
  const part = library.find((p) => p.id === piece.partId);
  if (!part) return [];
  const geo = partGeometry(part, library);
  if (!geo) return [];
  const joints = placedJoints([piece], library);
  const at = (id: string) => joints.find((j) => j.joint === id);

  // Sample the closure between the points and the diverging end, in the part's
  // own frame, then put it through the same transform the joints went through.
  const RAD = Math.PI / 180;
  const c = Math.cos(piece.rotationDeg * RAD);
  const s = Math.sin(piece.rotationDeg * RAD);
  const place = (x: number, y: number) => {
    const ly = piece.flipped ? -y : y;
    return { x: piece.x + x * c - ly * s, y: piece.y + x * s + ly * c };
  };

  const out: { route: [string, string]; points: { x: number; y: number }[] }[] = [];

  // ⚠️ A BUMPER HAS NO ROUTE, so the loop below would draw nothing at all and
  // the piece would be invisible and un-clickable. This polyline is its BODY,
  // not a path through it — the repeated joint id says there is nowhere to go.
  if (part.kind === "bumper") {
    const at = joints[0];
    if (!at) return out;
    const len = part.overallLength?.inches ?? BUMPER_DRAWN_INCHES;
    return [{ route: ["a", "a"], points: [{ x: at.x, y: at.y }, place(len, 0)] }];
  }

  // ⚠️ A SECTIONAL CURVE IS AN ARC AND MUST BE DRAWN AS ONE. Its joints land in
  // the right place either way, so this looks correct until you notice the rail
  // cutting the corner between them — the same mistake as drawing a turnout's
  // diverging route as a chord, arriving by a different door.
  if (part.kind === "curve") {
    const a = joints.find((j) => j.joint === "a");
    const b = joints.find((j) => j.joint === "b");
    if (!a || !b) return out;
    // `place` already mirrors a flipped piece, so the radius stays positive here
    // — negating it too would flip it back.
    const pts = flexRunPoints(sectionalArcInches(part), part.radius!.inches).map((q) =>
      place(q.x, q.y),
    );
    pts[pts.length - 1] = { x: b.x, y: b.y };
    return [{ route: ["a", "b"], points: pts }];
  }

  // ⚠️ A CROSSING ROUTE IS NOT A DIAGONAL FROM END TO END. It runs straight
  // along its own track to the point-set, crosses at the frog angle, and runs
  // straight again — so drawn as a chord the rail would leave the railhead for
  // most of the assembly and the scissors X would land nowhere near the middle.
  // Same mistake as drawing a sectional curve as its chord, arriving by another
  // door (that one shipped, because the JOINTS are right either way).
  if (part.kind === "crossover") {
    const g = crossoverAssembly(part);
    if (g) {
      const [p1, p2] = g.pointsAtInches;
      const S = g.spacingInches;
      const L = g.lengthInches;
      const yOf = (id: string) => (id.endsWith("2") ? S : 0);
      return geo.routes.map((route) => {
        const [from, to] = route;
        const y0 = yOf(from);
        const y1 = yOf(to);
        // Which end each joint is at: "a" west (x=0), "b" east (x=L).
        const x0 = from.startsWith("a") ? 0 : L;
        const x1 = to.startsWith("a") ? 0 : L;
        if (y0 === y1)
          return { route, points: [place(x0, y0), place(x1, y1)] }; // straight through
        // Crossing: straight to the near point-set, over, then straight on.
        const west = Math.min(x0, x1) === 0;
        const [xa, xb] = west ? [p1, p2] : [p2, p1];
        return {
          route,
          points: [place(x0, y0), place(xa, y0), place(xb, y1), place(x1, y1)],
        };
      });
    }
  }

  for (const route of geo.routes) {
    const a = at(route[0]);
    const b = at(route[1]);
    if (!a || !b) continue;
    const ends = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    if (part.kind === "flex") {
      // Bent flex is an arc; straight flex comes back as its two ends.
      const pts = flexRunPoints(piece.lengthInches ?? 0, piece.radiusInches).map((q) =>
        place(q.x, q.y),
      );
      pts[pts.length - 1] = { x: b.x, y: b.y };
      out.push({ route, points: pts });
      continue;
    }
    const diverging = route.some((r) => r === "diverge" || r === "legA" || r === "legB");
    if (!diverging) {
      out.push({ route, points: ends });
      continue;
    }
    const lead = part.lead?.inches ?? 0;
    const pts0 = part.pointsOffset?.inches ?? 0;
    const far = geo.joints.find((j) => j.id === route[1]) ?? geo.joints.find((j) => j.id === route[0]);
    if (!far || !(lead > 0)) {
      out.push({ route, points: ends });
      continue;
    }
    const isWye = part.kind === "wye";
    const closure = turnoutClosure(isWye ? (part.frogNumber as number) * 2 : (part.frogNumber as number), {
      leadInches: lead,
    });
    // The route runs straight to the points, then follows the closure. `legB` is
    // the mirror of `legA` — a wye splits symmetrically, which is the same rule
    // its joints were placed by.
    const mirror = route.includes("legB") ? -1 : 1;
    const pts: { x: number; y: number }[] = [place(0, 0), place(pts0, 0)];
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const x = pts0 + ((far.x - pts0) * i) / steps;
      pts.push(place(x, mirror * closure.offsetAt(x - pts0)));
    }
    // End ON the joint: the sampled curve and the joint are worked out the same
    // way, but only this makes them the same number.
    pts[pts.length - 1] = { x: b.x, y: b.y };
    out.push({ route, points: route[0] === "throat" ? pts : pts.slice().reverse() });
  }
  return out;
}

/**
 * The HAND of a placed piece — the product an owner would actually buy.
 *
 * ⭐ THE MODEL HAS NO HAND, AND THIS IS NOT A CONTRADICTION. Nothing derived
 * from the graph asks which way a turnout is handed: the side a route leaves on
 * is simply where the piece is (ADR 0001). But a turnout on a shelf IS a
 * left-hand or a right-hand product, with its own part number, and an owner
 * picking one out of a palette is choosing between two things they could own.
 * So the hand belongs at the point of PURCHASE and PLACEMENT, and nowhere after.
 *
 * ⚠️ UNFLIPPED IS THE LEFT-HAND PART. A part's own frame diverges toward +y, and
 * +y is to the left of the through route looking from the throat — which agrees
 * with the library: the Atlas #7's `partNumbers.left` (2052) is the one whose
 * published geometry these dimensions were read from.
 *
 * Null for a part with no hand to have — a wye splits symmetrically, which is
 * exactly why it is sold as one product.
 */
export function pieceHand(part: TrackPart, flipped?: boolean | null): "left" | "right" | null {
  const n = part.partNumbers;
  if (!n?.left || !n?.right) return null;
  return flipped ? "right" : "left";
}

/** The part number a placed piece corresponds to — what to order. */
export function piecePartNumber(part: TrackPart, flipped?: boolean | null): string | undefined {
  const hand = pieceHand(part, flipped);
  if (!hand) return part.partNumbers?.single;
  return part.partNumbers?.[hand];
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
  /** FLEX ONLY: how long this run is. The one piece a builder cuts (ADR 0001).
   * ⚠️ ARC length when the run is bent — the rail, not the chord across it. */
  lengthInches?: number;
  /**
   * FLEX ONLY: the radius this run is bent to, inches. Absent = straight.
   *
   * ⭐ It lives on the PIECE, not the part, because bending flex is what a
   * builder does to it — the product is the same product either way. That is
   * the same reason `lengthInches` is here.
   *
   * ⭐ SIGNED, and the sign IS the side: positive curves toward +y in the
   * piece's own frame, negative the other way. One number, no separate
   * "direction" field to disagree with it — the same reasoning that keeps a
   * hand off turnouts, where the side is simply where the piece is.
   *
   * ⚠️ {@link lengthInches} stays the ARC length. `pos` is arc length
   * everywhere in this model, a curve's rail is genuinely longer than the chord
   * it spans (a 90° corner at R30 runs 47.1″ across a 42.4″ chord), and it is
   * the rail a train travels.
   */
  radiusInches?: number;
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

/**
 * How long a bumper draws when it is not a named product.
 *
 * ⚠️ A DRAWING DEFAULT, NOT A MEASUREMENT, and deliberately not recorded as one
 * on any part. What a bumper is FOR — saying this end of the track is closed on
 * purpose — does not depend on its length, and plenty are a tie and a bit of
 * scrap. A named product supplies its own `overallLength` and this stops
 * applying.
 */
/** Every kind of part the library can hold. Beside the type it mirrors, so a
 * new kind is one edit and not two. */
export const TRACK_PART_KINDS: TrackPart["kind"][] = [
  "turnout",
  "wye",
  "curved-turnout",
  "crossover",
  "crossing",
  "flex",
  "straight",
  "curve",
  "bumper",
];

export const BUMPER_DRAWN_INCHES = 0.75;

/**
 * How long a sectional curve's RAIL is — the arc, not the chord across it.
 *
 * ⚠️ Curves are sold as a radius and an arc, never as a length, and the chord is
 * always shorter. Recording one as the piece's length would put everything past
 * that curve closer to endplate A than it is — the same mistake the walk exists
 * to avoid, arriving through the parts library instead.
 */
export function sectionalArcInches(part: TrackPart): number {
  if (part.kind !== "curve" || !part.radius || part.arcDegrees == null) return 0;
  return (part.radius.inches * Math.abs(part.arcDegrees) * Math.PI) / 180;
}

/**
 * Where a bent run's far end lands, and which way it points — in the piece's own
 * frame, starting at its origin heading +x.
 *
 * ONE definition, called by both {@link placedJoints} and
 * {@link pieceRoutePaths}, so the drawn rail cannot arrive anywhere other than
 * the joint at the end of it.
 */
export function flexRunEnd(
  lengthInches: number,
  radiusInches?: number,
): { x: number; y: number; headingDeg: number } {
  const L = lengthInches;
  const R = radiusInches;
  if (!R || !Number.isFinite(R) || Math.abs(R) < 1e-6)
    return { x: L, y: 0, headingDeg: 0 };
  // Sweep follows from the two of them: a length of rail bent to a radius has
  // no freedom left. Positive R turns toward +y.
  const theta = L / R;
  return {
    x: Math.abs(R) * Math.sin(Math.abs(theta)) * Math.sign(L || 1),
    y: R * (1 - Math.cos(theta)),
    headingDeg: (theta * 180) / Math.PI,
  };
}

/** Points along a bent run, in the piece's own frame. */
function flexRunPoints(lengthInches: number, radiusInches: number | undefined, steps = 16) {
  if (!radiusInches || !Number.isFinite(radiusInches) || Math.abs(radiusInches) < 1e-6)
    return [{ x: 0, y: 0 }, { x: lengthInches, y: 0 }];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) out.push(flexRunEnd((lengthInches * i) / steps, radiusInches));
  return out.map((p) => ({ x: p.x, y: p.y }));
}

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
    // Flex is the ONE piece whose geometry the builder sets: its far end is
    // wherever they cut it, and — bent — wherever the curve puts it. Everything
    // else is rigid.
    const run =
      part.kind === "flex" ? flexRunEnd(p.lengthInches ?? 0, p.radiusInches) : null;
    for (const j of geo.joints) {
      const far = run && j.id === "b";
      const lx = far ? run.x : j.x;
      const ly = p.flipped ? -(far ? run.y : j.y) : far ? run.y : j.y;
      // ⚠️ A bent run's far end POINTS somewhere else. Leaving the angle at 0
      // would make a curve's end claim to face along +x, so the next piece
      // snapped to it would come in across the rail instead of along it.
      const local = far ? run.headingDeg : j.angleDeg;
      const h = (p.flipped ? -local : local) + p.rotationDeg;
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

/** A piece as the route crosses it — what an anchored feature resolves against. */
export interface RouteSpan {
  piece: string;
  /** The joints the route entered and left this piece by. Tell you which way
   * round the piece's own measurements run against the route's. */
  entryJoint: string;
  exitJoint: string;
  /** Inches from endplate A at the entry joint, and at the one it left by. */
  fromPos: number;
  toPos: number;
}

/** A piece moved into place against an open joint. */
export interface PieceSnap {
  /** The piece, rotated and translated so the two joints coincide. */
  piece: TrackPiece;
  /** The moving joint's key, and the open joint it was brought onto. */
  from: string;
  to: string;
}

/**
 * Bring a piece being dragged onto the nearest OPEN joint of the others.
 *
 * ⛔ **ONLY OPEN JOINTS ARE CANDIDATES, and that is the ADR's standing rule
 * enforced where it can still be obeyed.** A joint already holding a connection
 * is not offered, so an owner cannot stack a third rail end on a joint at all —
 * rather than stacking it and having {@link buildTrackGraph} refuse all three
 * afterwards, with a piece silently outside the layout until they notice.
 *
 * The piece is ROTATED as well as moved: two ends meet when they are in the same
 * place and facing opposite ways, so the rotation falls out of the joint it is
 * brought to. That is what makes laying a curve out of straight pieces possible
 * without typing an angle.
 *
 * `withinInches` is a GRAB radius — how near counts as "meant it" — and is a
 * different thing from {@link JOINT_SNAP_INCHES}, which is how close two joints
 * must be to BE connected. This one is generous; that one is a hundredth of an
 * inch.
 */
export function snapPiece(
  moving: TrackPiece,
  others: TrackPiece[],
  library = BUILT_IN_TRACK_PARTS,
  withinInches = 0.5,
): PieceSnap | null {
  const mine = placedJoints([moving], library);
  if (!mine.length) return null;
  const graph = buildTrackGraph(others, library);
  const taken = new Set(graph.connections.flatMap((c) => [c.a, c.b]));
  const open = graph.joints.filter((j) => !taken.has(j.key));

  let best: { m: PlacedJoint; t: PlacedJoint; d: number } | null = null;
  for (const m of mine)
    for (const t of open) {
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d <= withinInches && (!best || d < best.d)) best = { m, t, d };
    }
  if (!best) return null;

  // Turn the piece about the joint that is being brought in — so that joint
  // stays where the owner's pointer left it — then slide it onto the target.
  const RAD = Math.PI / 180;
  const dRot = norm360(best.t.headingDeg + 180 - best.m.headingDeg);
  const c = Math.cos(dRot * RAD);
  const s = Math.sin(dRot * RAD);
  const ox = moving.x - best.m.x;
  const oy = moving.y - best.m.y;
  return {
    piece: {
      ...moving,
      rotationDeg: norm360(moving.rotationDeg + dRot),
      x: best.t.x + ox * c - oy * s,
      y: best.t.y + ox * s + oy * c,
    },
    from: best.m.key,
    to: best.t.key,
  };
}

/**
 * Cut a run of flex to fit BETWEEN two joints — the piece's near end already
 * where it belongs, its far end brought onto another open joint.
 *
 * ⭐ WITHOUT THIS A CROSSOVER CANNOT BE BUILT BY HAND. A piece snaps by ONE end,
 * and a flex run's length handle drags along its own axis, so the far end can
 * never be steered onto the turnout opposite: an owner would have to type an
 * angle and a length to a hundredth of an inch. Cutting a piece to fit between
 * two fixed points is exactly what a builder does with flex, and it is the last
 * thing standing between "two mains" and "two mains joined".
 *
 * ⚠️ STRAIGHT RUNS ONLY. A bend is already fixed by its radius; asking an arc to
 * meet a second point as well over-constrains it, and quietly re-bending an
 * owner's curve to reach something is not a fit, it is a guess.
 */
export function fitFlexBetween(
  piece: TrackPiece,
  others: TrackPiece[],
  library = BUILT_IN_TRACK_PARTS,
  withinInches = 0.5,
): TrackPiece | null {
  const part = library.find((p) => p.id === piece.partId);
  if (part?.kind !== "flex" || piece.radiusInches) return null;
  const mine = placedJoints([piece], library);
  const far = mine.find((j) => j.joint === "b");
  const near = mine.find((j) => j.joint === "a");
  if (!far || !near) return null;
  const graph = buildTrackGraph(others, library);
  const taken = new Set(graph.connections.flatMap((c) => [c.a, c.b]));
  let best: { j: PlacedJoint; d: number } | null = null;
  for (const j of graph.joints) {
    if (taken.has(j.key)) continue; // an occupied joint is not on offer
    // ⚠️ NOR THE ONE THIS PIECE ALREADY STARTS ON. A short connector's far end
    // is often nearer its own near-end joint than the joint opposite — a
    // crossover's diverging ends are a tenth of an inch apart — so the nearest
    // open joint is the piece's own, and fitting to it asks for a run of zero
    // length. That is what "the crossover cannot be built" looked like.
    if (Math.hypot(j.x - near.x, j.y - near.y) <= JOINT_SNAP_INCHES) continue;
    const d = Math.hypot(j.x - far.x, j.y - far.y);
    if (d <= withinInches && (!best || d < best.d)) best = { j, d };
  }
  if (!best) return null;
  const dx = best.j.x - piece.x;
  const dy = best.j.y - piece.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return null;
  return {
    ...piece,
    rotationDeg: norm360((Math.atan2(dy, dx) * 180) / Math.PI),
    lengthInches: Math.round(len * 1000) / 1000,
  };
}

/** A run cut in two to let a piece in. */
export interface RunInsertion {
  /** The whole set: the host shortened, the new piece, and the remainder. */
  pieces: TrackPiece[];
  /** The run that was cut, and the piece that went into it. */
  hostId: string;
  insertedId: string;
}

/**
 * Drop a piece ONTO a run and cut the run to take it.
 *
 * ⭐ Will, 2026-07-27: *"When I drop a turnout on the track, it should cut the
 * track there and automatically snap to the new joints."* Snapping alone cannot
 * do this: the middle of a run has no open joint, so there is nothing to snap
 * TO — the joints have to be made by cutting, which is exactly what a builder
 * does with a razor saw.
 *
 * ⚠️ ONLY FLEX CAN BE CUT. A turnout or a sectional piece is a moulding: you
 * cannot saw one in half and have two of anything. Dropping onto one is refused
 * rather than fudged.
 *
 * ⚠️ AND THE PIECE HAS TO FIT. It consumes length along the run — a #7 is six
 * inches of it — so an insertion that would run off the end is refused instead
 * of silently producing a remainder of negative length.
 */
export function insertIntoRun(
  pieces: TrackPiece[],
  fresh: TrackPiece,
  at: { x: number; y: number },
  library = BUILT_IN_TRACK_PARTS,
  withinInches = 1,
): RunInsertion | null {
  // The nearest run, measured against the rail rather than the piece's origin.
  let host: TrackPiece | null = null;
  let bestD = Infinity;
  for (const piece of pieces) {
    const part = library.find((x) => x.id === piece.partId);
    if (part?.kind !== "flex") continue;
    for (const { points } of pieceRoutePaths(piece, library))
      for (let i = 1; i < points.length; i++) {
        const d = distanceToSegment(at, points[i - 1], points[i]);
        if (d < bestD) {
          bestD = d;
          host = piece;
        }
      }
  }
  if (!host || bestD > withinInches) return null;

  const L = host.lengthInches ?? 0;
  const R = host.radiusInches;
  // How far along the host the drop lands, by walking its own arc.
  const steps = 200;
  let s = 0;
  let closest = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = (L * i) / steps;
    const local = flexRunEnd(t, R);
    const world = placeLocal(host, local.x, local.y);
    const d = Math.hypot(world.x - at.x, world.y - at.y);
    if (d < closest) {
      closest = d;
      s = t;
    }
  }

  // Sit the new piece on the run, pointing the way the run points there.
  const cutLocal = flexRunEnd(s, R);
  const cut = placeLocal(host, cutLocal.x, cutLocal.y);
  const heading = norm360(host.rotationDeg + (host.flipped ? -cutLocal.headingDeg : cutLocal.headingDeg));
  const placed: TrackPiece = { ...fresh, x: cut.x, y: cut.y, rotationDeg: heading };

  // What it consumes along the run: entry joint to the one the run leaves by.
  const js = placedJoints([placed], library);
  const entry = js.find((j) => j.joint === "throat" || j.joint === "a");
  const exit = js.find((j) => j.joint === "through" || j.joint === "b");
  if (!entry || !exit) return null;
  const body = Math.hypot(exit.x - entry.x, exit.y - entry.y);
  const rest = L - s - body;
  if (s < 0 || rest < 0) return null;

  const ids = new Set(pieces.map((p) => p.id));
  let n = 1;
  while (ids.has(`${host.id}b${n}`)) n += 1;
  const tail: TrackPiece = {
    ...host,
    id: `${host.id}b${n}`,
    x: exit.x,
    y: exit.y,
    rotationDeg: exit.headingDeg,
    lengthInches: rest,
  };

  const out = pieces.map((p) => (p.id === host!.id ? { ...p, lengthInches: s } : p));
  // A cut at the very start or end leaves a stub of nothing — drop it rather
  // than leaving a zero-length run for the graph to puzzle over.
  const kept = out.filter((p) => p.id !== host!.id || s > 0);
  return {
    pieces: [...kept, placed, ...(rest > 0 ? [tail] : [])],
    hostId: host.id,
    insertedId: placed.id,
  };
}

/** A point in a piece's own frame, put on the board. */
function placeLocal(piece: TrackPiece, x: number, y: number): { x: number; y: number } {
  const rad = (piece.rotationDeg * Math.PI) / 180;
  const ly = piece.flipped ? -y : y;
  return {
    x: piece.x + x * Math.cos(rad) - ly * Math.sin(rad),
    y: piece.y + x * Math.sin(rad) + ly * Math.cos(rad),
  };
}

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
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
  /** The piece that CLOSES this route — a bumper. Set = the track ends here on
   * purpose; null = it simply stops, which may just mean unfinished. */
  closedBy: string | null;
  pieces: string[];
  /** The same pieces, each with where it starts and ends along the route. */
  spans: RouteSpan[];
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
  /** Turnouts whose diverging route reaches nothing — the ids, not just the
   * sentence, so a caller can act on it (and say it ONCE) instead of matching
   * on prose. */
  danglingDiverges: string[];
  /** Pieces this walk never got to. ⚠️ "Unreached BY THIS WALK" is not the same
   * as "unreachable": a double-track module's second main is unreached by the
   * first walk and perfectly well connected. Ids, so a caller running more than
   * one walk can tell the difference. */
  unreached: string[];
}

/** The one wording for a turnout whose diverging route reaches nothing, so a
 * caller can recognise it exactly rather than by substring. */
const danglingDivergeWarning = (id: string) =>
  `the route diverging at ${id} is not connected to anything`;

/** Likewise for a piece the walk never got to. */
const unreachedWarning = (id: string) =>
  `${id} is not reachable from the endplate — nothing connects it`;

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
  /**
   * How far it is THROUGH a piece, from one of its joints to another.
   *
   * ⚠️⚠️ NOT THE DISTANCE BETWEEN THE TWO JOINTS. On a bent run those differ by
   * inches — a 90° corner at R30 is 47.1″ of rail across a 42.4″ chord — and
   * `pos` is arc length along the rail, because that is what a train travels
   * and what every position in the document means. A flex run's arc length is
   * the length it was cut to, which is exactly `lengthInches`.
   */
  const gap = (a?: PlacedJoint, b?: PlacedJoint) => {
    if (!a || !b) return 0;
    if (a.piece === b.piece) {
      const piece = pieceById.get(a.piece);
      const part = piece ? partOf(a.piece) : undefined;
      if (piece && part?.kind === "flex") return piece.lengthInches ?? 0;
      // ⚠️ AND A SECTIONAL CURVE BY ITS ARC. Missing this measured one 19″ 30°
      // section as its 9.83″ chord instead of 9.95″ of rail — an eighth of an
      // inch per section, compounding all the way along a curved module. The
      // invariant is not "flex is special"; it is that a curve's rail is longer
      // than the straight line across it, whoever made the curve.
      if (part?.kind === "curve") return sectionalArcInches(part);
    }
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const routes: GraphRoute[] = [];
  const turnouts: GraphTurnout[] = [];
  const warnings: string[] = [];
  const danglingDiverges: string[] = [];
  const queued = new Set<string>();
  const pending: { from: string; at: number; joint: string; skew: number }[] = [];

  const walk = (
    startKey: string,
    startPos: number,
    id: string,
    bornAt: string | null,
  ): GraphRoute => {
    const route: GraphRoute = {
      id, fromPos: startPos, toPos: startPos, bornAt, endsAt: null, closedBy: null,
      pieces: [], spans: [], lateral: 0,
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
      if (!opts.length) {
        // ⭐ NOWHERE TO GO — a bumper. The route ends here DELIBERATELY, which
        // is a different thing from running out of track, and the difference is
        // the whole reason bumpers exist in the model.
        //
        // ⚠️ It must be recorded as REACHED. Breaking out without it left the
        // bumper looking like stray track that nothing connects, which is the
        // opposite of what it says.
        route.pieces.push(here.piece);
        route.closedBy = here.piece;
        break;
      }
      // ⭐ THROUGH A CROSSOVER, STAY ON THE TRACK YOU ARE ON. Its four routes
      // are two straights and two crossings, and none of them is called
      // "through" — so the old rule fell through to `opts[0]` and a main could
      // walk out on the other main. The straight route is the one whose far end
      // is on the same track, which the joint ids say: a1/b1 are one track,
      // a2/b2 the other. A crossing is a route a train CHOOSES, exactly like a
      // turnout's diverging leg, so it is left for the branch pass.
      const sameTrack = (r: [string, string]) => {
        const other = r[0] === here.joint ? r[1] : r[0];
        return other.slice(-1) === here.joint.slice(-1);
      };
      const pick =
        (partOf(here.piece)?.kind === "crossover" ? opts.find(sameTrack) : undefined) ??
        opts.find((r) => r.includes("through")) ??
        opts[0];
      const exitJoint = pick[0] === here.joint ? pick[1] : pick[0];
      const exit = byKey.get(`${here.piece}.${exitJoint}`);
      const part = partOf(here.piece);

      if (part && (part.kind === "turnout" || part.kind === "wye")) {
        const throat = byKey.get(`${here.piece}.throat`);
        const through =
          byKey.get(`${here.piece}.through`) ?? byKey.get(`${here.piece}.legA`);
        const body = gap(throat, through);
        const lead = part.lead?.inches ?? body / 2;
        // ⚠️⚠️ THE FROG SITS AT `frogOffset` FROM THE TIE END, NOT AT `lead`.
        // `lead` is measured POINTS → frog (see {@link TrackPart.lead}, and the
        // measured table on {@link ATLAS_CODE55_N}: the #7's ⅝″ points and
        // 4⁷⁄₃₂″ frog give exactly its 3.59375″ lead). Adding it to the THROAT
        // landed 0.625″ short of the frog on a #7 — on no landmark at all.
        const frogAxial = part.frogOffset?.inches ?? (part.pointsOffset?.inches ?? 0) + lead;
        // ⚠️ ENTERED FROM EITHER END. A turnout facing the other way is entered
        // at its `through` joint, so the frog is `body − frogAxial` along.
        // The frog, in the piece's own frame — where the diverging rail has
        // climbed one gauge and the two routes truly cross.
        const dvj = byKey.get(`${here.piece}.diverge`) ?? byKey.get(`${here.piece}.legB`);
        const frogPt =
          throat && body > 0 && dvj
            ? {
                x: throat.x + ((dvj.x - throat.x) * frogAxial) / body,
                y: throat.y + ((dvj.y - throat.y) * frogAxial) / body,
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
            ? frogAxial
            : here.joint === "diverge" || here.joint === "legB"
              ? frogPt && dvj
                ? Math.hypot(dvj.x - frogPt.x, dvj.y - frogPt.y)
                : Math.max(0, body - frogAxial)
              : Math.max(0, body - frogAxial);
        const frogPos = pos + toFrog;
        if (here.joint === "diverge" || here.joint === "legB") {
          // Arrived by a diverging end: this route has run into the far turnout
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
                  x: throat.x + ((d.x - throat.x) * frogAxial) / body,
                  y: throat.y + ((d.y - throat.y) * frogAxial) / body,
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
      const entered = pos;
      pos += gap(here, exit);
      route.spans.push({
        piece: here.piece, entryJoint: here.joint, exitJoint, fromPos: entered, toPos: pos,
      });
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
      warnings.push(danglingDivergeWarning(b.from));
      danglingDiverges.push(b.from);
      continue;
    }
    // ⚠️ A SIDING IS FOUND TWICE — once from each of its turnouts. Both queue a
    // diverging branch, and the second walks the same rail back the other way.
    // Walking it again would put the same track in the layout twice, on two
    // lanes, with the far turnout diverging onto the copy. A piece belongs to
    // exactly ONE route, so if this branch starts on a piece a route already
    // holds, the answer is that route: the far turnout diverges onto the siding
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
  const unreached: string[] = [];
  for (const p of pieces)
    if (!reached.has(p.id) && !graph.unplaceable.some((u) => u.piece === p.id)) {
      warnings.push(unreachedWarning(p.id));
      unreached.push(p.id);
    }
  for (const c of graph.conflicts) warnings.push(c.reason);

  return { routes, turnouts, warnings, danglingDiverges, unreached };
}

// ─── GRAPH → DOCUMENT (ADR 0001) ─────────────────────────────────────────────
// The claim the whole decision rests on: the 1-D document becomes a DERIVED
// artifact, so `moduleFeatures`, the dispatcher view and Free-Dispatcher are
// unaffected. This is where that claim is demonstrated IN THE PACKAGE — the
// graph emits an ordinary `ModuleSchematicDoc` and the same pure function reads
// it. Nothing downstream is told which way a module was authored.

/** Where an anchored feature turned out to be. */
export interface ResolvedAnchor {
  /** Inches from endplate A — the number the document and the dispatcher read. */
  pos: number;
  /** The route the anchored piece is part of. */
  routeId: string;
  /** The piece's own measuring direction runs BACKWARD along the route, so
   * increasing {@link GraphAnchor.atInches} moves toward endplate A. */
  reversed: boolean;
}

/**
 * Turn a {@link GraphAnchor} into a position along the module.
 *
 * The piece is measured from its own origin end, and the walk knows both ends
 * of it, so whichever end the route arrived by, the sum comes out the same.
 * Returns null when the anchored piece is not on any route — a spur nobody has
 * connected yet — which is a thing to report, not to guess at.
 */
export function resolveGraphAnchor(
  anchor: GraphAnchor,
  walk: GraphWalk,
  pieces: TrackPiece[],
  library = BUILT_IN_TRACK_PARTS,
): ResolvedAnchor | null {
  const piece = pieces.find((p) => p.id === anchor.piece);
  const part = piece ? library.find((x) => x.id === piece.partId) : undefined;
  // Every part's own frame starts at x=0 at one joint: `a` on flex, the throat
  // on everything with points.
  const origin = part?.kind === "flex" ? "a" : "throat";
  for (const r of walk.routes) {
    const span = r.spans.find((s) => s.piece === anchor.piece);
    if (!span) continue;
    if (span.entryJoint === origin)
      return { pos: span.fromPos + anchor.atInches, routeId: r.id, reversed: false };
    if (span.exitJoint === origin)
      return { pos: span.toPos - anchor.atInches, routeId: r.id, reversed: true };
    // A wye crossed leg-to-leg never touches its throat, so there is no
    // measuring from it. Better to say so than to pick an end.
    return null;
  }
  return null;
}

/** What the graph cannot know, and therefore never invents. */
export interface GraphDocInput {
  /** Where the main begins: the joint endplate A's track arrives at. */
  startAt: { piece: string; joint: string };
  /** Where MAIN 2 begins, on a double-track module. Absent = single track. */
  start2?: { piece: string; joint: string } | null;
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
  // ⚠️ ONE PROBLEM, ONE SENTENCE. The walk reports a diverging route that
  // reaches nothing, and the emission has its own thing to say about the same
  // turnout — printed together they read as two faults. Drop the walk's wording
  // in favour of the one below, which names the consequence as well as the fact.
  const dangling = new Set(walk.danglingDiverges.map(danglingDivergeWarning));
  const warnings = walk.warnings.filter((w) => !dangling.has(w));
  const round = (n: number) => Math.round(n * 100) / 100;

  const base = input.base ?? {};
  const endplates: SchematicEndplate[] =
    base.endplates && base.endplates.length
      ? base.endplates
      : [{ id: "A", label: "West" }, { id: "B", label: "East" }];
  const epA = endplates[0];
  const epB = endplates[1];

  const main = walk.routes.find((r) => r.id === "main")!;

  /**
   * MAIN 2 is its own walk, from its own end of the endplate.
   *
   * ⚠️ It is a SEPARATE RUN, not a branch: the two mains of a double-track
   * module never touch along their length. So it is walked independently and its
   * routes are kept apart by a prefix, because both walks name their own route
   * "main".
   */
  const start2Key = input.start2 ? `${input.start2.piece}.${input.start2.joint}` : null;
  /**
   * ⭐⭐ **MAIN 2 DOES NOT ALWAYS ENTER AT THE ENDPLATE.** On a single-to-double
   * transition module it BEGINS AT A TURNOUT, so it is reached as a branch of
   * Main 1 rather than by a walk of its own — and `start2` points at the
   * turnout's diverging end, which is connected rather than open.
   *
   * That is the discriminator: an OPEN `start2` is a second main crossing the
   * endplate and gets its own walk; a CONNECTED one is a main that begins
   * partway along, already found by the first walk. Walking it a second time
   * would put one run in the document twice, which is what the `claimed` check
   * below exists to catch.
   */
  const start2IsOpenEnd = !!start2Key && graph.open.includes(start2Key);
  const walk2 =
    input.start2 && start2IsOpenEnd
      ? walkTrackGraph(graph, pieces, input.start2, library)
      : null;
  /** The branch of Main 1 that IS Main 2, on a transition module. */
  const main2FromBranch = (() => {
    if (!start2Key || start2IsOpenEnd) return null;
    const conn = graph.connections.find((c) => c.a === start2Key || c.b === start2Key);
    if (!conn) return null;
    const otherKey = conn.a === start2Key ? conn.b : conn.a;
    const piece = graph.joints.find((j) => j.key === otherKey)?.piece;
    return walk.routes.find((r) => r.id !== "main" && r.pieces[0] === piece) ?? null;
  })();
  const main2 = walk2?.routes.find((r) => r.id === "main") ?? main2FromBranch;
  /**
   * ⚠️⚠️ **A CROSSOVER IS THE ONE PIECE TWO ROUTES MAY BOTH HOLD.** Everywhere
   * else "this piece is already in a route" means the two starts landed on the
   * same run and emitting it twice would put one piece of track in the document
   * as two. A double crossover is the exception BY CONSTRUCTION: both mains run
   * straight through the same assembly, which is what it is for. Counting it as
   * a collision made an ordinary double-track module with a crossover report its
   * two mains as one run and emit neither.
   */
  const sharedByDesign = (id: string) => {
    const piece = pieces.find((p) => p.id === id);
    return library.find((p) => p.id === piece?.partId)?.kind === "crossover";
  };
  /**
   * ⚠️⚠️ **"MAIN 1 ALREADY RUNS ALONG THIS" IS TWO DIFFERENT SITUATIONS.**
   *
   * The real fault is both starts landing on the SAME RUN — one piece of track
   * emitted twice, on two lanes. That is Main 1's OWN route overlapping Main 2's.
   *
   * A walk-1 BRANCH overlapping Main 2 is not that at all. On a double-to-single
   * transition Main 2 runs from the endplate to a turnout, so walk 1 reaches it
   * through that turnout's diverging leg while walk 2 reaches it from the
   * endplate — both correctly, and it is one run either way. Treated as a
   * collision it dropped Main 2 and re-emitted it as a spur named after its
   * closing curve. The branch is the same track, so it is folded into Main 2 and
   * the turnout that opens it points there.
   */
  const mainPieces = new Set(main.pieces.filter((p) => !sharedByDesign(p)));
  if (!main2FromBranch && main2 && main2.pieces.some((p) => mainPieces.has(p))) {
    warnings.push(
      "Main 2 starts on track that Main 1 already runs along — they are one run, not two",
    );
  }
  const twoMains =
    !!main2 && (!!main2FromBranch || !main2.pieces.some((p) => mainPieces.has(p)));
  /** The walk-1 branch that IS Main 2 — a transition module's second main. */
  const main2AsBranch =
    walk2 && main2 && twoMains
      ? walk.routes.find(
          (r) => r.id !== "main" && r.pieces.some((p) => main2.pieces.includes(p)),
        ) ?? null
      : null;

  // ⭐ WHICH SIDE MAIN 2 IS ON IS READ, NOT AUTHORED. The 1-D model needs a
  // `mainsSwapped` flag to say Main 2 draws below; here it is simply where the
  // track is. Module-local +y is above, and endplate A's track point is the
  // origin, so the sign of its first joint's offset is the answer.
  const main2Lane = twoMains
    ? // A branch-born main reaches its lane after an easement, so its SIDE is
      // how far the run gets laterally, not where its first joint sits.
      (main2FromBranch
        ? main2FromBranch.lateral
        : (graph.joints.find((j) => j.key === start2Key!)?.y ?? 1)) >= 0
      ? 1
      : -1
    : 0;

  const lengthInches = round(Math.max(main.toPos, twoMains ? main2!.toPos : 0));

  // A branch takes the id of the piece it STARTS at — the run's own first piece.
  // It is the piece an owner selects, so it is the thing their name belongs to.
  // ⚠️ Not stable against inserting a piece at the throat: that changes the id.
  // Persisting the graph will need a run identity of its own; nothing yet reads
  // these ids back.
  const branches = [
    ...walk.routes.filter(
      (r) =>
        r.id !== "main" &&
        r.pieces.length &&
        r.id !== main2FromBranch?.id &&
        r.id !== main2AsBranch?.id,
    ),
    ...(walk2
      ? walk2.routes
          .filter((r) => r.id !== "main" && r.pieces.length)
          .map((r) => ({ ...r, id: `main2:${r.id}`, bornAt: r.bornAt }))
      : []),
  ];
  const trackIdOf = new Map<string, string>([["main", MAIN_TRACK_ID]]);
  if (twoMains) {
    trackIdOf.set(main2FromBranch ? main2FromBranch.id : "main2:main", MAIN2_TRACK_ID);
    // So the turnout that opens it says `divergeTrack: "main2"` rather than the
    // id of whatever piece the branch happened to start at.
    if (main2AsBranch) trackIdOf.set(main2AsBranch.id, MAIN2_TRACK_ID);
  }
  for (const r of branches) trackIdOf.set(r.id, r.pieces[0]);
  // ⚠️ A CROSSOVER IS FOUND BY BOTH WALKS — once from each main, exactly as a
  // siding is found from each of its turnouts, but now across two walks. The
  // two finds name the same first piece, so they resolve to the same track id
  // and the second is dropped rather than emitted as a phantom second
  // connector. Both turnouts still point at the one that remains.
  const emitted = new Set<string>();
  const uniqueBranches = branches.filter((r) => {
    const id = trackIdOf.get(r.id)!;
    if (emitted.has(id)) return false;
    emitted.add(id);
    return true;
  });

  // LANE is an ordinal: which side, and how many tracks out. The side is the
  // sign of how far the run reaches laterally; the magnitude is its rank among
  // the runs on that side, so a spur off a spur stacks OUTSIDE its parent.
  //
  // ⚠️ MAIN 2 ALREADY OCCUPIES A LANE on its own side, so branches there start
  // at 2. Ranking branches alone put the first siding above the main on lane 1
  // — the same lane as Main 2 — and the two drew on top of each other.
  const laneOf = (r: GraphRoute, among: GraphRoute[]): number => {
    const side = Math.sign(r.lateral) || 1;
    const sameSide = among
      .filter((x) => (Math.sign(x.lateral) || 1) === side)
      .sort((a, b) => Math.abs(a.lateral) - Math.abs(b.lateral));
    const taken = side === main2Lane ? 1 : 0;
    return side * (sameSide.indexOf(r) + 1 + taken);
  };

  const tracks: SchematicTrack[] = [
    {
      id: MAIN_TRACK_ID,
      role: "main",
      lane: 0,
      from: epA?.id ?? "A",
      ...(epB ? { to: epB.id } : {}),
      // A main can be closed too — that is a pocket module, where the track
      // runs in and stops rather than crossing to a second endplate.
      ...(main.closedBy ? { bumperAt: "to" as const } : {}),
    },
    ...(twoMains
      ? [
          {
            id: MAIN2_TRACK_ID,
            role: "main" as const,
            lane: main2Lane,
            // ⚠️ Only a main that CROSSES the endplates says so. A transition
            // module's second main begins at a turnout partway along and ends
            // at one endplate or neither; claiming A→B would tell the catalogue
            // it presents two tracks at an end where it presents one.
            ...(main2FromBranch ? {} : { from: epA?.id ?? "A", ...(epB ? { to: epB.id } : {}) }),
            // ⚠️ Its own extent, because a second main need not run the whole
            // module: on a transition module it starts or stops partway.
            fromPos: round(Math.min(main2!.fromPos, main2!.toPos)),
            toPos: round(Math.max(main2!.fromPos, main2!.toPos)),
          },
        ]
      : []),
  ];
  for (const r of uniqueBranches) {
    const id = trackIdOf.get(r.id)!;
    const meta = input.meta?.[id] ?? {};
    tracks.push({
      id,
      // It runs back into a second turnout, or it doesn't. That is the whole
      // difference between a siding and a spur, and it is read, not declared.
      role: r.endsAt ? "siding" : "spur",
      lane: laneOf(r, uniqueBranches),
      fromPos: round(Math.min(r.fromPos, r.toPos)),
      toPos: round(Math.max(r.fromPos, r.toPos)),
      // ⚠️ ALWAYS THE `to` END, and not because of an assumption: a branch's
      // positions are ARC LENGTH FROM ITS THROAT, so they only ever grow — a
      // spur running physically back toward endplate A still ends at the larger
      // number. The closed end is the far one from the turnout, by definition.
      ...(r.closedBy ? { bumperAt: "to" as const } : {}),
      ...(meta.trackName ? { trackName: meta.trackName } : {}),
      ...(meta.capacityFeet != null ? { capacityFeet: meta.capacityFeet } : {}),
      ...(meta.moduleTrackId != null ? { moduleTrackId: meta.moduleTrackId } : {}),
    });
  }

  if (walk2) {
    // ⚠️ EACH WALK CALLS THE OTHER MAIN UNREACHABLE, and neither is right. A
    // walk only knows what IT got to; with two starts, a piece reached by
    // either one is connected. Told as it stood, a perfectly ordinary
    // double-track module reported both of its mains as stray track.
    const seen = new Set([
      ...walk.routes.flatMap((r) => r.pieces),
      ...walk2.routes.flatMap((r) => r.pieces),
    ]);
    const covered = new Set([...walk.unreached, ...walk2.unreached].filter((id) => seen.has(id)));
    const drop = new Set([...covered].map(unreachedWarning));
    const d2 = new Set(walk2.danglingDiverges.map(danglingDivergeWarning));
    for (let i = warnings.length - 1; i >= 0; i--) if (drop.has(warnings[i])) warnings.splice(i, 1);
    for (const w of walk2.warnings)
      if (!d2.has(w) && !drop.has(w) && !warnings.includes(w)) warnings.push(w);
  }

  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const turnouts: SchematicTurnout[] = [];
  const allTurnouts = [
    ...walk.turnouts,
    ...(walk2
      ? walk2.turnouts.map((t) => ({
          ...t,
          onRoute: t.onRoute === "main" ? "main2:main" : `main2:${t.onRoute}`,
          divergeRoute: t.divergeRoute ? `main2:${t.divergeRoute}` : null,
        }))
      : []),
  ];
  for (const t of allTurnouts) {
    const diverge = t.divergeRoute ? trackIdOf.get(t.divergeRoute) : undefined;
    if (!diverge) {
      // A turnout whose diverging route reaches nothing is an unfinished layout,
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
  /**
   * ⭐⭐ A DOUBLE CROSSOVER IS ONE PIECE, AND THE DOCUMENT NEEDS FOUR TURNOUTS
   * AND TWO CONNECTORS OUT OF IT.
   *
   * Emitted here rather than through the walk's turnout machinery, because the
   * walk records one turnout per PIECE and this piece carries four point-sets.
   * Everything needed is already known: {@link crossoverAssembly} says where the
   * point-sets sit inside the assembly, and the walk's own
   * {@link RouteSpan.fromPos} says where the assembly sits on each main. So the
   * operations view gets the four turnouts and both crossing moves it needs,
   * while the physical view keeps drawing the single moulding that is really
   * there.
   *
   * ⚠️ It only emits when BOTH mains actually run through the assembly. Half a
   * double crossover is not a thing, and a piece reached from one main only
   * means the other main is not connected to it — which the open-end and
   * unreachable reporting already says, without inventing a turnout here.
   */
  const crossoverSpans = (() => {
    const found: {
      piece: string;
      part: TrackPart;
      /** By track index (1 = joints a1/b1, 2 = a2/b2): route id + the two
       * point-set positions along that route. */
      byTrack: Map<number, { routeId: string; at: [number, number] }>;
    }[] = [];
    const routesAll = [
      ...walk.routes.map((r) => ({ r, prefix: "" })),
      ...(walk2 ? walk2.routes.map((r) => ({ r, prefix: "main2:" })) : []),
    ];
    const seen = new Map<string, (typeof found)[number]>();
    for (const { r, prefix } of routesAll) {
      for (const sp of r.spans) {
        const piece = pieceById.get(sp.piece);
        const part = piece ? library.find((p) => p.id === piece.partId) : undefined;
        if (!part || part.kind !== "crossover") continue;
        const g = crossoverAssembly(part);
        if (!g) continue;
        const [p1, p2] = g.pointsAtInches;
        // Entered from the west end the point-sets are p1 then p2 along; from
        // the east end the assembly is walked backwards.
        const west = sp.entryJoint.startsWith("a");
        const at: [number, number] = west
          ? [sp.fromPos + p1, sp.fromPos + p2]
          : [sp.fromPos + (g.lengthInches - p2), sp.fromPos + (g.lengthInches - p1)];
        const track = sp.entryJoint.endsWith("2") ? 2 : 1;
        const routeId = r.id === "main" && prefix ? "main2:main" : `${prefix}${r.id}`;
        const rec =
          seen.get(sp.piece) ?? { piece: sp.piece, part, byTrack: new Map() };
        rec.byTrack.set(track, { routeId, at });
        seen.set(sp.piece, rec);
      }
    }
    for (const rec of seen.values()) if (rec.byTrack.size === 2) found.push(rec);
    return found;
  })();

  for (const xo of crossoverSpans) {
    const one = xo.byTrack.get(1)!;
    const two = xo.byTrack.get(2)!;
    const onA = trackIdOf.get(one.routeId) ?? MAIN_TRACK_ID;
    const onB = trackIdOf.get(two.routeId) ?? MAIN2_TRACK_ID;
    // The two crossing moves. A goes track 1 → track 2, B the other way; each
    // spans the same stretch of the module, which is what a scissors looks like.
    const legs: { id: string; from: [string, number]; to: [string, number] }[] = [
      { id: `${xo.piece}-a`, from: [onA, one.at[0]], to: [onB, two.at[1]] },
      { id: `${xo.piece}-b`, from: [onB, two.at[0]], to: [onA, one.at[1]] },
    ];
    for (const leg of legs) {
      tracks.push({
        id: leg.id,
        role: "crossover",
        // The connector lives between the mains, so it takes Main 2's lane —
        // the same lane the 1-D model has always drawn a crossover in.
        lane: main2Lane ?? 1,
        fromPos: round(Math.min(leg.from[1], leg.to[1])),
        toPos: round(Math.max(leg.from[1], leg.to[1])),
        trackName: xo.part.name ?? "Crossover",
        crossoverPartId: xo.part.id,
      });
      turnouts.push(
        {
          id: `${leg.id}-1`,
          pos: round(leg.from[1]),
          onTrack: leg.from[0],
          divergeTrack: leg.id,
          name: xo.part.name ?? "Crossover",
          ...(xo.part.frogNumber != null ? { size: xo.part.frogNumber } : {}),
        },
        {
          id: `${leg.id}-2`,
          pos: round(leg.to[1]),
          onTrack: leg.to[0],
          divergeTrack: leg.id,
          name: xo.part.name ?? "Crossover",
          ...(xo.part.frogNumber != null ? { size: xo.part.frogNumber } : {}),
        },
      );
    }
  }

  turnouts.sort((a, b) => a.pos - b.pos);

  /**
   * ⭐ A CONNECTOR BETWEEN TWO DIFFERENT MAINS IS A CROSSOVER, not a siding.
   *
   * Both are "a track with a turnout at each end"; what separates them is
   * whether those turnouts sit on the SAME track. A siding leaves the main and
   * comes back to it; a crossover goes somewhere else. That is the same test
   * `moduleFeatures` applies to decide whether to draw a diagonal or a
   * lane-paralleling band, so deciding it here means the document says what the
   * drawing will do instead of leaving both to work it out separately.
   *
   * Read, not authored — like everything else in this model.
   */
  for (const t of tracks) {
    if (t.role === "main") continue;
    const ends = turnouts.filter((sw) => sw.divergeTrack === t.id);
    if (!(ends.length >= 2 && new Set(ends.map((sw) => sw.onTrack)).size >= 2)) continue;
    t.role = "crossover";
    // ⭐ ITS EXTENT IS ITS TURNOUTS' POSITIONS — the same rule a siding follows,
    // and for the same reason: `fromPos`/`toPos` mean where a track sits ALONG
    // THE MODULE, not how much rail it has.
    //
    // ⚠️ A crossover needs this more than a siding does, because it is found
    // from BOTH mains and each walk only knows its OWN turnouts. The walk that
    // emitted it could not see the turnout at the far end, so it fell back to
    // accumulated arc length and put a 34→40 connector at 40→46.
    const at = ends.map((sw) => sw.pos);
    t.fromPos = round(Math.min(...at));
    t.toPos = round(Math.max(...at));
    // And it lies BETWEEN the mains rather than out past them.
    t.lane = main2Lane || 1;
  }

  // ⭐ ANCHORED FEATURES ARE PLACED BY THE PIECE THEY ARE BESIDE, not by a
  // number about the module. Unanchored ones keep exactly the positions their
  // owner typed — nothing migrates (ADR 0001).
  const place = (a: GraphAnchor | null | undefined, what: string) => {
    if (!a) return null;
    const hit = resolveGraphAnchor(a, walk, pieces, library);
    if (!hit) {
      warnings.push(
        `${what} is anchored to ${a.piece}, which is not on any route — its authored position stands`,
      );
      return null;
    }
    return hit;
  };
  /** A span keeps its authored LENGTH and takes its start from the anchor. */
  const spanAt = (hit: ResolvedAnchor, from: number, to: number): [number, number] => {
    const len = Math.abs(to - from);
    return hit.reversed
      ? [round(hit.pos - len), round(hit.pos)]
      : [round(hit.pos), round(hit.pos + len)];
  };

  const industries = base.industries?.map((ind) => {
    const hit = place(ind.anchor, `industry "${ind.name}"`);
    const spots = ind.spots?.map((s) => {
      const sh = place(s.anchor, `a spot of industry "${ind.name}"`);
      if (!sh) return s;
      const [from, to] = spanAt(sh, s.fromPos, s.toPos);
      return { ...s, track: trackIdOf.get(sh.routeId) ?? s.track, fromPos: from, toPos: to };
    });
    if (!hit) return spots ? { ...ind, spots } : ind;
    const [fromPos, toPos] = spanAt(hit, ind.fromPos, ind.toPos);
    return {
      ...ind,
      track: trackIdOf.get(hit.routeId) ?? ind.track,
      fromPos,
      toPos,
      ...(spots ? { spots } : {}),
    };
  });

  const signals = base.signals?.map((sig) => {
    const hit = place(sig.anchor, `signal "${sig.name ?? sig.id}"`);
    return hit
      ? { ...sig, pos: round(hit.pos), track: trackIdOf.get(hit.routeId) ?? sig.track }
      : sig;
  });

  const doc: ModuleSchematicDoc = {
    version: 1,
    ...base,
    lengthInches,
    endplates,
    tracks,
    turnouts,
    ...(industries ? { industries } : {}),
    ...(signals ? { signals } : {}),
  };
  return { doc, graph, walk, warnings };
}

/**
 * Bring a document up to date with the track its owner drew.
 *
 * A document with no `graph` is returned UNTOUCHED — that is the ADR's
 * no-migration rule in one line, and it is why every module authored before this
 * keeps behaving exactly as it did. With a graph, the tracks and turnouts are
 * re-read off the pieces and written back into the ordinary document keys, so
 * the module is stored in a form every existing reader already understands.
 *
 * ⭐ Owners' names, capacities and `module_tracks` links are carried across from
 * the tracks already in the document, keyed by id. Re-deriving must never cost
 * an owner the name they gave a siding.
 */
export function deriveGraphDoc(
  doc: ModuleSchematicDoc,
  library = BUILT_IN_TRACK_PARTS,
): { doc: ModuleSchematicDoc; warnings: string[] } {
  const g = doc.graph;
  if (!g || !g.pieces?.length || !g.startAt) return { doc, warnings: [] };
  const meta: NonNullable<GraphDocInput["meta"]> = {};
  for (const t of doc.tracks ?? []) {
    if (t.role === "main") continue;
    meta[t.id] = {
      ...(t.trackName ? { trackName: t.trackName } : {}),
      ...(t.capacityFeet != null ? { capacityFeet: t.capacityFeet } : {}),
      ...(t.moduleTrackId != null ? { moduleTrackId: t.moduleTrackId } : {}),
    };
  }
  const out = graphToDoc(g.pieces, {
    startAt: g.startAt,
    start2: g.start2 ?? null,
    base: doc,
    meta,
    library,
  });
  return { doc: out.doc, warnings: out.warnings };
}

/**
 * What a turnout in a 1-D document would become as a piece — or what it is
 * missing before it can become anything.
 *
 * ⭐⭐ **IDENTITY IS THE GATE, NOT GEOMETRY.** This is the thing that surprised
 * us and it is worth stating plainly: converting a drawn module to pieces is
 * blocked far more often by not knowing WHICH TURNOUT IT IS than by any missing
 * measurement. Across the production database not one turnout names a part, and
 * most state no frog number either — so for those there is nothing to look up.
 * No amount of measuring fixes that; only the owner knows what they laid, which
 * is exactly why conversion asks instead of guessing.
 */
export interface TurnoutIdentity {
  /** The turnout's id in the document. */
  id: string;
  name?: string | null;
  pos: number;
  /** The frog number the document states, if any. */
  size?: number | null;
  /** A part the document already names — the strongest possible answer. */
  statedPartId?: string | null;
  /** The part this turnout converts to; null = the owner has to say. */
  partId: string | null;
  /** How `partId` was arrived at. `assembly` = this is a crossover's own
   * point-set, and the crossover product answers for it. */
  from: "named" | "frog-number" | "unresolved" | "assembly";
  /**
   * The weakest provenance behind the chosen part's geometry, so a caller can
   * tell a turnout placed from real readings from one placed off a catalogue
   * figure. Null when unresolved.
   */
  source: DimensionSource | null;
  /** Why it cannot be resolved — null when it can. */
  why: string | null;
  /**
   * Parts the owner could reasonably pick, best first: an exact frog match
   * ahead of the rest. Only PLACEABLE parts are offered — listing one that
   * cannot be drawn would be an answer that does not answer.
   */
  candidates: string[];
}

/** Something that stops a whole document converting, whatever the owner says. */
export interface ConversionBlocker {
  /** `crossing` · `curved-turnout` · `loop` — the shapes with no piece to be. */
  kind: string;
  /** The document object it came from, where there is one. */
  ref?: string;
  why: string;
}

/**
 * A track the document draws but nothing in it connects — no turnout diverges
 * onto it.
 *
 * ⚠️⚠️ **THE 1-D MODEL TOLERATES THIS AND THE GRAPH CANNOT.** A siding is drawn
 * from its `lane` and its `fromPos`/`toPos` alone, so a document can carry a
 * named, capacity-bearing yard track that joins nothing at all and still look
 * completely normal. Real ones do: Idaho Falls Grain Yard has five yard tracks
 * and not one turnout. A piece, by contrast, has to be joined to something.
 *
 * So these are surfaced rather than converted. Dropping them would lose an
 * owner's named track and its capacity silently, and inventing a turnout to
 * reach it would be exactly the fabrication ADR 0001 forbids — the owner is the
 * only one who knows where it actually joins.
 */
export interface OrphanTrack {
  id: string;
  trackName?: string;
  role: TrackRole;
  why: string;
}

export interface ModuleConversionReport {
  /** Already authored as pieces — there is nothing to convert. */
  alreadyGraph: boolean;
  /**
   * The rebuild can be offered. False when {@link blockers} is non-empty: those
   * are shapes no answer can supply, so offering would promise something that
   * cannot finish.
   */
  offerable: boolean;
  /**
   * True when the rebuild could run right now with nothing asked.
   *
   * ⚠️ Requires BOTH that every turnout resolves and that no track is orphaned.
   * Checking only the turnouts claimed four production modules were ready when
   * converting them would have quietly dropped nine named tracks.
   */
  readyWithoutAsking: boolean;
  turnouts: TurnoutIdentity[];
  /** Ids of the turnouts the owner must identify first. */
  unanswered: string[];
  orphanTracks: OrphanTrack[];
  blockers: ConversionBlocker[];
}

/** A part that IS this frog number and can actually be drawn — never a nearby
 * one. A #6 is not a #5 (see {@link partExtentForSize}); silently converting a
 * #6 into the #7 we happen to have measured would put a real turnout's frog in
 * a place the owner never built it. */
function placeableTurnoutParts(library: TrackPart[], kind: TrackPart["kind"][]): TrackPart[] {
  // ⛔ NO STAND-INS. This answers "which real part is this?", both for automatic
  // resolution and for the candidates offered beside it. A placeholder is a
  // separate, explicitly-chosen fallback — see `provisionalParts`.
  return library.filter(
    (p) => kind.includes(p.kind) && !p.provisional && partGeometryGap(p) == null,
  );
}

/**
 * What would happen if this document were rebuilt as pieces — WITHOUT rebuilding
 * anything.
 *
 * This exists so an owner can be shown the offer and its cost before they accept
 * it (ADR 0001 amendment, 2026-07-27: conversion is opt-in PER MODULE, never
 * silent). It is pure, cheap, reads no geometry, and is safe to run on every
 * module in a list.
 *
 * ⚠️ **A document with a graph is NOT re-reported.** It is already the thing
 * conversion produces.
 */
export function moduleConversionReport(
  doc: ModuleSchematicDoc,
  library = BUILT_IN_TRACK_PARTS,
): ModuleConversionReport {
  if (doc.graph?.pieces?.length) {
    return {
      alreadyGraph: true,
      offerable: false,
      readyWithoutAsking: false,
      turnouts: [],
      unanswered: [],
      orphanTracks: [],
      blockers: [],
    };
  }

  const straight = placeableTurnoutParts(library, ["turnout"]);
  const curved = placeableTurnoutParts(library, ["curved-turnout"]);
  const blockers: ConversionBlocker[] = [];

  /**
   * ⭐ A CROSSOVER'S OWN POINT-SETS ARE ALREADY ANSWERED.
   *
   * The document names the crossover product on its connectors, and a double
   * crossover is ONE assembly whose four point-sets come with it. Asking "which
   * turnout is this?" about them asks an owner to identify parts of a product
   * they have already named — and on a #6 crossover it asked for a measured #6
   * TURNOUT, which has nothing to do with it.
   */
  const assemblyPart = new Map<string, TrackPart>();
  for (const t of doc.tracks ?? []) {
    if (t.role !== "crossover" || !t.crossoverPartId) continue;
    const part = library.find((p) => p.id === t.crossoverPartId);
    if (!part || part.kind !== "crossover" || partGeometryGap(part)) continue;
    for (const sw of doc.turnouts ?? [])
      if (sw.divergeTrack === t.id) assemblyPart.set(sw.id, part);
  }

  const turnouts: TurnoutIdentity[] = (doc.turnouts ?? []).map((t) => {
    const asm = assemblyPart.get(t.id);
    if (asm)
      return {
        id: t.id,
        name: t.name,
        pos: t.pos,
        size: t.size,
        statedPartId: t.partId,
        partId: asm.id,
        from: "assembly" as const,
        source: partGeometry(asm, library)?.source ?? null,
        why: null,
        candidates: [],
      };
    const wantCurved = t.curved === true;
    const pool = wantCurved ? curved : straight;
    const base = {
      id: t.id,
      name: t.name,
      pos: t.pos,
      size: t.size,
      statedPartId: t.partId,
    };
    // An exact frog match first, then everything placeable — the owner may know
    // the part even where the document's frog number is wrong or absent.
    const exact = t.size == null ? [] : pool.filter((p) => p.frogNumber === t.size);
    const candidates = [...exact, ...pool.filter((p) => !exact.includes(p))].map((p) => p.id);
    const resolve = (part: TrackPart, from: TurnoutIdentity["from"]): TurnoutIdentity => ({
      ...base,
      partId: part.id,
      from,
      source: partGeometry(part, library)?.source ?? null,
      why: null,
      candidates,
    });

    // 1. The document names a part. Strongest answer there is — provided we can
    //    draw it. A named part we cannot place is still unanswered, but the
    //    reason names the measurement rather than the owner.
    if (t.partId) {
      const named = library.find((p) => p.id === t.partId);
      if (named && partGeometryGap(named) == null) return resolve(named, "named");
      return {
        ...base,
        partId: null,
        from: "unresolved",
        source: null,
        why: named
          ? `this turnout names ${named.id}, which cannot be placed yet — ${partGeometryGap(named)}`
          : `this turnout names a part the library does not have (${t.partId})`,
        candidates,
      };
    }

    // 2. A frog number, and a placeable part that IS that frog number.
    if (t.size != null && exact.length) return resolve(exact[0], "frog-number");

    // 3. Everything else is a question for the owner. The two reasons are
    //    genuinely different and an owner can act on the difference: one is a
    //    measurement nobody has taken, the other is a fact only they hold.
    return {
      ...base,
      partId: null,
      from: "unresolved",
      source: null,
      why:
        t.size == null
          ? "the document never says what this turnout is — no part, no frog number"
          : wantCurved
            ? `no curved turnout is placeable yet, so a curved #${t.size} cannot be converted`
            : `no measured #${t.size} in the parts library yet`,
      candidates,
    };
  });

  // ⚠️ BLOCKERS ARE NOT QUESTIONS. A question has an answer the owner can give;
  // these are shapes the piece model cannot express at all yet, so the offer is
  // withheld rather than made and then abandoned half way.
  // ⏳ A CROSSING IS STILL LISTED HERE, AND TWO THINGS ARE MISSING, NOT ONE.
  //
  // The drawing code can express a diamond — `partGeometry` handles
  // `kind: "crossing"` and `crossingAngleDeg` reads its angle — so the oldest
  // reason, "not modelled yet", stopped being true.
  //
  // 1. THE ANGLE. A 1-D `crossings` entry records the two tracks and a position
  //    and never says how steeply they cross. By the rule above that IS an
  //    answer an owner could give, so it is half a question.
  // 2. ⛔ A PART TO PLACE. There is no crossing in the library, and no generic
  //    one: a placeholder was built and DELETED on purpose, because a turnout
  //    placeholder interpolates from turnouts we have MEASURED and there is no
  //    measured crossing to interpolate from. Deriving its arm length gave a #6
  //    a 13.7" body where the real part is ~2.5" — real shallow crossings end
  //    while their ties still interlace, so no clearance rule reproduces one.
  //    The library's own rule settles it: "Angle is geometry; everything else is
  //    a tooling decision. MEASURE THE PART. DO NOT MODEL IT."
  //
  // ⚠️ SO ASKING THE ANGLE IS NOT ENOUGH ON ITS OWN — an earlier version of this
  // comment implied it was, and cited a `genericCrossingPart` that does not
  // exist. Both are needed: the question in the questionnaire, and one measured
  // product (angle or frog number, end-to-end length ALONG ONE ROUTE tie-to-tie,
  // manufacturer + part number, and whether it is asymmetric).
  for (const c of doc.crossings ?? [])
    blockers.push({
      kind: "crossing",
      ref: c.id,
      why: "the document doesn't say what angle these tracks cross at, and nothing may choose one for you",
    });
  if (doc.loop)
    blockers.push({
      kind: "loop",
      why:
        "a balloon's curve radii were never recorded, and laying the loop would mean " +
        "inventing them — the one thing ADR 0001 forbids",
    });

  // A track is reached by a turnout DIVERGING onto it. Appearing as a turnout's
  // `onTrack` does not count: that says something branches OFF this track, which
  // still leaves it needing a way in of its own.
  const reached = new Set((doc.turnouts ?? []).map((t) => t.divergeTrack));
  const orphanTracks: OrphanTrack[] = (doc.tracks ?? [])
    // A main is reached by definition — it starts at the endplate.
    .filter((t) => t.role !== "main" && !reached.has(t.id))
    .map((t) => ({
      id: t.id,
      ...(t.trackName ? { trackName: t.trackName } : {}),
      role: t.role,
      why: "no turnout in the document diverges onto this track, so there is nothing to join it to",
    }));

  const unanswered = turnouts.filter((t) => !t.partId).map((t) => t.id);
  return {
    alreadyGraph: false,
    offerable: blockers.length === 0,
    readyWithoutAsking:
      blockers.length === 0 && unanswered.length === 0 && orphanTracks.length === 0,
    turnouts,
    unanswered,
    orphanTracks,
    blockers,
  };
}

/**
 * What the owner said when offered the rebuild.
 *
 * ⭐ **ONE ANSWER FOR THE WHOLE MODULE.** Owners lay one kind of turnout
 * throughout, or at most two, so asking per turnout asks the same question eight
 * times on a yard. The module-wide answer IS the question; `overrides` is for the
 * odd one out. (Will's call, 2026-07-27 — it turns 41 questions across the
 * production database into 14.)
 */
export interface ConversionAnswers {
  /** "The turnouts on this module are…" — a part id from the library. */
  turnoutPartId?: string | null;
  /** The exceptions, by turnout id. Beats {@link turnoutPartId}. */
  overrides?: Record<string, string>;
}

/**
 * Where a point on a track REALLY is, in module coordinates.
 *
 * ⭐⭐ **NOT ALL TRACK RUNS DOWN THE CENTRE-LINE** (Will, 2026-08-01), and the
 * conversion used to behave as though it did: it laid every piece at
 * `x = pos, y = laneOffset, rotationDeg = 0`, which is the STRAIGHTENED 1-D
 * frame, not the board. On a module whose centre-line curves — FMN-0064 chains
 * eight sections into a 386″ × 148.5″ shape — the pieces came out in a straight
 * line while the track they were converted from ran somewhere else entirely.
 *
 * The caller supplies this because **which polyline a piece sits on is a fact
 * about the MODULE's shape**, exactly as {@link turnoutDivergingLeg} takes its
 * `sampleAt`. The app already resolves it for every track it draws: the main is
 * the centre-line, a drawn track is its own path, and a positional siding is the
 * centre-line offset to its lane. Absent = lay flat, the old behaviour.
 *
 * `absPos` is inches from endplate A **measured along the module**, which is
 * what a document stores; converting that to an arc length along whatever
 * polyline the track really is belongs to the caller too, since it is the same
 * projection its renderer already does.
 */
export type PlaceOnTrack = (
  trackId: string,
  absPos: number,
) => { x: number; y: number; headingDeg: number } | null;

export interface DocToGraphResult {
  /** The graph to store, or null when the document could not be converted. */
  graph: NonNullable<ModuleSchematicDoc["graph"]> | null;
  /** Why the whole conversion was refused — null when it ran. */
  refused: string | null;
  /**
   * Track the conversion could not lay, each with a reason.
   *
   * ⚠️ **A REAL LOSS, AND THE OWNER MUST SEE IT.** Unshown, a "successful"
   * rebuild would quietly be missing a named siding.
   */
  notLaid: { id: string; why: string }[];
  warnings: string[];
}

/** Below this a transition curve is not something anyone laid by hand. Flagged,
 * never corrected — the house rule (see {@link FREEMO_MAIN_MIN_RADIUS_INCHES}). */
const CONVERSION_TIGHT_RADIUS_INCHES = 12;

/**
 * Rebuild a 1-D document as a graph of placed pieces.
 *
 * ⭐ **THE OWNER ASKED FOR THIS ONE MODULE** (ADR 0001 amendment, 2026-07-27).
 * Nothing calls it on a schedule, on load, or in bulk. Conversion supplies
 * geometry the 1-D document never recorded, which is what the original
 * constraint forbade doing behind an owner's back; done in front of them, having
 * shown them {@link moduleConversionReport} and taken their answer, it is an
 * edit they made.
 *
 * ⚠️ **STRAIGHT HOSTS ONLY.** A run is laid along its host's axis, so a module
 * whose main is DRAWN with bends is refused rather than quietly straightened.
 * Every module in production today has a straight main; the refusal is there so
 * the first curved one is a message and not a flattened drawing.
 *
 * ⭐ **PIECES CHAIN FROM MEASURED JOINTS, NOT FROM ABSOLUTE ARITHMETIC.** Each
 * piece is placed, its real joints are read back with {@link placedJoints}, and
 * the next starts from one of those. Connection then holds BY CONSTRUCTION
 * rather than by two independent calculations agreeing to within
 * {@link JOINT_SNAP_INCHES} — a hundredth of an inch is far too tight to hit by
 * coincidence.
 *

 * ⭐ A TURNOUT'S THROAT GOES AT `pos − frogOffset`: a document's `pos` is the
 * That is the inverse of what {@link walkTrackGraph} reports, which is the only
 * thing that makes convert-then-derive an identity. It is deliberately NOT
 * {@link turnoutOccupiedSpan}'s anchor, and the two disagree by
 * `lead − pointsOffset` — 2.97″ on an Atlas #7. That disagreement is real and
 * unresolved: see the note on {@link moduleConversionReport}. Because of it the
 * flex gaps here are measured off the placed pieces' OWN joints rather than
 * through the 1-D helper, so whichever anchor turns out to be right, the track
 * still meets the turnout it was cut for.
 */
export function docToGraph(
  doc: ModuleSchematicDoc,
  answers: ConversionAnswers = {},
  library = BUILT_IN_TRACK_PARTS,
  /** Where each track really runs — see {@link PlaceOnTrack}. Absent = the old
   * flat lay, which is correct only for a straight module whose track is all on
   * the centre-line. */
  placeAt: PlaceOnTrack | null = null,
): DocToGraphResult {
  const refuse = (why: string): DocToGraphResult => ({
    graph: null,
    refused: why,
    notLaid: [],
    warnings: [],
  });

  const report = moduleConversionReport(doc, library);
  if (report.alreadyGraph) return refuse("this module is already authored as pieces");
  if (!report.offerable) return refuse(report.blockers.map((b) => b.why).join("; "));
  // ⭐ CURVED RUNS ARE SUPPORTED NOW — when the caller says where the track is.
  // The refusal was honest while every piece was laid flat: a bent mainline
  // needs each bend's radius, and there was nowhere to get one. Given a
  // {@link PlaceOnTrack} the radius is READ OFF the drawn path rather than
  // invented, so the reason no longer holds. Without one we still lay flat, and
  // a bent run would come out straight — so the refusal stands in that case.
  if (!placeAt && (doc.mainPath?.length ?? 0) > 2)
    return refuse(
      "this module's mainline is drawn with bends, and laying it as pieces would need each bend's radius — convert it once curved runs are supported",
    );

  const partById = new Map(library.map((p) => [p.id, p]));

  /**
   * ⭐ Turnouts that are a CROSSOVER ASSEMBLY'S OWN POINT-SETS.
   *
   * The assembly answers for them, so they are neither asked about nor laid
   * individually. Without this an owner is asked "which turnout is this?" about
   * four point-sets of a product they have already named — and on FMN-0078,
   * whose crossovers are #6, the whole conversion refused for want of a measured
   * #6 turnout that has nothing to do with it.
   */
  const inAssembly = new Set<string>();
  for (const t of doc.tracks ?? []) {
    if (t.role !== "crossover" || !t.crossoverPartId) continue;
    const part = partById.get(t.crossoverPartId);
    if (!part || part.kind !== "crossover" || partGeometryGap(part)) continue;
    for (const sw of doc.turnouts ?? []) if (sw.divergeTrack === t.id) inAssembly.add(sw.id);
  }

  const chosen = new Map<string, TrackPart>();
  const unknown: string[] = [];
  for (const t of report.turnouts) {
    if (inAssembly.has(t.id)) continue;
    const id = answers.overrides?.[t.id] ?? (t.partId ? t.partId : answers.turnoutPartId) ?? null;
    const part = id ? partById.get(id) : undefined;
    if (!part || partGeometryGap(part)) unknown.push(t.id);
    else chosen.set(t.id, part);
  }
  if (unknown.length)
    return refuse(
      `${unknown.length} turnout${unknown.length === 1 ? "" : "s"} still need identifying: ${unknown.join(", ")}`,
    );

  const flexId = DEFAULT_FLEX_PART_ID;
  if (!partById.get(flexId)) return refuse("the parts library has no flex track to lay plain track with");
  const maxPiece = maxFlexPieceInches(flexId, library);

  const tracks = doc.tracks ?? [];
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const turnouts = doc.turnouts ?? [];
  const mainLen =
    doc.lengthInches ??
    Math.max(0, ...tracks.map((t) => t.toPos ?? 0), ...turnouts.map((t) => t.pos));
  if (!(mainLen > 0)) return refuse("this module has no length to lay track along");

  const pieces: TrackPiece[] = [];
  /** Each laid piece's position in the FLAT frame — the order a run is welded in. */
  const flatAt = new Map<string, number>();
  const notLaid: { id: string; why: string }[] = [];
  const warnings: string[] = [];
  const rad = (d: number) => (d * Math.PI) / 180;
  /** Signed turn, −180…180 — a heading difference has a SIDE, and `norm360`
   * would report a small left turn as 359°. */
  const norm180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const jointsOf = (p: TrackPiece) => placedJoints([p], library);
  const jointAt = (p: TrackPiece, id: string) => jointsOf(p).find((j) => j.joint === id) ?? null;
  type Cursor = { x: number; y: number; headingDeg: number };

  /**
   * Put a laid piece where the track REALLY is.
   *
   * Takes the flat-frame span the 1-D lay produced and asks {@link PlaceOnTrack}
   * for the two ends, then reads the piece's placement off the answer:
   *
   * - **origin + heading** come from the `from` end, so the piece starts exactly
   *   where the run does rather than at `x = pos, y = lane`;
   * - **radius** is DERIVED from how much the heading turned across the span.
   *   Turning θ over an arc `s` is a radius of `s / θ` — the same relationship
   *   the curve model already uses, read off the polyline instead of invented.
   *   The sign is the side, matching {@link TrackPiece.radiusInches}.
   *
   * ⚠️ Below a hair of turn a run is straight and must stay straight: a
   * thousandth of a degree over 30″ is a 1.7-million-inch radius, which is a
   * straight piece described in the most alarming way possible.
   */
  const STRAIGHT_ENOUGH_DEG = 0.05;
  const placeSpan = (
    trackId: string,
    fromPos: number,
    toPos: number,
  ): { x: number; y: number; rotationDeg: number; radiusInches?: number } | null => {
    if (!placeAt) return null;
    const a = placeAt(trackId, fromPos);
    const b = placeAt(trackId, toPos);
    if (!a || !b) return null;
    const arc = Math.abs(toPos - fromPos);
    const turn = norm180(b.headingDeg - a.headingDeg);
    if (!(arc > 0) || Math.abs(turn) < STRAIGHT_ENOUGH_DEG) {
      return { x: r3(a.x), y: r3(a.y), rotationDeg: a.headingDeg };
    }
    return {
      x: r3(a.x),
      y: r3(a.y),
      rotationDeg: a.headingDeg,
      radiusInches: r3(arc / rad(turn)),
    };
  };

  /** Where a body (a turnout) sits — a point, not a span, so no radius. */
  const placePoint = (
    trackId: string,
    pos: number,
  ): { x: number; y: number; headingDeg: number } | null => (placeAt ? placeAt(trackId, pos) : null);

  /**
   * A transition curve: leave `from` on its current heading, arrive parallel to
   * the module axis at `toY`.
   *
   * ⭐ **THE RADIUS IS DERIVED, NOT INVENTED.** Turning through θ moves a run
   * R(1 − cos θ) sideways, so the document's own lane offset and the part's own
   * frog angle fix R between them. Nothing here is a preference. It is also what
   * track physically does: the turnout throws the rail out at the frog angle and
   * a curve brings it back parallel. The 1-D model's instant jump to a lane
   * offset is the thing that was never real.
   */
  const transition = (
    id: string,
    from: Cursor,
    toY: number,
    /** +1 running east, −1 running west. ⚠️ A SIDING'S CLOSING CURVE RUNS THE
     * OTHER WAY, and measuring its heading against +x called an 8° turn a 172°
     * one — which came out as a 0.3″ radius instead of 51″. Everything here is
     * relative to the direction of travel. */
    dirSign: 1 | -1 = 1,
    /**
     * ⭐⭐ WHERE THE HOST RUNS at the point this track leaves it — and the lane
     * the host itself sits on.
     *
     * ⛔ BOTH QUANTITIES THIS FUNCTION NEEDS ARE RELATIVE TO THE HOST, and
     * measuring them against the module's axes only worked because a flat lay
     * puts the host along +x with its lanes at constant y. Given a
     * {@link PlaceOnTrack} that is no longer true, and the error is not subtle:
     * on an R=600″ arc blairstown's `mt5-far` came out **119.29″ long, radius
     * 2761.5, ending at x = −48.2 on a 96″ board**, because its diverging joint
     * had risen to y = 3.7 and `toY − from.y` read that rise as lateral offset
     * still to travel.
     *
     * The default is the flat frame, so a lay without a placer computes exactly
     * what it always did — `offFrom` collapses to `from.y`, `offTo` to `toY`,
     * and the angle to the old `0`/`180`.
     */
    host: { x: number; y: number; headingDeg: number; laneY: number } = {
      x: 0,
      y: 0,
      headingDeg: 0,
      laneY: 0,
    },
  ): TrackPiece | null => {
    // The host's LEFT normal — the direction a lane offset is measured along.
    const hostRad = rad(host.headingDeg);
    const nx = -Math.sin(hostRad);
    const ny = Math.cos(hostRad);
    /** How far off the host's centre-line a point already sits, to its left. */
    const offOf = (p: { x: number; y: number }) =>
      (p.x - host.x) * nx + (p.y - host.y) * ny;
    // A LANE is a flat-frame quantity (see `laneOffsetAt`), so the branch's
    // target is its lane MINUS its host's — an offset between two lanes, which
    // is frame-independent even though each number is not.
    const offTo = toY - host.laneY;
    const theta = rad(
      norm180(from.headingDeg - (host.headingDeg + (dirSign > 0 ? 0 : 180))),
    );
    // The piece's own +y is the host's left only when it runs with the host.
    const dy = (offTo - offOf(from)) * dirSign;
    if (Math.abs(theta) < 1e-9 || Math.abs(dy) < 1e-9) return null;
    const R = dy / (1 - Math.cos(theta));
    if (!Number.isFinite(R) || R === 0) return null;
    const mag = Math.abs(R);
    if (mag < CONVERSION_TIGHT_RADIUS_INCHES)
      warnings.push(
        `the curve bringing ${id} back parallel works out at ${mag.toFixed(1)}″ radius — tighter than anyone lays by hand, which usually means the document's lane and its turnout disagree`,
      );
    return {
      id,
      partId: flexId,
      x: from.x,
      y: from.y,
      rotationDeg: from.headingDeg,
      // Curving BACK toward the host: opposite the way we are already heading.
      // `radiusInches` is signed and the sign IS the side.
      radiusInches: r3(-Math.sign(theta) * mag),
      lengthInches: r3(mag * Math.abs(theta)),
    };
  };

  /**
   * ⭐⭐ WHERE ALONG `trackId` A POINT SITS — the inverse of {@link PlaceOnTrack}.
   *
   * ⛔ THE BUG THIS KILLS: a branch's flex extent was passed as the X-COORDINATES
   * of the curves at either end, into parameters that mean POSITIONS. Flat they
   * are the same number, so it never showed. Given a placer they are not, and it
   * broke two ways at once — the flex came out too SHORT to reach the closing
   * curve, and `layFlex`'s body matching, which picks the joint nearest
   * `placeAt(track, fromPos)`, sampled the wrong place and chose the curve's FAR
   * end, sending the run backwards (rot 233° on a 45° board).
   *
   * The same confusion as #253's arc-length-versus-`x`, one layer down.
   *
   * Coarse scan then bisect: the placer is any polyline the caller likes, so
   * there is nothing to invert analytically. Without a placer a position IS an
   * x, and the fallback returns it unchanged — the flat lay is untouched.
   */
  const posOfPoint = (
    trackId: string,
    p: { x: number; y: number },
    fallback: number,
  ): number => {
    if (!placeAt) return fallback;
    const span = Math.max(mainLen, 1);
    let best = fallback;
    let bestD = Infinity;
    const consider = (pos: number) => {
      if (pos < 0 || pos > span) return;
      const q = placeAt(trackId, pos);
      if (!q) return;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = pos;
      }
    };
    const steps = 240;
    for (let i = 0; i <= steps; i += 1) consider((span * i) / steps);
    if (bestD === Infinity) return fallback;
    // Refine well inside JOINT_SNAP_INCHES — this position decides where a joint
    // lands, and "near enough" is the habit that lets drift in.
    let step = span / steps;
    for (let k = 0; k < 40; k += 1) {
      step /= 2;
      consider(best - step);
      consider(best + step);
    }
    return best;
  };

  /**
   * Where a host track runs at `pos`, for a branch leaving it there — the frame
   * {@link transition} needs. Without a {@link PlaceOnTrack} this is the flat
   * lay's own frame, so the curve comes out exactly as it always did.
   */
  const hostFrameAt = (
    laid: TrackPiece | undefined,
    hostId: string | undefined,
    pos: number,
  ) => {
    const laneY = laneOffsetAt(trackById.get(hostId ?? "")?.lane ?? 0, 0);
    // ⛔⛔ READ THE FRAME OFF THE TURNOUT AS PLACED, NOT FROM A FRESH SAMPLE.
    // `chainRun` welds the host's run together and MOVES its turnouts, so by
    // the time a branch leaves one, `placeAt(host, pos)` no longer describes
    // where that turnout actually is — on blairstown's arc the sample sat 1.3″
    // off the laid turnout, which put the diverging joint on the wrong SIDE of
    // the host line and tripled the closing curve.
    const a = laid ? jointAt(laid, "throat") : null;
    const b = laid ? jointAt(laid, "through") : null;
    if (!a || !b) return { x: pos, y: laneY, headingDeg: 0, laneY };
    let hx = b.x - a.x;
    let hy = b.y - a.y;
    // ⚠️ Point it the module's own way. A lane's sign is a canonical-frame
    // fact, so measuring it against a WEST-facing turnout's own direction would
    // read every offset upside down — and `dirSign` already handles travel.
    const ref = placeAt && hostId ? placeAt(hostId, pos) : null;
    const rr = rad(ref?.headingDeg ?? 0);
    if (hx * Math.cos(rr) + hy * Math.sin(rr) < 0) {
      hx = -hx;
      hy = -hy;
    }
    return { x: a.x, y: a.y, headingDeg: (Math.atan2(hy, hx) * 180) / Math.PI, laneY };
  };

  /** Place a turnout so {@link walkTrackGraph} will report it at `t.pos`. */
  const layTurnout = (t: SchematicTurnout, hostY: number) => {
    const part = chosen.get(t.id)!;
    const geom = partGeometry(part, library)!;
    const branch = trackById.get(t.divergeTrack);
    // ⚠️ WHICH WAY DOES THE BRANCH LEAVE? The far end is whichever of the
    // branch's ends is further from this turnout — NOT always `toPos`. On a
    // siding's east turnout `toPos` IS its own position, so passing it left
    // `turnoutFacing` with a zero to sign and it fell through to "east",
    // pointing the diverging rail away from the siding it opens.
    const ends = [branch?.fromPos, branch?.toPos].filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n),
    );
    const divergeFarPos =
      // ⭐ A crossover half diverges TOWARD its partner. Its diverging track is a
      // MAIN, whose ends are the whole module, so the ordinary rule has nothing
      // useful to sign and would point it away from the turnout it feeds.
      divergeFarOverride.get(t.id) ??
      (ends.length
        ? ends.reduce((a, b) => (Math.abs(b - t.pos) > Math.abs(a - t.pos) ? b : a))
        : undefined);
    const facing = turnoutFacing({
      pos: t.pos,
      divergeFarPos,
      flipped: t.flipped ?? false,
    });
    const body = part.overallLength!.inches;
    const lead = part.lead?.inches ?? body / 2;
    // ⭐ A DOCUMENT'S `pos` IS THE FROG (Will, 2026-07-27), and the frog sits
    // `frogOffset` from the tie end. Entered at the throat the walk reports
    // `throat + frogOffset`; entered at the through end, `through + (body −
    // frogOffset)`. Invert whichever applies so the turnout comes back out where
    // the document put it.
    const frogAxial = part.frogOffset?.inches ?? (part.pointsOffset?.inches ?? 0) + lead;
    const throatPos = facing > 0 ? t.pos - frogAxial : t.pos + frogAxial;
    const hostLane = trackById.get(t.onTrack)?.lane ?? 0;
    // Which way must the diverging route go? The part diverges to its own +y;
    // turning it end-for-end sends that to module −y. ⭐ No hand is stored
    // anywhere — this reads the side off the document's lanes.
    const want = Math.sign((branch?.lane ?? hostLane) - hostLane) || 1;
    const unflipped = facing > 0 ? 1 : -1;
    // ⭐ A turnout is a FIXED MOULDING — it has no radius to derive, so only its
    // origin and heading move. Facing west still means turning it end-for-end,
    // but about the track's real heading rather than the module's +x.
    const at = placePoint(t.onTrack, throatPos);
    const piece: TrackPiece = {
      id: `t-${t.id}`,
      partId: part.id,
      x: at ? r3(at.x) : throatPos,
      y: at ? r3(at.y) : hostY,
      rotationDeg: at
        ? norm180(at.headingDeg + (facing > 0 ? 0 : 180))
        : facing > 0
          ? 0
          : 180,
      ...(unflipped !== want ? { flipped: true } : {}),
      ...(t.name ? { name: t.name } : {}),
    };
    // ⚠️ THE BODY IS MEASURED OFF THE PIECE, not off `partExtent` — see the
    // anchor warning on this function. Whatever the 1-D helper believes, flex
    // has to stop where this piece's rail actually starts.
    const bodyEnds = [throatPos, facing > 0 ? throatPos + body : throatPos - body];
    const span: OccupiedSpan = { fromPos: Math.min(...bodyEnds), toPos: Math.max(...bodyEnds) };
    const divergeId = geom.joints.find((j) => j.role === "diverge")?.id ?? "diverge";
    return { t, piece, span, divergeId };
  };

  /**
   * Re-aim a straight flex piece so its far end lands exactly on a point.
   *
   * A run that has to meet something slightly off its lane — a crossover pinches
   * the mains together — is eased over by the builder, and the angle is far
   * below anything drawable (0.035″ over a 30″ piece is 0.07°). Doing it by
   * re-aiming the piece keeps the joint EXACT, which is what the graph needs.
   */
  const aimEndAt = (piece: TrackPiece, to: { x: number; y: number }) => {
    const dx = to.x - piece.x;
    const dy = to.y - piece.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) return;
    // ⚠️ THE ANGLE IS NOT ROUNDED. Rounding it to three places moved the far end
    // by ~1.5e-5″ — harmless against JOINT_SNAP_INCHES, but this joint is meant
    // to be exact BY CONSTRUCTION, and "close enough to snap" is the habit that
    // lets real drift in.
    piece.rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    piece.lengthInches = len;
  };

  /**
   * ⭐⭐ CUT THE LAST PIECE TO LENGTH — never to a different RADIUS.
   *
   * A siding closes onto its far turnout, so its run is anchored at BOTH ends
   * and the flex has to arrive where the closing curve starts. Cutting the last
   * piece is what a builder does; {@link aimEndAt} is the straight-track version
   * of the same idea.
   *
   * ⛔ LENGTH ONLY. An earlier attempt solved for the RADIUS as well. That does
   * land the joint exactly — and pulled a 240″ stretch to 165″ to do it. A
   * piece's curvature describes the track; bending it to hide a positional error
   * is a wrong answer, and the suite says so by name ("bends each piece to the
   * radius its own stretch actually has"). Length is the one dimension of a flex
   * piece that is genuinely free.
   *
   * So this closes the ALONG-track component and leaves the LATERAL one, which
   * is not the flex's to fix: it is the rigid turnout's own chord across the arc
   * (0.030″ at R600), and the closing curve hangs off that turnout.
   */
  /**
   * Re-shape a TRANSITION curve so its far end lands exactly on a point.
   *
   * Its start and heading are fixed by the turnout it leaves, so a circular arc
   * to a given end is uniquely determined: `flexRunEnd` gives
   * `(R sin θ, R(1 − cos θ))` for `θ = L/R`, and inverting that pair is exact —
   * `c² = 2·R·dy`, so `R = c²/2dy` and `θ` follows.
   *
   * ⚠️ ONLY EVER A TRANSITION CURVE. Its radius is already DERIVED from the
   * geometry it reconciles (a turnout's divergence and a lane), not read off the
   * owner's polyline — so re-deriving it against the track's real position is
   * the same kind of statement. Doing this to a stretch of plain flex would be
   * the invention the suite refuses by name.
   */
  const fitEndTo = (piece: TrackPiece, to: { x: number; y: number }) => {
    const rot = rad(piece.rotationDeg ?? 0);
    const ax = to.x - piece.x;
    const ay = to.y - piece.y;
    const dx = ax * Math.cos(rot) + ay * Math.sin(rot);
    const dy = -ax * Math.sin(rot) + ay * Math.cos(rot);
    const c2 = dx * dx + dy * dy;
    if (!(c2 > 0) || dx <= 0) return; // behind us, or nowhere: leave it alone
    if (Math.abs(dy) < 1e-9) {
      delete piece.radiusInches;
      piece.lengthInches = r3(Math.sqrt(c2));
      return;
    }
    const R = c2 / (2 * dy);
    const theta = Math.atan2(dx / R, 1 - dy / R);
    const L = R * theta;
    if (!(L > 0) || !Number.isFinite(L) || !Number.isFinite(R)) return;
    piece.radiusInches = r3(R);
    piece.lengthInches = r3(L);
  };

  const fitLengthTo = (piece: TrackPiece, to: { x: number; y: number }) => {
    const L0 = piece.lengthInches ?? 0;
    if (!(L0 > 0)) return;
    const distAt = (L: number) => {
      const end = jointAt({ ...piece, lengthInches: L }, "b");
      return end ? Math.hypot(end.x - to.x, end.y - to.y) : Infinity;
    };
    // The end travels along the piece's OWN arc as its length changes, so this
    // is a 1-D minimisation: scan, then bisect. Never let it go non-positive.
    let best = L0;
    let bestD = distAt(L0);
    const span = Math.max(1, Math.abs(L0) * 0.5);
    for (let i = -40; i <= 40; i += 1) {
      const L = L0 + (span * i) / 40;
      if (L <= 0.01) continue;
      const d = distAt(L);
      if (d < bestD) {
        bestD = d;
        best = L;
      }
    }
    let step = span / 40;
    for (let k = 0; k < 40; k += 1) {
      step /= 2;
      for (const L of [best - step, best + step]) {
        if (L <= 0.01) continue;
        const d = distAt(L);
        if (d < bestD) {
          bestD = d;
          best = L;
        }
      }
    }
    piece.lengthInches = r3(best);
  };

  /**
   * ⭐⭐ WELD `cur` ONTO `prev` so their nearest joints coincide EXACTLY.
   *
   * Chaining the flex closed the gaps between flex pieces, but each BODY was
   * still placed by its own sample — so two adjacent turnouts (blairstown's
   * pair at 13″ and 19″, whose 6″ bodies touch) never met on a curve and the
   * walk stopped at the first. This welds every element of a run to the one
   * before it, whatever kind it is.
   *
   * The joint PAIR is chosen by proximity: both pieces are already sampled onto
   * roughly the right spot, so the nearest pair is the one meant to join — and
   * proximity is only choosing WHICH joint. The position and heading then come
   * from the joint exactly, so the result is exact by construction rather than
   * "near enough to snap".
   *
   * ⛔⛔ **BUT PROXIMITY MAY NOT CHOOSE A TURNOUT'S DIVERGING LEG.** That
   * assumption holds for a piece with two ends and BREAKS on a turnout, which
   * has three. `chainRun` is walking ONE run, and every turnout in its list
   * sits ON that run — so the run passes through the turnout throat-to-through,
   * and the diverging leg belongs to the OTHER run, which will need it.
   *
   * On a curve the incoming flex can land nearer the diverge joint than the
   * throat, and blairstown did exactly that: the main welded onto `sw4.diverge`,
   * leaving `sw4.through` open, so the main dead-ended into the siding's leg and
   * everything past it was unreachable (83.22″ of a 96″ module). It never showed
   * on a FLAT lay, where the throat is unambiguously nearest — which is why it
   * only surfaced once a {@link PlaceOnTrack} was supplied.
   *
   * ⭐ The caller knows which route it is walking; distance does not. Excluding
   * the diverging leg here is that knowledge, not a tolerance.
   */
  const weldTo = (
    prev: TrackPiece,
    cur: TrackPiece,
    /**
     * ⭐⭐ KEEP `cur`'s OWN HEADING and move it into place by TRANSLATION alone.
     *
     * ⛔ THE DRIFT THIS STOPS (#304). A turnout body is RIGID and ~6″ long, so on
     * a curve it chords across the arc: at R=600 its far end lands 0.030″ inside
     * the line AND POINTING 0.57° OFF THE TANGENT. Rotating the next piece to
     * face that end inherits the error, the piece after inherits it again, and
     * since every body adds another the run walks off the owner's drawing
     * QUADRATICALLY — 1.93″ at R600 and 4.75″ at R240 on a 96″ module.
     *
     * A body already knows where it belongs: it was placed from its own sample
     * of the line. Taking only its POSITION from the weld keeps the joint exact
     * — {@link buildTrackGraph} matches joints by position, not heading — and
     * leaves the sub-degree kink where it physically is, at the rigid part.
     *
     * ⚠️ That kink is REAL. Butt rigid turnouts end-to-end along a curve and the
     * rail genuinely does not stay tangent; a builder eases the flex around it.
     * Pretending otherwise is what moved the whole run off the drawing.
     */
    keepHeading = false,
  ) => {
    // A run passes through a turnout; it never leaves down the diverging leg.
    // Fails OPEN: if a piece somehow has nothing else, keep its full set rather
    // than refuse to weld at all.
    const throughOnly = (p: TrackPiece) => {
      const all = jointsOf(p);
      const thru = all.filter((j) => j.role !== "diverge");
      return thru.length ? thru : all;
    };
    const pjs = throughOnly(prev);
    const cjs = throughOnly(cur);
    if (!pjs.length || !cjs.length) return;
    let best: { pj: PlacedJoint; cj: PlacedJoint; d: number } | null = null;
    for (const pj of pjs)
      for (const cj of cjs) {
        const d = Math.hypot(pj.x - cj.x, pj.y - cj.y);
        if (!best || d < best.d) best = { pj, cj, d };
      }
    if (!best) return;
    // Face back the way we came: two joined ends point at each other — unless
    // this piece knows its own heading and should keep it (see `keepHeading`).
    if (!keepHeading) {
      const delta = norm180(norm180(best.pj.headingDeg + 180) - best.cj.headingDeg);
      cur.rotationDeg = norm180(cur.rotationDeg + delta);
    }
    const moved = jointAt(cur, best.cj.joint);
    if (!moved) return;
    cur.x = r3(cur.x + (best.pj.x - moved.x));
    cur.y = r3(cur.y + (best.pj.y - moved.y));
  };

  /** Weld a whole run, in the order its elements sit along the module. */
  const chainRun = (
    ordered: { at: number; piece: TrackPiece; keepHeading?: boolean }[],
  ) => {
    const seq = [...ordered].sort((a, b) => a.at - b.at);
    for (let i = 1; i < seq.length; i += 1)
      weldTo(seq[i - 1].piece, seq[i].piece, seq[i].keepHeading === true);
  };

  /** Lay the plain track of one straight run at `hostY`, between two positions,
   * around the bodies already sitting in it. */
  const layFlex = (
    label: string,
    hostY: number,
    fromPos: number,
    toPos: number,
    occupied: OccupiedSpan[],
    cuts?: number[] | null,
    /** Which track this run IS, so its pieces can be put where it really runs.
     * Absent = the flat lay (a synthesised connector with no track of its own). */
    trackId?: string | null,
    /** The BODIES this run is being laid around, already placed. A cut that
     * begins where a turnout ends must continue from that turnout's own joint —
     * re-sampling the polyline there leaves the same gap chaining exists to
     * close, just at the turnout instead of between two flex pieces. */
    bodies?: { span: OccupiedSpan; piece: TrackPiece }[],
  ) => {
    const out = flexPieces({ fromPos, toPos, maxPieceInches: maxPiece, occupied, cuts: cuts ?? null });
    /**
     * ⭐⭐ THE PIECES CHAIN. Each cut takes its SHAPE from the polyline — the
     * heading it sets off on and the radius its own stretch is bent to — but a
     * continuing piece takes its POSITION from the previous piece's far joint,
     * never from a fresh sample.
     *
     * ⛔⛔ Sampling every piece independently is what broke the first attempt.
     * A 30″ piece's real far end and the polyline's point 30″ along are not the
     * same place on a curve, and they differ by far more than
     * {@link JOINT_SNAP_INCHES} (0.01″). So consecutive pieces never shared a
     * joint, the graph FRAGMENTED, and `graphToDoc` walked 45.5″ of a 386″
     * module with 21 "not reachable from the endplate" warnings.
     *
     * Chaining makes the joint exact BY CONSTRUCTION, which is the same
     * standard {@link aimEndAt} is held to: "close enough to snap" is the habit
     * that lets real drift in.
     *
     * ⚠️ Only a CONTIGUOUS cut chains. `flexPieces` breaks the run around each
     * turnout body, and the piece after a turnout starts at the turnout, not at
     * the flex before it — so a new group re-samples the polyline.
     */
    const placed: TrackPiece[] = [];
    let prevEnd: { x: number; y: number; headingDeg: number } | null = null;
    let prevToPos: number | null = null;
    out.forEach((f, i) => {
      const flat: TrackPiece = {
        id: `f-${label}-${i}`,
        partId: flexId,
        x: f.fromPos,
        y: hostY,
        rotationDeg: 0,
        lengthInches: r3(f.lengthInches),
      };
      const shape = trackId ? placeSpan(trackId, f.fromPos, f.toPos) : null;
      if (!shape) {
        placed.push(flat);
        flatAt.set(flat.id, f.fromPos);
        prevEnd = null;
        prevToPos = f.toPos;
        return;
      }
      let continues =
        prevEnd != null && prevToPos != null && Math.abs(f.fromPos - prevToPos) < 1e-6;
      // Starting against a body? Continue from ITS joint. Which of the two or
      // three is decided by proximity to the sampled start — the sample is
      // right to within an inch, and it is only being used to CHOOSE the joint;
      // the position and heading then come from the joint exactly.
      if (!continues && bodies?.length) {
        const touching = bodies.find(
          (b) =>
            Math.abs(b.span.toPos - f.fromPos) < 0.51 ||
            Math.abs(b.span.fromPos - f.fromPos) < 0.51,
        );
        if (touching) {
          const near = jointsOf(touching.piece)
            .map((j) => ({ j, d: Math.hypot(j.x - shape.x, j.y - shape.y) }))
            .sort((a, b) => a.d - b.d)[0];
          if (near) {
            prevEnd = { x: near.j.x, y: near.j.y, headingDeg: near.j.headingDeg };
            continues = true;
          }
        }
      }
      const piece: TrackPiece = {
        ...flat,
        ...shape,
        // ⭐⭐ POSITION FROM THE JOINT, HEADING FROM THE LINE (#304).
        //
        // Taking the heading from the previous joint too is what carried a
        // rigid body's chord error into everything after it: a 6″ turnout on an
        // R600 arc ends 0.57° off tangent, the next flex set off at that angle,
        // and 30″ later it was 0.30″ further off the drawing — compounding to
        // 1.93″ (R600) and 4.75″ (R240) across a 96″ module.
        //
        // ⭐ On a run with no drift the two answers are the SAME — the sampled
        // heading at a cut's start IS where the previous piece's arc ends — so
        // this changes nothing that was already right, and stops carrying what
        // was wrong. The joint stays exact because it is the POSITION that makes
        // a joint, not the angle two rails meet at.
        ...(continues && prevEnd ? { x: r3(prevEnd.x), y: r3(prevEnd.y) } : {}),
      };
      placed.push(piece);
      flatAt.set(piece.id, f.fromPos);
      // The far joint of the piece as actually placed — bend included, since
      // `placedJoints` runs a flex end through `flexRunEnd(length, radius)`.
      const end = jointAt(piece, "b");
      prevEnd = end ? { x: end.x, y: end.y, headingDeg: end.headingDeg } : null;
      prevToPos = f.toPos;
    });
    pieces.push(...placed);
    return placed;
  };

  /**
   * Every turnout sitting ON a track, laid, with its body span — minus any whose
   * mouldings would occupy the same rail.
   *
   * ⚠️⚠️ **TWO TURNOUTS CANNOT SHARE AN INCH OF TRACK, AND NOTHING ELSE NOTICES.**
   * {@link flexPieces} deliberately MERGES overlapping occupied spans, so the
   * flex is cut around the union and the two pieces are simply left intersecting;
   * the walk then threads a path through geometry that cannot exist and emits a
   * module nobody has. FMN-0078 is the case: its scissors crossover puts two
   * turnouts 2.5″ apart, and an Atlas #7 is 6″ long — the rebuild produced two
   * turnouts at 91.9″ and called the crossovers sidings.
   *
   * A real scissors is ONE assembly for exactly this reason. Dropping the pair
   * and saying so leaves a module that is honestly missing its crossover, rather
   * than one that is quietly wrong.
   */
  const turnoutsOn = (trackId: string, hostY: number) => {
    const laid = turnouts
      .filter((t) => t.onTrack === trackId && chosen.has(t.id))
      .map((t) => layTurnout(t, hostY))
      .sort((a, b) => a.span.fromPos - b.span.fromPos);
    const clashed = new Set<string>();
    for (let i = 1; i < laid.length; i += 1) {
      const prev = laid[i - 1];
      const cur = laid[i];
      if (cur.span.fromPos < prev.span.toPos - 1e-6) {
        clashed.add(prev.t.id);
        clashed.add(cur.t.id);
        const gap = Math.abs(cur.t.pos - prev.t.pos);
        const body = prev.span.toPos - prev.span.fromPos;
        // ⭐⭐ IS THIS A CROSSOVER ASSEMBLY? Then the overlap is OUR modelling
        // error, not the owner's track. A double crossover is ONE moulding whose
        // four point-sets sit closer together than four separate turnouts ever
        // could — that is the entire reason it is sold as a single fixture.
        // Telling an owner their turnouts collide would blame them for a real
        // and perfectly ordinary piece of trackwork.
        const asm = trackById.get(cur.t.divergeTrack)?.role === "crossover";
        notLaid.push({
          id: cur.t.divergeTrack,
          why: asm
            ? `this is a crossover — one assembly, not ${gap.toFixed(1)}″ between two separate turnouts. Laying it needs the crossover product itself; pick one on the track and it can be placed as the single piece it is`
            : `${prev.t.name || prev.t.id} and ${cur.t.name || cur.t.id} are ${gap.toFixed(1)}″ apart on the same track, but the turnout chosen is ${body.toFixed(1)}″ long — their mouldings would overlap, so they cannot both be where the document puts them`,
        });
      }
    }
    return laid.filter((l) => !clashed.has(l.t.id));
  };

  /**
   * ⭐⭐ A DOUBLE CROSSOVER IS LAID AS **ONE PIECE** (Will, 2026-07-28).
   *
   * Found by its connectors: crossover-role tracks naming a placeable crossover
   * product. The four turnouts the document lists are the assembly's own
   * point-sets, so they are NOT laid individually — doing that is what made the
   * FMN-0078 rebuild collapse.
   *
   * ⚠️ **THE PRODUCT'S GEOMETRY WINS, AND ITS POSITION IS THE OWNER'S.** A real
   * #6 assembly is 20.14″ with its point-sets 6.54″ apart; a document may record
   * them anywhere. So it is centred on the mean of the recorded positions — the
   * crossover stays where the owner put it — and any discrepancy is reported
   * rather than silently absorbed.
   */
  const assemblies = (() => {
    const out: {
      part: TrackPart;
      geom: NonNullable<ReturnType<typeof crossoverAssembly>>;
      x0: number;
      trackIds: Set<string>;
      turnoutIds: Set<string>;
    }[] = [];
    const byPart = new Map<string, SchematicTrack[]>();
    for (const t of tracks) {
      if (t.role !== "crossover" || !t.crossoverPartId) continue;
      const list = byPart.get(t.crossoverPartId) ?? [];
      list.push(t);
      byPart.set(t.crossoverPartId, list);
    }
    for (const [partId, connectors] of byPart) {
      const part = partById.get(partId);
      if (!part || part.kind !== "crossover" || partGeometryGap(part)) continue;
      const geom = crossoverAssembly(part);
      if (!geom) continue;
      const trackIds = new Set(connectors.map((c) => c.id));
      const mine = turnouts.filter((t) => trackIds.has(t.divergeTrack));
      if (!mine.length) continue;
      const centre = mine.reduce((a, t) => a + t.pos, 0) / mine.length;
      const x0 = centre - geom.lengthInches / 2;
      const spread = Math.max(...mine.map((t) => t.pos)) - Math.min(...mine.map((t) => t.pos));
      if (Math.abs(spread - geom.crossingRunInches) > 0.05)
        warnings.push(
          `this document puts the crossover's point-sets ${spread.toFixed(2)}″ apart, but a ${part.name ?? partId} is ${geom.crossingRunInches.toFixed(2)}″ — the assembly is laid to its own dimensions, centred where the document has it`,
        );
      out.push({ part, geom, x0, trackIds, turnoutIds: new Set(mine.map((t) => t.id)) });
    }
    return out;
  })();
  /** Connectors that belong to an assembly are ITS business, not branches. */
  const assemblyTracks = new Set(assemblies.flatMap((a) => [...a.trackIds]));

  // ── THE MAINS. Both run along the module's axis; Main 2 sits a lane over.
  const main = trackById.get(MAIN_TRACK_ID) ?? tracks.find((t) => t.role === "main");
  if (!main) return refuse("this module's document has no mainline to convert");
  const mains = [main, ...tracks.filter((t) => t.role === "main" && t.id !== main.id)];
  const laidTurnouts = new Map<string, ReturnType<typeof layTurnout>>();
  const done = new Set<string>();

  // The assemblies go down first: they sit ON the mains, so the flex has to be
  // cut around them, and Main 2 has to be brought in to meet them.
  const mainY = laneOffsetAt(mains[0]?.lane ?? 0, 0);
  for (const [i, a] of assemblies.entries()) {
    pieces.push({
      id: `xo-${i}`,
      partId: a.part.id,
      x: r3(a.x0),
      y: mainY,
      rotationDeg: 0,
      ...(a.part.name ? { name: a.part.name } : {}),
    });
  }
  const assemblySpans: OccupiedSpan[] = assemblies.map((a) => ({
    fromPos: a.x0,
    toPos: a.x0 + a.geom.lengthInches,
  }));

  /**
   * ⭐⭐ A MAIN THAT BEGINS AT A TURNOUT is laid as a BRANCH of the one it leaves
   * — a single-to-double transition module, which the standard actively
   * recommends building.
   *
   * ⚠️ Laid here as its own run from endplate A instead, it lands where its
   * turnout cannot reach: the diverging route then goes nowhere, the turnout is
   * dropped, and the module comes out with one main and no turnout at all. It
   * did that silently on FMN-0075. So it is left out of this loop entirely and
   * the branch pass lays it, which already knows how to leave a turnout's
   * diverging end and ease onto a lane.
   *
   * Its `main` ROLE is not lost by that: {@link graphToDoc} promotes the run
   * `start2` points at back to Main 2, whichever way it was reached.
   */
  /**
   * How a second main meets the turnout that opens or closes it — a transition
   * module, which the standard actively recommends building. Two shapes, and
   * both are common in the database:
   *
   * - **`from`** — the main BEGINS at the turnout (single becoming double). It
   *   is left out of this loop entirely; the branch pass lays it, because it
   *   already knows how to leave a diverging end and ease onto a lane.
   * - **`to`** — the main runs from the endplate and ENDS at the turnout (double
   *   becoming single). It is laid here and then CLOSED onto the turnout's
   *   diverging end, exactly as a siding closes onto its far turnout.
   *
   * ⚠️ Laid as a plain run from endplate to endplate, either shape lands where
   * its turnout cannot reach it: the diverging route goes nowhere, the turnout
   * is dropped, and the module comes out with one main and no turnout. It did
   * that silently on FMN-0075.
   */
  const mainIdsAll = new Set(mains.map((m) => m.id));
  const attachment = new Map<string, { sw: SchematicTurnout; at: "from" | "to" }>();
  for (const t of turnouts) {
    const m = mains.find((x) => x.id === t.divergeTrack && x.id !== main.id);
    if (!m) continue;
    const from = m.fromPos ?? 0;
    const to = m.toPos ?? mainLen;
    if (from > 0 && Math.abs(t.pos - from) < 0.01) attachment.set(m.id, { sw: t, at: "from" });
    else if (Math.abs(t.pos - to) < 0.01) attachment.set(m.id, { sw: t, at: "to" });
  }

  /**
   * ⭐⭐ TWO TURNOUTS THAT JOIN THE MAINS TO EACH OTHER, with no connector track
   * recorded between them — ELM Yard's `sw7` on Main 1 → Main 2 and `sw8` on
   * Main 2 → Main 1, six inches apart.
   *
   * ⚠️ **DO NOT ASSUME A MANUFACTURED ASSEMBLY.** It could be a one-piece double
   * crossover, or it could be exactly what it says: two ordinary turnouts with a
   * piece of track between their diverging routes, which is how plenty of people
   * build a crossover. The document does not say, and the difference is real —
   * an assembly is 20″ of moulding at a fixed spacing, a hand-built pair is
   * whatever the builder cut.
   *
   * So the discrete build is the default, because it is what the document
   * literally describes and because it invents least: two turnouts the owner
   * identifies like any other, and a connector cut to fit between them. An owner
   * who DID buy an assembly says so the way FMN-0078 does — by naming a crossover
   * product on a connector track — and {@link crossoverAssembly} takes over.
   *
   * ELM Yard's own numbers back the discrete reading: 6.0″ apart, where a #6
   * assembly's crossing run is 6.75″ and a #5's is 5.63″.
   */
  const mainToMainPairs: { a: SchematicTurnout; b: SchematicTurnout; pairKey: string }[] = [];
  {
    const isMain = (id: string) => mainIdsAll.has(id);
    const used = new Set<string>();
    for (const t of turnouts) {
      if (used.has(t.id) || !isMain(t.onTrack) || !isMain(t.divergeTrack)) continue;
      if (t.onTrack === t.divergeTrack) continue;
      // Its partner runs the other way between the same two mains. Nearest by
      // position, so a module with several crossovers pairs them correctly.
      const partner = turnouts
        .filter(
          (u) =>
            !used.has(u.id) &&
            u.id !== t.id &&
            u.onTrack === t.divergeTrack &&
            u.divergeTrack === t.onTrack,
        )
        .sort((x, y) => Math.abs(x.pos - t.pos) - Math.abs(y.pos - t.pos))[0];
      if (!partner) continue;
      used.add(t.id);
      used.add(partner.id);
      mainToMainPairs.push({
        a: t,
        b: partner,
        pairKey: [t.onTrack, t.divergeTrack].sort().join("↔"),
      });
    }
  }
  /** How many crossings join the same two mains: ONE is a single crossover, TWO
   * is a scissors — and only the scissors raises the assembly question. */
  const crossingsBetween = new Map<string, number>();
  for (const p of mainToMainPairs)
    crossingsBetween.set(p.pairKey, (crossingsBetween.get(p.pairKey) ?? 0) + 1);
  /** Each half of a pair diverges TOWARD the other, which is what makes them a
   * crossover rather than two turnouts pointing away from each other. */
  const divergeFarOverride = new Map<string, number>();
  for (const { a, b } of mainToMainPairs) {
    divergeFarOverride.set(a.id, b.pos);
    divergeFarOverride.set(b.id, a.pos);
  }

  for (const m of mains) {
    if (attachment.get(m.id)?.at === "from") continue;
    const y = laneOffsetAt(m.lane ?? 0, 0);
    const on = turnoutsOn(m.id, y);
    for (const l of on) {
      pieces.push(l.piece);
      laidTurnouts.set(l.t.id, l);
    }
    // A main that ENDS at a turnout is closed onto its diverging end, the way a
    // siding closes onto its far turnout. The turnout itself is already down:
    // it sits on Main 1, which this loop lays first.
    let endPos = m.toPos ?? mainLen;
    const closeAt = attachment.get(m.id);
    if (closeAt?.at === "to") {
      const l = laidTurnouts.get(closeAt.sw.id);
      const fj = l ? jointAt(l.piece, l.divergeId) : null;
      if (fj) {
        const closing = transition(
          `${m.id}-close`,
          { x: fj.x, y: fj.y, headingDeg: fj.headingDeg },
          y,
          -1,
          hostFrameAt(l?.piece, closeAt.sw.onTrack, closeAt.sw.pos),
        );
        if (closing) {
          pieces.push(closing);
          const e = jointAt(closing, "b");
          if (e) endPos = e.x;
        } else endPos = fj.x;
      }
    }
    const laidFlex = layFlex(
      m.id,
      y,
      m.fromPos ?? 0,
      endPos,
      [...on.map((l) => l.span), ...assemblySpans],
      m.flexCuts,
      m.id,
      on.map((l) => ({ span: l.span, piece: l.piece })),
    );
    // ⭐ Now weld the run: bodies and flex together, in the order they sit
    // along the module. Chaining inside `layFlex` closes flex-to-flex; this
    // closes the joins the flex cannot see — turnout to turnout, and the
    // bodies to the flex either side of them.
    if (placeAt)
      chainRun([
        // A BODY keeps the heading its own sample gave it (#304).
        ...on.map((l) => ({ at: l.span.fromPos, piece: l.piece, keepHeading: true })),
        ...laidFlex.map((f) => ({ at: flatAt.get(f.id) ?? 0, piece: f, keepHeading: true })),
      ]);
    /**
     * ⚠️⚠️ **THE PINCH.** A #6 assembly is 1.09″ wide while the mains run
     * {@link FREEMO_TRACK_SPACING_INCHES} apart, so Main 2's rail has to come in
     * 0.035″ to meet it and go back out the other side. In the graph this is not
     * a special case at all — the piece IS 1.09″ wide and the flex bends to
     * reach it, which is exactly what retires `LanePinch`, `laneOffsetAt`'s
     * pinch handling and `PINCH_EASE_INCHES` from the 1-D model.
     *
     * ⚠️ NOT a departure from the standard: §2.0 fixes the spacing AT THE
     * ENDPLATE, and every real double crossover pinches the mains closer.
     */
    if (m !== mains[0]) {
      for (const a of assemblies) {
        const west = a.x0;
        const east = a.x0 + a.geom.lengthInches;
        const target = mainY + a.geom.spacingInches;
        for (const f of laidFlex) {
          const end = f.x + (f.lengthInches ?? 0);
          if (Math.abs(end - west) < 1e-6) aimEndAt(f, { x: west, y: target });
          else if (Math.abs(f.x - east) < 1e-6) {
            f.y = target;
            aimEndAt(f, { x: end, y: y });
          }
        }
      }
    }
    done.add(m.id);
  }

  // An assembly's connectors are already on the board — they are routes THROUGH
  // the piece, not branches hanging off a turnout. Marking them done keeps the
  // final sweep from reporting a crossover that was laid perfectly well.
  for (const id of assemblyTracks) done.add(id);

  // ── THE HAND-BUILT CROSSOVER: a connector cut to fit between two turnouts
  // that face each other across the mains. No part, because there is no part —
  // it is a piece of flex the builder cut, which is the whole point of reading
  // this shape as a discrete build rather than an assembly.
  for (const [i, pair] of mainToMainPairs.entries()) {
    const la = laidTurnouts.get(pair.a.id);
    const lb = laidTurnouts.get(pair.b.id);
    if (!la || !lb) continue;
    const ja = jointAt(la.piece, la.divergeId);
    const jb = jointAt(lb.piece, lb.divergeId);
    if (!ja || !jb) continue;
    const dx = jb.x - ja.x;
    const dy = jb.y - ja.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) {
      notLaid.push({
        id: pair.a.divergeTrack,
        why: `${pair.a.name || pair.a.id} and ${pair.b.name || pair.b.id} meet at the same point, so there is no track between them to lay`,
      });
      continue;
    }
    pieces.push({
      id: `xc-${i}`,
      partId: flexId,
      x: ja.x,
      y: ja.y,
      rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      lengthInches: r3(len),
    });
    /**
     * ⚠️ ONLY A SCISSORS RAISES THE ASSEMBLY QUESTION.
     *
     * A SINGLE crossover simply IS a turnout on each main with a connector
     * between them — there is no one-piece product to have bought instead, so
     * there is nothing to disclose and nothing to correct. Telling an owner to
     * "name the product" would send them looking for a thing that does not
     * exist. (Its hand — RH or LH — is which way it takes you, and like a
     * turnout's it lives at purchase and placement, not in the model.)
     *
     * TWO crossings between the same pair of mains is a double crossover, and
     * that one really might be a single moulding (ADR 0003). Absent a named
     * product the discrete build is the honest default, and THAT is worth
     * saying, because it is a reading of an ambiguous document.
     */
    if ((crossingsBetween.get(pair.pairKey) ?? 1) > 1)
      warnings.push(
        `${pair.a.name || pair.a.id} and ${pair.b.name || pair.b.id} are two of four turnouts crossing between the same pair of mains — a double crossover. They are laid as separate turnouts with a ${len.toFixed(1)}″ piece of track between them, which is what the document describes. If it is really a one-piece double crossover, name the product on a connector track and it will be laid as the single assembly it is.`,
      );
  }

  // ── EVERY OTHER TRACK HANGS OFF A TURNOUT. Laid outward from the mains,
  // repeating until nothing new is reachable — which is how a ladder three
  // turnouts deep resolves without the conversion knowing it is one.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const t of turnouts) {
      if (!done.has(t.onTrack)) continue; // its host is not laid yet
      const branch = trackById.get(t.divergeTrack);
      if (!branch || done.has(branch.id)) continue;
      const near = laidTurnouts.get(t.id);
      if (!near) continue;
      done.add(branch.id);
      progressed = true;

      const dj = jointAt(near.piece, near.divergeId);
      if (!dj) {
        notLaid.push({ id: branch.id, why: `turnout ${t.id} has no diverging end to leave from` });
        continue;
      }
      // A SIDING is the same track reached by a SECOND turnout — and a CROSSOVER
      // is that too, but between the two mains.
      const farSw0 = turnouts.find(
        (o) => o.id !== t.id && o.divergeTrack === branch.id && laidTurnouts.has(o.id),
      );
      const farJoint0 = farSw0
        ? (() => {
            const f = laidTurnouts.get(farSw0.id)!;
            return jointAt(f.piece, f.divergeId);
          })()
        : null;

      // ⭐⭐ A CROSSOVER CONNECTOR NEVER COMES PARALLEL TO A LANE. It runs
      // diagonally from one main to the other, so the transition curve that
      // straightens a siding onto its lane is exactly the wrong shape here — it
      // asked for a 0.3″ radius and then reported the crossover as unbuildable.
      // Straight between the two diverging joints is what a crossover IS, and
      // landing on both by construction is what makes it join at all.
      if (branch.role === "crossover" && farJoint0) {
        const dx = farJoint0.x - dj.x;
        const dy = farJoint0.y - dj.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-6) {
          pieces.push({
            id: `x-${branch.id}`,
            partId: flexId,
            x: dj.x,
            y: dj.y,
            rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
            lengthInches: r3(len),
            ...(branch.trackName ? { name: branch.trackName } : {}),
          });
        } else {
          notLaid.push({
            id: branch.id,
            why: "this crossover's two turnouts meet at the same point, so there is no connector between them to lay",
          });
        }
        continue;
      }

      // ⛔⛔ EVERY PIECE FROM HERE ON IS PROVISIONAL. The run below can still
      // turn out to have no room (see the bail-out further down), and the two
      // transition curves are pushed BEFORE that is known. Left in place they
      // became a module: a track reported in `notLaid` was emitted anyway —
      // FMN-0003's `sid` came out as a 9″ SPUR, plus a `sid-far` the document
      // has never contained. Remember the high-water mark so the bail-out can
      // put `pieces` back exactly as it found it.
      //
      // ⭐ The REPORT IS THE CONSENT SURFACE. The rebuild offer runs this very
      // function to show the owner what they will get, so `notLaid` and the
      // emitted graph disagreeing means they are shown one thing and given
      // another. Same shape as the 2026-07-28 bug, from the other side.
      const laidFrom = pieces.length;
      const branchY = laneOffsetAt(branch.lane ?? 0, 0);
      const curve = transition(
        branch.id,
        { x: dj.x, y: dj.y, headingDeg: dj.headingDeg },
        branchY,
        1,
        hostFrameAt(near.piece, t.onTrack, t.pos),
      );
      let start: Cursor = { x: dj.x, y: dj.y, headingDeg: dj.headingDeg };
      if (curve) {
        pieces.push(curve);
        const e = jointAt(curve, "b");
        if (e) start = { x: e.x, y: e.y, headingDeg: e.headingDeg };
      }

      // A SIDING is the same track reached by a SECOND turnout. Its far end is
      // that turnout's diverging joint, not a position — so the run is closed
      // onto it, the way a builder cuts the last piece to fit.
      const farJoint = farJoint0;
      let endX =
        farJoint != null
          ? farJoint.x
          : Math.max(branch.fromPos ?? t.pos, branch.toPos ?? t.pos);
      /** Where the run has to END, as a POINT — so it can be turned into a
       *  position along this branch rather than used as one. */
      let endPoint: { x: number; y: number } | null =
        farJoint != null ? { x: farJoint.x, y: farJoint.y } : null;
      let farCurve: TrackPiece | null = null;
      if (farJoint) {
        // ⚠️ The joint's heading ALREADY points the way this rail runs — west,
        // out of the far turnout and back down the siding. Reversing it as well
        // as passing `dirSign: -1` flipped it twice and turned an 8° transition
        // into a 172° one.
        farCurve = transition(
          `${branch.id}-far`,
          { x: farJoint.x, y: farJoint.y, headingDeg: farJoint.headingDeg },
          branchY,
          -1,
          // ⚠️ The FAR turnout's host and position, not the near one's — this
          // curve leaves the module at the other end of the siding.
          hostFrameAt(laidTurnouts.get(farSw0!.id)?.piece, farSw0!.onTrack, farSw0!.pos),
        );
        if (farCurve) {
          pieces.push(farCurve);
          const e = jointAt(farCurve, "b");
          if (e) {
            endX = e.x;
            endPoint = { x: e.x, y: e.y };
          }
        }
      }

      // ⚠️ THE MODULE MAY NOT HAVE ROOM FOR WHAT THE OWNER CHOSE. A turnout has
      // a real body and a real transition; a ladder pitched tighter than they
      // need cannot be built from those parts at all. The 1-D model never had to
      // notice — it draws a spur at its lane the instant the turnout appears.
      // Say so rather than lay a run of negative length.
      if (endX - start.x <= 1e-6) {
        // ⛔ Un-lay the transition curves pushed above. Reporting this track as
        // not laid while leaving its opening and closing curves in the graph is
        // what emitted a track the conversion had just refused.
        pieces.length = laidFrom;
        notLaid.push({
          id: branch.id,
          why: `the turnout and the curve bringing this track parallel already reach ${start.x.toFixed(1)}″, past where it has to end at ${endX.toFixed(1)}″ — with the turnout chosen there is no room for this track where the document places it`,
        });
        continue;
      }

      const on = turnoutsOn(branch.id, branchY).filter((l) => {
        if (l.span.fromPos >= start.x - 1e-6) return true;
        notLaid.push({
          id: l.t.divergeTrack,
          why: `turnout ${l.t.id} sits at ${l.t.pos}″ but this track has only reached ${start.x.toFixed(1)}″ by then — the ladder is pitched tighter than the chosen turnout allows`,
        });
        return false;
      });
      for (const l of on) {
        pieces.push(l.piece);
        laidTurnouts.set(l.t.id, l);
      }
      // ⛔⛔ POSITIONS, NOT X-COORDINATES. `layFlex` measures the run and asks
      // the placer where each cut goes, both in inches ALONG the track; handing
      // it the curves' x was silently right on a flat lay and wrong the moment a
      // placer existed. See {@link posOfPoint}.
      const startPos = posOfPoint(branch.id, start, start.x);
      /**
       * ⛔⛔ ONLY A REAL LAID POINT GETS ROUND-TRIPPED (#305).
       *
       * `endPoint` is set when the run CLOSES onto a far turnout — a place on
       * the board, which has to be turned into a position. A spur has no far
       * turnout, and then `endX` is `max(fromPos, toPos)` straight out of the
       * document: **already a position**. Feeding that through a fabricated
       * flat-frame point `{x: endX, y: branchY}` asked where a point that is not
       * on the curve sits on the curve, and the nearest answer is not the right
       * one — FMN-0032's 50° curve laid pbender's recorded 19″ spur as 10.15″.
       *
       * ⭐ Seven inches of an owner's rail, from converting a number that never
       * needed converting.
       */
      const endPos = endPoint ? posOfPoint(branch.id, endPoint, endX) : endX;
      const laidBranch = layFlex(
        branch.id,
        branchY,
        startPos,
        endPos,
        on.map((l) => l.span),
        branch.flexCuts,
        branch.id,
        // ⭐⭐ THE OPENING CURVE IS A BODY THIS RUN BEGINS AGAINST. The first cut
        // has nothing before it to chain from, so it samples the placer's line —
        // while the curve hangs off the turnout AS LAID. Continuing from the
        // curve's own joint closes exactly that difference.
        //
        // ⚠️ THE OPENING CURVE ONLY. `bodies` is for a cut that BEGINS against
        // something; offering the CLOSING curve let a short run's first cut match
        // it and set off backwards down the siding (233° on a 45° board).
        [
          ...on.map((l) => ({ span: l.span, piece: l.piece })),
          ...(curve ? [{ span: { fromPos: dj.x, toPos: startPos }, piece: curve }] : []),
        ],
      );
      if (placeAt) {
        chainRun([
          ...on.map((l) => ({ at: l.span.fromPos, piece: l.piece, keepHeading: true })),
          ...laidBranch.map((f) => ({ at: flatAt.get(f.id) ?? 0, piece: f, keepHeading: true })),
        ]);
        // ⭐ A SIDING IS ANCHORED AT BOTH ENDS, so the run cannot merely be
        // chained forward: the closing curve is pinned where its far turnout
        // puts it, and welding the run onto it would drag it off — the module
        // would then derive two extra SPURS instead of one siding, since a
        // siding is a siding only while BOTH its turnouts reach it. Cut the last
        // length of flex to reach it instead — LENGTH only, never the radius.
        const farEnd = farCurve ? jointAt(farCurve, "b") : null;
        const last = laidBranch[laidBranch.length - 1];
        if (farEnd && last) {
          fitLengthTo(last, farEnd);
          // ⭐⭐ AND THE CLOSING CURVE COMES THE REST OF THE WAY.
          //
          // Cutting the flex closes the ALONG-track error but not the LATERAL
          // one — 0.027″ here — because that is the rigid turnout's own chord
          // across the arc, and the flex is following the line, correctly.
          //
          // Reconciling a rigid part with where the track really runs is the
          // TRANSITION CURVE'S WHOLE JOB — it exists to get from a turnout's
          // diverging rail onto the siding's lane. So it, not the flex, is the
          // piece that should absorb the difference: its radius is derived from
          // the geometry it connects rather than read off the polyline, so
          // adjusting it is not the invention that bending a stretch of plain
          // flex would be.
          const arrived = jointAt(last, "b");
          if (arrived && farCurve) fitEndTo(farCurve, arrived);
        }
      }
    }
  }

  // ⚠️ Anything still unlaid has to be named. A track whose parent could not be
  // laid never gets its turn in the loop above, so without this sweep a ladder
  // that failed at its second turnout would report the second track and stay
  // silent about the third — the owner would be told about part of the loss.
  const orphanWhy = new Map(report.orphanTracks.map((o) => [o.id, o.why]));
  const alreadySaid = new Set(notLaid.map((n) => n.id));
  for (const t of tracks) {
    if (t.role === "main" || done.has(t.id) || alreadySaid.has(t.id)) continue;
    notLaid.push({
      id: t.id,
      why:
        orphanWhy.get(t.id) ??
        "the track it branches from could not be laid, so there is nothing to join it to",
    });
  }

  // ── Where each main begins: the westmost joint sitting in its lane.
  const startOf = (t: SchematicTrack) => {
    const y = laneOffsetAt(t.lane ?? 0, 0);
    let best: { piece: string; joint: string; x: number } | null = null;
    for (const p of pieces)
      for (const j of jointsOf(p)) {
        if (Math.abs(j.y - y) > 0.05) continue;
        if (!best || j.x < best.x) best = { piece: p.id, joint: j.joint, x: j.x };
      }
    return best ? { piece: best.piece, joint: best.joint } : null;
  };
  const startAt = startOf(main);
  if (!startAt) return refuse("nothing was laid on the mainline, so the module has no starting point");
  // ⚠️ WHERE MAIN 2 BEGINS is its turnout's diverging end on a transition
  // module, not a joint out at the endplate — `startOf` looks along a lane and
  // would land mid-run, since the run only reaches that lane after its easement.
  const second = mains[1]
    ? attachment.get(mains[1].id)?.at === "from"
      ? (() => {
          const l = laidTurnouts.get(attachment.get(mains[1].id)!.sw.id);
          return l ? { piece: l.piece.id, joint: l.divergeId } : null;
        })()
      : startOf(mains[1])
    : null;

  const graph = { pieces, startAt, ...(second ? { start2: second } : {}) };

  /**
   * ⭐⭐ **WHAT THE DERIVATION WILL SAY IS PART OF THE PREVIEW.**
   *
   * `docToGraph` only knows what it could not LAY. Whether the laid pieces then
   * make a module is `graphToDoc`'s business, and its warnings were going
   * nowhere — so FMN-0075 converted to a module with no turnout at all behind a
   * preview that promised one and raised nothing. An owner is being asked to
   * consent to a rebuild; they have to be told everything it is going to say.
   */
  const derived = graphToDoc(pieces, {
    startAt,
    start2: second ?? null,
    base: doc,
    library,
  });
  warnings.push(...derived.warnings);

  return { graph, refused: null, notLaid, warnings };
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
/**
 * The module's length in inches for positional work — the authored figure, or
 * the furthest feature when a doc hasn't got one.
 *
 * ⚠️ ONE DEFINITION ON PURPOSE. Everything that turns an inch position into a
 * fraction of the module divides by this; a second copy that disagreed would
 * put two renderings of the same document at different places.
 */
function docLengthInches(doc: ModuleSchematicDoc): number {
  return doc.lengthInches && doc.lengthInches > 0
    ? doc.lengthInches
    : Math.max(
        1,
        ...doc.tracks.map((t) => Math.max(t.fromPos ?? 0, t.toPos ?? 0)),
        ...(doc.turnouts ?? []).map((t) => t.pos),
      );
}

export function moduleFeatures(doc: ModuleSchematicDoc): ModuleFeatures {
  const len = docLengthInches(doc);
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
    /**
     * ⭐⭐ A ROUTE PINNED TO AN ENDPLATE HAS NO FREE CHOICE OF SIDE, so the hand
     * does not get a vote — the same exemption a crossover leg already gets in
     * the canvas ("a side that is determined has nothing for hand to state").
     *
     * ⛔ THIS IS WHY FMN-0068 REPORTED A CROSSING THAT ISN'T THERE. Such a route
     * has a DEGENERATE along-module extent — `fromPos === toPos === 27.8` — so
     * `far - sw.pos` below is **zero**, and the code went on to ask a right-hand
     * turnout which way it throws. It answered "down", giving lane −2, while
     * {@link moduleFeatures}'s own `branchConnectors` read the endplate's
     * `at.side` ("up") and said +2. Two derivations of one fact, disagreeing —
     * and the crossing check believed the wrong one, telling an owner their
     * route crossed Main 2 when it runs the other way entirely.
     *
     * The endplate is the authored fact: the route has to reach it. Reading the
     * side from there makes this agree with `branchConnectors` BY CONSTRUCTION
     * rather than by two functions staying in step.
     */
    const pinnedTo = (doc.endplates ?? []).find((e) => e.trackId === id && e.at);
    if (pinnedTo) {
      lane = (pinnedTo.at!.side === "down" ? -1 : 1) * Math.abs(trk.lane);
      resolving.delete(id);
      resolvedLanes.set(id, lane);
      return lane;
    }
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
      // ⚠️ THE PRIMARY SPOT IS BUILT FIELD BY FIELD HERE, so `cars` has to be
      // named or the owner's figure is silently lost between the doc and the
      // drawing — the third place today where a rebuild dropped a field it did
      // not mention (see docToState's spot mapping).
      { track: ind.track, fromPos: ind.fromPos, toPos: ind.toPos, side: ind.side, cars: ind.cars },
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
        cars: sp.cars ?? null,
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

/**
 * A place where the drawing runs one route straight through another track, and
 * the document never says a crossing is there.
 *
 * A diverging route has to get from its turnout's lane to its own lane, so any
 * track drawn in a lane BETWEEN those two is physically crossed — that is a
 * diamond, real trackwork somebody has to build and a dispatcher has to protect.
 * Today nothing puts it in the document: `crossings` is authored by hand, and
 * `nextLane` stacks a spur outward from Main 1 without looking at which side
 * Main 2 is on, so dropping a turnout on Main 1 quietly draws a route across
 * Main 2 (#FMN-0078, Will 2026-07-30).
 */
export interface ImplicitCrossing {
  /** The turnout whose diverging route does the crossing. */
  turnoutId: string;
  /** The diverging route. */
  trackId: string;
  /** The track it is drawn through. */
  crossesTrackId: string;
  /** The crossed track's DRAWN lane, and the two lanes the route spans. */
  lane: number;
  fromLane: number;
  toLane: number;
  /** Inches from endplate A of the TURNOUT.
   *
   * ⚠️ **NOT the diamond's position.** The crossing lies somewhere between the
   * turnout and where the route reaches its own lane, and how far that is
   * depends on the turnout's lead — a measurement the 1-D document does not
   * carry. Reporting the throat is the most this model honestly knows; naming a
   * spot for the diamond would be inventing one. */
  atInches: number;
}

/**
 * Every crossing the drawing implies that the document doesn't declare.
 *
 * ⭐ **THE LANES COME FROM {@link moduleFeatures}, NOT FROM THE STORED `lane`.**
 * A track's drawn side is resolved from its turnout's HAND (see `resolveLane`),
 * so the same stored lane 3 draws above the mains off a left-hand turnout and
 * below them off a right-hand one — only one of which crosses Main 2. Reading
 * the resolved lanes back off the feature resolver is what makes this agree with
 * the picture by construction, rather than by two functions computing the side
 * the same way and staying in step.
 *
 * Deliberately silent about:
 * - **crossovers** — a connector runs between two adjacent mains, so no track
 *   lies between them;
 * - **a double crossover's scissors** — its two connectors cross each other
 *   inside ONE assembly, which is a part, not a diamond to author (ADR: a double
 *   crossover is one assembly);
 * - **ladder rungs** — a yard track hangs off the track one lane in, so nothing
 *   sits between the two (ELM Yard's mt23/mt24/mt25).
 *
 * A crossing already named in `doc.crossings` is declared and never reported;
 * only the pair of tracks is matched, not the position, because the document
 * doesn't fix where the diamond sits (see {@link ImplicitCrossing.atInches}).
 *
 * ⚠️ **A BRANCH ROUTE CAN CROSS BUT CANNOT BE CROSSED.** A route to a third
 * endplate leaves at 90°, so it has no lane-parallel body for another route to
 * pass through and it isn't among the tracks tested. It is still tested as the
 * crosser — FMN-0068's branch off Main 1 correctly reports crossing Main 2.
 *
 * ✅ **Checked against all 32 production documents (2026-07-30): one report,
 * and it is right.** The throat-coverage rule is what earns that — without it
 * FMN-0012, FMN-0037 and FMN-0040 all report crossings of track that has not
 * begun yet at the point the route leaves (a ladder starts each successive
 * track further along, which is exactly how these were built).
 */
export function implicitCrossings(doc: ModuleSchematicDoc): ImplicitCrossing[] {
  const f = moduleFeatures(doc);
  const len = docLengthInches(doc);
  const frac = (inches: number) => Math.min(1, Math.max(0, inches / len));

  // Everything drawn as a lane-parallel track, at the lane it is DRAWN in.
  // The mains come from the resolver too: Main 2 sits below when the mains are
  // swapped, and a transition module's Main 2 covers only part of the board.
  const spans: { id: string; lane: number; fromFrac: number; toFrac: number }[] = [];
  for (const t of doc.tracks) {
    if (t.role !== "main") continue;
    if (t.id === MAIN2_TRACK_ID) {
      if (f.main2Lane == null) continue;
      spans.push({
        id: t.id,
        lane: f.main2Lane,
        fromFrac: f.main2Extent?.fromFrac ?? 0,
        toFrac: f.main2Extent?.toFrac ?? 1,
      });
    } else {
      spans.push({ id: t.id, lane: 0, fromFrac: 0, toFrac: 1 });
    }
  }
  for (const t of f.extraTracks)
    spans.push({ id: t.id, lane: t.lane, fromFrac: t.fromFrac, toFrac: t.toFrac });

  const declared = (a: string, b: string) =>
    (doc.crossings ?? []).some(
      (x) =>
        (x.tracks?.[0] === a && x.tracks?.[1] === b) ||
        (x.tracks?.[0] === b && x.tracks?.[1] === a),
    );

  const drawnById = new Map(f.turnouts.map((t) => [t.id, t]));
  const out: ImplicitCrossing[] = [];
  for (const sw of doc.turnouts ?? []) {
    const drawn = drawnById.get(sw.id);
    if (!drawn) continue;
    const lo = Math.min(drawn.onLane, drawn.divergeLane);
    const hi = Math.max(drawn.onLane, drawn.divergeLane);
    // Adjacent lanes (or none at all) leave no room for a track in between —
    // which is exactly why a crossover never reports.
    if (hi - lo < 2) continue;
    const at = frac(sw.pos);
    for (const s of spans) {
      if (s.id === sw.onTrack || s.id === sw.divergeTrack) continue;
      if (s.lane <= lo || s.lane >= hi) continue;
      // The route changes lanes at its throat, so a track that isn't there is
      // never crossed — a siding that ends short of the turnout is untouched.
      if (at < Math.min(s.fromFrac, s.toFrac) || at > Math.max(s.fromFrac, s.toFrac)) continue;
      if (declared(sw.divergeTrack, s.id)) continue;
      out.push({
        turnoutId: sw.id,
        trackId: sw.divergeTrack,
        crossesTrackId: s.id,
        lane: s.lane,
        fromLane: drawn.onLane,
        toLane: drawn.divergeLane,
        atInches: sw.pos,
      });
    }
  }
  return out;
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
  /** ⭐ Set when the binding was DERIVED rather than authored — the plate already
   * lay on that edge, so the edge owns it (modulerepo#268). Nothing was stored:
   * reshape the board and this re-resolves, or stops matching and falls back.
   * Callers can use it to say "this plate is part of your benchwork" without
   * claiming the owner chose the edge. */
  edgeDerived?: boolean;
  /** Set when the module HAS benchwork but this plate lies on none of its edges —
   * so the board and the plate disagree. Reported, never corrected. */
  offBenchwork?: boolean;
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

/**
 * ⭐⭐ THE SPAN A PLATE OF `widthInches` OCCUPIES ON A BENCHWORK EDGE, centred
 * where it currently sits (modulerepo#275).
 *
 * Will, 2026-08-01: *"The whole edge is the endplate regardless of what endplate
 * number or letter it is… The Endplate can be the same or smaller size than the
 * edge."* An endplate occupies a SPAN of an edge — the whole of it or part —
 * with no special case by letter. Binding a plate must therefore keep the width
 * the owner authored rather than widening it to swallow the edge, which is what
 * `{index}` alone does (absent `fromT`/`toT` means 0→1).
 *
 * ⭐ ONE DEFINITION, TWO CALLERS: the derived binding in `deriveEndplatePoses`
 * and the editor's own "which edge is this?" control. Computing this in both
 * places is precisely the drift this codebase keeps paying for.
 *
 * Returns null when the edge is missing, curved, or degenerate — never a guess.
 */
/**
 * ⭐⭐ THE SPAN A PLATE OCCUPIES WHEN THE OWNER SAYS WHERE IT STARTS (#275).
 *
 * The sibling {@link endplateSpanOnEdge} centres the span on wherever the plate
 * already sits, which is right when BINDING one — it keeps the plate where it
 * is and only stops it swallowing the edge. It is not enough for authoring:
 * Will, 2026-08-01, *"This should be allowed to be set for where it starts on
 * the edge and where it ends."* Centre-on-current-position cannot express that.
 *
 * `startInches` is measured from the edge's FIRST vertex (`outline[index]`),
 * which is what a modeller reads off the board with a tape.
 *
 * ⛔ CLAMPED, NEVER SILENTLY RESIZED. A start that would push the plate past
 * the end of the edge slides it back so the whole face stays ON the edge, and
 * the WIDTH is preserved — a plate is a physical object and does not shrink
 * because it was placed badly. When the edge is too short for the width at all,
 * this returns null rather than a plate that does not fit
 * ([[flagged-never-corrected]]: say so, don't quietly resize).
 *
 * Returns null for a missing, curved or degenerate edge — same refusals as its
 * sibling, for the same reason (§2.0: an endplate face is straight).
 */
export function endplateSpanFromStart(
  outline: BenchworkPoint[] | null | undefined,
  index: number,
  startInches: number,
  widthInches: number,
): { fromT: number; toT: number } | null {
  if (!outline || outline.length < 3 || !(widthInches > 0)) return null;
  if (!Number.isFinite(startInches)) return null;
  const n = outline.length;
  const i = Math.trunc(index);
  if (!Number.isFinite(i) || i < 0 || i >= n) return null;
  const a = outline[i];
  const b = outline[(i + 1) % n];
  if (a.bulge) return null; // a curved fascia is not an endplate face (§2.0)
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 0)) return null;
  // The edge cannot hold this plate at all — a fact worth reporting, not one to
  // paper over by returning a narrower plate than the owner authored.
  if (widthInches > len) return null;
  const maxStart = len - widthInches;
  const start = Math.max(0, Math.min(maxStart, startInches));
  return { fromT: start / len, toT: (start + widthInches) / len };
}

/** The length of one benchwork edge, inches — what the owner is measuring
 * against when they say where a plate starts. Null for a missing, curved or
 * degenerate edge, matching the span helpers' refusals. */
export function benchworkEdgeLength(
  outline: BenchworkPoint[] | null | undefined,
  index: number,
): number | null {
  if (!outline || outline.length < 3) return null;
  const n = outline.length;
  const i = Math.trunc(index);
  if (!Number.isFinite(i) || i < 0 || i >= n) return null;
  const a = outline[i];
  const b = outline[(i + 1) % n];
  if (a.bulge) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len > 0 ? len : null;
}

export function endplateSpanOnEdge(
  outline: BenchworkPoint[] | null | undefined,
  index: number,
  at: { x: number; y: number },
  widthInches: number,
): { fromT: number; toT: number } | null {
  if (!outline || outline.length < 3 || !(widthInches > 0)) return null;
  const n = outline.length;
  const i = Math.trunc(index);
  if (!Number.isFinite(i) || i < 0 || i >= n) return null;
  const a = outline[i];
  const b = outline[(i + 1) % n];
  if (a.bulge) return null; // a curved fascia is not an endplate face (§2.0)
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return null;
  // Where the plate's CENTRE sits along the edge.
  const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (len * len)));
  /**
   * ⭐⭐ DELEGATED, SO THE TWO HELPERS CANNOT DISAGREE (modulerepo#321).
   *
   * This used to clamp `t ± half` into 0…1 itself, which SHRINKS a plate that
   * overhangs an end — a 24″ plate near a corner came back as 18″, silently,
   * and the panel then validated a width the board was not building. Its
   * sibling had always done the opposite: slide the plate back on with its
   * width intact, and refuse outright when the edge cannot hold it.
   *
   * Two answers to one question is the drift this file's own comment warns
   * about ("computing this in both places is precisely the drift this codebase
   * keeps paying for"). So the position is turned into a START and handed to
   * {@link endplateSpanFromStart}: one definition, one behaviour.
   *
   * ⛔ A PLATE IS A PHYSICAL OBJECT. It does not get narrower because of where
   * it was dropped, so an overhang moves it; only an edge that genuinely cannot
   * hold the width is refused, and that refusal is the caller's to report.
   */
  return endplateSpanFromStart(outline, index, t * len - widthInches / 2, widthInches);
}

/**
 * ⭐⭐ THE MODULE'S LENGTH, READ OFF ITS BENCHWORK (modulerepo#268).
 *
 * Will, 2026-08-01: *"benchwork edges own the endplates"* — and the last of the
 * circularity is that `lengthInches` POSITIONS endplate B while dragging
 * endplate B SETS `lengthInches`. The cure is for the length to be a readout of
 * the board: the distance from endplate A's face to endplate B's.
 *
 * ⚠️ RETURNS null UNLESS THE BENCHWORK ACTUALLY DEFINES BOTH ENDS. That is what
 * keeps this from being circular all over again: a plate that is only *derived*
 * onto an edge got there from `lengthInches`, so measuring between two such
 * plates would just hand the same number back. Both ends must be **authored**
 * edge bindings — the owner saying "this edge is my endplate" — for the board to
 * have an opinion of its own. Anything else keeps the authored length.
 *
 * ⭐ AND IT IS THE FACE-TO-FACE DISTANCE, NOT A FASCIA LENGTH. FMN-0078 is
 * tapered: its fasciae run 96.333″ while its ends are 96″ apart. A module's
 * length is how far it is from one neighbour to the next, which is the ends —
 * nobody measures a module along its side rail.
 */
export function benchworkLengthInches(input: {
  outline?: BenchworkPoint[] | null;
  sections?: SchematicSection[] | null;
  endplateEdges?: Record<string, EndplateEdge> | null;
}): number | null {
  const edges = input.endplateEdges;
  if (!edges) return null;
  const a = edges["A"];
  const b = edges["B"];
  if (!a || !b) return null;
  const outlineFor = (e: EndplateEdge) =>
    (e.section ? input.sections?.find((s) => s.id === e.section)?.outline : input.outline) ??
    input.outline;
  const pa = endplateEdgePose(outlineFor(a), a);
  const pb = endplateEdgePose(outlineFor(b), b);
  if (!pa || !pb) return null;
  const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  return d > 0 ? Math.round(d * 1000) / 1000 : null;
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
  /**
   * ⭐⭐ THE BENCHWORK EDGE THIS PLATE ALREADY SITS ON (Will, 2026-08-01,
   * modulerepo#268: *"benchwork edges own the endplates"*).
   *
   * Nothing in the catalogue carries an authored `endplateEdges` binding — 0 of
   * 32 — so "the edge owns the plate" cannot mean "read the binding" without
   * stranding every existing module. It is DERIVED instead: if a plate's face
   * already lies along a straight benchwork edge, facing the same way out, then
   * that edge IS where the plate is, and the plate should be read off it.
   *
   * ⭐ THE SAFETY PROPERTY IS THE MATCHING RULE ITSELF. A match requires the
   * plate and the edge to AGREE — same point, same outward heading — so binding
   * moves nothing today. What changes is tomorrow: reshape the board and the
   * plate follows it, instead of staying where a stale `lengthInches` put it.
   * ⚠️ A derivation, NOT a stored pin. Nothing is written; if the board changes
   * so the plate no longer lies on any edge, the match simply stops matching
   * and the caller can say so — the failure mode #182's stale poses had.
   *
   * The span comes from the plate's OWN width, centred where it sits, so
   * binding never widens a plate to swallow its whole edge (modulerepo#275).
   */
  const edgeUnderPose = (p: EndplatePose, widthInches: number): EndplateEdge | null => {
    const ring = geo.outline;
    if (!ring || ring.length < 3 || !(widthInches > 0)) return null;
    const n = ring.length;
    let cx = 0;
    let cy = 0;
    for (const v of ring) {
      cx += v.x;
      cy += v.y;
    }
    cx /= n;
    cy /= n;
    const POS_EPS = 0.5; // inches off the edge line / past its ends
    const DIR_EPS = Math.cos(5 * DEG); // 5° of heading disagreement
    const hx = Math.cos(p.heading * DEG);
    const hy = Math.sin(p.heading * DEG);
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      if (a.bulge) continue; // a curved fascia is never an endplate face (§2.0)
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (!(len > 0)) continue;
      const ex = dx / len;
      const ey = dy / len;
      // Outward normal, away from the centroid — the same rule the resolver and
      // `snapPoseToOutline` use, so a derived binding and a dragged plate agree.
      let nx = ey;
      let ny = -ex;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (hx * nx + hy * ny < DIR_EPS) continue; // faces a different way out
      // Where the plate sits along the edge, and how far off its line.
      const t = ((p.x - a.x) * ex + (p.y - a.y) * ey) / len;
      const off = (p.x - a.x) * nx + (p.y - a.y) * ny;
      if (Math.abs(off) > POS_EPS) continue;
      if (t < -POS_EPS / len || t > 1 + POS_EPS / len) continue;
      // Keep the plate's own width; centre the span on where it actually is.
      // ⭐ Via the shared helper, so a derived binding and one the owner makes
      // from the editor's control compute the SAME span (modulerepo#275).
      const span = endplateSpanOnEdge(ring, i, p, widthInches);
      if (!span) continue;
      return { index: i, ...span };
    }
    return null;
  };

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
      //
      // ⛔⛔ AND DO NOT QUIETLY DERIVE A DIFFERENT ONE. The owner named this edge;
      // if it stopped resolving, that is the thing to report. Substituting
      // whichever edge the plate happens to lie on would repair their broken
      // binding behind their back and hide it — flag, don't correct
      // (#190/#193/#275). An existing test caught exactly this.
      return p;
    }
    // ⚠️ A HAND-PLACED POSE OUTRANKS A DERIVED BINDING. The owner put it there
    // deliberately; a derived binding is only an inference about where it
    // already is. Manual authority above inference — an authored `endplateEdges`
    // entry still beats both, because that IS the owner choosing the edge.
    const o = geo.poseOverrides?.[p.id];
    if (o) return { ...p, x: o.x, y: o.y, heading: norm360(o.heading), manual: true };

    // ⭐ Otherwise: does this plate already sit on a benchwork edge? Then the
    // edge owns it (#268). Matching requires agreement, so this moves nothing
    // today — it makes the plate follow the board when the board changes.
    const w =
      p.widthInches ??
      endplateWidthFor(geo.endplateWidths, p.id) ??
      FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES;
    const found = edgeUnderPose(p, w);
    if (found) {
      const e = endplateEdgePose(geo.outline, found);
      if (e)
        return {
          ...p,
          x: e.x,
          y: e.y,
          heading: e.heading,
          widthInches: e.widthInches,
          face: e.face,
          boundToEdge: true,
          edgeDerived: true,
        };
    }
    // The module has benchwork and this plate is on none of it. Say so; never
    // move the plate onto the board (flag, don't correct — #190/#193/#275).
    const hasBenchwork = (geo.outline?.length ?? 0) >= 3;
    return hasBenchwork ? { ...p, offBenchwork: true } : p;
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
