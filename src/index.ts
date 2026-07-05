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
  id: string; // "A" (West) | "B" (East)
  label?: string | null;
  tracks?: SchematicEndplateTrack[];
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
}
export interface SchematicTurnout {
  id: string;
  pos: number;
  onTrack: string;
  divergeTrack: string;
  kind?: TurnoutKind;
  name?: string | null;
  address?: string | null;
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
/**
 * A control point is an interlocking: a named group of one or more signals and
 * zero or more turnouts. A passing siding has two (West/East); a lone block
 * signal is a control point with one signal and no turnouts.
 */
export interface SchematicControlPoint {
  id: string;
  name?: string | null;
  turnouts?: string[];
  signals?: SchematicSignal[];
}
export interface ModuleSchematicDoc {
  version: number;
  module?: string;
  lengthInches?: number;
  endplates: SchematicEndplate[];
  tracks: SchematicTrack[];
  turnouts?: SchematicTurnout[];
  controlPoints?: SchematicControlPoint[];
  /** @deprecated pre-grouping flat signals; read for back-compat. */
  signals?: SchematicSignal[];
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
  signals: EditorCpSignal[];
}
export interface EditorState {
  lengthInches: number;
  configA: TrackConfig;
  configB: TrackConfig;
  extraTracks: EditorTrack[]; // sidings/spurs/…; the main track is implicit
  turnouts: EditorTurnout[];
  controlPoints: EditorControlPoint[];
}

/** Build the empty editor state for a module of the given length. */
export function emptyEditorState(lengthInches: number): EditorState {
  return {
    lengthInches: lengthInches > 0 ? lengthInches : 24,
    configA: "single",
    configB: "single",
    extraTracks: [],
    turnouts: [],
    controlPoints: [],
  };
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
    endplates: [
      { id: "A", label: "West", tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configA }] },
      { id: "B", label: "East", tracks: [{ trackId: MAIN_TRACK_ID, lane: 0, config: state.configB }] },
    ],
    tracks: [
      { id: MAIN_TRACK_ID, role: "main" as const, lane: 0, from: "A", to: "B" },
      // Double track: Main 2 is a real entity so turnouts/signals can attach.
      ...(state.configA === "double" || state.configB === "double"
        ? [{ id: MAIN2_TRACK_ID, role: "main" as const, lane: 1, from: "A", to: "B" }]
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
      })),
    ],
    turnouts: state.turnouts.map((t) => ({
      id: t.id,
      pos: t.pos,
      onTrack: t.onTrack,
      divergeTrack: t.divergeTrack,
      kind: t.kind,
      name: t.name || undefined,
    })),
    controlPoints: state.controlPoints.map((c) => ({
      id: c.id,
      name: c.name,
      turnouts: c.turnouts,
      signals: c.signals.map((s) => ({
        id: s.id,
        pos: s.pos,
        track: s.track,
        facing: s.facing,
        kind: "mast" as const,
        side: s.side,
      })),
    })),
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
  return {
    lengthInches: len,
    configA: configOf("A"),
    configB: configOf("B"),
    extraTracks,
    turnouts: (d!.turnouts ?? []).map((t) => ({
      id: t.id,
      name: t.name ?? "",
      pos: sc(t.pos),
      onTrack: t.onTrack,
      divergeTrack: t.divergeTrack,
      kind: (t.kind as TurnoutKind) ?? "right",
    })),
    controlPoints: readControlPoints(d!, sc),
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
  const turnouts: EditorTurnout[] = [
    { id: swW, name: "West Siding", pos: fromPos, onTrack: MAIN_TRACK_ID, divergeTrack: sidId, kind: "right" },
    { id: swE, name: "East Siding", pos: toPos, onTrack: MAIN_TRACK_ID, divergeTrack: sidId, kind: "left" },
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
}
export interface ModuleFeatures {
  /** Whether either endplate declares a double-track main. */
  doubleMain: boolean;
  /** Non-main tracks (sidings/spurs/yard/crossover). */
  extraTracks: DrawTrack[];
  turnouts: DrawTurnout[];
  signals: DrawSignal[];
  /** Lane extents across every feature (mains included; negative = outside
   * Main 1). Renderers size their vertical space from these. */
  laneMin: number;
  laneMax: number;
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

  const extraTracks: DrawTrack[] = [];
  for (const t of doc.tracks) {
    if (t.role === "main") continue; // the spine draws mains
    const from = t.fromPos ?? posOf(t.from);
    const to = t.toPos ?? posOf(t.to);
    if (from == null || to == null) continue; // can't place it
    extraTracks.push({
      id: t.id,
      role: t.role,
      lane: t.lane,
      fromFrac: clampFrac(Math.min(from, to)),
      toFrac: clampFrac(Math.max(from, to)),
      capacityFeet: t.capacityFeet ?? null,
      divergesFromLane: divergeOrigin(t.id),
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
  });
  // Signals come from control-point groups; fall back to pre-grouping flat
  // signals for docs authored before the model changed.
  const signals: DrawSignal[] = Array.isArray(doc.controlPoints)
    ? doc.controlPoints.flatMap((c) =>
        (c.signals ?? []).map((s) => drawSignal(s, c.name ?? "", c.id)),
      )
    : (doc.signals ?? []).map((s) => drawSignal(s, s.name ?? ""));

  const allLanes = [
    0,
    doubleMain ? 1 : 0,
    ...extraTracks.map((t) => t.lane),
    ...signals.map((s) => s.lane),
  ];
  return {
    doubleMain,
    extraTracks,
    turnouts,
    signals,
    laneMin: Math.min(...allLanes),
    laneMax: Math.max(...allLanes),
  };
}
