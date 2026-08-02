import { describe, it, expect } from "vitest";
import {
  asModuleSchematic,
  moduleFeatures,
  inchesToScaleFeet,
  scaleFeetToInches,
  nextId,
  emptyEditorState,
  moduleSections,
  sectionFootprints,
  sectionSpans,
  sectionBreaksFromSections,
  sectionedCenterline,
  sliceCenterline,
  sectionBand,
  sectionSpansOrWhole,
  toSectionRelative,
  fromSectionRelative,
  remapPos,
  WHOLE_MODULE_SECTION_ID,
  sectionAdjacency,
  sectionNeighbours,
  sectionComponents,
  sectionedEndPose,
  moduleFeatures,
  implicitCrossings,
  MAIN_TRACK_ID,
  MAIN2_TRACK_ID,
  moduleLengthFromSections,
  moduleCenterline,
  stateToDoc,
  docToState,
  buildPassingSiding,
  buildTransition,
  buildCrossover,
  divergeSideForHand,
  isTransitionTurnout,
  endplateWidthInches,
  FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  benchworkOutline,
  sampleBenchworkOutline,
  samplePath,
  pathLengthInches,
  measuredAlongPath,
  turnoutDivergingLeg,
  RAIL_GAUGE_INCHES,
  trackPath,
  carCapacity,
  N_CAR_LENGTH_INCHES,
  moduleFootprint,
  checkEndplateWidth,
  endplateCentreOffsetInches,
  endplateTrackOffsetInches,
  endplateCentreOffsetInches,
  moduleCenterline,
  MAIN_TRACK_ID,
  MAIN2_TRACK_ID,
  deriveEndplatePoses,
  benchworkLengthInches,
  endplateSpanOnEdge,
  poseNeedsManual,
  hasNoFarEndplate,
  poseOverridesFromDoc,
  endplateLead,
  trackMeetsEndplateIssues,
  ENDPLATE_LEAD_INCHES,
  returnLoop,
  turnoutClosure,
  RAIL_GAUGE_INCHES,
  TURNOUT_LEAD_INCHES_PER_FROG,
  ATLAS_CODE55_N,
  BUILT_IN_TRACK_PARTS,
  JOINT_SNAP_INCHES,
  placedJoints,
  type PlaceOnTrack,
  trackPart,
  turnoutPartForSize,
  partExtent,
  partExtentForSize,
  pastFrogInchesForSize,
  storedPartToTrackPart,
  mergeStoredParts,
  leadInchesForSize,
  parseXtpLibrary,
  samplePartSegments,
  importedPartToTrackPart,
  mergeImportedParts,
  frogNumberFromName,
  partOutlineAtFrog,
  type ImportedPart,
  type PartSegment,
  type ReturnLoopShape,
  type ModuleSchematicDoc,
  flexPieces,
  flexUsage,
  spanOverhang,
  carCapacity,
  assessSectionEnd,
  assessSectionJoint,
  FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES,
  usableCapacity,
  clearancePointPastFrogInches,
  CLEARANCE_SPACING_INCHES,
  FREEMO_TRACK_SPACING_INCHES,
  partGeometry,
  buildTrackGraph,
  graphToDoc,
  insertIntoRun,
  BUMPER_DRAWN_INCHES,
  sectionalArcInches,
  TRACK_PART_KINDS,
  flexRunEnd,
  pieceHand,
  piecePartNumber,
  fitFlexBetween,
  JOINT_SNAP_INCHES,
  pieceRoutePaths,
  snapPiece,
  deriveGraphDoc,
  type GraphAnchor,
  walkTrackGraph,
  placedJoints,
  type TrackPiece,
  endplateEdgePose,
  partGeometryGap,
  partsPlaceable,
  laneOffsetAt,
  crossoverPinches,
  PINCH_EASE_INCHES,
  type LanePinch,
  turnoutClosure,
  leadInchesForSize,
  partExtent,
  leadInchesForSize,
  resizeFlexPiece,
  flexParts,
  flexPartFor,
  maxFlexPieceInches,
  DEFAULT_FLEX_PART_ID,
  moduleConversionReport,
  docToGraph,
  genericTurnoutPart,
  genericCrossingPart,
  crossingAngleDeg,
  crossingClearanceHalfInches,
  CLEARANCE_SPACING_INCHES,
  partGeometry,
  partGeometryGap,
  partExtent,
  placedJoints,
  crossoverAssembly,
  turnoutOccupiedSpan,
  type ConversionAnswers,
  type SchematicTurnout,
} from "./index";

/** Round to hundredths for readable span/length assertions. */
const round2 = (v: number) => Math.round(v * 100) / 100;

describe("asModuleSchematic", () => {
  it("accepts a well-formed doc and rejects everything else", () => {
    const good = { version: 1, endplates: [], tracks: [] };
    expect(asModuleSchematic(good)).toBe(good);
    expect(asModuleSchematic(null)).toBeNull();
    expect(asModuleSchematic("x")).toBeNull();
    expect(asModuleSchematic({ version: "1", endplates: [], tracks: [] })).toBeNull();
    expect(asModuleSchematic({ version: 1, tracks: [] })).toBeNull();
  });
});

describe("N-scale helpers", () => {
  it("396in = 5280 scale feet (one mile) and round-trips", () => {
    expect(inchesToScaleFeet(396)).toBe(5280);
    expect(scaleFeetToInches(5280)).toBe(396);
    expect(Math.round(scaleFeetToInches(inchesToScaleFeet(240)))).toBe(240);
  });
});

describe("nextId", () => {
  it("skips ids already present", () => {
    expect(nextId("sw", [])).toBe("sw1");
    expect(nextId("sw", ["sw1", "sw2"])).toBe("sw3");
    expect(nextId("cp", ["cp2"])).toBe("cp1");
  });
});

const oneMile: ModuleSchematicDoc = {
  version: 1,
  module: "FMN-0010",
  lengthInches: 396,
  endplates: [
    { id: "A", label: "West", tracks: [{ trackId: "main", lane: 0, config: "single" }] },
    { id: "B", label: "East", tracks: [{ trackId: "main", lane: 0, config: "single" }] },
  ],
  tracks: [
    { id: "main", role: "main", lane: 0, from: "A", to: "B" },
    { id: "sid1", role: "siding", lane: 1, fromPos: 40, toPos: 356, capacityFeet: 4213 },
  ],
  turnouts: [
    // Siding above the main: west turnout throws left, east throws right (both
    // resolve to the same "above" side — divergeSideForHand / #bug1).
    { id: "sw1", pos: 40, onTrack: "main", divergeTrack: "sid1", kind: "left" },
    { id: "sw2", pos: 356, onTrack: "main", divergeTrack: "sid1", kind: "right" },
  ],
  controlPoints: [
    {
      id: "cpW",
      name: "West Siding",
      turnouts: ["sw1"],
      signals: [{ id: "cpW-AtoB", pos: 40, track: "main", facing: "AtoB", side: "above" }],
    },
    {
      id: "cpE",
      name: "East Siding",
      turnouts: ["sw2"],
      signals: [{ id: "cpE-BtoA", pos: 356, track: "main", facing: "BtoA", side: "below" }],
    },
  ],
};

describe("moduleFeatures", () => {
  it("positions tracks/turnouts/signals as fractions of the module length", () => {
    const f = moduleFeatures(oneMile);
    expect(f.doubleMain).toBe(false);
    expect(f.extraTracks).toHaveLength(1);
    expect(f.extraTracks[0]).toMatchObject({ role: "siding", lane: 1, capacityFeet: 4213 });
    expect(f.extraTracks[0].fromFrac).toBeCloseTo(40 / 396);
    expect(f.extraTracks[0].toFrac).toBeCloseTo(356 / 396);
    expect(f.turnouts.map((t) => t.posFrac)).toEqual([40 / 396, 356 / 396]);
    // signals flattened out of control points, carrying the CP name/id + side
    expect(f.signals).toHaveLength(2);
    expect(f.signals[0]).toMatchObject({ name: "West Siding", facing: "AtoB", side: "above", lane: 0, cp: "cpW" });
    expect(f.signals[1]).toMatchObject({ name: "East Siding", facing: "BtoA", side: "below", cp: "cpE" });
  });

  it("reports a double main from the endplate config", () => {
    const dbl = { ...oneMile, endplates: [
      { id: "A", tracks: [{ trackId: "main", lane: 0, config: "double" as const }] },
      { id: "B", tracks: [{ trackId: "main", lane: 0, config: "single" as const }] },
    ] };
    expect(moduleFeatures(dbl).doubleMain).toBe(true);
  });

  it("falls back to flat signals and defaults a signal with no track to lane 0", () => {
    const legacy: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 100,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [{ id: "main", role: "main", lane: 0 }],
      signals: [{ id: "s1", pos: 50, facing: "AtoB", name: "Home" }],
    };
    const f = moduleFeatures(legacy);
    expect(f.signals).toEqual([
      { id: "s1", name: "Home", posFrac: 0.5, lane: 0, facing: "AtoB", side: "above", stack: 0 },
    ]);
  });

  it("stacks signals that share a lane+side+position so they don't overlap", () => {
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [{ id: "main", role: "main", lane: 0 }],
      controlPoints: [
        {
          id: "cp1",
          name: "Bridge",
          turnouts: [],
          signals: [
            { id: "a1", pos: 48, track: "main", facing: "AtoB", side: "above" },
            { id: "a2", pos: 48, track: "main", facing: "AtoB", side: "above" }, // same spot
            { id: "b1", pos: 48, track: "main", facing: "BtoA", side: "below" },
          ],
        },
      ],
    };
    const stacks = Object.fromEntries(moduleFeatures(doc).signals.map((s) => [s.id, s.stack]));
    expect(stacks).toEqual({ a1: 0, a2: 1, b1: 0 }); // a2 fans out; b1 (other side) stays 0
  });

  it("clamps out-of-range positions into [0,1]", () => {
    const f = moduleFeatures({
      ...oneMile,
      turnouts: [{ id: "x", pos: 999, onTrack: "main", divergeTrack: "sid1" }],
    });
    expect(f.turnouts[0].posFrac).toBe(1);
  });
});

describe("endplate face width (#per-endplate authoring)", () => {
  it("defaults to the recommended width when unauthored", () => {
    expect(endplateWidthInches(undefined)).toBe(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES);
    expect(endplateWidthInches({})).toBe(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES);
    expect(endplateWidthInches({ widthInches: 0 })).toBe(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES);
    expect(endplateWidthInches({ widthInches: null })).toBe(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES);
    expect(endplateWidthInches({ widthInches: 12 })).toBe(12);
  });

  it("stateToDoc emits authored widths per endplate; absent ends stay bare", () => {
    const s = { ...emptyEditorState(96), endplateWidths: { A: 12, B: 24 } };
    const doc = stateToDoc(s, "M");
    const byId = Object.fromEntries(doc.endplates.map((e) => [e.id, e]));
    expect(byId.A.widthInches).toBe(12);
    expect(byId.B.widthInches).toBe(24);

    const bare = stateToDoc(emptyEditorState(96), "M");
    expect(bare.endplates.every((e) => e.widthInches === undefined)).toBe(true);
  });

  // Binds a drawn turnout to real part geometry. An unsaved field is how a doc
  // contract addition silently fails, so both directions are pinned.
  it("round-trips a turnout's partId, and omits it when absent", () => {
    const base = emptyEditorState(96);
    const turnout = {
      id: "sw1",
      pos: 24,
      onTrack: MAIN_TRACK_ID,
      divergeTrack: "sid1",
      kind: "right" as const,
      size: 7,
    };
    const withPart = stateToDoc(
      { ...base, turnouts: [{ ...turnout, partId: "atlas-c55-n-7" }] },
      "M",
    );
    expect(withPart.turnouts[0].partId).toBe("atlas-c55-n-7");
    expect(docToState(withPart, 96).turnouts[0].partId).toBe("atlas-c55-n-7");

    // A turnout that names no part stays bare — every turnout authored before
    // the parts library existed is exactly that, and must not gain a key.
    const bare = stateToDoc({ ...base, turnouts: [turnout] }, "M");
    expect("partId" in bare.turnouts[0]).toBe(false);
    expect(docToState(bare, 96).turnouts[0].partId).toBeUndefined();
  });

  // #120: the module detail page's Endplates section is going away, so naming
  // an end has to work in the builder. It could not: stateToDoc wrote the
  // constant "West"/"East" over whatever the owner had typed.
  it("round-trips the owner's name for endplate A/B", () => {
    const doc = stateToDoc(
      { ...emptyEditorState(96), endplateLabels: { A: "UP Spokane N", B: "MR Plummer W" } },
      "M",
    );
    const byId = Object.fromEntries(doc.endplates.map((e) => [e.id, e]));
    expect(byId.A.label).toBe("UP Spokane N");
    expect(byId.B.label).toBe("MR Plummer W");
    expect(docToState(doc, 96).endplateLabels).toEqual({
      A: "UP Spokane N",
      B: "MR Plummer W",
    });
  });

  it("an unnamed end keeps its default word, and does not become an authored name", () => {
    const bare = stateToDoc(emptyEditorState(96), "M");
    const byId = Object.fromEntries(bare.endplates.map((e) => [e.id, e]));
    expect(byId.A.label).toBe("West");
    expect(byId.B.label).toBe("East");
    // ⭐ THE POINT OF THIS TEST. Every doc ever saved carries "West"/"East", so
    // reading the label back unconditionally would mark all 42 modules as
    // having named their ends — a default silently promoted to an override,
    // which is exactly what #182 fixed for poses.
    expect(docToState(bare, 96).endplateLabels).toEqual({});
  });

  it("a loop's default words are its own, and blank names never blank a label", () => {
    const loop = { ...emptyEditorState(96), loop: true };
    const doc = stateToDoc(loop, "M");
    expect(doc.endplates[0].label).toBe("Entry");
    expect(docToState(doc, 96).endplateLabels).toEqual({});

    // A blank/whitespace entry means "unnamed", not "erase the label" — an end
    // with no name has always read as Entry/West on the board.
    const blank = stateToDoc({ ...loop, endplateLabels: { A: "   " } }, "M");
    expect(blank.endplates[0].label).toBe("Entry");
  });

  it("round-trips authored widths through docToState (unscaled by length)", () => {
    const doc = stateToDoc(
      { ...emptyEditorState(96), endplateWidths: { A: 18 } },
      "M",
    );
    // Reopen at a different module length — width is a cross-track size, so it
    // must NOT rescale the way positions do.
    const state = docToState(doc, 48);
    expect(state.endplateWidths).toEqual({ A: 18 });
  });
});

describe("benchwork outline (#benchwork authoring)", () => {
  const ring = [
    { x: 0, y: -12 },
    { x: 96, y: -12 },
    { x: 96, y: 12 },
    { x: 0, y: 12 },
  ];

  it("benchworkOutline needs ≥3 valid points, else null", () => {
    expect(benchworkOutline(null)).toBeNull();
    expect(benchworkOutline({})).toBeNull();
    expect(benchworkOutline({ outline: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBeNull();
    expect(benchworkOutline({ outline: ring })).toEqual(ring);
    // junk points are dropped
    expect(
      benchworkOutline({ outline: [...ring, { x: NaN, y: 0 }] as never }),
    ).toEqual(ring);
  });

  it("stateToDoc emits the outline only for a real ring; docToState reads it back unscaled", () => {
    const doc = stateToDoc({ ...emptyEditorState(96), outline: ring }, "M");
    expect(doc.outline).toEqual(ring);
    // reopen at a different module length — the physical board must NOT rescale.
    expect(docToState(doc, 48).outline).toEqual(ring);

    // fewer than 3 points → no outline key
    const bare = stateToDoc({ ...emptyEditorState(96), outline: ring.slice(0, 2) }, "M");
    expect(bare.outline).toBeUndefined();
    expect(docToState(bare, 96).outline).toEqual([]);
  });

  it("round-trips per-edge bulge (curved edges)", () => {
    const curved = [{ x: 0, y: 0, bulge: 6 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }];
    const doc = stateToDoc({ ...emptyEditorState(96), outline: curved }, "M");
    expect(doc.outline?.[0].bulge).toBe(6);
    expect(docToState(doc, 96).outline).toEqual(curved);
  });
});

describe("sampleBenchworkOutline", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
  ];

  it("emits one point per vertex for an all-straight ring", () => {
    expect(sampleBenchworkOutline(square)).toEqual(square);
  });

  it("bows a bulged edge out to its sagitta at the midpoint", () => {
    // First edge (0,0)->(40,0) bulged +8: the arc midpoint sits 8 above the chord
    // (left of +x is +y). Only the arc points fall strictly between x=0 and x=40.
    const pts = sampleBenchworkOutline([{ ...square[0], bulge: 8 }, ...square.slice(1)], 20);
    const onEdge = pts.filter((p) => p.x > 0.01 && p.x < 39.99);
    const apex = onEdge.reduce((m, p) => (p.y > m.y ? p : m), { x: 0, y: -Infinity });
    expect(apex.y).toBeCloseTo(8, 1);
    expect(apex.x).toBeCloseTo(20, 1);
    // more points than the 4 raw vertices (the arc was tessellated)
    expect(pts.length).toBeGreaterThan(square.length);
  });

  it("negative bulge bows the other way", () => {
    const pts = sampleBenchworkOutline([{ ...square[0], bulge: -8 }, ...square.slice(1)], 20);
    const onEdge = pts.filter((p) => p.x > 0.01 && p.x < 39.99);
    const low = onEdge.reduce((m, p) => (p.y < m.y ? p : m), { x: 0, y: Infinity });
    expect(low.y).toBeCloseTo(-8, 1);
  });
});

describe("moduleFootprint (physical single-module geometry)", () => {
  it("straight module: centre-line A→B, rectangular band, faces at width, no outline", () => {
    const fp = moduleFootprint({ lengthInches: 96, geometryType: "straight", endplateWidths: { A: 24, B: 24 } });
    expect(fp.centerline).toEqual([{ x: 0, y: 0 }, { x: 96, y: 0 }]);
    // band ±12 around y=0, spanning x 0..96
    const ys = fp.band.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-12);
    expect(ys[ys.length - 1]).toBeCloseTo(12);
    // A face at x=0 spans 24"; B face at x=96
    expect(fp.endplateFaces[0].mid).toEqual({ x: 0, y: 0 });
    expect(Math.abs(fp.endplateFaces[0].p1.y - fp.endplateFaces[0].p2.y)).toBeCloseTo(24);
    expect(fp.endplateFaces[1].mid.x).toBeCloseTo(96);
    expect(fp.outline).toBeNull();
  });

  it("a loop emits only endplate A's face (no spurious plate at the throat)", () => {
    const straight = moduleFootprint({ lengthInches: 96, geometryType: "straight" });
    expect(straight.endplateFaces).toHaveLength(2);
    const loop = moduleFootprint({ lengthInches: 96, geometryType: "straight", loop: true });
    expect(loop.endplateFaces).toHaveLength(1);
    expect(loop.endplateFaces[0].mid).toEqual({ x: 0, y: 0 });
  });

  it("per-end widths taper the band; a 90° corner curves the centre-line", () => {
    const fp = moduleFootprint({ lengthInches: 96, geometryType: "straight", endplateWidths: { A: 12, B: 24 } });
    const atA = fp.band.filter((p) => Math.abs(p.x) < 1e-6).map((p) => Math.abs(p.y));
    const atB = fp.band.filter((p) => Math.abs(p.x - 96) < 1e-6).map((p) => Math.abs(p.y));
    expect(Math.max(...atA)).toBeCloseTo(6);
    expect(Math.max(...atB)).toBeCloseTo(12);
    const corner = moduleCenterline({ lengthInches: 96, geometryType: "corner_90" });
    expect(corner.length).toBeGreaterThan(2); // arc sampled
    expect(corner[corner.length - 1].y).toBeGreaterThan(1); // turned off-axis
  });

  it("an authored outline (with a curved edge) is sampled and wins over the band", () => {
    const fp = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      outline: [{ x: 0, y: -12, bulge: -8 }, { x: 96, y: -12 }, { x: 96, y: 12 }, { x: 0, y: 12 }],
    });
    expect(fp.outline).not.toBeNull();
    expect(fp.outline!.length).toBeGreaterThan(4); // the bulged edge tessellated
  });

  // ⭐⭐ Will, 2026-08-01: "The Endplate is a part of the benchwork." The board's
  // ends are a fact about the BOARD, so a mainline drawn short, long or wandering
  // must not move them — while `pos` still follows the track the owner drew.
  it("the drawn mainline moves the TRACK's centre-line but never the benchwork or its endplate faces", () => {
    const base = { lengthInches: 96, geometryType: "straight" as const };
    const plain = moduleFootprint(base);
    // Same module, with a main drawn 8in short of the end and bowed off-axis.
    const drawn = moduleFootprint({
      ...base,
      mainPath: [{ x: 0, y: 0 }, { x: 88, y: -6 }],
    });

    // The TRACK's path follows what was drawn — that is what `pos` measures along.
    expect(drawn.centerline[drawn.centerline.length - 1].x).toBeCloseTo(88);
    expect(drawn.centerline[drawn.centerline.length - 1].y).toBeCloseTo(-6);

    // The BENCHWORK does not budge: the far endplate face stays at the board's
    // own end, not the track's.
    const farFace = (fp: ReturnType<typeof moduleFootprint>) =>
      fp.endplateFaces[fp.endplateFaces.length - 1];
    expect(farFace(drawn).mid.x).toBeCloseTo(96);
    expect(farFace(drawn).mid.y).toBeCloseTo(0);
    expect(farFace(drawn)).toEqual(farFace(plain));
    expect(drawn.band).toEqual(plain.band);
  });

  // ⭐ A module with no benchwork must be TELLABLE from one with a board, so the
  // apps can warn instead of standing a derived ribbon in for a board nobody
  // drew (modulerepo#268). The band still comes out either way — blanking it
  // would rewrite half the catalogue's modules rather than ask their owners.
  it("says whether the benchwork was actually authored, without withholding the band", () => {
    const none = moduleFootprint({ lengthInches: 96, geometryType: "straight" });
    expect(none.benchworkAuthored).toBe(false);
    expect(none.band.length).toBeGreaterThan(0); // still drawable

    const drawn = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      outline: [{ x: 0, y: -12 }, { x: 96, y: -12 }, { x: 96, y: 12 }, { x: 0, y: 12 }],
    });
    expect(drawn.benchworkAuthored).toBe(true);

    // ⛔⛔ DO NOT READ THIS AS "BARE SECTIONS ARE NEVER BENCHWORK". It is the
    // narrow case where `sectionFootprints` yields nothing, so there is neither
    // an outline nor a section footprint to count. Given the richer input the
    // app passes, two bare sections DO produce `sectionOutlines` and therefore
    // report `true` — verified on prod, FMN-0077 (2 sections, no shapes, no
    // outline) shows no "no benchwork" warning.
    //
    // ⚠️ Whether a module that declares boards but draws none should count as
    // having benchwork is an OPEN QUESTION for Will — modulerepo#268. This
    // assertion pins today's behaviour for this input only; it is not the rule.
    const noOutlineNoFootprints = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      sections: [{ lengthInches: 48 }, { lengthInches: 48 }],
    });
    expect(noOutlineNoFootprints.sectionOutlines).toHaveLength(0);
    expect(noOutlineNoFootprints.benchworkAuthored).toBe(false);
  });
});

// ⭐⭐ modulerepo#275. Will: "The whole edge is the endplate regardless of what
// endplate number or letter it is … The Endplate can be the same or smaller size
// than the edge." No special case by letter — a plate occupies a SPAN.
describe("endplateSpanOnEdge", () => {
  // Edge 0 runs (0,-12)->(0,12): 24in long, and t grows with +y.
  const rect = [
    { x: 0, y: -12 },
    { x: 0, y: 12 },
    { x: 48, y: 12 },
    { x: 48, y: -12 },
  ];

  it("centres the plate's own width where it sits, leaving the rest of the edge alone", () => {
    const s = endplateSpanOnEdge(rect, 0, { x: 0, y: 0 }, 12)!;
    expect(s.fromT).toBeCloseTo(0.25); // 12in centred on a 24in edge
    expect(s.toT).toBeCloseTo(0.75);
    // …and that really is 12in of edge, not 24.
    expect((s.toT - s.fromT) * 24).toBeCloseTo(12);
  });

  it("takes the whole edge when the plate is as wide as it", () => {
    const s = endplateSpanOnEdge(rect, 0, { x: 0, y: 0 }, 24)!;
    expect(s.fromT).toBeCloseTo(0);
    expect(s.toT).toBeCloseTo(1);
  });

  // ⚠️ A plate wider than its edge cannot hang off the board — it clamps to the
  // edge. The DISAGREEMENT is the caller's to report (flag, don't clamp lives
  // one level up); this function's job is to return a span that exists.
  it("clamps to the edge rather than returning a span hanging off the board", () => {
    const s = endplateSpanOnEdge(rect, 0, { x: 0, y: 0 }, 60)!;
    expect(s.fromT).toBeCloseTo(0);
    expect(s.toT).toBeCloseTo(1);
  });

  it("follows where the plate sits, not just the middle", () => {
    const s = endplateSpanOnEdge(rect, 0, { x: 0, y: 6 }, 12)!;
    expect(s.fromT).toBeCloseTo(0.5); // centred at t=0.75, half-width 0.25
    expect(s.toT).toBeCloseTo(1);
  });

  it("refuses a curved fascia, a missing edge and a zero width — never guesses", () => {
    const curved = [{ x: 0, y: -12, bulge: 5 }, ...rect.slice(1)];
    expect(endplateSpanOnEdge(curved, 0, { x: 0, y: 0 }, 12)).toBeNull();
    expect(endplateSpanOnEdge(rect, 9, { x: 0, y: 0 }, 12)).toBeNull();
    expect(endplateSpanOnEdge(rect, 0, { x: 0, y: 0 }, 0)).toBeNull();
    expect(endplateSpanOnEdge(null, 0, { x: 0, y: 0 }, 12)).toBeNull();
  });
});

// ⭐⭐ modulerepo#268, the last of the circularity: the length is a READOUT of
// the board, not a number that positions the endplate that then sets it back.
describe("benchworkLengthInches", () => {
  const rect = [
    { x: 0, y: -12 },
    { x: 96, y: -12 },
    { x: 96, y: 12 },
    { x: 0, y: 12 },
  ];
  // Edge 3 is (0,12)->(0,-12) = end A; edge 1 is (96,-12)->(96,12) = end B.
  const bothEnds = { A: { index: 3 }, B: { index: 1 } };

  it("measures face to face when both ends are authored benchwork edges", () => {
    expect(benchworkLengthInches({ outline: rect, endplateEdges: bothEnds })).toBeCloseTo(96);
  });

  // ⭐ A TAPERED BOARD IS THE CASE THAT MATTERS. FMN-0078's fasciae run 96.333in
  // while its ends are 96in apart — a module's length is end to end, because
  // that is what its neighbours meet. Nobody measures a module along its side.
  it("is the face-to-face distance on a tapered board, not the fascia length", () => {
    const tapered = [
      { x: 0, y: -8 },
      { x: 96, y: -16 },
      { x: 96, y: 16 },
      { x: 0, y: 8 },
    ];
    const fascia = Math.hypot(96 - 0, -16 - -8); // 96.333…
    expect(fascia).toBeGreaterThan(96.3);
    expect(
      benchworkLengthInches({ outline: tapered, endplateEdges: { A: { index: 3 }, B: { index: 1 } } }),
    ).toBeCloseTo(96);
  });

  // ⛔⛔ THE GUARD THAT STOPS THIS BEING CIRCULAR AGAIN. A plate only DERIVED onto
  // an edge got there from `lengthInches`; measuring between two of those would
  // hand the same number straight back. Both ends must be AUTHORED.
  it("refuses unless both ends are authored — no outline, one end, or none", () => {
    expect(benchworkLengthInches({ outline: rect, endplateEdges: {} })).toBeNull();
    expect(benchworkLengthInches({ outline: rect, endplateEdges: { A: { index: 3 } } })).toBeNull();
    expect(benchworkLengthInches({ outline: null, endplateEdges: bothEnds })).toBeNull();
    expect(benchworkLengthInches({ outline: rect })).toBeNull();
  });

  it("refuses an edge that does not resolve, rather than guessing", () => {
    const curved = [{ x: 0, y: -12, bulge: 4 }, ...rect.slice(1)];
    // edge 0 is now a curved fascia; binding an end to it must not yield a length
    expect(
      benchworkLengthInches({ outline: curved, endplateEdges: { A: { index: 0 }, B: { index: 1 } } }),
    ).toBeNull();
  });
});

// ⭐⭐ Will, 2026-08-01 (modulerepo#268): "benchwork edges own the endplates."
describe("a benchwork edge OWNS the endplate that sits on it", () => {
  const board = [
    { x: 0, y: -12 },
    { x: 96, y: -12 },
    { x: 96, y: 12 },
    { x: 0, y: 12 },
  ];
  const base = {
    lengthInches: 96,
    geometryType: "straight" as const,
    endplateConfigs: ["single", "single"] as ("single" | "double")[],
  };

  // ⭐ THE SAFETY PROPERTY. Matching demands the plate and the edge AGREE, so
  // adopting the edge cannot move anything that was already right. If this ever
  // fails, the change is silently repositioning existing modules.
  it("moves nothing today — a plate on its board's end reads the same pose bound as unbound", () => {
    const withoutBoard = deriveEndplatePoses(base);
    const withBoard = deriveEndplatePoses({ ...base, outline: board });
    for (const id of ["A", "B"]) {
      const u = withoutBoard.find((p) => p.id === id)!;
      const b = withBoard.find((p) => p.id === id)!;
      expect(b.x).toBeCloseTo(u.x, 6);
      expect(b.y).toBeCloseTo(u.y, 6);
      expect(b.heading).toBeCloseTo(u.heading, 6);
      expect(b.boundToEdge).toBe(true);
      expect(b.edgeDerived).toBe(true);
    }
  });

  // ⚠️ A DEEPER BOARD DOES NOT WIDEN THE PLATE. The span keeps the plate's own
  // width and stays centred where it sits — binding must never swallow the edge
  // (modulerepo#275). The board grows; the endplate is still the endplate.
  it("stays its own width on a deeper board, centred on the edge", () => {
    const deeper = board.map((p) => ({ ...p, y: p.y < 0 ? -16 : 16 }));
    const poses = deriveEndplatePoses({ ...base, outline: deeper });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.boundToEdge).toBe(true);
    expect(b.widthInches).toBeCloseTo(24); // its own width, not the 32in edge
    expect(b.face![0].y).toBeCloseTo(-12);
    expect(b.face![1].y).toBeCloseTo(12);
  });

  // ⚠️⚠️ THE LIMIT OF THIS INCREMENT, PINNED SO NOBODY MISREADS IT. Lengthening
  // the board does NOT drag the plate along, because the plate's position still
  // comes from `lengthInches` — the edge is adopted only where it already
  // agrees. Real ownership needs the length DERIVED from the benchwork, which is
  // the remaining half of modulerepo#268. Until then this is honestly reported
  // rather than silently papered over.
  it("does NOT follow a board lengthened on its own — it reports the disagreement", () => {
    const longer = board.map((p) => (p.x === 96 ? { ...p, x: 120 } : p));
    const poses = deriveEndplatePoses({ ...base, outline: longer });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.x).toBeCloseTo(96); // where lengthInches puts it
    expect(b.boundToEdge).toBeFalsy();
    expect(b.offBenchwork).toBe(true);
  });

  // ⚠️ Binding must not widen a plate to swallow its edge (modulerepo#275).
  it("keeps the plate's own width instead of taking the whole edge", () => {
    const poses = deriveEndplatePoses({
      ...base,
      outline: board,
      endplateWidths: { A: 16, B: 16 },
    });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.widthInches).toBeCloseTo(16); // the edge is 24in long
  });

  // ⚠️ Manual authority above inference.
  it("a hand-placed pose outranks a derived binding", () => {
    const poses = deriveEndplatePoses({
      ...base,
      outline: board,
      poseOverrides: { B: { x: 80, y: 4, heading: 0 } },
    });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.manual).toBe(true);
    expect(b.boundToEdge).toBeFalsy();
    expect(b.x).toBeCloseTo(80);
  });

  // ⛔ Flag, don't correct: a plate off the board is reported where it is.
  it("reports a plate that lies on no edge instead of moving it onto the board", () => {
    // A board that stops well short of where the module says its far end is.
    const shortBoard = board.map((p) => (p.x === 96 ? { ...p, x: 60 } : p));
    const poses = deriveEndplatePoses({ ...base, outline: shortBoard });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.boundToEdge).toBeFalsy();
    expect(b.offBenchwork).toBe(true);
    expect(b.x).toBeCloseTo(96); // left where it was, NOT dragged to 60
  });
});

describe("double track (main2)", () => {
  it("stateToDoc emits Main 2 as a real track only when an endplate is double", () => {
    const single = stateToDoc(emptyEditorState(96), "M");
    expect(single.tracks.map((t) => t.id)).toEqual(["main"]);
    const dbl = stateToDoc({ ...emptyEditorState(96), configA: "double" }, "M");
    expect(dbl.tracks.filter((t) => t.role === "main").map((t) => t.id)).toEqual([
      "main",
      "main2",
    ]);
    expect(dbl.tracks.find((t) => t.id === "main2")?.lane).toBe(1);
    // round-trip: main2 never becomes an editor extra track
    expect(docToState(dbl, 96).extraTracks).toEqual([]);
  });

  it("a team track off Main 2 diverges from lane 1 — not a crossover from Main 1", () => {
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [
        { id: "A", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
        { id: "B", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
      ],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
        { id: "team", role: "spur", lane: 2, fromPos: 40, toPos: 80 },
      ],
      turnouts: [
        { id: "sw1", pos: 40, onTrack: "main2", divergeTrack: "team", kind: "left" },
      ],
    };
    const f = moduleFeatures(doc);
    const team = f.extraTracks.find((t) => t.id === "team")!;
    expect(team.divergesFromLane).toBe(1); // off Main 2, outward to lane 2
    expect(f.turnouts[0]).toMatchObject({ onLane: 1, divergeLane: 2 });
    expect(f.laneMax).toBe(2);
  });

  it("negative lanes model a track outside Main 1 and widen the extents", () => {
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "house", role: "spur", lane: -1, fromPos: 30, toPos: 70 },
      ],
      turnouts: [
        { id: "sw1", pos: 30, onTrack: "main", divergeTrack: "house", kind: "right" },
      ],
    };
    const f = moduleFeatures(doc);
    expect(f.extraTracks[0]).toMatchObject({ lane: -1, divergesFromLane: 0 });
    expect(f.laneMin).toBe(-1);
    expect(f.laneMax).toBe(0);
  });

  it("buildPassingSiding starts above Main 2 on a double module", () => {
    const siding = buildPassingSiding({ ...emptyEditorState(96), configA: "double" });
    expect(siding.track.lane).toBe(2);
    expect(buildPassingSiding(emptyEditorState(96)).track.lane).toBe(1);
  });
});

describe("turnout hand drives the drawn side (#bug1)", () => {
  it("divergeSideForHand: left throws to the body's side, right to the opposite", () => {
    // body running east (stubDir +1)
    expect(divergeSideForHand("left", 1)).toBe(1); // above
    expect(divergeSideForHand("right", 1)).toBe(-1); // below
    // body running west (stubDir −1) flips both
    expect(divergeSideForHand("left", -1)).toBe(-1);
    expect(divergeSideForHand("right", -1)).toBe(1);
    // wye / unset → no opinion
    expect(divergeSideForHand("wye", 1)).toBe(0);
    expect(divergeSideForHand(undefined, 1)).toBe(0);
  });

  it("a ladder rung follows its PARENT's side, not the main — hand never flips it across", () => {
    // East yard ladder: each rung diverges off the previous, stacking below.
    // sw2/sw3 are left-hand, but that's relative to their parent rung, so they
    // must stay below the main (not flip above like a main-centerline turnout).
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 48,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "r1", role: "spur", lane: -1, fromPos: 8, toPos: 45 },
        { id: "r2", role: "spur", lane: -2, fromPos: 13, toPos: 45 },
        { id: "r3", role: "spur", lane: -3, fromPos: 18, toPos: 45 },
      ],
      turnouts: [
        { id: "sw1", pos: 8, onTrack: "main", divergeTrack: "r1", kind: "right" },
        { id: "sw2", pos: 13, onTrack: "r1", divergeTrack: "r2", kind: "left" },
        { id: "sw3", pos: 18, onTrack: "r2", divergeTrack: "r3", kind: "left" },
      ],
    };
    const lanes = Object.fromEntries(
      moduleFeatures(doc).extraTracks.map((t) => [t.id, t.lane]),
    );
    expect(lanes).toEqual({ r1: -1, r2: -2, r3: -3 }); // ladder stays intact
  });

  it("a spur off Main 2 stacks on Main 2's side (above), not driven across the main", () => {
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 48,
      endplates: [
        { id: "A", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
        { id: "B", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
      ],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
        { id: "w1", role: "spur", lane: 2, fromPos: 8, toPos: 45 },
      ],
      turnouts: [{ id: "sw", pos: 8, onTrack: "main2", divergeTrack: "w1", kind: "right" }],
    };
    expect(moduleFeatures(doc).extraTracks[0].lane).toBe(2); // follows Main 2, above
  });

  it("reconciles a spur's lane sign to its turnout's hand, keeping magnitude", () => {
    const base: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        // authored ABOVE (lane 2), but the hand says right → below
        { id: "spur", role: "spur", lane: 2, fromPos: 30, toPos: 70 },
      ],
      turnouts: [{ id: "sw1", pos: 30, onTrack: "main", divergeTrack: "spur", kind: "right" }],
    };
    // right-hand, body runs east → below; magnitude 2 preserved
    expect(moduleFeatures(base).extraTracks[0].lane).toBe(-2);
    // flip the hand → above
    const left = { ...base, turnouts: [{ ...base.turnouts![0], kind: "left" as const }] };
    expect(moduleFeatures(left).extraTracks[0].lane).toBe(2);
  });
});

describe("transition module: whichever main ends is the partial one (#FMN-0043)", () => {
  /** Double at A, single at B, with the transition turnout on the given main. */
  const transition = (onTrack: string, divergeTrack: string) => {
    const s = emptyEditorState(30);
    return stateToDoc(
      {
        ...s,
        configA: "double" as const,
        configB: "single" as const,
        turnouts: [
          { id: "sw1", name: "End of Double Track", pos: 18, onTrack, divergeTrack, kind: "left" as const },
        ],
      },
      "M",
    );
  };
  const track = (d: ReturnType<typeof stateToDoc>, id: string) =>
    d.tracks.find((t) => t.id === id)!;

  it("Main 2 ends when the turnout diverges TO it (Main 1 stays through)", () => {
    const d = transition(MAIN_TRACK_ID, MAIN2_TRACK_ID);
    expect(track(d, MAIN2_TRACK_ID).toPos).toBe(18);
    expect(track(d, MAIN_TRACK_ID).from).toBe("A");
    expect(track(d, MAIN_TRACK_ID).to).toBe("B");
  });

  it("Main 1 ends when the turnout sits ON Main 2 (Main 2 is the through main)", () => {
    const d = transition(MAIN2_TRACK_ID, MAIN_TRACK_ID);
    // Main 2 runs endplate to endplate…
    expect(track(d, MAIN2_TRACK_ID).from).toBe("A");
    expect(track(d, MAIN2_TRACK_ID).to).toBe("B");
    // …and Main 1 is the one that stops at the turnout — it used to run the
    // full length too, so the single-track end showed two tracks reaching it.
    expect(track(d, MAIN_TRACK_ID).toPos).toBe(18);
    expect(track(d, MAIN_TRACK_ID).fromPos).toBe(0);
  });

  it("a plain double-track module keeps both mains full length", () => {
    const s = emptyEditorState(30);
    const d = stateToDoc({ ...s, configA: "double", configB: "double" }, "M");
    expect(track(d, MAIN_TRACK_ID).to).toBe("B");
    expect(track(d, MAIN2_TRACK_ID).to).toBe("B");
  });
});

describe("endplate width conformance (Free-moN §1.1 + §2.0)", () => {
  it("passes a 24in plate, single or double, tracks centred", () => {
    expect(checkEndplateWidth({ widthInches: 24, config: "single" })).toEqual([]);
    expect(checkEndplateWidth({ widthInches: 24, config: "double" })).toEqual([]);
  });

  it("passes the 12in minimum with tracks centred", () => {
    // Double at 12″: outer track 0.5625 from centre ⇒ 5.4375″ of fascia clearance.
    expect(checkEndplateWidth({ widthInches: 12, config: "double" })).toEqual([]);
  });

  it("measures the second track on MAIN 2's side, not always above (#190)", () => {
    // 10″ plate with Main 1 authored 4″ from the plate centre.
    //   Main 2 ABOVE  → it sits at −2.875, i.e. back toward the centre, so the
    //                   nearest-fascia track is MAIN 1 at 4       ⇒ 2 × (4 + 4)
    //   Main 2 BELOW  → it runs further out to −5.125 and becomes
    //                   the worst                                 ⇒ 2 × (5.125 + 4)
    // Same authored number, different geometry — which is exactly what assuming
    // "Main 2 is above" got wrong.
    const up = checkEndplateWidth({ widthInches: 10, config: "double", trackOffsetInches: -4 });
    const down = checkEndplateWidth({
      widthInches: 10,
      config: "double",
      trackOffsetInches: -4,
      main2Below: true,
    });
    expect(up.find((i) => i.code === "clearance")!.requiredInches).toBe(2 * (4 + 4));
    expect(down.find((i) => i.code === "clearance")!.requiredInches).toBe(2 * (5.125 + 4));
  });

  it("says so when a double end's pair doesn't straddle the plate centre (#190)", () => {
    // Unauthored: the pair straddles by construction, so nothing to report.
    expect(
      checkEndplateWidth({ widthInches: 24, config: "double" }).map((i) => i.code),
    ).not.toContain("offcentre");
    expect(
      checkEndplateWidth({ widthInches: 24, config: "double", main2Below: true }).map(
        (i) => i.code,
      ),
    ).not.toContain("offcentre");

    // ⚠️ An authored 0 means "centre MAIN 1", which pushes the whole pair to one
    // side — legal since the 20220628 revision relaxed centring, but almost
    // always an accident, and it's what FMN-0068/0073/0075 were all storing.
    const zero = checkEndplateWidth({
      widthInches: 24,
      config: "double",
      trackOffsetInches: 0,
    });
    expect(zero.map((i) => i.code)).toContain("offcentre");
    expect(zero.find((i) => i.code === "offcentre")!.message).toContain("0.56");
    // …and it is NOT a clearance failure on a 24″ plate, so the two are distinct.
    expect(zero.map((i) => i.code)).not.toContain("clearance");

    // A single end is never "off-centre" in this sense — there's no pair.
    expect(
      checkEndplateWidth({ widthInches: 24, config: "single", trackOffsetInches: 0 }).map(
        (i) => i.code,
      ),
    ).not.toContain("offcentre");
  });

  it("endplateCentreOffsetInches places the plate centre toward MAIN 2 (#190)", () => {
    // The renderer's framing: where the plate's centre sits relative to Main 1.
    expect(endplateCentreOffsetInches({ config: "single" })).toBe(0);
    expect(endplateCentreOffsetInches({ config: "double" })).toBeCloseTo(0.5625, 6);
    expect(endplateCentreOffsetInches({ config: "double", main2Below: true })).toBeCloseTo(
      -0.5625,
      6,
    );
    // An authored value wins, negated out of the standard's framing.
    expect(
      endplateCentreOffsetInches({ config: "double", authoredTrackOffsetInches: -2 }),
    ).toBe(2);
    // …including an explicit 0, which is what centres the pair off the plate.
    expect(
      endplateCentreOffsetInches({ config: "double", authoredTrackOffsetInches: 0 }),
    ).toBe(0);
  });

  it("flags a plate under the 12in minimum", () => {
    const issues = checkEndplateWidth({ widthInches: 10, config: "single" });
    expect(issues.map((i) => i.code)).toContain("narrow");
    expect(issues.find((i) => i.code === "narrow")!.requiredInches).toBe(12);
  });

  it("flags too little fascia clearance even on a wide plate when the track is offset", () => {
    // 24″ plate but the track is 9″ off centre ⇒ only 3″ to the near fascia.
    const issues = checkEndplateWidth({ widthInches: 24, config: "single", trackOffsetInches: 9 });
    expect(issues.map((i) => i.code)).toEqual(["clearance"]);
    expect(issues[0].requiredInches).toBe(26); // 2 × (9 + 4)
  });

  it("accounts for the second track on a double end", () => {
    // 9″ plate, centred double: outer track 0.5625 out ⇒ 3.9375″ < 4″.
    const issues = checkEndplateWidth({ widthInches: 9, config: "double" });
    expect(issues.map((i) => i.code)).toEqual(["narrow", "clearance"]);
    // 2 × (0.5625 + 4) — exact; only the human message rounds.
    expect(issues.find((i) => i.code === "clearance")!.requiredInches).toBeCloseTo(9.125);
  });
});

describe("endplate track offset (double ends centre on the pair, #93)", () => {
  it("is half a track spacing for double, zero for single", () => {
    const centre = (config?: "single" | "double" | "none", main2Below?: boolean) =>
      endplateCentreOffsetInches({ config, main2Below });
    expect(centre("double")).toBeCloseTo(0.5625);
    expect(centre("single")).toBe(0);
    expect(centre(undefined)).toBe(0);
    // The plate centre follows MAIN 2's side, so swapping the mains puts it below.
    expect(centre("double", true)).toBeCloseTo(-0.5625);
    expect(centre("single", true)).toBe(0);
  });

  it("an authored offset wins over the recommended default", () => {
    // A transition section offsets its SINGLE end by +9/16 so the through main
    // lines up with the upper track of its double end (One Mile).
    expect(endplateTrackOffsetInches(0.5625, "single")).toBeCloseTo(0.5625);
    // 0 is meaningful — explicitly centred, even on a double end.
    expect(endplateTrackOffsetInches(0, "double")).toBe(0);
    // Absent falls back to the §2.0 recommendation.
    expect(endplateTrackOffsetInches(undefined, "double")).toBeCloseTo(-0.5625);
    expect(endplateTrackOffsetInches(null, "single")).toBe(0);
  });

  it("round-trips an authored offset through the doc", () => {
    const s = emptyEditorState(48);
    const doc = stateToDoc({ ...s, endplateTrackOffsets: { A: 0.5625 } }, "M");
    expect(doc.endplates.find((e) => e.id === "A")!.trackOffsetInches).toBeCloseTo(0.5625);
    expect(doc.endplates.find((e) => e.id === "B")!.trackOffsetInches).toBeUndefined();
    expect(docToState(doc).endplateTrackOffsets).toEqual({ A: 0.5625 });
  });

  it("shifts the endplate face and band without moving the track point", () => {
    const base = { lengthInches: 48, geometryType: "straight" };
    const plain = moduleFootprint(base);
    const shifted = moduleFootprint({
      ...base,
      endplateTrackOffsets: { A: 0.5625, B: 0.5625 },
    });
    // The track point (face mid) is unchanged — joints still key off it…
    expect(shifted.endplateFaces[0].mid.y).toBeCloseTo(plain.endplateFaces[0].mid.y);
    // …while the face itself moves up half a spacing.
    expect(shifted.endplateFaces[0].p1.y - plain.endplateFaces[0].p1.y).toBeCloseTo(0.5625);
    expect(shifted.endplateFaces[0].p2.y - plain.endplateFaces[0].p2.y).toBeCloseTo(0.5625);
    // The face is still a full width across.
    const w = Math.abs(shifted.endplateFaces[0].p1.y - shifted.endplateFaces[0].p2.y);
    expect(w).toBeCloseTo(24);
  });

  // #190. The builder passed swap-aware offsets; the read-only and catalog views
  // passed NOTHING, and an absent entry meant 0 — so every double plate there was
  // centred on Main 1 and its pair sat wholly above it. The default now comes from
  // §2.0, so a caller that only says "this end is double" still draws it right.
  it("straddles an unauthored double end by default, either way round", () => {
    const base = {
      lengthInches: 48,
      geometryType: "straight",
      endplateConfigs: ["double", "double"] as const,
    };
    const mid = (fp: ReturnType<typeof moduleFootprint>, i: number) =>
      (fp.endplateFaces[i].p1.y + fp.endplateFaces[i].p2.y) / 2;

    // Main 2 above ⇒ the pair is at 0 and +1.125, so the plate centre is +0.5625.
    const up = moduleFootprint({ ...base });
    expect(mid(up, 0)).toBeCloseTo(0.5625);
    expect(mid(up, 1)).toBeCloseTo(0.5625);
    // Swapped ⇒ Main 2 runs below, and the plate centre goes with it.
    const down = moduleFootprint({ ...base, mainsSwapped: true });
    expect(mid(down, 0)).toBeCloseTo(-0.5625);

    // A single end still crosses at the plate's centre…
    const single = moduleFootprint({ ...base, endplateConfigs: ["single", "double"] });
    expect(mid(single, 0)).toBeCloseTo(0);
    // …and a given placement still wins per-end, including an explicit 0, which
    // is how an owner centres a double plate on Main 1 on purpose (#93).
    const placed = moduleFootprint({ ...base, endplateTrackOffsets: { A: 0 } });
    expect(mid(placed, 0)).toBeCloseTo(0);
    expect(mid(placed, 1)).toBeCloseTo(0.5625); // B unstated, so still §2.0
  });
});

describe("swap Main 1 / Main 2 positions (#FMN-0043)", () => {
  const lanes = (swapped: boolean) => {
    const s = emptyEditorState(30);
    const d = stateToDoc(
      { ...s, configA: "double" as const, configB: "double" as const, mainsSwapped: swapped },
      "M",
    );
    return {
      main: d.tracks.find((t) => t.id === MAIN_TRACK_ID)!.lane,
      main2: d.tracks.find((t) => t.id === MAIN2_TRACK_ID)!.lane,
      doc: d,
    };
  };

  it("defaults to Main 1 on the centre line, Main 2 above", () => {
    const { main, main2, doc } = lanes(false);
    expect(main).toBe(0);
    expect(main2).toBe(1);
    expect(doc.mainsSwapped).toBeUndefined(); // absent unless set
  });

  it("swapped keeps Main 1 on the centre line and moves Main 2 below (#131)", () => {
    const { main, main2, doc } = lanes(true);
    expect(main).toBe(0); // Main 1 never moves
    expect(main2).toBe(-1); // Main 2 drops to the lower side
    expect(doc.mainsSwapped).toBe(true);
    expect(docToState(doc).mainsSwapped).toBe(true);
  });

  it("a single-track module is unaffected by the flag", () => {
    const s = emptyEditorState(30);
    const d = stateToDoc({ ...s, mainsSwapped: true }, "M");
    expect(d.tracks.find((t) => t.id === MAIN_TRACK_ID)!.lane).toBe(0);
    expect(d.tracks.find((t) => t.id === MAIN2_TRACK_ID)).toBeUndefined();
  });
});

describe("curved turnout flag (#turnout-palette)", () => {
  const withTurnout = (curved?: boolean) => {
    const s = emptyEditorState(96);
    return {
      ...s,
      extraTracks: [
        { id: "spur", role: "spur" as const, lane: 1, fromPos: 30, toPos: 50, moduleTrackId: null, trackName: "" },
      ],
      turnouts: [
        { id: "sw1", name: "", pos: 30, onTrack: "main", divergeTrack: "spur", kind: "right" as const, size: 6, ...(curved ? { curved: true } : {}) },
      ],
    };
  };

  it("stateToDoc emits curved only when set; docToState reads it back", () => {
    const on = stateToDoc(withTurnout(true), "M");
    expect(on.turnouts?.[0].curved).toBe(true);
    const off = stateToDoc(withTurnout(false), "M");
    expect(off.turnouts?.[0].curved).toBeUndefined();
    // round-trip preserves the flag (and its absence)
    expect(docToState(on).turnouts[0].curved).toBe(true);
    expect(docToState(off).turnouts[0].curved).toBeUndefined();
  });
});

describe("spur throat direction (#bug3)", () => {
  const spurDoc = (fromPos: number, toPos: number, swPos: number): ModuleSchematicDoc => ({
    version: 1,
    lengthInches: 100,
    endplates: [{ id: "A" }, { id: "B" }],
    tracks: [
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "spur", role: "spur", lane: 1, fromPos, toPos },
    ],
    turnouts: [{ id: "sw1", pos: swPos, onTrack: "main", divergeTrack: "spur", kind: "left" }],
  });

  it("puts the throat at the turnout end — east-facing spur throats east", () => {
    // spur body 20..60, turnout at 60 (east end) → throat east, stub west
    const f = moduleFeatures(spurDoc(20, 60, 60)).extraTracks[0];
    expect(f.throatFrac).toBeCloseTo(0.6);
    expect(f.stubFrac).toBeCloseTo(0.2);
    // extent stays sorted W→E for consumers that want it
    expect(f.fromFrac).toBeCloseTo(0.2);
    expect(f.toFrac).toBeCloseTo(0.6);
  });

  it("west-facing spur throats west", () => {
    const f = moduleFeatures(spurDoc(20, 60, 20)).extraTracks[0];
    expect(f.throatFrac).toBeCloseTo(0.2);
    expect(f.stubFrac).toBeCloseTo(0.6);
  });
});

describe("crossovers (#bug2)", () => {
  it("a connector with turnouts on two mains resolves to a diagonal", () => {
    const s = { ...emptyEditorState(96), configA: "double" as const, configB: "double" as const };
    const built = buildCrossover(s)!;
    expect(built.track.role).toBe("crossover");
    s.extraTracks.push(built.track);
    s.turnouts.push(...built.turnouts);
    const doc = stateToDoc(s, "M");
    const f = moduleFeatures(doc);
    // drawn as one crossover, not two sidings
    expect(f.crossovers).toHaveLength(1);
    expect(f.extraTracks.find((t) => t.id === built.track.id)).toBeUndefined();
    const xo = f.crossovers[0];
    expect(xo.fromLane).toBe(0);
    expect(xo.toLane).toBe(1);
    expect(xo.fromPosFrac).toBeLessThan(xo.toPosFrac);
  });

  it("draws a crossover modelled as two turnouts diverging onto the other main", () => {
    // FMN-0025 shape: no connector track — a leg on each main pointing at the
    // other. They pair into one diagonal between the two mains.
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 48,
      endplates: [
        { id: "A", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
        { id: "B", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
      ],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
      ],
      turnouts: [
        { id: "x1", pos: 40, onTrack: "main", divergeTrack: "main2", kind: "right" },
        { id: "x2", pos: 34, onTrack: "main2", divergeTrack: "main", kind: "right" },
      ],
    };
    const xs = moduleFeatures(doc).crossovers;
    expect(xs).toHaveLength(1);
    expect(xs[0]).toMatchObject({ fromLane: 0, toLane: 1 });
    expect(new Set([xs[0].fromPosFrac, xs[0].toPosFrac])).toEqual(
      new Set([40 / 48, 34 / 48]),
    );
  });

  it("buildCrossover needs a double-track module", () => {
    expect(buildCrossover(emptyEditorState(96))).toBeNull();
    expect(buildCrossover({ ...emptyEditorState(96), configA: "double" })).not.toBeNull();
  });

  it("a passing siding (both turnouts on one main) is NOT a crossover", () => {
    const s = emptyEditorState(96);
    const built = buildPassingSiding(s);
    s.extraTracks.push(built.track);
    s.turnouts.push(...built.turnouts);
    const f = moduleFeatures(stateToDoc(s, "M"));
    expect(f.crossovers).toEqual([]);
    expect(f.extraTracks).toHaveLength(1);
  });
});

describe("loop modules (single-endplate turnback)", () => {
  it("stateToDoc emits one endplate + a positioned main; round-trips", () => {
    const s = { ...emptyEditorState(120), loop: true, configB: "none" as const };
    s.extraTracks.push({
      id: "grain", role: "spur", lane: 1, fromPos: 90, toPos: 118,
      moduleTrackId: null, trackName: "Grain",
    });
    const doc = stateToDoc(s, "FMN-SEAFORD");
    expect(doc.loop).toBe(true);
    expect(doc.endplates).toHaveLength(1);
    expect(doc.endplates[0].id).toBe("A");
    const main = doc.tracks.find((t) => t.id === "main")!;
    expect(main).toMatchObject({ fromPos: 0, toPos: 120 });

    const back = docToState(doc, 120);
    expect(back.loop).toBe(true);
    expect(back.extraTracks).toHaveLength(1);
  });

  it("a loop is the AUTHORED flag only — one endplate no longer implies one (#191)", () => {
    const doc = stateToDoc({ ...emptyEditorState(96), loop: true }, "M");
    expect(moduleFeatures(doc).loop).toBe(true);

    // ⚠️ REVERSES an earlier rule that inferred a loop from `endplates.length
    // === 1`. That was safe only while a turnback was the sole way to have one
    // endplate; #184 made an end of the line / pocket present one too, so every
    // single-ended module was being drawn as a balloon — bulb, "Entry" label and
    // all. A loop is a loop because someone said so.
    const oneEndplate: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [{ id: "A" }],
      tracks: [{ id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 }],
    };
    expect(moduleFeatures(oneEndplate).loop).toBe(false);

    // ordinary through module stays false
    expect(moduleFeatures(stateToDoc(emptyEditorState(96), "M")).loop).toBe(false);
  });

  it("a loop never emits main2 (the parallel lead legs are one main)", () => {
    const doc = stateToDoc(
      { ...emptyEditorState(96), loop: true, configA: "double" },
      "M",
    );
    expect(doc.tracks.filter((t) => t.role === "main")).toHaveLength(1);
  });

  it("a standard endplate B on the balloon makes an interchange loop (Seaford)", () => {
    // loop + B present → interchange; loop + "none" → pure turnback
    const inter = stateToDoc({ ...emptyEditorState(120), loop: true, configB: "single" }, "M");
    expect(inter.loop).toBe(true);
    expect(inter.endplates.map((e) => e.id)).toEqual(["A", "B"]);
    expect(inter.endplates[1].label).toBe("Interchange");
    const fi = moduleFeatures(inter);
    expect(fi).toMatchObject({ loop: true, loopInterchange: true });

    const turnback = stateToDoc({ ...emptyEditorState(120), loop: true, configB: "none" }, "M");
    expect(turnback.endplates.map((e) => e.id)).toEqual(["A"]);
    expect(moduleFeatures(turnback)).toMatchObject({ loop: true, loopInterchange: false });

    // round-trips both ways
    expect(docToState(inter, 120).configB).toBe("single");
    expect(docToState(inter, 120).loop).toBe(true);
    expect(docToState(turnback, 120).configB).toBe("none");
  });

  it("a Main 2 return emits main2 as a positioned track and round-trips (#165)", () => {
    const s = {
      ...emptyEditorState(96),
      loop: true,
      loopReturn: "main2" as const,
      configA: "double" as const,
      configB: "none" as const,
    };
    const doc = stateToDoc(s, "M");
    expect(doc.loopReturn).toBe("main2");
    // The U joins the two lanes at the balloon — main2 exists on the lead.
    const main2 = doc.tracks.find((t) => t.id === "main2")!;
    expect(main2).toMatchObject({ role: "main", lane: 1, fromPos: 0, toPos: 96 });
    expect(moduleFeatures(doc)).toMatchObject({ loop: true, loopReturn: "main2" });

    const back = docToState(doc, 96);
    expect(back.loopReturn).toBe("main2");
    // Same-main loops stay "same" and never emit main2.
    const same = stateToDoc({ ...emptyEditorState(96), loop: true, configB: "none" as const }, "M");
    expect(same.loopReturn).toBeUndefined();
    expect(same.tracks.some((t) => t.id === "main2")).toBe(false);
    expect(moduleFeatures(same).loopReturn).toBe("same");
  });

  it("inLoop marks balloon-interior tracks and survives the round trip (#165)", () => {
    const s = { ...emptyEditorState(120), loop: true, configB: "none" as const };
    s.extraTracks.push(
      { id: "t1", role: "yard", lane: 1, fromPos: 95, toPos: 118, moduleTrackId: null, trackName: "Staging 1", inLoop: true },
      { id: "lead", role: "spur", lane: 2, fromPos: 40, toPos: 80, moduleTrackId: null, trackName: "Lead" },
    );
    const doc = stateToDoc(s, "M");
    expect(doc.tracks.find((t) => t.id === "t1")?.inLoop).toBe(true);
    expect(doc.tracks.find((t) => t.id === "lead")?.inLoop).toBeUndefined();
    const f = moduleFeatures(doc);
    expect(f.extraTracks.find((t) => t.id === "t1")?.inLoop).toBe(true);
    expect(f.extraTracks.find((t) => t.id === "lead")?.inLoop).toBe(false);
    expect(docToState(doc, 120).extraTracks.find((t) => t.id === "t1")?.inLoop).toBe(true);
  });

  it("'none' on a NON-loop module drops endplate B — it isn't loop-only (#184)", () => {
    // ⚠️ REVERSES an earlier rule that read "a non-loop module never drops
    // endplate B ('none' coerces to single)". That made a single-ended module
    // impossible to author, which is wrong: an end of the line and a pocket both
    // present one conforming face and simply stop. The standard governs the
    // faces a module OFFERS for joining, never how many it must offer.
    const doc = stateToDoc({ ...emptyEditorState(96), configB: "none" }, "M");
    expect(doc.endplates.map((e) => e.id)).toEqual(["A"]);
  });
});

describe("transition modules — one single + one double endplate (FMN-0038)", () => {
  it("buildTransition creates the mainline turnout + End of Double Track CP", () => {
    const s = { ...emptyEditorState(96), configB: "double" as const };
    const built = buildTransition(s)!;
    expect(built.turnout).toMatchObject({
      onTrack: "main", // sits ON the through mainline (Main 1)…
      divergeTrack: "main2", // …and diverges TO the second main (#131)
      name: "End of Double Track",
      // Hand lands the leg on Main 2's side: east-double + Main 2 above → left
      // (a left-hand turnout facing east throws up); west-double → right.
      kind: "left",
    });
    expect(built.controlPoint.turnouts).toEqual([built.turnout.id]);
    expect(built.controlPoint.signals.map((x) => `${x.facing}:${x.side}`)).toEqual([
      "AtoB:above",
      "BtoA:below",
    ]);
    // Swapping Main 2 below flips the hand (leg must follow Main 2's side).
    expect(buildTransition({ ...s, mainsSwapped: true })!.turnout.kind).toBe("right");
    // West-double, Main 2 above → right; swapped → left.
    expect(buildTransition({ ...emptyEditorState(96), configA: "double" as const })!.turnout.kind).toBe("right");
    expect(buildTransition({ ...emptyEditorState(96), configA: "double" as const, mainsSwapped: true })!.turnout.kind).toBe("left");
    // Not a transition → null
    expect(buildTransition(emptyEditorState(96))).toBeNull();
    expect(buildTransition({ ...emptyEditorState(96), configA: "double" as const, configB: "double" as const })).toBeNull();
  });

  it("Main 1 is the through main; Main 2 is the branch that ends (#131)", () => {
    // Single at A, double at B (east double): turnout ON Main 1 → Main 1 runs
    // full length, Main 2 is the branch that starts at the junction and runs
    // to the double (east) end.
    const s = { ...emptyEditorState(96), configB: "double" as const };
    const built = buildTransition(s)!;
    s.turnouts.push(built.turnout);
    s.controlPoints.push(built.controlPoint);
    const doc = stateToDoc(s, "FMN-0038");
    expect(doc.tracks.find((t) => t.id === "main")).toMatchObject({ from: "A", to: "B" }); // Main 1 full
    const m2 = doc.tracks.find((t) => t.id === "main2")!;
    expect(m2.fromPos).toBe(built.turnout.pos); // Main 2 begins at the junction
    expect(m2.toPos).toBe(96); // …and runs to the double end
    const f = moduleFeatures(doc);
    expect(f.main2Extent!.fromFrac).toBeCloseTo(built.turnout.pos / 96);
    expect(f.transition).toEqual({
      throughLane: 0, branchLane: 1, atFrac: built.turnout.pos / 96, doubleSide: "east",
    });
    // Round-trips: the turnout comes back.
    const back = docToState(doc, 96);
    expect(back.turnouts.find(isTransitionTurnout)?.pos).toBe(built.turnout.pos);

    // Double at A (west double): the junction sits toward the west.
    const s2 = { ...emptyEditorState(96), configA: "double" as const };
    const b2 = buildTransition(s2)!;
    s2.turnouts.push(b2.turnout);
    expect(moduleFeatures(stateToDoc(s2, "M")).transition).toEqual({
      throughLane: 0, branchLane: 1, atFrac: b2.turnout.pos / 96, doubleSide: "west",
    });
  });

  it("a turnout diverging TO Main 2 makes Main 2 the branch (partial + through=Main 1)", () => {
    // west double, turnout on Main 1 diverging up to Main 2 → Main 2 ends.
    const s = { ...emptyEditorState(96), configA: "double" as const };
    s.turnouts.push({
      id: "sw1", name: "End of Double Track", pos: 72,
      onTrack: MAIN_TRACK_ID, divergeTrack: MAIN2_TRACK_ID, kind: "right",
    });
    const doc = stateToDoc(s, "M");
    expect(doc.tracks.find((t) => t.id === "main2")).toMatchObject({ fromPos: 0, toPos: 72 });
    const f = moduleFeatures(doc);
    expect(f.main2Extent).toEqual({ fromFrac: 0, toFrac: 72 / 96 });
    expect(f.transition).toEqual({ throughLane: 0, branchLane: 1, atFrac: 72 / 96, doubleSide: "west" });
  });

  it("FMN-0043: turnout ON Main 2, Main 2 stored full-length → Main 2 is the through main, not a crossover", () => {
    const doc: ModuleSchematicDoc = {
      version: 1, lengthInches: 30,
      endplates: [
        { id: "A", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
        { id: "B", tracks: [{ trackId: "main", lane: 0, config: "single" }] },
      ],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" }, // stale full-length
      ],
      turnouts: [{ id: "sw1", pos: 18, kind: "left", onTrack: "main2", divergeTrack: "main" }],
    };
    const f = moduleFeatures(doc);
    expect(f.transition).toEqual({ throughLane: 1, branchLane: 0, atFrac: 18 / 30, doubleSide: "west" });
    expect(f.main2Extent).toBeNull(); // Main 2 is the through main → full
    expect(f.crossovers).toEqual([]); // the lone Main1↔Main2 turnout is the transition
  });

  it("both-double modules keep the full-length Main 2 (no extent)", () => {
    const s = { ...emptyEditorState(96), configA: "double" as const, configB: "double" as const };
    const doc = stateToDoc(s, "M");
    expect(doc.tracks.find((t) => t.id === "main2")).toMatchObject({ from: "A", to: "B" });
    expect(moduleFeatures(doc).main2Extent).toBeNull();
  });

  it("a mismatched module WITHOUT a transition turnout falls back to full length", () => {
    const doc = stateToDoc({ ...emptyEditorState(96), configB: "double" as const }, "M");
    expect(doc.tracks.find((t) => t.id === "main2")).toMatchObject({ from: "A", to: "B" });
  });
});

describe("crossings and branch endplates (#170)", () => {
  it("a diamond round-trips and resolves to an X between the two lanes", () => {
    const s = emptyEditorState(96);
    s.extraTracks.push({ id: "foreign", role: "crossover", lane: 1, fromPos: 0, toPos: 96, moduleTrackId: null, trackName: "Foreign line" });
    s.crossings.push({ id: "x1", name: "GSP Diamond", pos: 48, trackA: "main", trackB: "foreign" });
    s.controlPoints.push({ id: "cp1", name: "Diamond", turnouts: [], crossings: ["x1"], signals: [] });

    const doc = stateToDoc(s, "M");
    expect(doc.crossings).toEqual([{ id: "x1", pos: 48, tracks: ["main", "foreign"], name: "GSP Diamond" }]);
    expect(doc.controlPoints?.[0].crossings).toEqual(["x1"]);

    const f = moduleFeatures(doc);
    expect(f.crossings).toEqual([
      { id: "x1", name: "GSP Diamond", posFrac: 0.5, laneA: 0, laneB: 1 },
    ]);

    const back = docToState(doc, 96);
    expect(back.crossings).toEqual([
      { id: "x1", name: "GSP Diamond", pos: 48, trackA: "main", trackB: "foreign" },
    ]);
    expect(back.controlPoints[0].crossings).toEqual(["x1"]);
  });

  it("branch endplates C, D round-trip and become connector arrows once connected", () => {
    // The Frisco/MoPac case: a second railroad enters at one branch endplate
    // and leaves at another. The connector arrow follows the route drawn to each
    // (its trackId) — placing a bare endplate must not conjure one (#170).
    const s = emptyEditorState(120);
    s.branches.push(
      { label: "MoPac West", pos: 20, side: "down", config: "single", kind: "branch", trackId: "bw" },
      { label: "MoPac East", pos: 110, side: "up", config: "single", kind: "branch", trackId: "be" },
    );
    s.extraTracks.push(
      { id: "bw", role: "branch", lane: 2, fromPos: 20, toPos: 20, path: [{ x: 20, y: 0 }, { x: 20, y: -6 }], moduleTrackId: null, trackName: "MoPac West" },
      { id: "be", role: "branch", lane: 3, fromPos: 110, toPos: 110, path: [{ x: 110, y: 0 }, { x: 110, y: 6 }], moduleTrackId: null, trackName: "MoPac East" },
    );
    const doc = stateToDoc(s, "M");
    expect(doc.endplates.map((e) => e.id)).toEqual(["A", "B", "C", "D"]);
    expect(doc.endplates[2]).toMatchObject({ label: "MoPac West", at: { pos: 20, side: "down" } });
    expect(doc.endplates[3]).toMatchObject({ label: "MoPac East", at: { pos: 110, side: "up" } });

    const f = moduleFeatures(doc);
    // Each route runs to the EDGE of the module and ends at a plate, because an
    // endplate is an endplate whatever letter it carries (#183) — and each sits
    // a clear lane's GAP beyond everything else, so a full-width route can't be
    // mistaken for a parallel main.
    expect(f.branchConnectors).toEqual([
      {
        id: "C",
        label: "MoPac West",
        name: "MoPac West",
        trackId: "bw",
        kind: "branch",
        posFrac: 20 / 120,
        fromLane: 0,
        side: "down",
        lane: -2,
        endFrac: 1,
        lengthInches: 6,
      },
      {
        id: "D",
        label: "MoPac East",
        name: "MoPac East",
        trackId: "be",
        kind: "branch",
        posFrac: 110 / 120,
        fromLane: 0,
        side: "up",
        lane: 2,
        endFrac: 1,
        lengthInches: 6,
      },
    ]);
    // The branch lanes are part of the drawn extent — renderers need no extra
    // headroom of their own.
    expect([f.laneMin, f.laneMax]).toEqual([-2, 2]);
    expect(f.loop).toBe(false);

    const back = docToState(doc, 120);
    expect(back.branches).toEqual([
      { label: "MoPac West", pos: 20, side: "down", config: "single", kind: "branch", trackId: "bw" },
      { label: "MoPac East", pos: 110, side: "up", config: "single", kind: "branch", trackId: "be" },
    ]);
  });

  it("the branch connector sits at its feeding turnout, not the endplate's own spot", () => {
    const s = emptyEditorState(96);
    s.branches.push({ label: "Jct", pos: 12, side: "up", config: "single", kind: "branch", trackId: "br1" });
    s.extraTracks.push({
      id: "br1",
      role: "branch",
      lane: 2,
      fromPos: 60,
      toPos: 60,
      path: [{ x: 60, y: 0 }, { x: 12, y: 10 }],
      moduleTrackId: null,
      trackName: "To C",
    });
    s.turnouts.push({ id: "sw1", pos: 60, onTrack: "main", divergeTrack: "br1", kind: "right" });
    const f = moduleFeatures(stateToDoc(s, "M"));
    // Endplate C sits at pos 12, but the branch diverges at the turnout (60).
    expect(f.branchConnectors[0]?.posFrac).toBeCloseTo(60 / 96, 6);
  });

  it("pathLengthInches measures the path itself, arcs included", () => {
    expect(pathLengthInches([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBeCloseTo(5, 6);
    // A bulge equal to half the chord is a semicircle: length πr, not the 2r
    // chord. (Sampled in 20 segments, so a shade under.)
    expect(pathLengthInches([{ x: 0, y: 0, bulge: 10 }, { x: 0, y: 20 }])).toBeCloseTo(
      Math.PI * 10,
      1,
    );
    expect(pathLengthInches([{ x: 0, y: 0 }])).toBe(0);
    expect(pathLengthInches(undefined)).toBe(0);
  });

  it("a square 90° branch runs to the module edge and ends at a plate", () => {
    // The case that made branches invisible (#181): the endplate sits directly
    // out from its turnout, so the route projects to ZERO along the module axis.
    // It is an END of the module, so it runs to the edge like A and B do (#183);
    // its own on-module length is still reported for the tooltip.
    const s = emptyEditorState(96);
    s.branches.push({ label: "Jct", pos: 48, side: "up", config: "single", kind: "main", trackId: "br1" });
    s.extraTracks.push({
      id: "br1",
      role: "branch",
      lane: 2,
      fromPos: 48,
      toPos: 48,
      path: [{ x: 48, y: 0 }, { x: 48, y: 14 }],
      moduleTrackId: null,
      trackName: "Coast Sub",
    });
    s.turnouts.push({ id: "sw1", pos: 48, onTrack: "main", divergeTrack: "br1", kind: "right" });

    const b = moduleFeatures(stateToDoc(s, "M")).branchConnectors[0];
    expect(b.lengthInches).toBeCloseTo(14, 6); // its real 14″ on this module
    expect(b.posFrac).toBeCloseTo(48 / 96, 6); // leaves the main here
    expect(b.endFrac).toBe(1); // …and terminates at the module's edge
    // A diverging main is drawn as one — that's the whole point of the rule.
    expect(b.kind).toBe("main");
    expect(b.name).toBe("Coast Sub");
  });

  it("a route exits toward the edge its plate actually sits on", () => {
    // A junction near the west end leaves west. The letter is the module's own
    // fact; which module lies beyond it is Free-Dispatcher's to say.
    const s = emptyEditorState(96);
    s.branches.push({ label: "Jct", pos: 10, side: "up", config: "single", kind: "branch", trackId: "br1" });
    s.extraTracks.push({
      id: "br1",
      role: "branch",
      lane: 2,
      fromPos: 60,
      toPos: 60,
      path: [{ x: 60, y: 0 }, { x: 10, y: 18 }],
      moduleTrackId: null,
      trackName: "To C",
    });
    s.turnouts.push({ id: "sw1", pos: 60, onTrack: "main", divergeTrack: "br1", kind: "right" });

    const b = moduleFeatures(stateToDoc(s, "M")).branchConnectors[0];
    expect(b.posFrac).toBeCloseTo(60 / 96, 6); // leaves at its turnout
    expect(b.endFrac).toBe(0); // exits WEST, where endplate C sits
  });

  it("a branch takes a lane clear of the sidings already drawn", () => {
    const s = emptyEditorState(96);
    s.extraTracks.push(
      { id: "sd1", role: "siding", lane: 1, fromPos: 10, toPos: 40, moduleTrackId: null, trackName: "Siding" },
      { id: "sp1", role: "spur", lane: 2, fromPos: 50, toPos: 70, moduleTrackId: null, trackName: "Spur" },
    );
    s.branches.push({ label: "Jct", pos: 80, side: "up", config: "single", kind: "branch", trackId: "br1" });
    s.extraTracks.push({
      id: "br1",
      role: "branch",
      lane: 9,
      fromPos: 80,
      toPos: 80,
      path: [{ x: 80, y: 0 }, { x: 80, y: 8 }],
      moduleTrackId: null,
      trackName: "To C",
    });
    s.turnouts.push(
      { id: "sw1", pos: 10, onTrack: "main", divergeTrack: "sd1", kind: "right" },
      { id: "sw2", pos: 50, onTrack: "main", divergeTrack: "sp1", kind: "right" },
      { id: "sw3", pos: 80, onTrack: "main", divergeTrack: "br1", kind: "right" },
    );

    const f = moduleFeatures(stateToDoc(s, "M"));
    const b = f.branchConnectors[0];
    // Above every drawn lane, and the extents already account for it.
    expect(b.lane).toBeGreaterThan(Math.max(...f.extraTracks.map((t) => t.lane)));
    expect(f.laneMax).toBe(b.lane);
  });

  it("a return loop keeps its bulb — a loop track is role:\"branch\" but no endplate reaches it", () => {
    // The loop generator emits role:"branch" too. Branches are found via the
    // ENDPLATE's trackId, never the role, so a loop grows no stray lane (#181).
    const s = emptyEditorState(96);
    s.loop = true;
    s.extraTracks.push({
      id: "loop1",
      role: "branch",
      lane: 1,
      fromPos: 96,
      toPos: 96,
      path: [{ x: 96, y: 0 }, { x: 110, y: 14 }, { x: 96, y: 28 }],
      moduleTrackId: null,
      trackName: "Return loop",
    });

    const f = moduleFeatures(stateToDoc(s, "M"));
    expect(f.loop).toBe(true);
    expect(f.branchConnectors).toEqual([]);
    expect(f.laneMax).toBe(0);
  });

  it("a placed-but-unconnected branch endplate draws NO connector arrow", () => {
    // Adding a 3rd endplate alone must not put a junction arrow in the operating
    // view — the arrow only appears once track is drawn to it (#170).
    const doc = stateToDoc(
      { ...emptyEditorState(96), branches: [{ label: "Jct", pos: 40, side: "up", config: "single" }] },
      "M",
    );
    expect(doc.endplates.find((e) => e.id === "C")).toBeTruthy();
    expect(moduleFeatures(doc).branchConnectors).toEqual([]);
  });

  it("docs without crossings or branches are unchanged", () => {
    const doc = stateToDoc(emptyEditorState(96), "M");
    expect(doc.crossings).toBeUndefined();
    expect(doc.endplates).toHaveLength(2);
    const f = moduleFeatures(doc);
    expect(f.crossings).toEqual([]);
    expect(f.branchConnectors).toEqual([]);
  });
});

describe("editor state machine", () => {
  it("stateToDoc → docToState round-trips a passing siding", () => {
    let state = emptyEditorState(396);
    const built = buildPassingSiding(state);
    state = {
      ...state,
      extraTracks: [built.track],
      turnouts: built.turnouts,
      controlPoints: built.controlPoints,
    };
    const doc = stateToDoc(state, "FMN-0010");

    // The siding is a real track with a computed capacity; two switches; two CPs.
    expect(doc.tracks.find((t) => t.id === MAIN_TRACK_ID)?.role).toBe("main");
    expect(doc.tracks.filter((t) => t.role === "siding")).toHaveLength(1);
    expect(doc.turnouts).toHaveLength(2);
    expect(doc.controlPoints).toHaveLength(2);
    // opposite directions sit on opposite sides so they never overlap
    const sides = doc.controlPoints!.flatMap((c) => c.signals!.map((s) => `${s.facing}:${s.side}`));
    expect(new Set(sides)).toEqual(new Set(["AtoB:above", "BtoA:below"]));

    const back = docToState(doc, 396);
    expect(back.lengthInches).toBe(396);
    expect(back.extraTracks).toHaveLength(1);
    expect(back.turnouts).toHaveLength(2);
    expect(back.controlPoints).toHaveLength(2);
  });

  it("docToState treats the module length as authoritative and rescales", () => {
    // Doc authored at 432 but the module is 396 → positions scale by 396/432.
    const doc = stateToDoc(
      { ...emptyEditorState(432), extraTracks: [], turnouts: [
        { id: "sw1", name: "", pos: 216, onTrack: "main", divergeTrack: "x", kind: "right" },
      ] },
      "M",
    );
    const state = docToState(doc, 396);
    expect(state.lengthInches).toBe(396);
    expect(state.turnouts[0].pos).toBe(Math.round(216 * (396 / 432))); // 198
  });

  it("docToState keeps THOUSANDTHS when nothing is rescaled (#220)", () => {
    // The real numbers off FMN-0078: a scissors crossover's frogs, derived by
    // the package itself at 40.104 / 42.396. Opening the module rounded them to
    // 40.1 / 42.4 and the editor's autosave wrote that back — the app could not
    // hold a number it had computed. Same length in and out ⇒ nothing to absorb.
    const doc = stateToDoc(
      {
        ...emptyEditorState(96),
        turnouts: [
          { id: "sw1", name: "", pos: 40.104, onTrack: "main", divergeTrack: "xoA", kind: "left" },
          { id: "sw2", name: "", pos: 42.396, onTrack: "main", divergeTrack: "xoB", kind: "right" },
        ],
        extraTracks: [
          // `moduleTrackId: null` explicitly — an un-adopted track reads back as
          // null, and leaving it off would fail the whole-doc comparison below
          // for a reason that has nothing to do with precision.
          { id: "xoA", role: "crossover", lane: 1, fromPos: 40.104, toPos: 42.396, moduleTrackId: null },
        ],
      } as EditorState,
      "M",
    );
    const back = docToState(doc, 96);
    expect(back.turnouts.map((t) => t.pos)).toEqual([40.104, 42.396]);
    const xo = back.extraTracks.find((t) => t.id === "xoA");
    expect(xo?.fromPos).toBe(40.104);
    expect(xo?.toPos).toBe(42.396);
    // ⭐ The property that matters, not just the two numbers: the document that
    // comes back out is the one that went in. A save can then never degrade it.
    expect(stateToDoc(back, "M")).toEqual(doc);
  });

  it("docToState still rounds to hundredths when it DOES rescale (#220)", () => {
    // The guard keeps its job — 100.004 × (48/96) = 50.002, float noise from a
    // real multiply, and that is what hundredths are for.
    const doc = stateToDoc(
      {
        ...emptyEditorState(96),
        turnouts: [
          { id: "sw1", name: "", pos: 100.004, onTrack: "main", divergeTrack: "x", kind: "right" },
        ],
      } as EditorState,
      "M",
    );
    expect(docToState(doc, 48).turnouts[0].pos).toBe(50);
  });

  it("docToState adopts module_tracks not yet in the doc", () => {
    const doc = stateToDoc(emptyEditorState(240), "M");
    const state = docToState(doc, 240, [
      { id: 7, track_name: "House Track", capacity_scale_feet: 800 },
    ]);
    const adopted = state.extraTracks.find((t) => t.moduleTrackId === 7);
    expect(adopted?.trackName).toBe("House Track");
  });
});

describe("endplate poses (#175)", () => {
  it("straight: A at origin facing west, B at the far end facing east", () => {
    const [a, b] = deriveEndplatePoses({ lengthInches: 100 });
    expect(a).toMatchObject({ id: "A", x: 0, y: 0, heading: 180, trackConfig: "single", trackOffsets: [0] });
    expect(b).toMatchObject({ id: "B", x: 100, y: 0, heading: 0 });
  });

  it("offset: B parallel but jogged sideways by the offset", () => {
    const [, b] = deriveEndplatePoses({ lengthInches: 100, geometryType: "offset", geometryOffsetInches: 6 });
    expect(b).toMatchObject({ id: "B", x: 100, y: 6, heading: 0 });
  });

  it("corner_90: B on a quarter arc of arc-length L, heading 90", () => {
    const [, b] = deriveEndplatePoses({ lengthInches: 100, geometryType: "corner_90" });
    const r = 100 / (Math.PI / 2);
    expect(b.x).toBeCloseTo(r, 3);   // r·sin90 = r
    expect(b.y).toBeCloseTo(r, 3);   // r·(1-cos90) = r
    expect(b.heading).toBe(90);
  });

  it("corner_45 and curve turn by their angle", () => {
    const [, b45] = deriveEndplatePoses({ lengthInches: 100, geometryType: "corner_45" });
    expect(b45.heading).toBe(45);
    const [, bc] = deriveEndplatePoses({ lengthInches: 60, geometryType: "curve", geometryDegrees: 30 });
    expect(bc.heading).toBe(30);
    const r = 60 / (30 * (Math.PI / 180));
    expect(bc.x).toBeCloseTo(r * Math.sin(Math.PI / 6), 3);
    expect(bc.y).toBeCloseTo(r * (1 - Math.cos(Math.PI / 6)), 3);
  });

  it("dead_end / turnback has a single endplate (no B)", () => {
    const poses = deriveEndplatePoses({ lengthInches: 96, geometryType: "dead_end" });
    expect(poses.map((p) => p.id)).toEqual(["A"]);
  });

  it("a balloon / return loop has a single endplate (no spurious B at the throat)", () => {
    // A lead + curve sections summing to 360° chains back near the throat; the
    // loop returns on itself, so there's one endplate (A), not a far B (#loop).
    const balloon = (deg: number): SchematicSection => ({
      id: `c${deg}`,
      lengthInches: 20,
      geometryType: "curve",
      geometryDegrees: 90,
    });
    const poses = deriveEndplatePoses({
      lengthInches: 116,
      loop: true,
      sections: [
        { id: "lead", lengthInches: 36, geometryType: "straight" },
        balloon(90),
        balloon(90),
        balloon(90),
        balloon(90),
      ],
    });
    expect(poses.map((p) => p.id)).toEqual(["A"]);
    // Non-loop with the same chain still gets a B (at the chain's end).
    const withB = deriveEndplatePoses({
      lengthInches: 116,
      sections: [{ id: "lead", lengthInches: 36, geometryType: "straight" }, balloon(90)],
    });
    expect(withB.map((p) => p.id)).toEqual(["A", "B"]);
  });

  it("double endplate carries two track offsets (± half spacing)", () => {
    const [a, b] = deriveEndplatePoses({
      lengthInches: 96,
      endplateConfigs: ["single", "double"],
      trackHalfSpacingInches: 0.5625,
    });
    expect(a.trackOffsets).toEqual([0]);
    expect(b.trackOffsets).toEqual([-0.5625, 0.5625]);
    expect(b.trackConfig).toBe("double");
  });

  it("branch endplates sit along the axis facing out their side", () => {
    const poses = deriveEndplatePoses({
      lengthInches: 120,
      branches: [
        { id: "C", atPos: 20, side: "down" },
        { id: "D", atPos: 108, side: "up", config: "double" },
      ],
      trackHalfSpacingInches: 1,
    });
    expect(poses.find((p) => p.id === "C")).toMatchObject({ x: 20, heading: 270, trackOffsets: [0] });
    expect(poses.find((p) => p.id === "D")).toMatchObject({ x: 108, heading: 90, trackOffsets: [-1, 1] });
  });

  it("a manual override replaces the derived pose and flags it", () => {
    const poses = deriveEndplatePoses({
      lengthInches: 100,
      geometryType: "wye",
      poseOverrides: { B: { x: 40, y: -30, heading: 300 } },
    });
    expect(poses.find((p) => p.id === "B")).toMatchObject({ x: 40, y: -30, heading: 300, manual: true });
  });

  it("partExtent reads the measured parts, and the numbers reconcile with the rail-end readings", () => {
    // Will measured frog → end of the diverging rail independently of the tie
    // dimensions, and the two routes agree — that cross-check is what makes this
    // the strongest data in the library, so pin it.
    const seven = partExtent(trackPart("atlas-c55-n-7"))!;
    expect(seven.behindPoints).toBeCloseTo(0.625, 6);
    expect(seven.aheadOfPoints).toBeCloseTo(5.375, 6); // 6.00 − 0.625
    expect(seven.pastFrog).toBeCloseTo(1.78125, 6); // vs 1 13/16″ = 1.8125 read directly
    // Exactly one tape division apart — the closest the two routes come, and
    // the reason a tighter bound here would be fitting noise, not measurement.
    expect(Math.abs(seven.pastFrog - 1.8125)).toBeLessThanOrEqual(1 / 32);

    const five = partExtent(trackPart("atlas-c55-n-5"))!;
    expect(five.aheadOfPoints).toBeCloseTo(4.25, 6);
    expect(Math.abs(five.pastFrog - 1.3125)).toBeLessThanOrEqual(1 / 16);

    const ten = partExtent(trackPart("atlas-c55-n-10"))!;
    expect(ten.aheadOfPoints).toBeCloseTo(7.4375, 6);
    expect(Math.abs(ten.pastFrog - 2.5625)).toBeLessThanOrEqual(1 / 16);
  });

  it("a stored part derives its lead from the two offsets, not a separate column", () => {
    // They're measured from the same tie end, so the difference IS the lead. A
    // separately-typed lead could silently disagree with the positions it is
    // supposed to summarise, and that disagreement is the check worth keeping.
    const p = storedPartToTrackPart({
      slug: "peco-c55-n-6",
      manufacturer: "Peco",
      line: "Code 55",
      name: "#6 Turnout",
      kind: "turnout",
      frogNumber: 6,
      pointsOffsetInches: 0.75,
      pointsOffsetSource: "measured",
      frogOffsetInches: 4.25,
      frogOffsetSource: "measured",
      overallLengthInches: 6.5,
      overallLengthSource: "measured",
      leadInches: 99, // ignored — the offsets are the real reading
      leadSource: "measured",
      measurementNote: "test",
    });
    expect(p.lead).toMatchObject({ inches: 3.5, source: "measured" });

    // A part with only a lead (the wye) keeps it.
    const wye = storedPartToTrackPart({
      slug: "atlas-c55-n-wye",
      manufacturer: "Atlas",
      line: "Code 55",
      name: "#2.5 Wye",
      kind: "wye",
      frogNumber: 2.5,
      leadInches: 1.205,
      leadSource: "derived",
    });
    expect(wye.lead).toMatchObject({ inches: 1.205, source: "derived" });
    expect(wye.kind).toBe("wye");

    // A lead is only as good as the weaker of the two readings behind it.
    const shaky = storedPartToTrackPart({
      slug: "x",
      manufacturer: "X",
      line: "L",
      name: "n",
      pointsOffsetInches: 1,
      pointsOffsetSource: "measured",
      frogOffsetInches: 4,
      frogOffsetSource: "unverified",
    });
    expect(shaky.lead).toMatchObject({ inches: 3, source: "derived" });
  });

  it("a stored part REPLACES a built-in, and the built-ins remain the floor", () => {
    // The stored library is seeded from the built-ins and edited by an admin
    // holding the part — refusing the correction would mean a wrong dimension
    // could only be fixed by shipping a release.
    const merged = mergeStoredParts([
      {
        slug: "atlas-c55-n-7",
        manufacturer: "Atlas",
        line: "Code 55",
        name: "#7 Turnout",
        kind: "turnout",
        frogNumber: 7,
        pointsOffsetInches: 0.625,
        pointsOffsetSource: "measured",
        frogOffsetInches: 4.5, // a corrected reading
        frogOffsetSource: "measured",
        overallLengthInches: 6,
        overallLengthSource: "measured",
      },
      {
        slug: "peco-c55-n-6",
        manufacturer: "Peco",
        line: "Code 55",
        name: "#6 Turnout",
        kind: "turnout",
        frogNumber: 6,
        pointsOffsetInches: 0.75,
        pointsOffsetSource: "measured",
        frogOffsetInches: 4.25,
        frogOffsetSource: "measured",
        overallLengthInches: 6.5,
        overallLengthSource: "measured",
      },
    ]);

    expect(merged.find((p) => p.id === "atlas-c55-n-7")?.frogOffset?.inches).toBe(4.5);
    // Untouched built-ins survive, so geometry still works with no database.
    expect(merged.find((p) => p.id === "atlas-c55-n-5")?.frogOffset?.inches).toBe(4.75);
    // …and a newly stored part is now a real, drawable #6 — the gap closes.
    expect(partExtentForSize(6, merged)).toMatchObject({
      behindPoints: 0.75,
      aheadOfPoints: 5.75,
      pastFrog: 2.25,
    });
    expect(leadInchesForSize(6, merged)).toBeCloseTo(3.5, 6);
  });

  // ⛔ The flip side of that, and a real incident: replacement is WHOLESALE, so
  // an INCOMPLETE stored row silently deletes dimensions the built-in had. When
  // the Atlas wyes were measured in 0.78.0 their seeded rows still held null
  // offsets, so production saw no measurements at all — nothing failed, the
  // parts just looked unmeasured. Pinned so the behaviour is a decision rather
  // than a surprise, and so anyone measuring a built-in is told to update the
  // stored row too.
  it("an INCOMPLETE stored row erases the built-in's dimensions", () => {
    const before = trackPart("atlas-c55-n-wye")!;
    expect(before.frogOffset?.inches).toBe(4.125);
    expect(before.lead?.source).toBe("measured");

    const merged = mergeStoredParts([
      {
        slug: "atlas-c55-n-wye",
        manufacturer: "Atlas",
        line: "Code 55",
        name: "#2.5 Wye",
        kind: "wye",
        frogNumber: 2.5,
        // …every offset null, exactly as the original seed left them.
      },
    ]);
    const after = merged.find((p) => p.id === "atlas-c55-n-wye")!;
    expect(after.frogOffset).toBeUndefined();
    expect(after.pointsOffset).toBeUndefined();
    expect(after.overallLength).toBeUndefined();
    // …so the wye claims no body again, and flex runs straight through it.
    expect(partExtent(after)).toBeNull();
  });

  // Every dimension a manufacturer publishes has to survive the DB, or the
  // wholesale-replace trap above quietly deletes it the first time an admin
  // edits the part. Fast Tracks' set is the one that would go.
  it("carries a Fast Tracks part's own dimensions through the stored round-trip", () => {
    const merged = mergeStoredParts([
      {
        slug: "fast-tracks-n-me55-t-6",
        manufacturer: "Fast Tracks",
        line: "Code 55",
        name: "#6 Turnout",
        kind: "turnout",
        frogNumber: 6,
        buildable: true,
        overallLengthInches: 6.26,
        overallLengthSource: "manufacturer",
        minimumLengthInches: 4.3,
        minimumLengthSource: "manufacturer",
        substitutionRadiusInches: 24,
        substitutionRadiusSource: "manufacturer",
      },
    ]);
    const p = merged.find((x) => x.id === "fast-tracks-n-me55-t-6")!;
    expect(p.buildable).toBe(true);
    expect(p.minimumLength).toMatchObject({ inches: 4.3, source: "manufacturer" });
    expect(p.substitutionRadius).toMatchObject({ inches: 24, source: "manufacturer" });
    expect(p.overallLength!.inches).toBe(6.26);
    // Still no landmarks, so still no body — the DB cannot invent one.
    expect(partExtent(p)).toBeNull();
  });

  it("takes a MANUFACTURER's published figures, but never a derived one", () => {
    // Will, 2026-07-31: "For fast tracks, run with the default." A maker's own
    // spec is not a guess — Fast Tracks publish to two decimals and build to true
    // frog ratios. A DERIVED offset is a formula wearing a measurement's clothes,
    // and that is what this rule was written against; only its scope changed.
    const base = {
      id: "probe", manufacturer: "Fast Tracks", line: "Code 55", scale: "N" as const,
      name: "#6", kind: "turnout" as const, frogNumber: 6,
    };
    const published = partExtent({
      ...base,
      pointsOffset: { inches: 1.2, source: "manufacturer" },
      overallLength: { inches: 6.26, source: "manufacturer" },
    });
    expect(published).toMatchObject({ behindPoints: 1.2, aheadOfPoints: 6.26 - 1.2 });

    // One published + one measured is fine — the pair is what matters, not a
    // single provenance for both.
    expect(
      partExtent({
        ...base,
        pointsOffset: { inches: 1.2, source: "measured" },
        overallLength: { inches: 6.26, source: "manufacturer" },
      }),
    ).not.toBeNull();

    for (const bad of ["derived", "unverified"] as const)
      expect(
        partExtent({
          ...base,
          pointsOffset: { inches: 1.2, source: bad },
          overallLength: { inches: 6.26, source: "manufacturer" },
        }),
        `${bad} must not earn a body`,
      ).toBeNull();
  });

  it("the Fast Tracks #6 has a body now, and knows it does NOT know its frog", () => {
    // Will measured the points offset on his own build, 2026-07-31. The overall
    // length is Fast Tracks' published default, which now counts.
    const e = partExtentForSize(6)!;
    expect(e).not.toBeNull();
    expect(e.behindPoints).toBe(1.19);
    expect(e.aheadOfPoints).toBeCloseTo(6.26 - 1.19, 9);
    // ⭐ The half that is NOT known, said out loud rather than faked.
    expect(e.frogKnown).toBe(false);
  });

  it("a span is REFUSED without a frog reading, and granted with one", () => {
    // ⛔ `pos` marks the FROG, so placing a body needs the frog. Without it the
    // extent's behindFrog/pastFrog pretend the frog IS the points — 3.78" out on
    // a #6 — and the flex either side would be cut to fit a turnout that is not
    // there. The tie strip and its rail joints are measured from the POINTS and
    // are unaffected, which is why only this one thing is withheld.
    expect(turnoutOccupiedSpan({ pos: 27.8, extent: partExtentForSize(6), facing: -1 })).toBeNull();

    const atlas7 = partExtentForSize(7)!;
    expect(atlas7.frogKnown).toBe(true);
    expect(turnoutOccupiedSpan({ pos: 27.8, extent: atlas7, facing: -1 })).not.toBeNull();
  });

  it("one fixture's reading never stands in for its neighbours", () => {
    // A #6 is not a #5 or a #7. Only the fixture actually measured gains a body;
    // the other Fast Tracks turnouts keep drawing none.
    const ft = (n: number) => BUILT_IN_TRACK_PARTS.find((p) => p.id === `fast-tracks-n-me55-t-${n}`)!;
    expect(partExtent(ft(6))).not.toBeNull();
    for (const n of [4, 4.5, 5, 7, 8, 9, 10, 12]) expect(partExtent(ft(n)), `#${n}`).toBeNull();
  });

  it("...and that relaxation changes NOTHING in the shipped library today", () => {
    // ⭐ The blast radius, pinned. Every Fast Tracks part publishes an overall
    // length but NOT ONE publishes a pointsOffset, so none of them gains a body
    // from this — a single points-offset reading is still what completes them.
    // The generic turnouts are `derived` and must stay refused.
    const turnouts = BUILT_IN_TRACK_PARTS.filter((p) => p.frogNumber != null);
    const withExtent = turnouts.filter((p) => partExtent(p) !== null).map((p) => p.id);
    expect(withExtent).toEqual([
      "atlas-c55-n-5",
      "atlas-c55-n-7",
      "atlas-c55-n-10",
      "atlas-c55-n-wye",
      "atlas-c55-n-wye-35",
      "fast-tracks-n-me55-t-6",
    ]);
    // ⚠️ The #6 is the one exception now — Will measured it. Every other Fast
    // Tracks fixture still has no body.
    expect(
      turnouts
        .filter((p) => p.id.startsWith("fast-tracks") && p.id !== "fast-tracks-n-me55-t-6")
        .every((p) => partExtent(p) === null),
    ).toBe(true);
    expect(turnouts.filter((p) => p.id.startsWith("generic")).every((p) => partExtent(p) === null)).toBe(true);
  });

  it("carries divergingLength through the stored round-trip", () => {
    const merged = mergeStoredParts([
      {
        slug: "atlas-c55-n-wye-35",
        manufacturer: "Atlas",
        line: "Code 55",
        name: "#3.5 Wye",
        kind: "wye",
        frogNumber: 3.5,
        pointsOffsetInches: 0.75,
        pointsOffsetSource: "measured",
        frogOffsetInches: 3.15625,
        frogOffsetSource: "measured",
        overallLengthInches: 5,
        overallLengthSource: "measured",
        divergingLengthInches: 1.9375,
        divergingLengthSource: "measured",
      },
    ]);
    const p = merged.find((x) => x.id === "atlas-c55-n-wye-35")!;
    expect(p.divergingLength).toMatchObject({ inches: 1.9375, source: "measured" });
    // The lead still comes from the two offsets, not its own column.
    expect(p.lead?.inches).toBeCloseTo(2.40625, 6);
    expect(partExtent(p)).toEqual({
      behindPoints: 0.75,
      aheadOfPoints: 4.25,
      pastFrog: 1.84375,
      behindFrog: 3.15625,
      frogKnown: true,
    });
  });

  it("pastFrogInchesForSize interpolates like the lead does, and stays bounded", () => {
    // Measured: #5 = 1.25″, #7 = 1.78125″, #10 = 2.5″ past the frog.
    expect(pastFrogInchesForSize(5)).toBeCloseTo(1.25, 6);
    expect(pastFrogInchesForSize(7)).toBeCloseTo(1.78125, 6);
    expect(pastFrogInchesForSize(10)).toBeCloseTo(2.5, 6);
    // A #6 sits between the #5 and the #7 — the same rule the lead already uses.
    const six = pastFrogInchesForSize(6);
    expect(six).toBeGreaterThan(1.25);
    expect(six).toBeLessThan(1.78125);
    // ⚠️ The whole point: a turnout is drawn a few inches past its frog, not the
    // ~7″ the arrive-parallel leg used to run on a #7.
    expect(pastFrogInchesForSize(7)).toBeLessThan(3);
    // Never negative, however far out the extrapolation is pushed.
    expect(pastFrogInchesForSize(1)).toBeGreaterThanOrEqual(0);
  });

  it("partExtent refuses to guess — length is packaging, not a function of N", () => {
    // The #5 and the #7 are BOTH 6.00″, so nothing about N predicts a length.
    // ⚠️ The #6 USED to be the example here; Will measured his Fast Tracks #6 on
    // 2026-07-31, so the #4 carries the point now — the parts either side still
    // cannot supply a length for a size nobody has read.
    expect(partExtentForSize(4)).toBeNull();
    expect(partExtentForSize(8)).toBeNull();
    expect(partExtentForSize(7)).not.toBeNull();
    expect(partExtentForSize(10)).not.toBeNull();

    // A part carrying only derived dimensions is not a measurement either.
    expect(
      partExtent({
        id: "x",
        manufacturer: "X",
        line: "L",
        kind: "turnout",
        pointsOffset: { inches: 1, source: "derived" },
        overallLength: { inches: 6, source: "measured" },
      }),
    ).toBeNull();
    expect(partExtent(null)).toBeNull();
  });

  it("a single-ended module draws ONE endplate face, not two (#191)", () => {
    // The footprint used to trim to one face only for a loop, using "is it a
    // loop?" as a stand-in for "has it got two ends?" — so a pocket drew a plate
    // at an end it hasn't got. hasNoFarEndplate is now the single answer.
    const base = { lengthInches: 24, geometryType: "straight" } as const;
    expect(moduleFootprint({ ...base }).endplateFaces).toHaveLength(2);
    expect(
      moduleFootprint({ ...base, endplateConfigs: ["single", "none"] }).endplateFaces,
    ).toHaveLength(1);
    expect(moduleFootprint({ ...base, loop: true }).endplateFaces).toHaveLength(1);
    // ⚠️ A `dead_end` GEOMETRY draws NO faces at all, which is a separate
    // pre-existing quirk, not this fix: moduleCenterline returns a single point
    // for it, so there's no direction to build a face from — and a module with a
    // one-point centre-line has no length either. Pinned as-is so the oddity is
    // recorded rather than hidden; authoring a single-ended module goes through
    // `endplateConfigs` above, which works.
    expect(
      moduleFootprint({ lengthInches: 24, geometryType: "dead_end" }).endplateFaces,
    ).toHaveLength(0);

    // …and the predicate itself, since three places now share it.
    expect(hasNoFarEndplate({ geometryType: "straight" })).toBe(false);
    expect(hasNoFarEndplate({ geometryType: "dead_end" })).toBe(true);
    expect(hasNoFarEndplate({ loop: true })).toBe(true);
    expect(hasNoFarEndplate({ endplateConfigs: ["single", "none"] })).toBe(true);
    expect(hasNoFarEndplate({ endplateConfigs: ["single", "double"] })).toBe(false);
  });

  it("a module can present ONE endplate — an end of the line or a pocket (#184)", () => {
    // A straight board that simply stops. No geometry type says this (it isn't a
    // dead_end curve or a loop); the owner says it, by giving end B no plate.
    const doc = stateToDoc({ ...emptyEditorState(96), configB: "none" as const }, "M");
    expect(doc.endplates.map((e) => e.id)).toEqual(["A"]);

    const poses = deriveEndplatePoses({
      lengthInches: 96,
      geometryType: "straight",
      endplateConfigs: ["single", "none"],
    });
    expect(poses.map((p) => p.id)).toEqual(["A"]);

    // …and the ordinary two-ended module is untouched.
    const two = stateToDoc(emptyEditorState(96), "M");
    expect(two.endplates.map((e) => e.id)).toEqual(["A", "B"]);
    expect(
      deriveEndplatePoses({ lengthInches: 96, geometryType: "straight" }).map((p) => p.id),
    ).toEqual(["A", "B"]);
  });

  it("a single-ended module round-trips, and is NOT read as a loop (#191)", () => {
    const doc = stateToDoc({ ...emptyEditorState(120), configB: "none" as const }, "M");
    const back = docToState(doc, 120);
    // No endplate B ⇒ "none", because the plate is absent — not because the
    // module is a turnback. This round trip previously survived only via the
    // loop misclassification.
    expect(back.configB).toBe("none");
    expect(back.loop).toBe(false);
    const f = moduleFeatures(doc);
    expect(f.loop).toBe(false);
    // …and renderers are told there's no far end, so they don't label one.
    expect(f.hasEndplateB).toBe(false);
    expect(moduleFeatures(stateToDoc(emptyEditorState(120), "M")).hasEndplateB).toBe(true);
  });

  it("poseNeedsManual flags wye and other only", () => {
    expect(poseNeedsManual("wye")).toBe(true);
    expect(poseNeedsManual("other")).toBe(true);
    expect(poseNeedsManual("corner_90")).toBe(false);
    expect(poseNeedsManual("straight")).toBe(false);
  });
});

describe("manual pose overrides (#175 phase 1b)", () => {
  it("stateToDoc writes endplate.pose; docToState + poseOverridesFromDoc read it", () => {
    const s = { ...emptyEditorState(120), poseOverrides: { B: { x: 40, y: -30, heading: 300 } } };
    const doc = stateToDoc(s, "M");
    expect(doc.endplates.find((e) => e.id === "B")?.pose).toEqual({ x: 40, y: -30, heading: 300 });
    expect(doc.endplates.find((e) => e.id === "A")?.pose).toBeUndefined();
    expect(poseOverridesFromDoc(doc)).toEqual({ B: { x: 40, y: -30, heading: 300 } });
    expect(docToState(doc, 120).poseOverrides).toEqual({ B: { x: 40, y: -30, heading: 300 } });
  });

  it("an UNFLAGGED pose on A/B is derived residue — ignored, so the plate keeps following the module (#182)", () => {
    // Exactly FMN-0068's stored shape: a straight 47.9″ board that picked up
    // poses for A and B. B's was written when the board was 48″ and never
    // followed it down, which is the whole failure — honouring it pins the
    // plate 0.1″ past its own end.
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 47.9,
      endplates: [
        { id: "A", pose: { x: 0, y: 0, heading: 180 } },
        { id: "B", pose: { x: 48, y: 0, heading: 0 } },
      ],
      tracks: [{ id: "main", role: "main", lane: 0, from: "A", to: "B" }],
    };
    expect(poseOverridesFromDoc(doc)).toEqual({});

    const poses = deriveEndplatePoses({
      lengthInches: 47.9,
      geometryType: "straight",
      poseOverrides: poseOverridesFromDoc(doc),
    });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.x).toBe(47.9); // follows the module, not pinned at the stale 48
    expect(b.manual).toBeUndefined();
  });

  it("an OFF-AXIS pose on B counts as authored even without the flag (old docs)", () => {
    // A wye's B is hand-placed off the axis — that's WHY it needed placing, and
    // derivation could never have produced it. Free-Dispatcher's footprint
    // compositor relies on this.
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 100,
      endplates: [{ id: "A" }, { id: "B", pose: { x: 10, y: 90, heading: 90 } }],
      tracks: [{ id: "main", role: "main", lane: 0 }],
    };
    expect(poseOverridesFromDoc(doc)).toEqual({ B: { x: 10, y: 90, heading: 90 } });
  });

  it("an AUTHORED pose still overrides — the capability is intact", () => {
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 47.9,
      endplates: [
        { id: "A" },
        { id: "B", pose: { x: 48, y: 3, heading: 10 }, poseAuthored: true },
      ],
      tracks: [{ id: "main", role: "main", lane: 0, from: "A", to: "B" }],
    };
    expect(poseOverridesFromDoc(doc)).toEqual({ B: { x: 48, y: 3, heading: 10 } });
  });

  it("a PLACED branch endplate keeps its pose with or without the flag", () => {
    // Its pose IS its placement — there's nothing to derive it from — and docs
    // written before the flag existed must keep working.
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 47.9,
      endplates: [
        { id: "A" },
        { id: "B" },
        { id: "C", at: { pos: 12, side: "up" }, pose: { x: 12, y: 12, heading: 90 } },
      ],
      tracks: [{ id: "main", role: "main", lane: 0, from: "A", to: "B" }],
    };
    expect(poseOverridesFromDoc(doc)).toEqual({ C: { x: 12, y: 12, heading: 90 } });
  });

  it("saving marks an override authored, so a healed doc can't re-pin itself", () => {
    const doc = stateToDoc(
      { ...emptyEditorState(120), poseOverrides: { B: { x: 40, y: -30, heading: 300 } } },
      "M",
    );
    expect(doc.endplates.find((e) => e.id === "B")?.poseAuthored).toBe(true);
    // …and a plate with no override gains neither field.
    expect(doc.endplates.find((e) => e.id === "A")?.poseAuthored).toBeUndefined();
    // Round-trips: an authored override survives save → load → save.
    expect(poseOverridesFromDoc(doc)).toEqual({ B: { x: 40, y: -30, heading: 300 } });
  });

  it("deriveEndplatePoses honours the doc's overrides via poseOverridesFromDoc", () => {
    const doc = stateToDoc(
      { ...emptyEditorState(100), poseOverrides: { B: { x: 10, y: 90, heading: 90 } } },
      "M",
    );
    const poses = deriveEndplatePoses({
      lengthInches: 100,
      poseOverrides: poseOverridesFromDoc(doc),
    });
    expect(poses.find((p) => p.id === "B")).toMatchObject({ x: 10, y: 90, heading: 90, manual: true });
  });
});

describe("industries (#industries)", () => {
  const withIndustry = () => {
    const s = emptyEditorState(96);
    s.extraTracks.push({
      id: "sp1",
      role: "spur",
      lane: 1,
      fromPos: 10,
      toPos: 60,
      moduleTrackId: 7,
      trackName: "Team Track",
    });
    s.industries.push({
      id: "ind1",
      name: "Ace Feed",
      type: "grain",
      track: "sp1",
      fromPos: 20,
      toPos: 53, // 33" span → 10 cars at 3.3"/car
      spots: [],
      side: "below",
      labelMode: "cars",
      carTypes: ["covered_hopper", "boxcar"],
      moduleIndustryId: 42,
    });
    return s;
  };

  it("carCapacity derives cars from a span length (never typed)", () => {
    expect(carCapacity(20, 53)).toBe(10); // 33 / 3.3
    expect(carCapacity(53, 20)).toBe(10); // order-independent
    expect(carCapacity(0, 0)).toBe(0);
    expect(N_CAR_LENGTH_INCHES).toBeGreaterThan(0);
  });

  it("emits an industries array only when some are authored", () => {
    expect(stateToDoc(emptyEditorState(96), "M").industries).toBeUndefined();
    const doc = stateToDoc(withIndustry(), "M");
    expect(doc.industries).toHaveLength(1);
    expect(doc.industries?.[0]).toMatchObject({
      id: "ind1",
      name: "Ace Feed",
      type: "grain",
      track: "sp1",
      fromPos: 20,
      toPos: 53,
      side: "below",
      labelMode: "cars",
      carTypes: ["covered_hopper", "boxcar"],
      moduleIndustryId: 42,
    });
  });

  it("round-trips through docToState unchanged at the same length", () => {
    const doc = stateToDoc(withIndustry(), "M");
    const back = docToState(doc, 96, []);
    expect(back.industries).toEqual(withIndustry().industries);
  });

  it("rescales span positions with the module length, like other features", () => {
    const doc = stateToDoc(withIndustry(), "M"); // authored at len 96
    const back = docToState(doc, 48, []); // half length
    expect(back.industries[0].fromPos).toBe(10); // 20 → 10
    // 53 → 26.5, KEPT. This used to assert 27: positions were rounded to whole
    // inches on load, which silently flattened authored measurements (#132) and
    // autosaved the rounded value back over them.
    expect(back.industries[0].toPos).toBe(26.5);
  });

  it("moduleFeatures resolves an industry to a DrawIndustry beside its track lane", () => {
    const f = moduleFeatures(stateToDoc(withIndustry(), "M"));
    expect(f.industries).toHaveLength(1);
    expect(f.industries[0]).toMatchObject({
      id: "ind1",
      name: "Ace Feed",
      lane: 1, // sits on spur sp1's lane
      side: "below",
      labelMode: "cars",
      cars: 10,
    });
    expect(f.industries[0].fromFrac).toBeCloseTo(20 / 96, 5);
    expect(f.industries[0].toFrac).toBeCloseTo(53 / 96, 5);
  });

  it("emits one DrawIndustry per spot for a multi-track (house-track) industry", () => {
    const s = withIndustry();
    s.extraTracks.push({
      id: "sp2",
      role: "spur",
      lane: 2,
      fromPos: 15,
      toPos: 55,
      moduleTrackId: 8,
      trackName: "House Track 2",
    });
    s.industries[0].spots = [{ track: "sp2", fromPos: 30, toPos: 40, side: "above" }];
    const doc = stateToDoc(s, "M");
    expect(doc.industries?.[0].spots).toHaveLength(1);
    // Round-trips.
    expect(docToState(doc, 96, []).industries[0].spots).toEqual([
      { track: "sp2", fromPos: 30, toPos: 40, side: "above" },
    ]);
    // Two DrawIndustry entries, one per spot, sharing the name; each on its lane.
    const f = moduleFeatures(doc);
    expect(f.industries).toHaveLength(2);
    expect(f.industries.map((i) => i.name)).toEqual(["Ace Feed", "Ace Feed"]);
    expect(f.industries.map((i) => i.lane)).toEqual([1, 2]);
    expect(f.industries[1].id).toBe("ind1-s1");
  });

  it("defaults labelMode to none and drops empty car-type lists", () => {
    const s = emptyEditorState(96);
    s.industries.push({
      id: "i2",
      name: "Interchange",
      type: "",
      track: "main",
      fromPos: 0,
      toPos: 24,
      side: "above",
      labelMode: "none",
      carTypes: [],
      moduleIndustryId: null,
    });
    const doc = stateToDoc(s, "M");
    expect(doc.industries?.[0].labelMode).toBeUndefined();
    expect(doc.industries?.[0].carTypes).toBeUndefined();
    expect(docToState(doc, 96, []).industries[0].labelMode).toBe("none");
  });
});

describe("section breaks (#48)", () => {
  it("round-trips section joints and rescales them with the module length", () => {
    const s = emptyEditorState(96);
    s.sectionBreaks = [24, 48, 72];
    const doc = stateToDoc(s, "M");
    expect(doc.sectionBreaks).toEqual([24, 48, 72]);
    expect(docToState(doc, 96, []).sectionBreaks).toEqual([24, 48, 72]);
    // Half the authored length → joints scale with it.
    expect(docToState(doc, 48, []).sectionBreaks).toEqual([12, 24, 36]);
  });
  it("omits section breaks for a single-section module", () => {
    const doc = stateToDoc(emptyEditorState(48), "M");
    expect(doc.sectionBreaks).toBeUndefined();
  });
});

describe("authored track paths (#2d-track)", () => {
  it("samplePath expands an open path and always reaches the last vertex", () => {
    const straight = samplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(straight[0]).toEqual({ x: 0, y: 0 });
    expect(straight[straight.length - 1]).toEqual({ x: 10, y: 0 });
    // A bulged edge emits intermediate arc points (more than the 2 endpoints).
    const curved = samplePath([{ x: 0, y: 0, bulge: 3 }, { x: 12, y: 0 }]);
    expect(curved.length).toBeGreaterThan(2);
    expect(curved[curved.length - 1]).toEqual({ x: 12, y: 0 });
  });

  it("trackPath needs >= 2 valid points, else null", () => {
    expect(trackPath(null)).toBeNull();
    expect(trackPath([{ x: 0, y: 0 }])).toBeNull();
    expect(trackPath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toHaveLength(2);
  });

  it("moduleCenterline prefers an authored mainPath over the geometry fields", () => {
    // Geometry says straight, but the owner drew an L — the drawing wins.
    const c = moduleCenterline({
      lengthInches: 48,
      geometryType: "straight",
      mainPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }],
    });
    expect(c[0]).toEqual({ x: 0, y: 0 });
    expect(c[c.length - 1]).toEqual({ x: 40, y: 20 });
  });

  it("moduleCenterline still derives when no mainPath is authored", () => {
    const c = moduleCenterline({ lengthInches: 48, geometryType: "straight" });
    expect(c).toEqual([{ x: 0, y: 0 }, { x: 48, y: 0 }]);
  });

  it("moduleCenterline is empty with no mainPath and no geometry (fresh module)", () => {
    expect(moduleCenterline({ lengthInches: 48 })).toEqual([]);
    expect(moduleCenterline({ lengthInches: 48, geometryType: "" })).toEqual([]);
    // …but a drawn main still wins even without geometry.
    const c = moduleCenterline({
      lengthInches: 48,
      mainPath: [{ x: 0, y: 0 }, { x: 48, y: 0 }],
    });
    expect(c[c.length - 1]).toEqual({ x: 48, y: 0 });
  });

  it("round-trips mainPath + a track path through the doc, unscaled by length", () => {
    const s = emptyEditorState(96);
    s.mainPath = [{ x: 0, y: 0 }, { x: 50, y: 0, bulge: 4 }, { x: 96, y: 0 }];
    s.extraTracks.push({
      id: "sp1", role: "spur", lane: 1, fromPos: 10, toPos: 60,
      moduleTrackId: null, trackName: "Bent Spur",
      path: [{ x: 10, y: 6 }, { x: 40, y: 18 }],
    });
    const doc = stateToDoc(s, "M");
    expect(doc.mainPath).toHaveLength(3);
    expect(doc.tracks.find((t) => t.id === "sp1")?.path).toHaveLength(2);
    // Reopen at HALF length — the path is a physical shape, so it must NOT rescale.
    const back = docToState(doc, 48, []);
    expect(back.mainPath).toEqual(s.mainPath);
    expect(back.extraTracks[0].path).toEqual([{ x: 10, y: 6 }, { x: 40, y: 18 }]);
  });

  it("emits no mainPath key when none is authored", () => {
    expect(stateToDoc(emptyEditorState(48), "M").mainPath).toBeUndefined();
  });
});

describe("checkEndplateWidth reads the offset as MAIN 1's position", () => {
  it("an authored offset shifts BOTH tracks on a double end", () => {
    // Main 1 at +2 -> Main 2 at +3.125; worst is 3.125 from centre, so the
    // plate must be 2*(3.125+4) = 14.25" to keep 4" of fascia clearance.
    const issues = checkEndplateWidth({ widthInches: 12, config: "double", trackOffsetInches: 2 });
    const c = issues.find((i) => i.code === "clearance");
    expect(c?.requiredInches).toBeCloseTo(14.25);
  });

  it("an offset single end is checked against its own track", () => {
    expect(
      checkEndplateWidth({ widthInches: 24, config: "single", trackOffsetInches: 0.5625 }),
    ).toEqual([]);
    const tight = checkEndplateWidth({
      widthInches: 12,
      config: "single",
      trackOffsetInches: 3,
    });
    expect(tight.find((i) => i.code === "clearance")?.requiredInches).toBeCloseTo(14);
  });
});

describe("sections as objects (#96 phase 2)", () => {
  const peninsula = [
    { x: 60, y: 12 },
    { x: 72, y: 12 },
    { x: 72, y: 48 },
    { x: 60, y: 48 },
  ];

  it("round-trips named sections with their own outlines", () => {
    const s = emptyEditorState(96);
    const doc = stateToDoc(
      {
        ...s,
        sections: [
          { id: "s1", name: "west transition" },
          { id: "s2", name: "peninsula", outline: peninsula },
        ],
      },
      "M",
    );
    expect(doc.sections).toEqual([
      { id: "s1", name: "west transition" },
      { id: "s2", name: "peninsula", outline: peninsula },
    ]);
    expect(docToState(doc).sections).toEqual(doc.sections);
  });

  it("is purely additive — a doc without sections is unchanged", () => {
    const doc = stateToDoc(emptyEditorState(96), "M");
    expect(doc.sections).toBeUndefined();
    expect(docToState(doc).sections).toEqual([]);
  });

  it("drops sections with no id and blank names", () => {
    const secs = moduleSections({
      sections: [
        { id: "", name: "nameless" },
        { id: "s1", name: "   " },
      ] as never,
    });
    expect(secs).toEqual([{ id: "s1" }]);
  });

  it("keeps an outline only when it's a real polygon", () => {
    expect(moduleSections({ sections: [{ id: "s", outline: [{ x: 0, y: 0 }] }] })).toEqual([
      { id: "s" },
    ]);
    expect(sectionFootprints({ sections: [{ id: "s", outline: peninsula }] })).toHaveLength(1);
  });

  it("shaped sections become the footprint and retire the module outline", () => {
    const withSections = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      outline: [
        { x: 0, y: -12 },
        { x: 96, y: -12 },
        { x: 96, y: 12 },
        { x: 0, y: 12 },
      ],
      sections: [{ id: "s2", name: "peninsula", outline: peninsula }],
    });
    expect(withSections.sectionOutlines).toHaveLength(1);
    // Both would be ambiguous — a renderer shouldn't have to pick a winner.
    expect(withSections.outline).toBeNull();

    // Without sections nothing changes: the module outline still speaks.
    const plain = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      outline: [
        { x: 0, y: -12 },
        { x: 96, y: -12 },
        { x: 96, y: 12 },
        { x: 0, y: 12 },
      ],
    });
    expect(plain.sectionOutlines).toEqual([]);
    expect(plain.outline).not.toBeNull();
  });

  it("a section with only a name doesn't claim to be a shape", () => {
    const fp = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      outline: [
        { x: 0, y: -12 },
        { x: 96, y: -12 },
        { x: 96, y: 12 },
        { x: 0, y: 12 },
      ],
      sections: [{ id: "s1", name: "west transition" }],
    });
    expect(fp.sectionOutlines).toEqual([]);
    expect(fp.outline).not.toBeNull();
  });
});

describe("sections-first geometry (#108)", () => {
  // One Mile in miniature: straight boards with two curved ones in the middle.
  const oneMile = {
    sections: [
      { id: "a", name: "west transition", lengthInches: 36 },
      { id: "b", lengthInches: 60 },
      { id: "c", lengthInches: 24, geometryType: "curve", geometryDegrees: 45 },
      { id: "d", lengthInches: 24, geometryType: "curve", geometryDegrees: 45 },
      { id: "e", lengthInches: 60 },
      { id: "f", name: "east transition", lengthInches: 36 },
    ],
  };

  it("derives the module length as the sum of its sections", () => {
    expect(moduleLengthFromSections(oneMile)).toBe(240);
    expect(moduleLengthFromSections({ sections: [] })).toBeNull();
    // A named section with no length yet doesn't claim any of the module.
    expect(moduleLengthFromSections({ sections: [{ id: "x", name: "unbuilt" }] })).toBeNull();
  });

  it("derives the joints instead of authoring them", () => {
    expect(sectionBreaksFromSections(oneMile)).toEqual([36, 96, 120, 144, 204]);
    expect(sectionSpans(oneMile)[2]).toEqual({ id: "c", fromPos: 96, toPos: 120 });
  });

  it("chains sections into one centre-line, turning where the boards turn", () => {
    const c = sectionedCenterline(oneMile);
    expect(c.length).toBeGreaterThan(2);
    expect(c[0]).toEqual({ x: 0, y: 0 });
    // 45° + 45° of curve means the far end runs due +y, having turned 90°.
    const n = c.length;
    const dx = c[n - 1].x - c[n - 2].x;
    const dy = c[n - 1].y - c[n - 2].y;
    expect(Math.atan2(dy, dx) * (180 / Math.PI)).toBeCloseTo(90, 4);
    // Arc length is the sum of the section lengths (curves are sampled, so
    // allow a little chord shortening).
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
    expect(len).toBeGreaterThan(239);
    expect(len).toBeLessThanOrEqual(240.001);
  });

  it("a straight-only set of sections is just a straight line", () => {
    const c = sectionedCenterline({
      sections: [
        { id: "a", lengthInches: 24 },
        { id: "b", lengthInches: 24 },
      ],
    });
    expect(c[c.length - 1]).toEqual({ x: 48, y: 0 });
    expect(c.every((p) => p.y === 0)).toBe(true);
  });

  it("moduleCenterline prefers sections over the module geometry", () => {
    const c = moduleCenterline({
      lengthInches: 999, // stale module-level length: the sections win
      geometryType: "straight",
      sections: oneMile.sections,
    });
    expect(c[0]).toEqual({ x: 0, y: 0 });
    expect(c[c.length - 1].y).toBeGreaterThan(0); // it curved
  });

  it("still uses the module geometry when there are no sections", () => {
    const c = moduleCenterline({ lengthInches: 96, geometryType: "straight" });
    expect(c).toEqual([
      { x: 0, y: 0 },
      { x: 96, y: 0 },
    ]);
  });

  it("an authored mainPath still wins over everything", () => {
    const c = moduleCenterline({
      lengthInches: 96,
      geometryType: "straight",
      sections: oneMile.sections,
      mainPath: [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    });
    expect(c[0]).toEqual({ x: 0, y: 5 });
  });

  it("round-trips section geometry", () => {
    const s = emptyEditorState(240);
    const doc = stateToDoc({ ...s, sections: oneMile.sections }, "M");
    expect(doc.sections).toEqual(oneMile.sections);
    expect(docToState(doc).sections).toEqual(oneMile.sections);
  });
});

describe("a section's outline belongs to the section (#96 phase 2b)", () => {
  const input = {
    lengthInches: 96,
    geometryType: "straight",
    endplateWidths: { A: 24, B: 24 },
    sections: [
      { id: "s1", lengthInches: 36 },
      { id: "s2", name: "peninsula", lengthInches: 60 },
    ],
  };

  it("derives a band per section when none is authored", () => {
    const fp = moduleFootprint(input);
    expect(fp.sectionOutlines).toHaveLength(2);
    expect(fp.sectionOutlines.every((s) => s.derived)).toBe(true);
    // Each band covers only its own stretch of the module.
    const xs = (i: number) => fp.sectionOutlines[i].outline.map((p) => p.x);
    expect(Math.min(...xs(0))).toBeCloseTo(0);
    expect(Math.max(...xs(0))).toBeCloseTo(36);
    expect(Math.min(...xs(1))).toBeCloseTo(36);
    expect(Math.max(...xs(1))).toBeCloseTo(96);
  });

  it("a derived band follows the board when the section is resized", () => {
    const wider = moduleFootprint({
      ...input,
      sections: [{ id: "s1", lengthInches: 50 }, { id: "s2", lengthInches: 60 }],
    });
    expect(Math.max(...wider.sectionOutlines[0].outline.map((p) => p.x))).toBeCloseTo(50);
  });

  it("an authored outline stays exactly as drawn", () => {
    const drawn = [
      { x: 40, y: 12 },
      { x: 60, y: 12 },
      { x: 60, y: 48 },
      { x: 40, y: 48 },
    ];
    const fp = moduleFootprint({
      ...input,
      sections: [
        { id: "s1", lengthInches: 36 },
        { id: "s2", lengthInches: 60, outline: drawn },
      ],
    });
    const s2 = fp.sectionOutlines.find((s) => s.id === "s2")!;
    expect(s2.derived).toBe(false);
    // It reaches to y=48 — well off the 24" band — because it was authored.
    expect(Math.max(...s2.outline.map((p) => p.y))).toBeCloseTo(48);
    // Its neighbour is still derived, so the two coexist.
    expect(fp.sectionOutlines.find((s) => s.id === "s1")!.derived).toBe(true);
  });

  it("section widths interpolate across the MODULE, not each section", () => {
    // A tapered module: 12" at A, 36" at B. The joint at 48" should be 24".
    const fp = moduleFootprint({
      ...input,
      endplateWidths: { A: 12, B: 36 },
      sections: [{ id: "s1", lengthInches: 48 }, { id: "s2", lengthInches: 48 }],
    });
    const ys = fp.sectionOutlines[0].outline.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(12); // half of 24 at the joint
    expect(Math.min(...ys)).toBeCloseTo(-12);
  });

  it("sliceCenterline cuts exactly on the requested positions", () => {
    const c = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(sliceCenterline(c, 20, 60)).toEqual([
      { x: 20, y: 0 },
      { x: 60, y: 0 },
    ]);
    expect(sliceCenterline(c, 10, 10)).toEqual([]);
    // Out-of-range is clamped, not an error.
    expect(sliceCenterline(c, -50, 500)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });
});

describe("section adjacency from shared edges (#96 phase 2c)", () => {
  const rect = (id: string, x0: number, x1: number, y0: number, y1: number) => ({
    id,
    outline: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    derived: true,
  });

  it("finds a butt joint and measures the shared edge", () => {
    const adj = sectionAdjacency([rect("a", 0, 36, -12, 12), rect("b", 36, 96, -12, 12)]);
    expect(adj).toHaveLength(1);
    expect(adj[0].lengthInches).toBeCloseTo(24);
  });

  it("finds a PENINSULA hanging off the back of a band", () => {
    // The case list order can't express: the peninsula is section 3, but it
    // meets the band (section 1) along part of its back edge, not section 2.
    const band = rect("band", 0, 96, -12, 12);
    const next = rect("next", 96, 140, -12, 12);
    const peninsula = rect("peninsula", 40, 60, 12, 60);
    const adj = sectionAdjacency([band, next, peninsula]);
    expect(sectionNeighbours("peninsula", adj)).toEqual(["band"]);
    expect(adj.find((x) => x.b === "peninsula")!.lengthInches).toBeCloseTo(20);
    // …and it is NOT a neighbour of the board next to it in the list.
    expect(sectionNeighbours("next", adj)).toEqual(["band"]);
  });

  it("ignores boards that only touch at a corner, or not at all", () => {
    expect(sectionAdjacency([rect("a", 0, 36, -12, 12), rect("b", 36, 60, 12, 40)])).toEqual([]);
    expect(sectionAdjacency([rect("a", 0, 36, -12, 12), rect("b", 60, 96, -12, 12)])).toEqual([]);
  });

  it("tolerates a hair of slop between hand-drawn boards", () => {
    const adj = sectionAdjacency([rect("a", 0, 36, -12, 12), rect("b", 36.2, 96, -12, 12)]);
    expect(adj).toHaveLength(1);
  });

  it("groups sections into connected pieces", () => {
    const joined = sectionAdjacency([rect("a", 0, 36, -12, 12), rect("b", 36, 96, -12, 12)]);
    expect(sectionComponents(["a", "b"], joined)).toEqual([["a", "b"]]);

    // A floating board is its own piece — the check phase 3 needs before it
    // can say whether dropping a section leaves the rest intact.
    const split = sectionAdjacency([rect("a", 0, 36, -12, 12), rect("c", 200, 240, -12, 12)]);
    expect(sectionComponents(["a", "c"], split)).toHaveLength(2);
  });

  it("reads adjacency off a real derived module", () => {
    const fp = moduleFootprint({
      lengthInches: 96,
      geometryType: "straight",
      endplateWidths: { A: 24, B: 24 },
      sections: [
        { id: "s1", lengthInches: 36 },
        { id: "s2", lengthInches: 60 },
      ],
    });
    const adj = sectionAdjacency(fp.sectionOutlines);
    expect(adj).toHaveLength(1);
    expect(adj[0].lengthInches).toBeCloseTo(24);
  });
});

describe("endplate B follows the sections (#108)", () => {
  it("lands at the end of the chained boards, not the straight-module end", () => {
    // 240" straight then a 90° corner: B is up and round, facing north — NOT
    // at (264, 0) where a single module-level geometry would put it.
    const poses = deriveEndplatePoses({
      lengthInches: 264,
      geometryType: "straight",
      sections: [
        { id: "a", lengthInches: 240 },
        { id: "b", lengthInches: 24, geometryType: "corner_90" },
      ],
    });
    const b = poses.find((p) => p.id === "B")!;
    expect(b.x).toBeGreaterThan(240);
    expect(b.y).toBeGreaterThan(10); // it turned
    expect(b.heading).toBeCloseTo(90, 0);
  });

  it("is unchanged for a module with no sections", () => {
    const b = deriveEndplatePoses({ lengthInches: 96, geometryType: "straight" }).find(
      (p) => p.id === "B",
    )!;
    expect(b.x).toBeCloseTo(96);
    expect(b.y).toBeCloseTo(0);
    expect(b.heading).toBeCloseTo(0);
  });

  it("still honours a manual pose override", () => {
    const b = deriveEndplatePoses({
      lengthInches: 264,
      sections: [{ id: "a", lengthInches: 240 }],
      poseOverrides: { B: { x: 5, y: 6, heading: 7 } },
    }).find((p) => p.id === "B")!;
    expect(b).toMatchObject({ x: 5, y: 6, heading: 7, manual: true });
  });
});

describe("a double stretch bounded at BOTH ends (#118)", () => {
  const siding = (): EditorState => ({
    ...emptyEditorState(384),
    configA: "single",
    configB: "single",
    turnouts: [
      { id: "sw1", pos: 13, onTrack: MAIN_TRACK_ID, divergeTrack: MAIN2_TRACK_ID, hand: "left" },
      { id: "sw2", pos: 367, onTrack: MAIN_TRACK_ID, divergeTrack: MAIN2_TRACK_ID, hand: "right" },
    ] as never,
  });

  it("Main 2 lives between the two turnouts, not out to the endplate", () => {
    const doc = stateToDoc(siding(), "M");
    const m2 = doc.tracks.find((t) => t.id === MAIN2_TRACK_ID)!;
    expect(m2.fromPos).toBe(13);
    expect(m2.toPos).toBe(367);
    // Main 1 still runs the whole module — it's the through main.
    const m1 = doc.tracks.find((t) => t.id === MAIN_TRACK_ID)!;
    expect(m1.from).toBe("A");
    expect(m1.to).toBe("B");
  });

  it("moduleFeatures reports the bounded extent", () => {
    const f = moduleFeatures(stateToDoc(siding(), "M"));
    expect(f.main2Extent!.fromFrac).toBeCloseTo(13 / 384);
    expect(f.main2Extent!.toFrac).toBeCloseTo(367 / 384);
  });

  it("still ends at the endplate when that end IS double", () => {
    const s = { ...siding(), configB: "double" as const };
    const m2 = stateToDoc(s, "M").tracks.find((t) => t.id === MAIN2_TRACK_ID)!;
    expect(m2.fromPos).toBe(13);
    expect(m2.toPos).toBe(384);
  });

  it("a half-drawn siding (one turnout, both ends single) still runs out", () => {
    const s = siding();
    s.turnouts = [s.turnouts[0]];
    const m2 = stateToDoc(s, "M").tracks.find((t) => t.id === MAIN2_TRACK_ID)!;
    expect(m2.fromPos).toBe(13);
    expect(m2.toPos).toBe(384);
  });
});

describe("a turnout can be rotated 180° (#turnout-flip)", () => {
  it("flipping swaps the side the diverging route leaves on", () => {
    expect(divergeSideForHand("left", 1)).toBe(1);
    expect(divergeSideForHand("left", 1, true)).toBe(-1);
    expect(divergeSideForHand("right", 1)).toBe(-1);
    expect(divergeSideForHand("right", 1, true)).toBe(1);
  });

  it("flipping twice is the same as not flipping — it's a 180° rotation", () => {
    for (const kind of ["left", "right"] as const)
      for (const dir of [1, -1])
        expect(divergeSideForHand(kind, dir, true)).toBe(divergeSideForHand(kind, -dir, false));
  });

  it("leaves a wye alone — it has no hand to swap", () => {
    expect(divergeSideForHand("wye", 1, true)).toBe(0);
    expect(divergeSideForHand(undefined, 1, true)).toBe(0);
  });

  it("round-trips, and stays absent when not flipped", () => {
    const s = emptyEditorState(96);
    const t = { id: "sw1", pos: 10, onTrack: MAIN_TRACK_ID, divergeTrack: "spur1", kind: "left" };
    const doc = stateToDoc({ ...s, turnouts: [{ ...t, flipped: true }] as never }, "M");
    expect(doc.turnouts![0].flipped).toBe(true);
    expect(docToState(doc).turnouts[0].flipped).toBe(true);
    const plain = stateToDoc({ ...s, turnouts: [t] as never }, "M");
    expect(plain.turnouts![0].flipped).toBeUndefined();
  });
});

describe("section-relative positions (#109)", () => {
  const sections = [
    { id: "a", lengthInches: 36 },
    { id: "b", lengthInches: 60 },
    { id: "c", lengthInches: 24 },
  ];
  const spans = sectionSpansOrWhole({ sections }, 120);

  it("a module with no sections is one implicit section covering it all", () => {
    const whole = sectionSpansOrWhole({ sections: [] }, 96);
    expect(whole).toEqual([{ id: WHOLE_MODULE_SECTION_ID, fromPos: 0, toPos: 96 }]);
    // …so its positions convert to offsets from 0 — the numbers don't change.
    expect(toSectionRelative(40, whole)).toEqual({ sectionId: "module", offsetInches: 40 });
    expect(fromSectionRelative({ sectionId: "module", offsetInches: 40 }, whole)).toBe(40);
  });

  it("round-trips every position — the mapping is total and lossless", () => {
    for (const pos of [0, 1, 35.9, 36, 50, 95.999, 96, 110, 120])
      expect(fromSectionRelative(toSectionRelative(pos, spans)!, spans)).toBeCloseTo(pos, 3);
  });

  it("a joint belongs to the board that STARTS there", () => {
    expect(toSectionRelative(36, spans)).toEqual({ sectionId: "b", offsetInches: 0 });
    expect(toSectionRelative(35.9, spans)!.sectionId).toBe("a");
    // …except the module's east end, where nothing starts.
    expect(toSectionRelative(120, spans)).toEqual({ sectionId: "c", offsetInches: 24 });
  });

  it("brings positions along when a board is resized", () => {
    // Section a grows 36 → 50. Something 10" into section b was at 46; it's now
    // at 60 — still 10" into b, which is the point.
    const after = sectionSpansOrWhole(
      { sections: [{ id: "a", lengthInches: 50 }, ...sections.slice(1)] },
      134,
    );
    expect(remapPos(46, spans, after)).toBeCloseTo(60);
    // Something on section a itself doesn't move.
    expect(remapPos(10, spans, after)).toBeCloseTo(10);
  });

  it("brings positions along when boards are REORDERED", () => {
    const after = sectionSpansOrWhole(
      { sections: [sections[2], sections[0], sections[1]] },
      120,
    );
    // 10" into c was at 106; c is now first, so it's at 10.
    expect(remapPos(106, spans, after)).toBeCloseTo(10);
    // 10" into a was at 10; a now follows c, so it's at 34.
    expect(remapPos(10, spans, after)).toBeCloseTo(34);
  });

  it("reports a lost board rather than guessing", () => {
    const after = sectionSpansOrWhole({ sections: [sections[0], sections[1]] }, 96);
    expect(remapPos(106, spans, after)).toBeNull(); // was on c, which is gone
    expect(remapPos(10, spans, after)).toBeCloseTo(10);
  });

  it("a span crossing a joint keeps BOTH ends on their own boards", () => {
    // The owner's diagonal route crosses joints; each end converts on its own,
    // so a reorder moves them independently and correctly.
    const from = toSectionRelative(30, spans)!;
    const to = toSectionRelative(50, spans)!;
    expect(from.sectionId).toBe("a");
    expect(to.sectionId).toBe("b");
    const after = sectionSpansOrWhole(
      { sections: [{ id: "a", lengthInches: 50 }, ...sections.slice(1)] },
      134,
    );
    expect(fromSectionRelative(from, after)).toBeCloseTo(30);
    expect(fromSectionRelative(to, after)).toBeCloseTo(64);
  });

  it("clamps rather than throwing when a position is off the end", () => {
    expect(toSectionRelative(-5, spans)!.offsetInches).toBe(0);
    expect(toSectionRelative(999, spans)!.sectionId).toBe("c");
    expect(fromSectionRelative({ sectionId: "a", offsetInches: 999 }, spans)).toBe(36);
  });
});

describe("Main 2 authored path (#131)", () => {
  const dbl = (): EditorState => ({
    ...emptyEditorState(96),
    configA: "double",
    configB: "double",
  });
  const path = [
    { x: 0, y: 1.125 },
    { x: 48, y: 3 },
    { x: 96, y: 1.125 },
  ];

  it("puts the authored path on the Main 2 track and round-trips", () => {
    const doc = stateToDoc({ ...dbl(), main2Path: path }, "M");
    const m2 = doc.tracks.find((t) => t.id === MAIN2_TRACK_ID)!;
    expect(m2.path).toEqual(path);
    expect(doc.main2Path).toEqual(path);
    expect(docToState(doc).main2Path).toEqual(path);
  });

  it("is absent when Main 2 isn't bent — derives as a lane offset", () => {
    const doc = stateToDoc(dbl(), "M");
    expect(doc.tracks.find((t) => t.id === MAIN2_TRACK_ID)!.path).toBeUndefined();
    expect(doc.main2Path).toBeUndefined();
    expect(docToState(doc).main2Path).toEqual([]);
  });

  it("reads a legacy path stored only on the track record", () => {
    const doc = stateToDoc(dbl(), "M");
    (doc.tracks.find((t) => t.id === MAIN2_TRACK_ID) as { path?: unknown }).path = path;
    delete (doc as { main2Path?: unknown }).main2Path;
    expect(docToState(doc).main2Path).toEqual(path);
  });
})

describe("turnout self-heals when it diverges into the track it sits on (#172)", () => {
  const loadTurnout = (onTrack: string, divergeTrack: string) => {
    const doc = {
      version: 1,
      module: "M",
      lengthInches: 96,
      tracks: [
        { id: MAIN_TRACK_ID, role: "main", lane: 0, from: "A", to: "B" },
        { id: MAIN2_TRACK_ID, role: "main", lane: 1, from: "A", to: "B" },
      ],
      endplates: [],
      turnouts: [{ id: "sw1", name: "End of Double Track", pos: 40, onTrack, divergeTrack, kind: "left" }],
    };
    return docToState(doc, 96).turnouts[0];
  };

  it("repoints Main 1→Main 1 onto Main 2", () => {
    const t = loadTurnout(MAIN_TRACK_ID, MAIN_TRACK_ID);
    expect(t.onTrack).toBe(MAIN_TRACK_ID);
    expect(t.divergeTrack).toBe(MAIN2_TRACK_ID);
    expect(isTransitionTurnout(t)).toBe(true);
  });

  it("repoints Main 2→Main 2 onto Main 1", () => {
    const t = loadTurnout(MAIN2_TRACK_ID, MAIN2_TRACK_ID);
    expect(t.divergeTrack).toBe(MAIN_TRACK_ID);
    expect(isTransitionTurnout(t)).toBe(true);
  });

  it("leaves a valid transition untouched", () => {
    const t = loadTurnout(MAIN_TRACK_ID, MAIN2_TRACK_ID);
    expect(t.onTrack).toBe(MAIN_TRACK_ID);
    expect(t.divergeTrack).toBe(MAIN2_TRACK_ID);
  });

  // The editor heals on load, but the catalog / module page / FD render from the
  // RAW doc — Steve's FMN-0067 still drew both mains endplate-to-endplate after
  // the editor-side fix, because nothing had rewritten the stored doc.
  it("asModuleSchematic heals on READ, so every renderer sees a valid transition", () => {
    const raw = {
      version: 1,
      module: "M",
      lengthInches: 96,
      mainsSwapped: true,
      tracks: [
        { id: MAIN_TRACK_ID, role: "main", lane: 0, from: "A", to: "B" },
        { id: MAIN2_TRACK_ID, role: "main", lane: -1, from: "A", to: "B" },
      ],
      endplates: [
        { id: "A", tracks: [{ lane: 0, config: "double", trackId: MAIN_TRACK_ID }] },
        { id: "B", tracks: [{ lane: 0, config: "single", trackId: MAIN_TRACK_ID }] },
      ],
      turnouts: [
        { id: "sw1", name: "End of Double Track", pos: 17.4, onTrack: MAIN_TRACK_ID, divergeTrack: MAIN_TRACK_ID, kind: "left" },
      ],
    };
    const doc = asModuleSchematic(raw)!;
    expect(doc.turnouts?.[0].divergeTrack).toBe(MAIN2_TRACK_ID);
    expect(isTransitionTurnout(doc.turnouts![0])).toBe(true);
    // …and the derived schematic now knows it's a transition at all.
    expect(moduleFeatures(doc).transition).not.toBeNull();
  });

  it("asModuleSchematic returns the SAME object when nothing needs healing", () => {
    const raw = {
      version: 1,
      module: "M",
      lengthInches: 96,
      tracks: [{ id: MAIN_TRACK_ID, role: "main", lane: 0, from: "A", to: "B" }],
      endplates: [],
      turnouts: [{ id: "sw1", pos: 10, onTrack: MAIN_TRACK_ID, divergeTrack: "spur1", kind: "left" }],
    };
    expect(asModuleSchematic(raw)).toBe(raw as unknown);
  });
});

describe("docToState keeps authored precision (#132 measurements)", () => {
  const docWith = (pos: number, len = 30) => ({
    version: 1,
    module: "M",
    lengthInches: len,
    tracks: [{ id: MAIN_TRACK_ID, role: "main", lane: 0, from: "A", to: "B" }],
    endplates: [],
    turnouts: [{ id: "sw1", pos, onTrack: MAIN_TRACK_ID, divergeTrack: "spur1", kind: "left" }],
  });

  it("does NOT flatten a measured position to a whole inch", () => {
    // Steve's FMN-0067 frog: typed 17.4 off XTrkCAD, was read back as 17 and
    // then autosaved over the original.
    expect(docToState(docWith(17.4), 30).turnouts[0].pos).toBeCloseTo(17.4, 6);
    // Oxnard's WestAutoPortSpur.
    expect(docToState(docWith(68.4, 120), 120).turnouts[0].pos).toBeCloseTo(68.4, 6);
  });

  it("round-trips a fractional position unchanged", () => {
    const st = docToState(docWith(17.4), 30);
    expect(stateToDoc(st, "M").turnouts?.[0].pos).toBeCloseTo(17.4, 6);
  });

  it("still rescales when the module's length really differs", () => {
    // doc authored at 30″, module is 60″ ⇒ everything doubles.
    expect(docToState(docWith(17.4), 60).turnouts[0].pos).toBeCloseTo(34.8, 6);
  });

  it("absorbs float noise from a rescale rather than carrying 15 decimals", () => {
    const p = docToState(docWith(10, 30), 100).turnouts[0].pos; // ×10/3
    expect(p).toBe(Math.round(p * 100) / 100);
  });
});

describe("track parts library (#179 stage 3)", () => {
  it("has the Atlas code 55 turnouts Free-moN actually uses", () => {
    for (const n of [5, 7, 10]) {
      const p = ATLAS_CODE55_N.find((x) => x.frogNumber === n && x.kind === "turnout");
      expect(p, `#${n}`).toBeTruthy();
      expect(p!.manufacturer).toBe("Atlas");
      expect(p!.line).toBe("Code 55");
    }
  });

  it("records PROVENANCE on every dimension, so a guess can't pass as a spec", () => {
    for (const part of BUILT_IN_TRACK_PARTS) {
      for (const key of ["lead", "overallLength", "divergingRadius", "outerRadius", "innerRadius"] as const) {
        const d = part[key];
        if (!d) continue;
        expect(["manufacturer", "measured", "derived", "unverified"]).toContain(d.source);
        // Anything not straight from the manufacturer must say where it came from.
        if (d.source !== "manufacturer") expect(d.note, `${part.id}.${key}`).toBeTruthy();
      }
    }
  });

  // Was "only the wye is still derived". Both wyes were measured 2026-07-26, so
  // NOT ONE lead in the library is derived any more — which is a stronger claim
  // than the old one, and the one worth defending.
  it("every lead in the library is MEASURED — none is derived", () => {
    expect(trackPart("atlas-c55-n-5")!.lead).toMatchObject({
      inches: 3.0,
      source: "measured",
    });
    expect(trackPart("atlas-c55-n-7")!.lead).toMatchObject({
      inches: 3.59375,
      source: "measured",
    });
    expect(trackPart("atlas-c55-n-10")!.lead).toMatchObject({
      inches: 4.9375,
      source: "measured",
    });
    expect(trackPart("atlas-c55-n-wye")!.lead).toMatchObject({
      inches: 2.5,
      source: "measured",
    });
    expect(trackPart("atlas-c55-n-wye-35")!.lead).toMatchObject({
      inches: 2.40625,
      source: "measured",
    });
    // ⭐ Narrowed, and sharpened: a derived lead may appear ONLY on a stand-in.
    // The invariant this protects is that no part claiming to be a PRODUCT
    // carries a guessed dimension. A provisional part exists precisely to carry
    // an interpolation, and says so — so the test now pins both halves.
    for (const p of BUILT_IN_TRACK_PARTS) {
      if (!p.lead) continue;
      if (p.provisional) expect(p.lead.source).toBe("derived");
      else expect(p.lead.source).toBe("measured");
    }
    // And a stand-in never pretends to be someone's product.
    for (const p of BUILT_IN_TRACK_PARTS.filter((x) => x.provisional)) {
      expect(p.manufacturer).toBe("Generic");
      expect(p.partNumbers).toBeUndefined();
      expect(p.name).toMatch(/unknown/i);
    }
  });

  // The 2056 measurement is the per-frog rule's worst case, and the reason the
  // wyes must never be interpolated with the turnouts: the rule predicts 1.205″
  // against a real 2.5″. Every earlier refutation was a matter of slope; this
  // one is a factor of two.
  it("the retired per-frog rule is off by more than 2x on the #2.5 wye", () => {
    const wye = trackPart("atlas-c55-n-wye")!;
    expect(wye.lead!.inches / (2.5 * TURNOUT_LEAD_INCHES_PER_FROG)).toBeGreaterThan(2);
    // lead ÷ N: the turnouts sit near 0.25, the wyes nowhere near it.
    expect(wye.lead!.inches / 2.5).toBeCloseTo(1.0, 2);
    expect(trackPart("atlas-c55-n-wye-35")!.lead!.inches / 3.5).toBeCloseTo(0.6875, 3);
  });

  // The whole reason the library exists. Lead-per-frog FALLS with N, so the
  // rule's error changes sign — nothing may reconstruct a lead by multiplying.
  it("lead is NOT proportional to frog number, and the error changes sign", () => {
    const perFrog = (id: string) => {
      const p = trackPart(id)!;
      return p.lead!.inches / p.frogNumber!;
    };
    expect(perFrog("atlas-c55-n-5")).toBeCloseTo(0.6, 3);
    expect(perFrog("atlas-c55-n-7")).toBeCloseTo(0.5134, 3);
    expect(perFrog("atlas-c55-n-10")).toBeCloseTo(0.4938, 3);
    // Reads ~20% SHORT at N=5, so no fudge factor rescues it.
    expect(5 * TURNOUT_LEAD_INCHES_PER_FROG).toBeLessThan(3.0 * 0.85);
    // ...so leadInchesForSize must return the PART, never the rule.
    expect(leadInchesForSize(5)).toBeCloseTo(3.0, 6);
    expect(leadInchesForSize(7)).toBeCloseTo(3.59375, 6);
    expect(leadInchesForSize(10)).toBeCloseTo(4.9375, 6);
  });

  // Sizes with no part interpolate across the MEASURED leads rather than
  // multiplying by the dead constant.
  it("interpolates the lead for sizes no part covers", () => {
    // #6 sits halfway between the measured #5 and #7.
    expect(leadInchesForSize(6)).toBeCloseTo((3.0 + 3.59375) / 2, 6);
    // #8 and #9 ride the #7 -> #10 segment.
    expect(leadInchesForSize(8)).toBeCloseTo(3.59375 + (4.9375 - 3.59375) / 3, 6);
    // Strictly increasing across the whole range a user can pick.
    for (let n = 4; n < 12; n += 0.5) {
      expect(leadInchesForSize(n), `${n}`).toBeLessThan(leadInchesForSize(n + 0.5));
    }
    // Nothing may equal the dead rule any more.
    for (const n of [4, 6, 8, 9, 12]) {
      expect(leadInchesForSize(n), `${n}`).not.toBeCloseTo(
        n * TURNOUT_LEAD_INCHES_PER_FROG,
        2,
      );
    }
  });

  // Only `measured` leads form the basis — interpolating through a derived value
  // would launder a guess into the sizes either side of it.
  // The built-in library no longer HAS a derived lead to use as the fixture (the
  // wye's was retired when Will measured it), so inject one. Testing against a
  // synthetic part is the point: the rule must hold for whatever gets added
  // next, not just for the one part that happened to be derived in July 2026.
  it("ignores derived leads when interpolating", () => {
    const bogus: TrackPart = {
      id: "test-derived-4",
      manufacturer: "Test",
      line: "Code 55",
      scale: "N",
      name: "#4 (derived lead)",
      kind: "turnout",
      frogNumber: 4,
      lead: { inches: 0.1, source: "derived" },
    };
    const withBogus = [...BUILT_IN_TRACK_PARTS, bogus];
    // An exact part match still wins — that path doesn't consult provenance.
    expect(leadInchesForSize(4, withBogus)).toBeCloseTo(0.1, 6);
    // ...but it must NOT drag the sizes either side of it toward 0.1in.
    expect(leadInchesForSize(4.5, withBogus)).toBeCloseTo(leadInchesForSize(4.5), 6);
    expect(leadInchesForSize(6, withBogus)).toBeCloseTo(leadInchesForSize(6), 6);
    expect(leadInchesForSize(4.5, withBogus)).toBeGreaterThan(2.5);
  });

  // Both wyes are `kind: "wye"`, and every size lookup filters to "turnout".
  // Their leads are wildly off the turnout trend (2.5in at N=2.5), so if that
  // filter ever slipped, low-N interpolation would move a long way.
  it("wyes never enter the turnout interpolation basis", () => {
    for (const n of [2.5, 3, 3.5, 4, 5, 7, 10]) {
      const noWyes = BUILT_IN_TRACK_PARTS.filter((p) => p.kind !== "wye");
      expect(leadInchesForSize(n, noWyes), `lead ${n}`).toBeCloseTo(
        leadInchesForSize(n),
        6,
      );
    }
    expect(turnoutPartForSize(2.5)!.kind).toBe("turnout");
    // A #2.5 turnout does not exist, so no extent may be claimed for one even
    // though a #2.5 WYE is now fully measured.
    expect(partExtentForSize(2.5)).toBeNull();
  });

  // lead is the difference of two measured positions, not an independent datum.
  // The #7 now reconciles too: its single-span re-read matched its positions
  // exactly, which is what retired Steve Branton's founding 3 3/8in figure.
  it("lead reconciles with the measured points and frog offsets", () => {
    for (const id of ["atlas-c55-n-5", "atlas-c55-n-7", "atlas-c55-n-10"]) {
      const p = trackPart(id)!;
      expect(p.frogOffset!.inches - p.pointsOffset!.inches, id).toBeCloseTo(
        p.lead!.inches,
        6,
      );
    }
  });

  // The frogs are at 4.75 / 4 3/16 / 5.5 — the "fixed at 4.75in" model shipped in
  // 0.54.0 came from measuring the #10 to the frog CASTING END, not the V.
  it("the frog is NOT at a fixed offset", () => {
    const offsets = ["atlas-c55-n-5", "atlas-c55-n-7", "atlas-c55-n-10"].map(
      (id) => trackPart(id)!.frogOffset!.inches,
    );
    expect(new Set(offsets).size).toBe(3);
  });

  // The pattern that currently fits: the moulding runs past the frog far enough
  // to gain a constant ~0.25in of separation. Predicts the FROG, not the lead.
  // Asserted at the strength the evidence actually has — two exact, one near.
  it("every part runs past the frog for ~0.25in of extra separation", () => {
    const past = (id: string) => {
      const p = trackPart(id)!;
      return (p.overallLength!.inches - p.frogOffset!.inches) / p.frogNumber!;
    };
    expect(past("atlas-c55-n-5")).toBeCloseTo(0.25, 6);
    expect(past("atlas-c55-n-10")).toBeCloseTo(0.25, 6);
    // The #7 is the near miss: 0.2545, out by 1/32in of tie end — one tape
    // division from exact. Still asserted at the strength it has earned and no
    // more; the `not` is what stops this quietly becoming a law.
    expect(past("atlas-c55-n-7")).toBeCloseTo(0.25, 2);
    expect(past("atlas-c55-n-7")).not.toBeCloseTo(0.25, 3);
  });

  // Overall length isn't a function of N either: #5 and #7 share a 6" moulding.
  it("overall length is not a function of frog number", () => {
    expect(trackPart("atlas-c55-n-5")!.overallLength!.inches).toBe(6);
    expect(trackPart("atlas-c55-n-7")!.overallLength!.inches).toBe(6);
    expect(trackPart("atlas-c55-n-10")!.overallLength!.inches).toBe(8);
  });

  // The working turnout starts partway into its moulding; the rest is approach
  // track. A part must never be treated as if its points sat at the tie end.
  it("the #10's points sit 9/16in inside the tie strip", () => {
    const ten = trackPart("atlas-c55-n-10")!;
    expect(ten.pointsOffset!.inches).toBeCloseTo(0.5625, 6);
    expect(ten.pointsOffset!.source).toBe("measured");
    // Points + lead must land the frog inside the part, not past its end.
    expect(ten.pointsOffset!.inches + ten.lead!.inches).toBeLessThan(
      ten.overallLength!.inches,
    );
  });

  it("carries the curved turnout's published radii", () => {
    const c = trackPart("atlas-c55-n-curved-21-15")!;
    expect(c.outerRadius).toEqual({ inches: 21.25, source: "manufacturer", note: expect.any(String) });
    expect(c.innerRadius!.inches).toBe(15);
  });

  it("leadInchesForSize uses a real measurement ONLY when the frog matches", () => {
    expect(leadInchesForSize(7)).toBeCloseTo(3.59375, 6); // the measured part
    // A #4 and #6 have no part. They interpolate — and crucially must NOT
    // borrow a neighbour's measurement wholesale.
    const measured = [3.0, 3.59375, 4.9375];
    for (const n of [4, 6, 8]) {
      for (const m of measured) {
        expect(leadInchesForSize(n), `${n} vs ${m}`).not.toBeCloseTo(m, 6);
      }
    }
    expect(leadInchesForSize(6)).toBeCloseTo(3.296875, 6);
    expect(leadInchesForSize(4)).toBeCloseTo(2.703125, 6);
  });

  it("turnoutPartForSize picks the nearest frog", () => {
    // #9 and #4 used to resolve to the Atlas #10 and #5 because nothing nearer
    // existed. Fast Tracks make both sizes, so the nearest is now exact.
    expect(turnoutPartForSize(9)!.frogNumber).toBe(9);
    expect(turnoutPartForSize(4)!.frogNumber).toBe(4);
    expect(turnoutPartForSize(11.4)!.frogNumber).toBe(12);
    expect(turnoutPartForSize(6.4)!.frogNumber).toBe(6);
    // A #11 is equidistant from the #10 and the #12, so the extent tie-break
    // decides it: the Atlas #10 is measured, the Fast Tracks #12 is a fixture.
    expect(turnoutPartForSize(11)!.id).toBe("atlas-c55-n-10");
  });

  // Will Gage, 2026-07-26: "not every manufacturer has all the same numbers."
  // Fast Tracks publish an angle, two radii and two lengths; Atlas publish three
  // landmarks and one length. Neither set is a subset of the other, and the
  // library has to hold both rather than a lowest common denominator.
  it("Fast Tracks parts carry their OWN dimension set, not Atlas's", () => {
    // Crossovers are excluded on purpose: they are an assembly and carry a
    // THIRD dimension set again (track spacing, second frog; no radii). Even
    // within one manufacturer the numbers aren't uniform.
    const ft = BUILT_IN_TRACK_PARTS.filter(
      (p) => p.manufacturer === "Fast Tracks" && p.kind !== "crossover",
    );
    expect(ft).toHaveLength(14); // 9 straight + 5 wye
    for (const p of ft) {
      // What Fast Tracks DO publish.
      expect(p.actualAngle, `${p.id} angle`).toBeTruthy();
      expect(p.divergingRadius, `${p.id} diverging R`).toBeTruthy();
      expect(p.overallLength, `${p.id} default length`).toBeTruthy();
      expect(p.minimumLength, `${p.id} minimum length`).toBeTruthy();
      expect(p.substitutionRadius, `${p.id} substitution R`).toBeTruthy();
      // What they DON'T publish — and inventing these is what the library forbids.
      // ⭐ EXCEPT where somebody measured the fixture they built: Will read the
      // points on his #6 (2026-07-31). That is a reading off a real part, not a
      // catalogue figure, which is exactly the distinction this test protects.
      if (p.id !== "fast-tracks-n-me55-t-6")
        expect(p.pointsOffset, `${p.id} points`).toBeUndefined();
      expect(p.frogOffset, `${p.id} frog`).toBeUndefined();
      expect(p.lead, `${p.id} lead`).toBeUndefined();
      // A fixture has no length of its own; the builder cuts the rail.
      expect(p.buildable, `${p.id} buildable`).toBe(true);
      expect(p.minimumLength!.inches).toBeLessThan(p.overallLength!.inches);
      // …so it claims no body, and flex still runs through it (#193). Honest:
      // we do not know where someone's hand-built turnout stops.
      // ⭐ EXCEPT the #6 Will measured (2026-07-31): it now knows where it starts
      // and stops. It still claims no ROUTES — that needs the frog — so nothing
      // about "we do not know where a hand-built turnout stops" is weakened for
      // the fixtures nobody has read.
      if (p.id !== "fast-tracks-n-me55-t-6")
        expect(partExtent(p), `${p.id} extent`).toBeNull();
    }
  });

  // A crossover is an ASSEMBLY — two turnouts and the diagonal between two
  // parallel tracks — so it carries a track spacing no single turnout has, and
  // partExtent means nothing for it.
  it("crossovers carry a track spacing, and stay out of the turnout lookups", () => {
    const xs = BUILT_IN_TRACK_PARTS.filter((p) => p.kind === "crossover");
    expect(xs.map((p) => p.frogNumber)).toEqual([6, 8]);
    for (const p of xs) {
      expect(p.manufacturer).toBe("Fast Tracks");
      expect(p.trackSpacing!.inches).toBe(1.09);
      expect(p.buildable).toBe(true);
      expect(p.minimumLength!.inches).toBeLessThan(p.overallLength!.inches);
      // ⚠️ Will Gage, 2026-07-26: "crossovers are two pieces. the pdf shows
      // half, then you would duplicate this same piece and flip it 180 and butt
      // it up to the through and X." So the lengths are ONE HALF, and both
      // notes have to say so — this shipped once claiming they were the whole
      // assembly.
      expect(p.piecesPerAssembly, `${p.id}`).toBe(2);
      expect(p.overallLength!.note, `${p.id} length note`).toMatch(/ONE HALF/);
      expect(p.minimumLength!.note, `${p.id} minimum note`).toMatch(/ONE HALF/);
      expect(p.name).toMatch(/Double Crossover/);
    }
    // Nothing else in the library is built in pieces, so nothing else may carry
    // a length that means something other than "the whole part".
    for (const p of BUILT_IN_TRACK_PARTS.filter((x) => x.kind !== "crossover")) {
      expect(p.piecesPerAssembly, `${p.id}`).toBeUndefined();
    }
    // Every size lookup filters kind === "turnout", so a #6 crossover must not
    // become "the #6" and displace a real turnout.
    expect(turnoutPartForSize(6)!.kind).toBe("turnout");
    expect(turnoutPartForSize(8)!.kind).toBe("turnout");
    const noCross = BUILT_IN_TRACK_PARTS.filter((p) => p.kind !== "crossover");
    for (const n of [5, 6, 7, 8, 10]) {
      expect(leadInchesForSize(n), `lead ${n}`).toBeCloseTo(leadInchesForSize(n, noCross), 9);
      expect(pastFrogInchesForSize(n), `past ${n}`).toBeCloseTo(
        pastFrogInchesForSize(n, noCross),
        9,
      );
    }
  });

  // ⚠️ A REAL INCOMPATIBILITY, recorded rather than reconciled. Free-moN §2.0
  // fixes double-track spacing at 1.125"; these fixtures are machined for 1.09"
  // and cannot be built to another spacing. Pinned so nobody "tidies" the
  // number toward the standard.
  it("the Fast Tracks crossovers do NOT build to Free-moN track spacing", () => {
    for (const p of BUILT_IN_TRACK_PARTS.filter((x) => x.kind === "crossover")) {
      expect(p.trackSpacing!.inches).not.toBe(FREEMO_TRACK_SPACING_INCHES);
      expect(p.trackSpacing!.inches).toBeLessThan(FREEMO_TRACK_SPACING_INCHES);
      expect(FREEMO_TRACK_SPACING_INCHES - p.trackSpacing!.inches).toBeCloseTo(0.035, 3);
      expect(p.trackSpacing!.note).toMatch(/Free-moN/);
    }
  });

  // The published second frog is the SCISSORS of a double crossover — the X
  // where its two opposite diverging routes cross. Each leaves its main at the
  // frog angle and they point opposite ways, so the crossing is twice the frog
  // angle. A free cross-check on the pair, and it passes.
  it("a crossover's second frog angle is twice its first", () => {
    for (const p of BUILT_IN_TRACK_PARTS.filter((x) => x.kind === "crossover")) {
      expect(p.secondaryFrogAngle!.deg, `${p.id}`).toBeCloseTo(
        2 * p.actualAngle!.deg,
        0.5,
      );
    }
  });

  // ⭐ Fast Tracks build to TRUE frog ratios; Atlas build to SECTIONAL angles
  // (a "#5" is 11.25°, a 1/32 turn, not theory's 11.310°). Same number on the
  // box, two different meanings — worth pinning, because it is the kind of
  // difference that gets "simplified" away.
  it("Fast Tracks angles are atan(1/N); Atlas angles are not", () => {
    for (const p of BUILT_IN_TRACK_PARTS.filter((x) => x.manufacturer === "Fast Tracks")) {
      const theory = (Math.atan(1 / (p.frogNumber as number)) * 180) / Math.PI;
      expect(p.actualAngle!.deg, `${p.id}`).toBeCloseTo(theory, 1);
    }
    const atlas5 = trackPart("atlas-c55-n-5")!;
    expect(atlas5.actualAngle!.deg).toBe(11.25);
    expect(atlas5.actualAngle!.deg).not.toBeCloseTo(
      (Math.atan(1 / 5) * 180) / Math.PI,
      2,
    );
  });

  // Adding a whole manufacturer must not move a single drawn turnout: Fast
  // Tracks publish no lead and no extent, so neither interpolation basis sees
  // them. This is the check that would have caught it if they did.
  it("adding Fast Tracks moves no existing turnout geometry", () => {
    const atlasOnly = BUILT_IN_TRACK_PARTS.filter((p) => p.manufacturer !== "Fast Tracks");
    for (const n of [4, 4.5, 5, 6, 7, 8, 9, 10, 12]) {
      expect(leadInchesForSize(n), `lead ${n}`).toBeCloseTo(
        leadInchesForSize(n, atlasOnly),
        9,
      );
      expect(pastFrogInchesForSize(n), `pastFrog ${n}`).toBeCloseTo(
        pastFrogInchesForSize(n, atlasOnly),
        9,
      );
    }
  });

  // ⚠️ Atlas and Fast Tracks both make a #5 and a #7, and only Atlas publish the
  // landmarks partExtent needs. If a frog-number tie went on array order the
  // fixture could win and take the Atlas part's body away with it — which is
  // #193 (a turnout with no extent has flex drawn straight through it).
  it("breaks a frog-number tie toward the part that can be drawn", () => {
    for (const n of [5, 7]) {
      const both = BUILT_IN_TRACK_PARTS.filter(
        (p) => p.kind === "turnout" && p.frogNumber === n,
      );
      expect(both.length, `two makers at #${n}`).toBeGreaterThan(1);
      const picked = turnoutPartForSize(n)!;
      expect(picked.manufacturer, `#${n}`).toBe("Atlas");
      expect(partExtent(picked), `#${n} extent`).not.toBeNull();
      expect(partExtentForSize(n), `#${n} via size`).not.toBeNull();
    }
    // …and the tie-break holds whichever order the library happens to be in.
    const reversed = [...BUILT_IN_TRACK_PARTS].reverse();
    expect(turnoutPartForSize(5, reversed)!.manufacturer).toBe("Atlas");
    expect(partExtentForSize(7, reversed)).not.toBeNull();
  });
});

describe("moduleFeatures honours the flip, not just the hand", () => {
  const build = (flipped: boolean) =>
    moduleFeatures({
      moduleId: "M",
      lengthInches: 96,
      endplates: [
        { id: "A", end: "A", config: "single" },
        { id: "B", end: "B", config: "single" },
      ],
      tracks: [
        { id: MAIN_TRACK_ID, role: "main", lane: 0 },
        { id: "sid1", role: "siding", lane: 1, fromPos: 40, toPos: 70 },
      ],
      turnouts: [
        {
          id: "sw1",
          pos: 40,
          onTrack: MAIN_TRACK_ID,
          divergeTrack: "sid1",
          kind: "right",
          size: 6,
          ...(flipped ? { flipped: true } : {}),
        },
      ],
    });

  // An author sets three things: the host track, the hand, and the flip. All
  // three must reach the drawing. The flip used to be dropped here, so the 2-D
  // and the dispatcher put the same turnout's route on OPPOSITE sides.
  it("a flipped turnout diverges to the other side", () => {
    const plain = build(false).extraTracks.find((t) => t.id === "sid1")!;
    const flip = build(true).extraTracks.find((t) => t.id === "sid1")!;
    expect(Math.sign(plain.lane)).not.toBe(0);
    expect(Math.sign(flip.lane)).toBe(-Math.sign(plain.lane));
    // Only the SIDE changes — the track stays the same distance out.
    expect(Math.abs(flip.lane)).toBe(Math.abs(plain.lane));
  });

  it("agrees with divergeSideForHand, which the 2-D view uses", () => {
    for (const flipped of [false, true]) {
      const lane = build(flipped).extraTracks.find((t) => t.id === "sid1")!.lane;
      // sid1 runs 40 -> 70, so the far end is forward of the turnout.
      const expected = divergeSideForHand("right", 30, flipped);
      expect(Math.sign(lane), `flipped=${flipped}`).toBe(expected);
    }
  });
});

describe("turnoutClosure easement — arriving PARALLEL, not merely reaching", () => {
  const N = 7, LANE = 1.125, G = 0.354;
  const eased = turnoutClosure(N, { leadInches: 3.59375, arriveAtInches: LANE });

  it("arrives exactly at the target offset", () => {
    expect(eased.offsetAt(eased.span)).toBeCloseTo(LANE, 9);
  });

  // THE WHOLE POINT. Reaching the lane while still climbing at 1/N is the kink
  // that read as misaligned rails; the slope must be ZERO on arrival.
  it("arrives with zero slope", () => {
    const e = 1e-4;
    const slope = (eased.offsetAt(eased.span) - eased.offsetAt(eased.span - e)) / e;
    expect(slope).toBeCloseTo(0, 4);
    // ...where the un-eased profile is still at the full frog angle.
    const plain = turnoutClosure(N, { leadInches: 3.59375 });
    const reach = 3.59375 + (LANE - G) * N;
    const s2 = (plain.offsetAt(reach) - plain.offsetAt(reach - e)) / e;
    expect(s2).toBeCloseTo(1 / N, 4);
  });

  it("keeps the frog exactly where it was — the crossing must not move", () => {
    const plain = turnoutClosure(N, { leadInches: 3.59375 });
    for (const s of [0, 0.5, 1.5, 3.0, 3.59375]) {
      expect(eased.offsetAt(s), `s=${s}`).toBeCloseTo(plain.offsetAt(s), 9);
    }
    expect(eased.offsetAt(eased.lead)).toBeCloseTo(G, 9);
  });

  it("is monotonic and never overshoots the target", () => {
    let prev = -1;
    for (let s = 0; s <= eased.span + 1; s += 0.05) {
      const o = eased.offsetAt(s);
      expect(o, `s=${s}`).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(o, `s=${s}`).toBeLessThanOrEqual(LANE + 1e-9);
      prev = o;
    }
  });

  it("costs length — the route needs room to come back parallel", () => {
    expect(eased.span).toBeGreaterThan(3.59375 + (LANE - G) * N);
    expect(eased.span).toBeCloseTo(10.788, 2);
    // Radius stays clear of the Free-moN 22in main minimum.
    expect(eased.easeInches / eased.frogSlope).toBeGreaterThan(22);
  });

  it("shortens the ease rather than starting it before the frog", () => {
    // A target barely past the gauge cannot absorb a full-lead ease; moving the
    // ease earlier would shift the crossing, so `b` shrinks instead.
    const tight = turnoutClosure(N, { leadInches: 3.59375, arriveAtInches: G + 0.05 });
    expect(tight.offsetAt(tight.lead)).toBeCloseTo(G, 9);
    expect(tight.offsetAt(tight.span)).toBeCloseTo(G + 0.05, 9);
    expect(tight.easeInches).toBeLessThan(3.59375);
  });

  it("without a target, behaves exactly as before", () => {
    const plain = turnoutClosure(N, { leadInches: 3.59375 });
    expect(plain.span).toBe(Infinity);
    expect(plain.easeInches).toBe(0);
    expect(plain.offsetAt(20)).toBeCloseTo(G + (20 - 3.59375) / N, 9);
  });
});

describe("parseXtpLibrary — importing an owner's OWN XTrkCAD library", () => {
  // A verbatim excerpt of the .xtp record shape (an owner supplies the file;
  // we redistribute none of it).
  const sample = [
    '# a comment line',
    'TURNOUT N "Atlas\t#7 LH Switch\t2052"',
    '\tP "Normal" 1 2',
    '\tE 0.000000 0.000000 270.000000',
    '\tE 6.000000 0.000000 90.000000',
    '\tE 6.000000 0.625000 81.818182',
    '\tS 0 0.000000 0.000000 0.000000 0.353100 0.000000',
    '\tC 0 0.000000 -18.176138 0.353124 18.176138 171.818106 8.181970',
    '\tEND',
  ].join("\n");

  it("extracts the manufacturer, name and part number from the tabbed title", () => {
    const [p] = parseXtpLibrary(sample);
    expect(p.manufacturer).toBe("Atlas");
    expect(p.name).toBe("#7 LH Switch");
    expect(p.partNumber).toBe("2052");
    expect(p.scale).toBe("N");
  });

  it("extracts endpoints with their tangents", () => {
    const [p] = parseXtpLibrary(sample);
    expect(p.ends).toHaveLength(3);
    expect(p.ends[0]).toEqual({ x: 0, y: 0, angleDeg: 270 });
    expect(p.ends[2]).toEqual({ x: 6, y: 0.625, angleDeg: 81.818182 });
  });

  it("extracts straight and curved segments", () => {
    const [p] = parseXtpLibrary(sample);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toEqual({ kind: "straight", x0: 0, y0: 0, x1: 0.3531, y1: 0 });
    const c = p.segments[1] as Extract<PartSegment, { kind: "curve" }>;
    expect(c.kind).toBe("curve");
    expect(c.radius).toBeCloseTo(-18.176138, 6);
    expect(c.extentDeg).toBeCloseTo(8.18197, 5);
  });

  it("ignores comments and doesn't emit empty parts", () => {
    expect(parseXtpLibrary("# nothing but a comment\n")).toEqual([]);
    expect(parseXtpLibrary('TURNOUT N "X\tY\tZ"\n\tEND\n')).toEqual([]);
  });

  describe("wiring imports into the parts library", () => {
    // A size we carry no built-in for, so it must be APPENDED rather than merged.
    const unknown = [
      'TURNOUT N "Atlas\t#6 RH Switch\t9999"',
      '\tE 0.000000 0.000000 270.000000',
      '\tE 5.000000 0.000000 90.000000',
      '\tE 5.000000 0.500000 80.537678',
      '\tS 0 0.000000 0.000000 0.000000 0.353100 0.000000',
      '\tEND',
    ].join("\n");

    it("reads identity and geometry off the file", () => {
      const t = importedPartToTrackPart(parseXtpLibrary(sample)[0], "N-atlasn55.xtp");
      expect(t.manufacturer).toBe("Atlas");
      expect(t.frogNumber).toBe(7);
      expect(t.kind).toBe("turnout");
      expect(t.partNumbers).toEqual({ single: "2052" });
      expect(t.segments).toHaveLength(2);
      expect(t.ends).toHaveLength(3);
      expect(t.importedFrom).toBe("N-atlasn55.xtp");
      // Span along the through axis, and the angle between the two exit ends.
      expect(t.overallLength!.inches).toBeCloseTo(6, 6);
      expect(t.actualAngle!.deg).toBeCloseTo(8.1818, 3);
    });

    // THE SAFETY PROPERTY. The shipped Atlas file's frog positions are
    // internally inconsistent (#5's frog further out than the #7's), and an
    // imported lead would outrank leadInchesForSize's interpolation across
    // physical measurements. So imports must never carry one.
    it("derives NO lead and NO frog offset, ever", () => {
      for (const src of [sample, unknown]) {
        for (const raw of parseXtpLibrary(src)) {
          const t = importedPartToTrackPart(raw);
          expect(t.lead, t.id).toBeUndefined();
          expect(t.frogOffset, t.id).toBeUndefined();
          expect(t.pointsOffset, t.id).toBeUndefined();
        }
      }
    });

    it("everything imported is marked unverified", () => {
      const t = importedPartToTrackPart(parseXtpLibrary(sample)[0]);
      for (const d of [t.overallLength, t.actualAngle]) {
        expect(d!.source).toBe("unverified");
        expect(d!.note).toMatch(/not a measurement/);
      }
    });

    it("matches a built-in by part number and attaches its geometry", () => {
      const merged = mergeImportedParts(parseXtpLibrary(sample), BUILT_IN_TRACK_PARTS);
      // Merged, not appended.
      expect(merged).toHaveLength(BUILT_IN_TRACK_PARTS.length);
      const seven = merged.find((p) => p.id === "atlas-c55-n-7")!;
      expect(seven.segments).toHaveLength(2);
      expect(seven.ends).toHaveLength(3);
    });

    // The rule that keeps this safe: imports fill gaps, they never overwrite.
    it("never overwrites a value we already hold", () => {
      const merged = mergeImportedParts(parseXtpLibrary(sample), BUILT_IN_TRACK_PARTS);
      const seven = merged.find((p) => p.id === "atlas-c55-n-7")!;
      const builtIn = trackPart("atlas-c55-n-7")!;
      // Measured lead and overall length survive untouched...
      expect(seven.lead).toEqual(builtIn.lead);
      expect(seven.overallLength).toEqual(builtIn.overallLength);
      expect(seven.overallLength!.source).toBe("measured");
      // ...and so does an existing UNVERIFIED value, even against another
      // unverified one. Ours is at least traceable.
      expect(seven.actualAngle).toEqual(builtIn.actualAngle);
      expect(seven.actualAngle!.deg).toBeCloseTo(8.13, 6);
      // The originals are untouched — merge must not mutate the library.
      expect(BUILT_IN_TRACK_PARTS.find((p) => p.id === "atlas-c55-n-7")!.segments)
        .toBeUndefined();
    });

    it("appends a part we have no entry for", () => {
      const merged = mergeImportedParts(parseXtpLibrary(unknown), BUILT_IN_TRACK_PARTS);
      expect(merged).toHaveLength(BUILT_IN_TRACK_PARTS.length + 1);
      // Select by provenance, not frog number: Fast Tracks make a #6 too, and
      // the imported part appends rather than folding into it because the
      // manufacturer differs.
      const six = merged.find((p) => p.importedFrom)!;
      expect(six.importedFrom).toBeTruthy();
      expect(six.frogNumber).toBe(6);
      expect(six.lead).toBeUndefined();
    });

    // An appended part has no lead, so lead lookups still interpolate across
    // the MEASURED parts rather than picking up CAD data.
    it("leaves lead lookups resting on measurements", () => {
      const merged = mergeImportedParts(parseXtpLibrary(unknown), BUILT_IN_TRACK_PARTS);
      expect(leadInchesForSize(6, merged)).toBeCloseTo(leadInchesForSize(6), 6);
      expect(leadInchesForSize(6, merged)).toBeCloseTo(3.296875, 6);
    });

    it("reads frog numbers out of the maker's own naming", () => {
      expect(frogNumberFromName("#7 LH Switch")).toBe(7);
      expect(frogNumberFromName("Number 10 Right")).toBe(10);
      expect(frogNumberFromName("No. 5 Turnout")).toBe(5);
      expect(frogNumberFromName("Mark 3 Wye 280")).toBeUndefined();
      expect(frogNumberFromName(undefined)).toBeUndefined();
    });

    it("places a part's outline in frog-local coordinates", () => {
      const merged = mergeImportedParts(parseXtpLibrary(sample), BUILT_IN_TRACK_PARTS);
      const seven = merged.find((p) => p.id === "atlas-c55-n-7")!;
      const lead = seven.lead!.inches; // 3.59375, MEASURED
      const polys = partOutlineAtFrog(seven, lead)!;
      expect(polys).toHaveLength(2);

      // The fixture's first segment runs from the points along the through
      // route, so it must start exactly one lead BEHIND the frog (x = 0).
      const first = polys[0];
      expect(first[0].x).toBeCloseTo(-lead, 6);
      expect(first[0].y).toBeCloseTo(0, 6);
      // ...and stay on the through route.
      expect(first[first.length - 1].y).toBeCloseTo(0, 6);
      // The part is 6" long, so nothing may run past 6 - lead beyond the frog.
      for (const p of polys.flat()) {
        expect(p.x).toBeGreaterThanOrEqual(-lead - 1e-6);
        expect(p.x).toBeLessThanOrEqual(6 - lead + 1e-6);
      }
    });

    // A left-hand and a right-hand part are mirror images in the file. Both must
    // come out with the diverging side on +y, or one hand would draw inverted.
    it("puts the diverging side on POSITIVE y regardless of the part's hand", () => {
      const handed = (s: 1 | -1): ImportedPart => ({
        title: "synthetic",
        name: "#6 Switch",
        ends: [
          { x: 0, y: 0, angleDeg: 270 }, // points, facing back down -x
          { x: 6, y: 0, angleDeg: 90 }, // through
          { x: 6, y: 0.5 * s, angleDeg: 90 - 5 * s }, // diverging
        ],
        segments: [{ kind: "straight", x0: 0, y0: 0, x1: 6, y1: 0.5 * s }],
      });
      for (const s of [1, -1] as const) {
        const t = importedPartToTrackPart(handed(s));
        const pts = partOutlineAtFrog(t, 3)!.flat();
        expect(Math.min(...pts.map((p) => p.y)), `hand ${s}`).toBeGreaterThan(-1e-9);
        // Both hands land the diverging end at the SAME +y.
        expect(pts[pts.length - 1].y, `hand ${s}`).toBeCloseTo(0.5, 9);
        // ...and the lead shift is applied either way.
        expect(pts[0].x, `hand ${s}`).toBeCloseTo(-3, 9);
      }
    });

    it("returns null for a part with no imported geometry", () => {
      expect(partOutlineAtFrog(trackPart("atlas-c55-n-5")!, 3)).toBeNull();
    });

    it("classifies wyes and crossings from the name", () => {
      const kindOf = (n: string) =>
        importedPartToTrackPart({ title: n, name: n, ends: [], segments: [] }).kind;
      expect(kindOf("Mark 3 Wye 280")).toBe("wye");
      expect(kindOf("19 Degree Crossing")).toBe("crossing");
      expect(kindOf("Curved Turnout 21/15")).toBe("curved-turnout");
      expect(kindOf("#7 LH Switch")).toBe("turnout");
    });
  });

  it("samples a curve with XTrkCAD's clockwise-from-north angles", () => {
    const [p] = parseXtpLibrary(sample);
    const polys = samplePartSegments(p.segments);
    // The curve runs to 180° = straight 'down' from its centre, which is the
    // switch-point end at (0.3531, 0) — the same decode used to read the file.
    const curve = polys[1];
    const end = curve[curve.length - 1];
    expect(end.x).toBeCloseTo(0.3531, 3);
    expect(end.y).toBeCloseTo(0, 3);
  });
});

describe("turnoutClosure — the frog lands where the inner rails actually cross (#173)", () => {
  const G = RAIL_GAUGE_INCHES;

  for (const N of [4, 5, 6, 7, 8, 10]) {
    it(`#${N}: points on the stock rail, frog at one gauge, leaving at 1/N`, () => {
      const c = turnoutClosure(N);
      expect(c.offsetAt(0)).toBeCloseTo(0, 6); // points start ON the stock rail
      expect(c.offsetAt(c.lead)).toBeCloseTo(G, 6); // frog = inner rails crossing
      // slope arriving at the frog is the frog angle
      const h = 1e-4;
      expect((c.offsetAt(c.lead) - c.offsetAt(c.lead - h)) / h).toBeCloseTo(1 / N, 3);
      expect(c.frogSlope).toBeCloseTo(1 / N, 9);
    });

    it(`#${N}: the switch angle is positive and shallower than the frog angle`, () => {
      const c = turnoutClosure(N);
      // A tangent start (slope 0) could never reach a gauge within a commercial
      // lead — real points leave at a finite angle. But it must still be gentler
      // than the frog angle, or the closure would be bending the wrong way.
      expect(c.switchSlope).toBeGreaterThan(0);
      expect(c.switchSlope).toBeLessThan(c.frogSlope);
    });

    it(`#${N}: the closure never doubles back`, () => {
      const c = turnoutClosure(N);
      let prev = -1;
      for (let i = 0; i <= 40; i++) {
        const d = c.offsetAt((c.lead * i) / 40);
        expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = d;
      }
    });
  }

  it("past the frog it runs STRAIGHT at the frog angle, not bending further", () => {
    const c = turnoutClosure(7);
    const a = c.offsetAt(c.lead + 1);
    const b = c.offsetAt(c.lead + 2);
    expect(a - G).toBeCloseTo(1 / 7, 6);
    expect(b - a).toBeCloseTo(1 / 7, 6); // constant slope ⇒ straight
  });

  it("uses the commercial lead by default (Atlas #7 = 3⅜″)", () => {
    expect(turnoutClosure(7).lead).toBeCloseTo(3.374, 3);
  });

  it("an absurdly long lead degrades to a tangent start instead of bending backwards", () => {
    // lead ≥ 2·gauge·N is outside the model; α clamps at 0 rather than going negative.
    const c = turnoutClosure(7, { leadInches: 2 * G * 7 + 5 });
    expect(c.switchSlope).toBe(0);
  });
});

describe("a lone shapeless section doesn't orphan the module outline (#173)", () => {
  const rect = [
    { x: 0, y: 9 },
    { x: 120, y: 9 },
    { x: 120, y: -9 },
    { x: 0, y: -9 },
  ];
  const base = {
    lengthInches: 120,
    geometryType: "straight",
    endplateWidths: { A: 18, B: 18 },
    outline: rect,
  };

  it("keeps the authored outline when the only section has no shape of its own", () => {
    // Oxnard Auto Port's exact shape: one section, no outline, module outline drawn.
    const fp = moduleFootprint({ ...base, sections: [{ id: "sec1", lengthInches: 120 }] });
    expect(fp.sectionOutlines).toHaveLength(0);
    expect(fp.outline).not.toBeNull();
    expect(fp.outline).toHaveLength(4);
  });

  it("sections take over once one is actually shaped", () => {
    const fp = moduleFootprint({
      ...base,
      sections: [{ id: "sec1", lengthInches: 120, outline: rect }],
    });
    expect(fp.sectionOutlines.length).toBeGreaterThan(0);
    expect(fp.outline).toBeNull();
  });

  it("two shapeless sections still split into their own derived boards", () => {
    const fp = moduleFootprint({
      ...base,
      sections: [
        { id: "sec1", lengthInches: 60 },
        { id: "sec2", lengthInches: 60 },
      ],
    });
    expect(fp.sectionOutlines).toHaveLength(2);
    expect(fp.outline).toBeNull();
  });

  it("no sections at all is unchanged — the outline still wins", () => {
    const fp = moduleFootprint(base);
    expect(fp.sectionOutlines).toHaveLength(0);
    expect(fp.outline).toHaveLength(4);
  });
});

describe("swapped transition draws Main 2 below in the schematic (#172)", () => {
  const feats = (swapped: boolean) => {
    const st = emptyEditorState(96);
    st.configA = "double";
    st.configB = "single";
    st.mainsSwapped = swapped;
    st.turnouts = [
      { id: "sw1", name: "End of Double Track", pos: 72, onTrack: MAIN_TRACK_ID, divergeTrack: MAIN2_TRACK_ID, kind: "left" },
    ];
    return moduleFeatures(stateToDoc(st, "M"));
  };

  it("Main 2 is below (lane −1) and the transition branch follows it when swapped", () => {
    const f = feats(true);
    expect(f.main2Lane).toBe(-1);
    expect(f.transition?.throughLane).toBe(0);
    expect(f.transition?.branchLane).toBe(-1);
  });

  it("the canvas extent (laneMin) includes the swapped Main 2 so it isn't clipped", () => {
    expect(feats(true).laneMin).toBeLessThanOrEqual(-1);
  });

  it("Main 2 is above (lane +1) when not swapped", () => {
    const f = feats(false);
    expect(f.main2Lane).toBe(1);
    expect(f.transition?.branchLane).toBe(1);
  });
});

describe("junction / 3rd-endplate authoring (place-an-endplate + §2.0)", () => {
  it("round-trips a placed branch endplate C with kind + trackId + pose", () => {
    const s = {
      ...emptyEditorState(96),
      branches: [
        { label: "To Staging", pos: 40, side: "up" as const, config: "single" as const, kind: "main" as const, trackId: "branch-1" },
      ],
      poseOverrides: { C: { x: 40, y: 12, heading: 90 } },
    };
    const doc = stateToDoc(s, "M");
    const ep = doc.endplates.find((e) => e.id === "C");
    expect(ep?.kind).toBe("main");
    expect(ep?.trackId).toBe("branch-1");
    expect(ep?.at).toEqual({ pos: 40, side: "up" });
    expect(ep?.pose).toEqual({ x: 40, y: 12, heading: 90 });

    const back = docToState(doc, 96);
    expect(back.branches).toEqual([
      { label: "To Staging", pos: 40, side: "up", config: "single", kind: "main", trackId: "branch-1" },
    ]);
    expect(back.poseOverrides.C).toEqual({ x: 40, y: 12, heading: 90 });
  });

  it("defaults kind to 'branch' and omits trackId until connected", () => {
    const doc = stateToDoc(
      { ...emptyEditorState(96), branches: [{ label: "B1", pos: 20, side: "down", config: "single" }] },
      "M",
    );
    const ep = doc.endplates.find((e) => e.id === "C");
    expect(ep?.kind).toBe("branch");
    expect(ep?.trackId).toBeUndefined();
    expect(docToState(doc, 96).branches[0]).toMatchObject({ kind: "branch", trackId: null });
  });

  it("endplateLead returns a 4″ perpendicular lead inboard of the face", () => {
    // Endplate facing north (outward heading 90°): lead runs south (inboard).
    const lead = endplateLead({ x: 40, y: 12, heading: 90 });
    expect(lead.face).toEqual({ x: 40, y: 12 });
    expect(lead.inboard.x).toBeCloseTo(40, 6);
    expect(lead.inboard.y).toBeCloseTo(12 - ENDPLATE_LEAD_INCHES, 6);
    expect(lead.inwardHeading).toBeCloseTo(270, 6);
  });

  it("passes a straight perpendicular approach and flags a skew / early bend", () => {
    const pose = { x: 40, y: 12, heading: 90 }; // faces north
    // Straight south run into the plate (last point = the plate): compliant.
    const good = [
      { x: 40, y: 0 },
      { x: 40, y: 6 },
      { x: 40, y: 12 },
    ];
    expect(trackMeetsEndplateIssues(good, pose)).toEqual([]);
    // Approaches at 45° → not perpendicular.
    const skew = [
      { x: 28, y: 0 },
      { x: 40, y: 12 },
    ];
    expect(trackMeetsEndplateIssues(skew, pose).map((i) => i.code)).toContain("not-perpendicular");
    // Bends within the first 4″ (a vertex 2″ off the lead line at y=10).
    const kinked = [
      { x: 40, y: 0 },
      { x: 38, y: 10 },
      { x: 40, y: 12 },
    ];
    expect(trackMeetsEndplateIssues(kinked, pose).map((i) => i.code)).toContain("short-lead");
  });

  it("a branch-route track is kept out of the straightened extraTracks", () => {
    const doc = stateToDoc(
      {
        ...emptyEditorState(96),
        branches: [{ label: "Jct", pos: 48, side: "up", config: "single", kind: "branch", trackId: "branch1" }],
        extraTracks: [
          {
            id: "branch1",
            role: "branch",
            lane: 2,
            fromPos: 48,
            toPos: 48,
            path: [
              { x: 48, y: 0 },
              { x: 48, y: 8 },
              { x: 48, y: 12 },
            ],
            moduleTrackId: null,
            trackName: "To endplate C",
          },
        ],
      },
      "M",
    );
    const f = moduleFeatures(doc);
    expect(f.extraTracks.find((t) => t.id === "branch1")).toBeUndefined();
    // …but the endplate still shows as a connector arrow.
    expect(f.branchConnectors.map((b) => b.id)).toContain("C");
  });

  it("flags a crossing closer than 4″ to a fascia", () => {
    const pose = { x: 40, y: 12, heading: 90 };
    const path = [
      { x: 40, y: 0 },
      { x: 40, y: 12 },
    ];
    // 12″ face, track 3″ off centre → 6−3 = 3″ clear < 4″.
    const issues = trackMeetsEndplateIssues(path, pose, { faceWidthInches: 12, trackOffsetInches: 3 });
    expect(issues.map((i) => i.code)).toContain("fascia-clearance");
    // Centred on a 12″ face → 6″ clear, fine.
    expect(
      trackMeetsEndplateIssues(path, pose, { faceWidthInches: 12, trackOffsetInches: 0 }).map((i) => i.code),
    ).not.toContain("fascia-clearance");
  });
})

describe("returnLoop geometry (wye-throated return loop)", () => {
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 0.5) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= tol;

  for (const shape of ["circle", "teardrop", "offset-teardrop", "square"] as ReturnLoopShape[]) {
    it(`${shape}: the loop closes exactly at the throat`, () => {
      const g = returnLoop(shape, { leadInches: 48, radius: 24 });
      expect(g.throat).toEqual({ x: 48, y: 0 });
      expect(near(g.loop[0], g.throat, 0.01)).toBe(true); // starts at throat
      expect(near(g.loop[g.loop.length - 1], g.throat, 0.01)).toBe(true); // ends at throat
      expect(g.loop.length).toBeGreaterThanOrEqual(6);
    });

    it(`${shape}: the two wye legs start at the throat and diverge`, () => {
      const g = returnLoop(shape, { leadInches: 48, radius: 24 });
      expect(near(g.wyeLegs[0][0], g.throat, 0.01)).toBe(true);
      expect(near(g.wyeLegs[1][0], g.throat, 0.01)).toBe(true);
      // the two legs' far ends are on opposite sides of the lead axis (y=0)
      const e0 = g.wyeLegs[0][g.wyeLegs[0].length - 1];
      const e1 = g.wyeLegs[1][g.wyeLegs[1].length - 1];
      expect(Math.sign(e0.y)).toBe(-Math.sign(e1.y));
      expect(g.wyeHalfAngleDeg).toBeGreaterThan(0);
    });
  }

  it("circle: the loop rides on the circle of radius R (tangent legs are exact)", () => {
    const R = 24;
    const g = returnLoop("circle", { leadInches: 48, radius: R });
    // the wye legs' far ends (the tangent points) are exactly R from the centre
    const D = R * 1.15;
    const C = { x: 48 + D, y: 0 };
    for (const leg of g.wyeLegs) {
      const P = leg[leg.length - 1];
      expect(Math.hypot(P.x - C.x, P.y - C.y)).toBeCloseTo(R, 1);
      // tangent: leg ⊥ radius at P → (P−T)·(P−C) ≈ 0
      const dot = (P.x - g.throat.x) * (P.x - C.x) + (P.y - g.throat.y) * (P.y - C.y);
      expect(Math.abs(dot)).toBeLessThan(1);
    }
  });

  it("offset-teardrop actually offsets the bulb off the lead axis", () => {
    const g = returnLoop("offset-teardrop", { leadInches: 48, radius: 24 });
    const ys = g.loop.map((p) => p.y);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    expect(Math.abs(mid)).toBeGreaterThan(2); // bulb centre is off y=0
  });

  it("has a donut hole (inner outline) for every shape at a normal board width", () => {
    for (const shape of ["circle", "teardrop", "offset-teardrop", "square"] as ReturnLoopShape[]) {
      const g = returnLoop(shape, { leadInches: 48, radius: 24, boardHalfWidth: 6 });
      expect(g.outlineOuter.length).toBeGreaterThan(3);
      expect(g.outlineInner.length).toBeGreaterThanOrEqual(4); // the open middle
    }
  });

  it("square: the TRACK is a curved circle, not a rectangle (real track has no 90° corners)", () => {
    const R = 24;
    const g = returnLoop("square", { leadInches: 48, radius: R });
    const D = R * 1.15;
    const C = { x: 48 + D, y: 0 };
    // Every loop vertex except the throat itself rides the circle of radius R.
    const onCircle = g.loop.filter((p) => !near(p, g.throat, 0.01));
    expect(onCircle.length).toBeGreaterThan(20); // densely sampled arc, not 4 corners
    for (const p of onCircle) {
      expect(Math.hypot(p.x - C.x, p.y - C.y)).toBeCloseTo(R, 0);
    }
  });

  it("square: the benchwork is a SQUARE donut (rectangular hole), the loop hole 4 corners", () => {
    const g = returnLoop("square", { leadInches: 48, radius: 24, boardHalfWidth: 6 });
    // A square hole has exactly 4 distinct corners (vs the curved shapes' ~40-pt ring).
    expect(g.outlineInner.length).toBe(4);
    // Hole corners sit inside the R=24 track circle (board stays under the rail).
    const C = { x: 48 + 24 * 1.15, y: 0 };
    for (const p of g.outlineInner) {
      expect(Math.hypot(p.x - C.x, p.y - C.y)).toBeLessThanOrEqual(24);
    }
  });

  it("curved shapes' outer outline winds around the loop centre exactly once (no double-wrap)", () => {
    // A self-overlapping (double-wrapped) outer ring renders fine under a solid
    // fill but INVERTS an even-odd donut (centre fills, board empties) (#loop).
    for (const shape of ["circle", "teardrop", "offset-teardrop"] as ReturnLoopShape[]) {
      const R = 24;
      const g = returnLoop(shape, { leadInches: 48, radius: R });
      const D = shape === "circle" ? R * 1.15 : R * 1.6;
      const offY = shape === "offset-teardrop" ? R * 0.7 : 0;
      const C = { x: 48 + D, y: offY };
      let turn = 0;
      for (let i = 0; i < g.outlineOuter.length; i++) {
        const a = g.outlineOuter[i];
        const b = g.outlineOuter[(i + 1) % g.outlineOuter.length];
        let d =
          Math.atan2(b.y - C.y, b.x - C.x) - Math.atan2(a.y - C.y, a.x - C.x);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        turn += d;
      }
      // one full loop around C = ±2π; a double-wrap would be ±4π
      expect(Math.abs(turn) / (2 * Math.PI)).toBeCloseTo(1, 1);
    }
  });

  // Ray-cast point-in-polygon (module-local inches).
  const inPoly = (pt: { x: number; y: number }, poly: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  };

  it("the benchwork is never narrower than the endplate at the face", () => {
    for (const shape of ["circle", "teardrop", "offset-teardrop", "square"] as ReturnLoopShape[]) {
      // 24″ endplate → the lead board must be ≥ 24″ (±12) where it meets the face.
      const g = returnLoop(shape, { leadInches: 48, radius: 24, endplateHalfWidth: 12 });
      const atFace = g.outlineOuter.filter((p) => Math.abs(p.x) < 0.5);
      expect(atFace.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...atFace.map((p) => Math.abs(p.y)))).toBeGreaterThanOrEqual(12 - 0.01);
    }
  });

  it("every point of the loop track sits ON the board (inside the outline, outside the hole)", () => {
    for (const shape of ["circle", "teardrop", "offset-teardrop", "square"] as ReturnLoopShape[]) {
      const g = returnLoop(shape, { leadInches: 48, radius: 24, endplateHalfWidth: 12 });
      // the loop track, plus the straight lead from the endplate to the throat
      const track = [...g.loop, { x: 0, y: 0 }, { x: 24, y: 0 }, g.throat];
      for (const p of track) {
        expect(inPoly(p, g.outlineOuter)).toBe(true); // on the board
        if (g.outlineInner.length >= 3) expect(inPoly(p, g.outlineInner)).toBe(false); // not over the hole
      }
    }
  });

  it("outlineInner round-trips through stateToDoc / docToState", () => {
    const g = returnLoop("teardrop", { leadInches: 48, radius: 24 });
    const st = emptyEditorState(48);
    st.loop = true;
    st.outline = g.outlineOuter.map((p) => ({ x: p.x, y: p.y }));
    st.outlineInner = g.outlineInner.map((p) => ({ x: p.x, y: p.y }));
    const doc = stateToDoc(st, "FMN-LOOP");
    expect(doc.outlineInner?.length).toBe(g.outlineInner.length);
    const back = docToState(doc, 48);
    expect(back.outlineInner.length).toBe(g.outlineInner.length);
  });
})

// ── Flex track in pieces (#193) ────────────────────────────────────────────────
// Everything that isn't a turnout or a crossing is flex, flex comes in lengths
// with a maximum, and where two lengths meet is a rail joint. A 96″ main isn't
// one piece of track — it's four lengths of Atlas flex with three joints in it.
describe("flex track pieces (#193)", () => {
  const spans = (ps: ReturnType<typeof flexPieces>) =>
    ps.map((p) => `${round2(p.fromPos)}–${round2(p.toPos)}`);
  const lens = (ps: ReturnType<typeof flexPieces>) => ps.map((p) => round2(p.lengthInches));

  it("cuts a clear run into full lengths with the remainder at the end", () => {
    // How you actually lay it: full lengths off the roll, then cut the last one.
    const p = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 });
    expect(lens(p)).toEqual([30, 30, 30, 6]);
    expect(spans(p)).toEqual(["0–30", "30–60", "60–90", "90–96"]);
    expect(p.every((x) => !x.overlong)).toBe(true);
  });

  it("a run shorter than one length is a single piece", () => {
    expect(lens(flexPieces({ fromPos: 0, toPos: 18, maxPieceInches: 30 }))).toEqual([18]);
    // …and exactly one length is ONE piece, not two with a zero-length tail.
    expect(lens(flexPieces({ fromPos: 0, toPos: 30, maxPieceInches: 30 }))).toEqual([30]);
    expect(lens(flexPieces({ fromPos: 0, toPos: 36, maxPieceInches: 36 }))).toEqual([36]);
  });

  it("gives up the stretch a turnout occupies, and joints either side of it", () => {
    // The turnout is the part; the flex meets it at a rail joint on each side —
    // the same joint #189 draws where a switch meets the track past it.
    const p = flexPieces({
      fromPos: 0,
      toPos: 48,
      maxPieceInches: 30,
      occupied: [{ fromPos: 20, toPos: 26 }], // a 6″ #7
    });
    expect(spans(p)).toEqual(["0–20", "26–48"]);
    expect(p[0].toEnd).toBe("part"); // butts the turnout
    expect(p[1].fromEnd).toBe("part");
    expect(p[0].fromEnd).toBe("runEnd"); // …and the endplate at the other
    expect(p[1].toEnd).toBe("runEnd");
  });

  it("merges overlapping part bodies so a crossover doesn't carve the same inch twice", () => {
    const p = flexPieces({
      fromPos: 0,
      toPos: 40,
      maxPieceInches: 30,
      occupied: [
        { fromPos: 10, toPos: 18 },
        { fromPos: 14, toPos: 22 }, // overlaps the first
      ],
    });
    expect(spans(p)).toEqual(["0–10", "22–40"]);
  });

  it("cuts each gap on its own, so a long gap past a turnout still gets joints", () => {
    const p = flexPieces({
      fromPos: 0,
      toPos: 96,
      maxPieceInches: 30,
      occupied: [{ fromPos: 10, toPos: 16 }],
    });
    // 0–10 fits; 16–96 is 80″ ⇒ 30 + 30 + 20.
    expect(spans(p)).toEqual(["0–10", "16–46", "46–76", "76–96"]);
  });

  it("authored cuts are the ONLY joints — a deliberate cut isn't re-derived", () => {
    // The owner moved the cut to 33 so the joint clears something at 30.
    const p = flexPieces({ fromPos: 0, toPos: 60, maxPieceInches: 30, cuts: [33] });
    expect(spans(p)).toEqual(["0–33", "33–60"]);
    // 33 > 30, so it can't come off one length — say so rather than re-cutting it.
    expect(p[0].overlong).toBe(true);
    expect(p[1].overlong).toBe(false);
  });

  it("an EMPTY authored list means one uncut piece, not 'derive them'", () => {
    // The distinction absent-vs-empty is the whole reason cuts is nullable.
    expect(lens(flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30, cuts: [] }))).toEqual([96]);
    expect(lens(flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 }))).toEqual([30, 30, 30, 6]);
  });

  it("ignores authored cuts that fall inside a part, or outside the run", () => {
    const p = flexPieces({
      fromPos: 0,
      toPos: 48,
      maxPieceInches: 30,
      occupied: [{ fromPos: 20, toPos: 26 }],
      cuts: [-5, 10, 23, 40, 90], // −5 and 90 are off the run; 23 is inside the turnout
    });
    expect(spans(p)).toEqual(["0–10", "10–20", "26–40", "40–48"]);
  });

  it("balances the last two rather than leaving a sliver", () => {
    // 72.1″ of 36″ flex is 36 + 36 + 0.1 — and a tenth of an inch isn't a piece
    // of track, it's an offcut. Real: FMN-0073's Main 2 in Micro Engineering.
    const p = flexPieces({ fromPos: 0, toPos: 72.1, maxPieceInches: 36 });
    expect(lens(p)).toEqual([36, 18.05, 18.05]);
    expect(p.every((x) => !x.overlong)).toBe(true);
    // A 6″ tail off a 30″ length IS a real piece — leave it alone.
    expect(lens(flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 }))).toEqual([30, 30, 30, 6]);
    // Two pieces where the second would be a sliver: split the pair evenly.
    expect(lens(flexPieces({ fromPos: 0, toPos: 30.4, maxPieceInches: 30 }))).toEqual([15.2, 15.2]);
  });

  it("a crossing breaks the run without claiming a length it hasn't got", () => {
    // We've measured no crossing part, so its extent is a zero-length break: the
    // run stops and starts there — a rail joint — but no inches are taken.
    const p = flexPieces({
      fromPos: 0,
      toPos: 40,
      maxPieceInches: 30,
      occupied: [{ fromPos: 18, toPos: 18 }],
    });
    expect(spans(p)).toEqual(["0–18", "18–40"]);
    expect(p[0].toEnd).toBe("part");
    expect(p[1].fromEnd).toBe("part");
    expect(flexUsage(p).totalInches).toBeCloseTo(40); // nothing lost to it
  });

  it("a run with no length, or swallowed whole by a part, has no flex in it", () => {
    expect(flexPieces({ fromPos: 12, toPos: 12, maxPieceInches: 30 })).toEqual([]);
    expect(
      flexPieces({ fromPos: 0, toPos: 6, maxPieceInches: 30, occupied: [{ fromPos: 0, toPos: 6 }] }),
    ).toEqual([]);
  });

  it("reads the same run either way round", () => {
    const fwd = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 });
    const back = flexPieces({ fromPos: 96, toPos: 0, maxPieceInches: 30 });
    expect(spans(back)).toEqual(spans(fwd));
  });

  it("reports what a run costs to build", () => {
    const p = flexPieces({
      fromPos: 0,
      toPos: 96,
      maxPieceInches: 30,
      occupied: [{ fromPos: 20, toPos: 26 }],
    });
    const u = flexUsage(p);
    expect(u.totalInches).toBeCloseTo(90); // 96 less the 6″ turnout
    expect(u.pieces).toBe(u.pieces); // whatever the cut needs
    expect(u.overlong).toBe(0);
  });

  it("resizing a piece moves its joint and its neighbour takes the difference", () => {
    const p = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 }); // 30/30/30/6
    // Piece 1 to 20″ ⇒ its neighbour gains the 10.
    const cuts = resizeFlexPiece(p, 0, 20)!;
    expect(cuts).toEqual([20, 60, 90]);
    expect(lens(flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30, cuts }))).toEqual([
      20, 40, 30, 6,
    ]);
    // The run never grows: whatever the pair was, it stays.
    const before = p[0].lengthInches + p[1].lengthInches;
    const after = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30, cuts });
    expect(after[0].lengthInches + after[1].lengthInches).toBeCloseTo(before);
  });

  it("clamps a resize to the pair rather than reordering the cuts", () => {
    const p = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 });
    // Asking for 70 when the pair is only 60 — the old inline version sorted the
    // new cut past its neighbour and handed back a DIFFERENT piece silently.
    const cuts = resizeFlexPiece(p, 0, 70)!;
    expect(cuts).toEqual([59, 60, 90]);
    const after = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30, cuts });
    expect(after[0].lengthInches).toBeCloseTo(59); // clamped, still ordered
    expect(after[1].lengthInches).toBeCloseTo(1);
    // …and it can't be driven to zero from the other side either.
    expect(resizeFlexPiece(p, 0, -5)).toEqual([1, 60, 90]);
  });

  it("won't resize a piece that butts a part or the end of the run", () => {
    const p = flexPieces({ fromPos: 0, toPos: 96, maxPieceInches: 30 });
    expect(resizeFlexPiece(p, 3, 10)).toBeNull(); // last piece → the endplate
    const withSwitch = flexPieces({
      fromPos: 0,
      toPos: 48,
      maxPieceInches: 30,
      occupied: [{ fromPos: 20, toPos: 26 }],
    });
    expect(withSwitch[0].toEnd).toBe("part");
    expect(resizeFlexPiece(withSwitch, 0, 10)).toBeNull();
  });

  it("knows the two products, and falls back rather than leaving track unbuilt", () => {
    expect(maxFlexPieceInches("atlas-c55-n-flex")).toBe(30);
    expect(maxFlexPieceInches("me-c55-n-flex")).toBe(36);
    // Unknown or unset ⇒ the default, because every inch of track IS some product.
    expect(maxFlexPieceInches(undefined)).toBe(30);
    expect(maxFlexPieceInches("no-such-part")).toBe(30);
    // A TURNOUT slug is not a flex product, even though it's in the library.
    expect(flexPartFor("atlas-c55-n-7")!.id).toBe(DEFAULT_FLEX_PART_ID);
    expect(flexParts().map((p) => p.id).sort()).toEqual(["atlas-c55-n-flex", "me-c55-n-flex"]);
  });

  it("knows BOTH Atlas wyes apart, by their moulded numbers", () => {
    // Will Gage, 2026-07-26: "2057 is 3.5, 2056 is 2.5". They are two different
    // FROG NUMBERS, not a left/right pair — a wye has no hand, both legs
    // diverge. Pinned because the identification came from someone holding the
    // parts, and the library had only one of them.
    const wyes = BUILT_IN_TRACK_PARTS.filter(
      (p) => p.kind === "wye" && p.manufacturer === "Atlas",
    );
    expect(wyes.map((w) => [w.partNumbers?.single, w.frogNumber])).toEqual([
      ["2056", 2.5],
      ["2057", 3.5],
    ]);
    // BOTH are now fully measured (Will Gage, 2026-07-26) — which is what makes
    // a wye claim a real body, so #193's flex stops running straight through it.
    const w25 = wyes.find((w) => w.frogNumber === 2.5)!;
    const w35 = wyes.find((w) => w.frogNumber === 3.5)!;
    expect(partExtent(w25)).toEqual({
      behindPoints: 1.625,
      aheadOfPoints: 4.875,
      pastFrog: 2.375,
      behindFrog: 4.125,
      frogKnown: true,
    });
    expect(partExtent(w35)).toEqual({
      behindPoints: 0.75,
      aheadOfPoints: 4.25,
      pastFrog: 1.84375,
      behindFrog: 3.15625,
      frogKnown: true,
    });
  });

  // The frog apex must fall INSIDE the moulding. The 2057 first came in at
  // 5 5/32in against a 5in overall length, which would have drawn its frog off
  // the end of itself; a re-read gave 3 5/32in. Cheap, total, and it caught a
  // real one — so it guards every part, not just that one.
  it("no part's frog or points sit outside its own overall length", () => {
    for (const p of BUILT_IN_TRACK_PARTS) {
      const overall = p.overallLength?.inches;
      if (overall == null) continue;
      if (p.frogOffset) expect(p.frogOffset.inches, `${p.id} frog`).toBeLessThan(overall);
      if (p.pointsOffset) {
        expect(p.pointsOffset.inches, `${p.id} points`).toBeLessThan(overall);
      }
      if (p.frogOffset && p.pointsOffset) {
        expect(p.frogOffset.inches, `${p.id} frog after points`).toBeGreaterThan(
          p.pointsOffset.inches,
        );
      }
    }
  });

  // A diverging rail is the hypotenuse of the angle it leaves at, so it must be
  // LONGER than the axial distance it covers — and not absurdly so. This is the
  // check that falsified the 2057's first frog reading (it made the axial
  // distance negative).
  it("each diverging rail is longer than its own axial projection", () => {
    const measured = BUILT_IN_TRACK_PARTS.filter(
      (p) => p.divergingLength && p.overallLength && p.frogOffset,
    );
    expect(measured.length).toBeGreaterThan(0);
    for (const p of measured) {
      const axial = p.overallLength!.inches - p.frogOffset!.inches;
      expect(axial, `${p.id} axial past-frog`).toBeGreaterThan(0);
      expect(p.divergingLength!.inches, `${p.id} rail vs axial`).toBeGreaterThan(axial);
      // Within 15%: past that the frog or the rail is misread, not angled.
      expect(p.divergingLength!.inches / axial, `${p.id} ratio`).toBeLessThan(1.15);
    }
  });

  it("round-trips a track's product and cuts through the doc", () => {
    const s = emptyEditorState(96);
    const st: typeof s = {
      ...s,
      flexByTrack: { [MAIN_TRACK_ID]: { partId: "me-c55-n-flex", cuts: [36, 72] } },
    };
    const doc = stateToDoc(st, "M");
    const main = doc.tracks.find((t) => t.id === MAIN_TRACK_ID)!;
    expect(main.flexPartId).toBe("me-c55-n-flex");
    expect(main.flexCuts).toEqual([36, 72]);
    expect(docToState(doc, 96).flexByTrack[MAIN_TRACK_ID]).toEqual({
      partId: "me-c55-n-flex",
      cuts: [36, 72],
    });
    // A track nobody has chosen for stays absent — not written as a default.
    expect(doc.tracks.every((t) => t.id === MAIN_TRACK_ID || t.flexPartId === undefined)).toBe(true);
  });

  it("rescales cuts with the module, like every other position along the run", () => {
    // A joint 30″ along a 96″ main is 15″ along the same main halved — leaving it
    // at 30 would put it somewhere else entirely on the board.
    const s = emptyEditorState(96);
    const doc = stateToDoc({ ...s, flexByTrack: { [MAIN_TRACK_ID]: { cuts: [30, 60] } } }, "M");
    expect(docToState(doc, 48).flexByTrack[MAIN_TRACK_ID].cuts).toEqual([15, 30]);
  });

  it("does NOT rescale the cuts on a run measured along its own path", () => {
    // ⭐ The opposite of the test above, and for the reason that makes them
    // different: these cuts index into the track's PATH, which is kept as
    // authored. Halving the module leaves the drawn route exactly where it was,
    // so halving its joints would slide them off it (#226).
    const s = emptyEditorState(96);
    s.extraTracks.push({
      id: "br1",
      role: "branch",
      lane: 2,
      fromPos: 27.8,
      toPos: 27.8,
      path: [{ x: 27.8, y: 0 }, { x: 27.8, y: 22 }],
      moduleTrackId: null,
      trackName: "To endplate C",
    });
    const doc = stateToDoc({ ...s, flexByTrack: { br1: { cuts: [11] } } }, "M");
    expect(docToState(doc, 48).flexByTrack.br1.cuts).toEqual([11]);
  });
})

// ── Which axis a run is measured along (#226) ─────────────────────────────────
describe("measuredAlongPath (#226)", () => {
  const route = {
    path: [{ x: 27.8, y: 0 }, { x: 27.8, y: 22 }],
    fromPos: 27.8,
    toPos: 27.8,
  };

  it("a drawn route with no extent along the module is measured along itself", () => {
    expect(measuredAlongPath(route)).toBe(true);
  });

  it("a drawn run that DOES cover module is still measured along the module", () => {
    // A bent siding has a real extent from A — its positions stay absolute, and
    // nothing about this change may move them.
    expect(measuredAlongPath({ ...route, fromPos: 12, toPos: 40 })).toBe(false);
  });

  it("a track with no path is measured along the module, however degenerate", () => {
    expect(measuredAlongPath({ path: null, fromPos: 27.8, toPos: 27.8 })).toBe(false);
    expect(measuredAlongPath({ path: [{ x: 1, y: 1 }], fromPos: 5, toPos: 5 })).toBe(false);
  });

  it("fails CLOSED when there are no positions to compare", () => {
    // No evidence the module axis is unusable ⇒ keep the frame everything else
    // already assumes, rather than silently re-parameterising a run.
    expect(measuredAlongPath({ ...route, fromPos: null, toPos: null })).toBe(false);
    expect(measuredAlongPath({ path: route.path })).toBe(false);
  });

  it("says nothing about the stored role — a return loop qualifies too", () => {
    // ⭐ The label is the owner's (#226). A loop is drawn across the board for
    // exactly the same reason a route to endplate C is, and the frame follows
    // the geometry, not the word. Keying off role:"branch" got the loop right
    // only by accident.
    expect(
      measuredAlongPath({
        path: [{ x: 96, y: 0 }, { x: 110, y: 14 }, { x: 96, y: 28 }],
        fromPos: 96,
        toPos: 96,
      }),
    ).toBe(true);
  });
})

// ── An industry span running past its track (#194) ────────────────────────────
describe("span overhang (#194)", () => {
  it("reports nothing when the span fits", () => {
    const o = spanOverhang({ fromPos: 12, toPos: 40, trackFromPos: 8, trackToPos: 45 });
    expect(o.overhangInches).toBe(0);
    expect(o.onTrackInches).toBe(28);
  });

  it("measures each end separately", () => {
    // FMN-0013's "Team track": 29.8→41 authored on a siding running 30→39.
    const o = spanOverhang({ fromPos: 29.8, toPos: 41, trackFromPos: 30, trackToPos: 39 });
    expect(o.beforeInches).toBeCloseTo(0.2);
    expect(o.afterInches).toBeCloseTo(2);
    expect(o.onTrackInches).toBeCloseTo(9);
    expect(o.overhangInches).toBeCloseTo(2.2);
    // …and that's a car and a half of capacity with no rail under it.
    expect(carCapacity(29.8, 41)).toBe(3);
    expect(carCapacity(0, o.onTrackInches)).toBe(2);
  });

  it("doesn't care which way round either span was authored", () => {
    // A siding running east-to-west is ordinary; so is a span typed end-first.
    const fwd = spanOverhang({ fromPos: 10, toPos: 50, trackFromPos: 20, trackToPos: 40 });
    const back = spanOverhang({ fromPos: 50, toPos: 10, trackFromPos: 40, trackToPos: 20 });
    expect(back).toEqual(fwd);
    expect(fwd.beforeInches).toBe(10);
    expect(fwd.afterInches).toBe(10);
    expect(fwd.onTrackInches).toBe(20);
  });

  it("a span entirely off its track has NO rail under it", () => {
    const o = spanOverhang({ fromPos: 60, toPos: 70, trackFromPos: 10, trackToPos: 40 });
    expect(o.onTrackInches).toBe(0);
    expect(o.afterInches).toBe(30); // measured from the track's far end
    expect(o.beforeInches).toBe(0);
  });
})

// ── Usable capacity from the clearance point (#19/#20) ────────────────────────
// Physical track length is not usable capacity: a car standing short of the
// clearance point fouls the adjacent route. Capacity is measured from there.
describe("usable capacity (#19/#20)", () => {
  it("puts the clearance point where the routes reach one track spacing apart", () => {
    // The defining distance IS the standard's track spacing — the distance at
    // which two parallel tracks coexist — not a second, disagreeing constant.
    expect(CLEARANCE_SPACING_INCHES).toBe(FREEMO_TRACK_SPACING_INCHES);
    const cl = turnoutClosure(7, { leadInches: leadInchesForSize(7) });
    const past = clearancePointPastFrogInches(7);
    // At the clearance point the routes are exactly one spacing apart…
    expect(cl.offsetAt(leadInchesForSize(7) + past)).toBeCloseTo(FREEMO_TRACK_SPACING_INCHES, 3);
    // …and a shade before it, they are not.
    expect(cl.offsetAt(leadInchesForSize(7) + past - 0.5)).toBeLessThan(FREEMO_TRACK_SPACING_INCHES);
  });

  it("reaches clearance later on a shallower frog", () => {
    // A #10 diverges more gently, so it takes longer to get clear — which is
    // exactly why the figure can't be one constant for every turnout.
    const p = [5, 6, 7, 10].map((n) => clearancePointPastFrogInches(n));
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
    expect(p[2]).toBeCloseTo(5.4, 1); // the #7, on our measured lead
  });

  it("a siding gives up its clearance point at BOTH ends", () => {
    // FMN-0040's passing siding: 33 → 103 on the main, a #7 governing each end.
    const u = usableCapacity({
      fromPos: 33,
      toPos: 103,
      governing: [{ pos: 33, size: 7 }, { pos: 103, size: 7 }],
    });
    expect(u.drawnInches).toBe(70);
    expect(u.usableInches).toBeCloseTo(70 - 2 * clearancePointPastFrogInches(7), 3);
    expect(u.usableInches).toBeCloseTo(59.2, 1);
    // The point of the whole exercise: the drawn figure overstates it.
    expect(carCapacity(0, 70)).toBe(21);
    expect(u.cars).toBe(17);
  });

  it("a spur gives up only the end its turnout governs", () => {
    const u = usableCapacity({ fromPos: 20, toPos: 50, governing: [{ pos: 20, size: 7 }] });
    expect(u.fromPos).toBeCloseTo(20 + clearancePointPastFrogInches(7), 3);
    expect(u.toPos).toBe(50); // the far end is a rail end, not a turnout
  });

  it("governs the NEAREST end, whichever way the track was authored", () => {
    // A spur running east→west is ordinary; its turnout is then at the HIGH end.
    const west = usableCapacity({ fromPos: 50, toPos: 20, governing: [{ pos: 50, size: 7 }] });
    expect(west.toPos).toBeCloseTo(50 - clearancePointPastFrogInches(7), 3);
    expect(west.fromPos).toBe(20);
    expect(west.usableInches).toBeCloseTo(
      usableCapacity({ fromPos: 20, toPos: 50, governing: [{ pos: 20, size: 7 }] }).usableInches,
      6,
    );
  });

  it("an owner's measured length wins, and clearance is NOT taken off it again", () => {
    // They measured the USABLE length — a bumper post short of the drawn end.
    // Subtracting the clearance point again would double-count it.
    const u = usableCapacity({
      fromPos: 33,
      toPos: 103,
      governing: [{ pos: 33, size: 7 }, { pos: 103, size: 7 }],
      measuredUsableInches: 55,
    });
    expect(u.usableInches).toBe(55);
    expect(u.cars).toBe(carCapacity(0, 55));
    expect(u.givenUpInches).toBe(15); // 70 drawn − 55 usable
  });

  it("a run swallowed whole by its clearance points holds nothing", () => {
    const u = usableCapacity({
      fromPos: 40,
      toPos: 44,
      governing: [{ pos: 40, size: 7 }, { pos: 44, size: 7 }],
    });
    expect(u.usableInches).toBe(0);
    expect(u.cars).toBe(0);
  });

  it("stores the USABLE figure as capacityFeet, and round-trips a measured override", () => {
    const s0 = emptyEditorState(120);
    const st: typeof s0 = {
      ...s0,
      extraTracks: [
        { id: "sid1", role: "siding", lane: -1, fromPos: 33, toPos: 103, moduleTrackId: null, trackName: "Passing siding" },
        { id: "sp1", role: "spur", lane: -2, fromPos: 20, toPos: 50, moduleTrackId: null, trackName: "Spur", measuredUsableInches: 22 },
      ],
      turnouts: [
        { id: "sw1", pos: 33, kind: "right", name: "", onTrack: MAIN_TRACK_ID, divergeTrack: "sid1", size: 7 },
        { id: "sw2", pos: 103, kind: "right", name: "", onTrack: MAIN_TRACK_ID, divergeTrack: "sid1", size: 7 },
        { id: "sw3", pos: 20, kind: "right", name: "", onTrack: "sid1", divergeTrack: "sp1", size: 7 },
      ],
    };
    const doc = stateToDoc(st, "M");
    const sid = doc.tracks.find((t) => t.id === "sid1")!;
    const spur = doc.tracks.find((t) => t.id === "sp1")!;
    // The siding stores USABLE feet, not the 933 its drawn 70″ would give.
    expect(sid.capacityFeet).toBe(
      usableCapacity({ fromPos: 33, toPos: 103, governing: [{ pos: 33, size: 7 }, { pos: 103, size: 7 }] }).scaleFeet,
    );
    expect(sid.capacityFeet).toBeLessThan(Math.round(inchesToScaleFeet(70)));
    expect(sid.measuredUsableInches).toBeUndefined(); // nothing measured ⇒ not written
    // The spur's measured override is stored and comes back.
    expect(spur.measuredUsableInches).toBe(22);
    expect(spur.capacityFeet).toBe(Math.round(inchesToScaleFeet(22)));
    expect(docToState(doc, 120).extraTracks.find((t) => t.id === "sp1")!.measuredUsableInches).toBe(22);
    // …and rescales with the module, like every other real-world length.
    expect(docToState(doc, 60).extraTracks.find((t) => t.id === "sp1")!.measuredUsableInches).toBe(11);
  });

  it("with no governing turnout, usable IS the drawn length", () => {
    const u = usableCapacity({ fromPos: 0, toPos: 48 });
    expect(u.usableInches).toBe(48);
    expect(u.drawnInches).toBe(48);
    expect(u.givenUpInches).toBe(0);
  });
})

// ── A section's two ends (#130) ───────────────────────────────────────────────
// Owner: "how would I update my section joints to be endplates from within MR?"
// The answer is that you describe the end and the geometry decides — there is
// deliberately no "this is an endplate" flag to tick wrongly.
describe("section ends (#130)", () => {
  it("an undescribed end is an internal joint, not a failing endplate", () => {
    // Most joints inside a module are just joints, and the standard exempts
    // them from the end-interface rules (#96). That's absence, not failure.
    for (const end of [undefined, null, {}, { widthInches: 24 }, { config: "none" as const }]) {
      const a = assessSectionEnd(end);
      expect(a.described).toBe(false);
      expect(a.conforming).toBe(false);
      expect(a.issues).toEqual([]); // NOT flagged as wrong
    }
  });

  it("a width alone doesn't make a joint an interface — a track config does", () => {
    expect(assessSectionEnd({ widthInches: 24 }).described).toBe(false);
    expect(assessSectionEnd({ config: "single" }).described).toBe(true);
  });

  it("a described end that meets the standard IS an endplate", () => {
    const a = assessSectionEnd({ config: "single", widthInches: 24 });
    expect(a.conforming).toBe(true);
    expect(a.issues).toEqual([]);
    // A double end straddles its pair by default, so it conforms untouched.
    expect(assessSectionEnd({ config: "double", widthInches: 24 }).conforming).toBe(true);
  });

  it("applies the SAME rules a module's own plates get", () => {
    // Too narrow (§1.1's 12″ minimum).
    const narrow = assessSectionEnd({ config: "single", widthInches: 8 });
    expect(narrow.described).toBe(true);
    expect(narrow.conforming).toBe(false);
    expect(narrow.issues.map((i) => i.code)).toContain("narrow");
    // Track too near a fascia (§2.0's 4″).
    const crowded = assessSectionEnd({ config: "single", widthInches: 12, trackOffsetInches: 5 });
    expect(crowded.conforming).toBe(false);
    expect(crowded.issues.map((i) => i.code)).toContain("clearance");
  });

  it("a joint is standard only when BOTH ends are", () => {
    const good = { config: "single" as const, widthInches: 24 };
    expect(assessSectionJoint(good, good).standardInterface).toBe(true);
    expect(assessSectionJoint(good, good).reason).toBeNull();
    // One side undescribed ⇒ not an interface, and the reason says which.
    const half = assessSectionJoint(good, undefined);
    expect(half.standardInterface).toBe(false);
    expect(half.reason).toMatch(/only the west side/);
    // One side too narrow ⇒ not an interface, and the reason is the real issue.
    const narrow = assessSectionJoint(good, { config: "single", widthInches: 8 });
    expect(narrow.standardInterface).toBe(false);
    expect(narrow.reason).toMatch(/at least 12/);
  });

  it("track COUNT is the compatibility rule — differing WIDTHS still mate", () => {
    // The standard lets plates differ in width and be offset, so long as the
    // track lines up. A width-mismatch check would be inventing a rule.
    const wide = { config: "single" as const, widthInches: 24 };
    const narrowButLegal = { config: "single" as const, widthInches: 12 };
    expect(assessSectionJoint(wide, narrowButLegal).standardInterface).toBe(true);
    // Single meeting double is the real mismatch.
    const dbl = { config: "double" as const, widthInches: 24 };
    const mixed = assessSectionJoint(wide, dbl);
    expect(mixed.standardInterface).toBe(false);
    expect(mixed.reason).toMatch(/track counts differ/);
  });

  it("honours the swap, like every other endplate check", () => {
    // A double end's recommended offset flips with mainsSwapped (#190), so an
    // end authored for a swapped module must not read as off-centre.
    expect(assessSectionEnd({ config: "double", widthInches: 24 }, { main2Below: true }).conforming).toBe(true);
    const explicit = assessSectionEnd(
      { config: "double", widthInches: 24, trackOffsetInches: 0.5625 },
      { main2Below: true },
    );
    expect(explicit.conforming).toBe(true);
  });

  it("round-trips a section's ends through the doc", () => {
    const s0 = emptyEditorState(96);
    const st: typeof s0 = {
      ...s0,
      sections: [
        { id: "sec1", lengthInches: 48, endA: { config: "single", widthInches: 24 }, endB: { config: "double" } },
        { id: "sec2", lengthInches: 48 },
      ],
    };
    const doc = stateToDoc(st, "M");
    expect(doc.sections?.[0].endA).toEqual({ config: "single", widthInches: 24 });
    expect(doc.sections?.[0].endB).toEqual({ config: "double" });
    const back = docToState(doc, 96);
    expect(back.sections[0].endA?.config).toBe("single");
    expect(back.sections[0].endB?.config).toBe("double");
    expect(back.sections[1].endA ?? null).toBeNull();
  });
})

// ── A branch endplate sits on the benchwork edge ─────────────────────────────
describe("branch endplate placement", () => {
  it("puts a placed 3rd endplate on the BOARD EDGE, not the centre line", () => {
    // An endplate is where a train leaves the module, so a side-facing one
    // belongs on the border. This derived `y: 0` — buried mid-board — and only
    // looked right on modules whose pose had been hand-authored to the edge.
    const up = deriveEndplatePoses({
      lengthInches: 72,
      geometryType: "straight",
      branches: [{ id: "C", atPos: 24, side: "up" }],
    }).find((p) => p.id === "C")!;
    expect(up.x).toBeCloseTo(24);
    expect(up.y).toBeCloseTo(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES / 2); // 12, the board edge
    expect(up.heading).toBe(90);
    expect(up.y).not.toBe(0);

    const down = deriveEndplatePoses({
      lengthInches: 72,
      geometryType: "straight",
      branches: [{ id: "D", atPos: 24, side: "down" }],
    }).find((p) => p.id === "D")!;
    expect(down.y).toBeCloseTo(-FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES / 2);
    expect(down.heading).toBe(270);
  });

  it("follows the board's own depth, and tapers with it", () => {
    // A module whose plates differ in width is a wedge, so where a branch sits
    // along it changes how deep the board is there.
    const poses = deriveEndplatePoses({
      lengthInches: 100,
      geometryType: "straight",
      endplateWidths: { A: 12, B: 24 },
      branches: [
        { id: "C", atPos: 0, side: "up" },
        { id: "D", atPos: 50, side: "up" },
        { id: "E", atPos: 100, side: "up" },
      ],
    });
    expect(poses.find((p) => p.id === "C")!.y).toBeCloseTo(6); // 12/2
    expect(poses.find((p) => p.id === "D")!.y).toBeCloseTo(9); // halfway
    expect(poses.find((p) => p.id === "E")!.y).toBeCloseTo(12); // 24/2
  });

  it("an authored pose still wins", () => {
    // The owner dragging the plate is the final word — the derived edge is only
    // the starting point (#182).
    const p = deriveEndplatePoses({
      lengthInches: 72,
      geometryType: "straight",
      branches: [{ id: "C", atPos: 24, side: "up" }],
      poseOverrides: { C: { x: 30, y: 5, heading: 45 } },
    }).find((x) => x.id === "C")!;
    expect(p).toMatchObject({ x: 30, y: 5, heading: 45, manual: true });
  });
})

// ─── The crossover pinch (#180) ──────────────────────────────────────────────
// Will Gage, 2026-07-26: "draw the crossover at 1.09 and show the pinch."
// A crossover fixture is machined for ONE spacing, so a module with a Fast
// Tracks crossover really does have its mains 0.035" closer across it, opening
// back to the standard 1.125" at the endplates. Drawing a straight pair would
// be drawing something the module doesn't have.
describe("crossover pinch", () => {
  const pinch: LanePinch[] = [
    { lane: 1, fromPos: 40, toPos: 50, spacingInches: 1.09 },
  ];

  it("holds the fixture's spacing across the crossover", () => {
    for (const pos of [40, 43, 45, 48, 50]) {
      expect(laneOffsetAt(1, pos, pinch), `pos ${pos}`).toBeCloseTo(1.09, 9);
    }
  });

  it("is the standard spacing well clear of it", () => {
    for (const pos of [0, 20, 36.9, 53.1, 80]) {
      expect(laneOffsetAt(1, pos, pinch), `pos ${pos}`).toBeCloseTo(1.125, 9);
    }
  });

  // The whole point of a smoothstep: the deviation leaves and rejoins the
  // straight run TANGENTIALLY. A linear ramp puts a visible corner at each end,
  // which is not how bent flex behaves.
  it("eases in and out with no kink at either end", () => {
    const e = PINCH_EASE_INCHES;
    const d = 0.001;
    const slope = (p: number) =>
      (laneOffsetAt(1, p + d, pinch) - laneOffsetAt(1, p - d, pinch)) / (2 * d);
    // Flat where the ease meets the straight track, and where it meets the
    // rigid section — all four joins.
    expect(Math.abs(slope(40 - e))).toBeLessThan(1e-3);
    expect(Math.abs(slope(40))).toBeLessThan(1e-3);
    expect(Math.abs(slope(50))).toBeLessThan(1e-3);
    expect(Math.abs(slope(50 + e))).toBeLessThan(1e-3);
    // …and it genuinely moves in between, rather than being flat everywhere.
    expect(laneOffsetAt(1, 40 - e / 2, pinch)).toBeGreaterThan(1.09);
    expect(laneOffsetAt(1, 40 - e / 2, pinch)).toBeLessThan(1.125);
    // Monotone approach: no wobble on the way in.
    let prev = Infinity;
    for (let s = 0; s <= 20; s++) {
      const v = laneOffsetAt(1, 40 - e + (e * s) / 20, pinch);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it("never moves the main — it is the reference everything is measured from", () => {
    for (const pos of [0, 40, 45, 50, 80]) {
      expect(laneOffsetAt(0, pos, pinch)).toBe(0);
    }
  });

  it("pulls a lane BELOW the main toward it too, not away", () => {
    const below: LanePinch[] = [
      { lane: -1, fromPos: 40, toPos: 50, spacingInches: 1.09 },
    ];
    expect(laneOffsetAt(-1, 45, below)).toBeCloseTo(-1.09, 9);
    expect(laneOffsetAt(-1, 0, below)).toBeCloseTo(-1.125, 9);
    // Closer to the main in BOTH cases — the sign must not flip the direction.
    expect(Math.abs(laneOffsetAt(-1, 45, below))).toBeLessThan(
      Math.abs(laneOffsetAt(-1, 0, below)),
    );
  });

  it("leaves other lanes alone", () => {
    expect(laneOffsetAt(2, 45, pinch)).toBeCloseTo(2.25, 9);
    expect(laneOffsetAt(1, 45, [])).toBeCloseTo(1.125, 9);
    expect(laneOffsetAt(1, 45, null)).toBeCloseTo(1.125, 9);
  });

  // Two crossovers on top of each other is a data error, not a doubly-tight
  // pair — so the deepest wins rather than the two summing into nonsense.
  it("takes the deepest of overlapping pinches, never the sum", () => {
    const two: LanePinch[] = [
      { lane: 1, fromPos: 40, toPos: 50, spacingInches: 1.09 },
      { lane: 1, fromPos: 42, toPos: 48, spacingInches: 1.0 },
    ];
    expect(laneOffsetAt(1, 45, two)).toBeCloseTo(1.0, 9);
    // Summing the two deviations would give 1.125 − 0.035 − 0.125 = 0.965.
    // Nothing anywhere may go below the deepest single target.
    for (let pos = 30; pos <= 60; pos += 0.25) {
      expect(laneOffsetAt(1, pos, two), `pos ${pos}`).toBeGreaterThanOrEqual(1.0 - 1e-9);
      expect(laneOffsetAt(1, pos, two), `pos ${pos}`).toBeLessThanOrEqual(1.125 + 1e-9);
    }
    // Order must not matter.
    expect(laneOffsetAt(1, 41, two)).toBeCloseTo(laneOffsetAt(1, 41, [...two].reverse()), 12);
  });

  describe("derived from the document", () => {
    const xover = (partId?: string) => ({
      role: "crossover",
      lane: 1,
      fromPos: 40,
      toPos: 50,
      ...(partId ? { crossoverPartId: partId } : {}),
    });

    it("reads the spacing off the named part", () => {
      const ps = crossoverPinches([xover("fast-tracks-n-me55-c-6")]);
      expect(ps).toEqual([
        { lane: 1, fromPos: 40, toPos: 50, spacingInches: 1.09 },
      ]);
    });

    // A double crossover is TWO connectors over the same span at the same
    // spacing, but the pair of tracks only closes up ONCE. Un-deduped the
    // geometry stays right (identical pinches agree) so it surfaces as a
    // doubled CALLOUT — the label drawn twice, exactly superimposed, which is
    // how it was found.
    it("a double crossover's two connectors are ONE pinch", () => {
      const both = crossoverPinches([
        xover("fast-tracks-n-me55-c-6"),
        xover("fast-tracks-n-me55-c-6"),
      ]);
      expect(both).toHaveLength(1);
      // …but two crossovers at DIFFERENT places are still two.
      expect(
        crossoverPinches([
          xover("fast-tracks-n-me55-c-6"),
          { ...xover("fast-tracks-n-me55-c-6"), fromPos: 70, toPos: 80 },
        ]),
      ).toHaveLength(2);
    });

    // An owner who hasn't said what they built gets the straight pair they had
    // before. Assuming Fast Tracks would be inventing a fact about their module.
    it("imposes nothing when no part is named", () => {
      expect(crossoverPinches([xover()])).toEqual([]);
    });

    it("imposes nothing for a part built to the standard spacing", () => {
      const lib = [
        {
          id: "std-crossover",
          manufacturer: "T",
          line: "Code 55",
          scale: "N" as const,
          name: "std",
          kind: "crossover" as const,
          trackSpacing: {
            inches: FREEMO_TRACK_SPACING_INCHES,
            source: "manufacturer" as const,
          },
        },
      ];
      expect(crossoverPinches([xover("std-crossover")], lib)).toEqual([]);
    });

    it("ignores tracks that aren't crossovers, and unknown parts", () => {
      expect(
        crossoverPinches([
          { role: "siding", lane: 1, fromPos: 40, toPos: 50, crossoverPartId: "fast-tracks-n-me55-c-6" },
          { ...xover("no-such-part") },
        ]),
      ).toEqual([]);
    });
  });
});


// ─── Piece geometry (ADR 0001) ───────────────────────────────────────────────
// A part's ENDS, in its own frame, so a piece graph has something to snap. The
// spike proved a graph can carry the dispatcher view; this is the data it needs.
describe("part geometry", () => {
  it("a turnout's three joints sit where its measurements say", () => {
    const g = partGeometry(trackPart("atlas-c55-n-7")!)!;
    expect(g.joints.map((j) => j.id)).toEqual(["throat", "through", "diverge"]);
    const [throat, through, diverge] = g.joints;
    // The frame: origin at the tie end, through route along +x.
    expect([throat.x, throat.y]).toEqual([0, 0]);
    expect(throat.angleDeg).toBe(180);
    expect(through.x).toBe(6); // the measured overall length
    expect(through.y).toBe(0);
    // The diverging end leaves at the FROG angle, atan(1/7).
    expect(diverge.angleDeg).toBeCloseTo((Math.atan(1 / 7) * 180) / Math.PI, 6);
    expect(diverge.y).toBeGreaterThan(0);
    // Routes share the throat — that is what makes it a turnout.
    expect(g.routes).toEqual([["throat", "through"], ["throat", "diverge"]]);
    expect(g.source).toBe("measured");
  });

  // ⭐ THE CROSS-CHECK PAYING OFF. `divergingLength` (frog -> end of the
  // diverging rail, ALONG the rail) and `overallLength` are two independent
  // readings of the same part. Projected, they must agree — and on both wyes
  // they do, to a few hundredths. That is the measurements corroborating each
  // other, not the code agreeing with itself.
  it("the measured diverging end agrees with the measured overall length", () => {
    for (const id of ["atlas-c55-n-wye", "atlas-c55-n-wye-35"]) {
      const part = trackPart(id)!;
      const g = partGeometry(part)!;
      expect(g.divergingEndMeasured, id).toBe(true);
      const leg = g.joints.find((j) => j.id === "legA")!;
      expect(Math.abs(leg.x - part.overallLength!.inches), `${id} within 0.1"`).toBeLessThan(0.1);
    }
  });

  it("a wye has two mirrored legs and NO straight route — which is why it has no hand", () => {
    const g = partGeometry(trackPart("atlas-c55-n-wye")!)!;
    const a = g.joints.find((j) => j.id === "legA")!;
    const b = g.joints.find((j) => j.id === "legB")!;
    expect(a.y).toBeCloseTo(-b.y, 9);
    expect(a.angleDeg).toBeCloseTo(-b.angleDeg, 9);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(g.joints.some((j) => j.role === "through")).toBe(false);
    // Each leg takes HALF the divergence, so it behaves as a #2N — the same
    // rule `frogLegOf` uses. One definition, two callers.
    expect(a.angleDeg).toBeCloseTo((Math.atan(1 / (2.5 * 2)) * 180) / Math.PI, 6);
  });

  it("falls back to the moulding's end when the diverging rail wasn't measured", () => {
    for (const id of ["atlas-c55-n-5", "atlas-c55-n-7", "atlas-c55-n-10"]) {
      const part = trackPart(id)!;
      const g = partGeometry(part)!;
      expect(g.divergingEndMeasured, id).toBe(false);
      const d = g.joints.find((j) => j.id === "diverge")!;
      expect(d.x, id).toBe(part.overallLength!.inches);
    }
  });

  // ⚠️ THE BLOCKED LIST IS THE PARTS BACKLOG. Every reason here is a
  // measurement someone could take, and the count is how far the piece editor
  // is from covering the library.
  it("says WHY a part cannot be placed, rather than silently omitting it", () => {
    const { placeable, blocked } = partsPlaceable();
    expect(placeable.length + blocked.length).toBe(BUILT_IN_TRACK_PARTS.length);
    // Everything Atlas measured, plus both flex products — and the bumper,
    // which is placeable with NO dimensions because what it means does not
    // depend on its size — and both Fast Tracks DOUBLE CROSSOVERS, whose
    // geometry turned out to be published all along (see crossoverAssembly):
    // the half-length, the fixture's track spacing and its frog angle fix the
    // whole assembly between them. What was missing was reading the half as a
    // half, not the geometry.
    expect(placeable.map((p) => p.id).sort()).toEqual([
      "atlas-c55-n-10", "atlas-c55-n-5", "atlas-c55-n-7",
      "atlas-c55-n-flex", "atlas-c55-n-wye", "atlas-c55-n-wye-35",
      "fast-tracks-n-me55-c-6", "fast-tracks-n-me55-c-8",
      "generic-bumper",
      // ⏳ NO CROSSING APPEARS HERE, and that is deliberate: the geometry is
      // modelled, but the library ships no diamond until one is measured. A
      // placeholder's arm length would be a number with nothing behind it.
      // The placeholders for a turnout nobody has identified. Placeable is the
      // truth about them — they can be drawn — and the palette groups them under
      // "Generic" with "(make unknown)" in the name. What they must never be is
      // ADOPTED automatically, which `placeableTurnoutParts` prevents.
      "generic-turnout-10", "generic-turnout-4", "generic-turnout-5",
      "generic-turnout-6", "generic-turnout-7", "generic-turnout-8",
      "me-c55-n-flex",
    ]);
    // Every Fast Tracks turnout and wye is blocked for ONE reason, and it is a
    // reading, not a modelling problem: they publish no points offset.
    // ⭐ TWO reasons now, not one: Will measured his #6's points on 2026-07-31, so
    // that fixture's gap has moved on to the frog while the other thirteen still
    // publish neither landmark. The backlog got one item shorter, not one part
    // closer to being drawn.
    const ft = blocked.filter((b) => b.part.manufacturer === "Fast Tracks" && b.part.kind !== "crossover");
    expect(ft).toHaveLength(14);
    for (const b of ft)
      expect(b.why, b.part.id).toMatch(
        b.part.id === "fast-tracks-n-me55-t-6" ? /frog offset/ : /points offset/,
      );
    expect(partGeometry(trackPart("fast-tracks-n-me55-t-6")!)).toBeNull();
  });

  it("flex has two ends and no fixed shape — the builder cuts it", () => {
    const g = partGeometry(trackPart("atlas-c55-n-flex")!)!;
    expect(g.joints.map((j) => j.id)).toEqual(["a", "b"]);
    expect(g.routes).toEqual([["a", "b"]]);
    expect(partGeometryGap(trackPart("atlas-c55-n-flex")!)).toBeNull();
  });

  // Geometry belongs to the PART. Placement is a rotation and a translation
  // applied later — so nothing here may depend on where a piece was dropped.
  it("is expressed in the part's own frame, with the throat at the origin", () => {
    for (const p of partsPlaceable().placeable) {
      const g = partGeometry(p)!;
      const first = g.joints[0];
      expect([first.x, first.y], p.id).toEqual([0, 0]);
      expect(first.angleDeg, p.id).toBe(180);
    }
  });
});


// ─── Endplates are part of the benchwork (ADR 0001) ──────────────────────────
// Will Gage: "Endplates are a part of the benchwork. We have separated them
// causing some challenges." A pose floats in module space and can disagree with
// the board. An edge binding cannot.
describe("endplate bound to a benchwork edge", () => {
  // A tapered board: 16" deep at the west end, 32" at the east.
  const tapered = [
    { x: 0, y: -8 }, { x: 0, y: 8 },
    { x: 72, y: 16 }, { x: 72, y: -16 },
  ];
  const rect = [
    { x: 0, y: -12 }, { x: 0, y: 12 }, { x: 96, y: 12 }, { x: 96, y: -12 },
  ];

  it("reads position, heading AND width off the edge — they cannot disagree", () => {
    // Edge 0 of the rectangle is the WEST end: (0,-12) -> (0,12).
    const e = endplateEdgePose(rect, { index: 0 })!;
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
    expect(e.heading).toBe(180); // outward = west, away from the centroid
    expect(e.widthInches).toBe(24); // the edge's own length; no separate number
  });

  it("faces outward on every edge, never into the board", () => {
    const headings = [0, 1, 2, 3].map((index) => endplateEdgePose(rect, { index })!.heading);
    expect(headings).toEqual([180, 90, 0, 270]);
  });

  // ⭐ The limitation reported on FMN-0077 — "the face draws flat while a
  // tapered edge slopes, so it is flush only at its midpoint" — stops existing.
  // The face IS the edge.
  it("follows a tapered board's slope, instead of being flush only at its midpoint", () => {
    const e = endplateEdgePose(tapered, { index: 1 })!; // the sloping north edge
    expect(e.face[0]).toEqual({ x: 0, y: 8 });
    expect(e.face[1]).toEqual({ x: 72, y: 16 });
    // Its width is the SLOPING length, not the horizontal run.
    expect(e.widthInches).toBeCloseTo(Math.hypot(72, 8), 9);
    expect(e.widthInches).toBeGreaterThan(72);
  });

  it("takes a span of an edge when an endplate is narrower than the board", () => {
    const e = endplateEdgePose(rect, { index: 0, fromT: 0.25, toT: 0.75 })!;
    expect(e.widthInches).toBe(12);
    expect(e.y).toBe(0);
    expect(e.face).toEqual([{ x: 0, y: -6 }, { x: 0, y: 6 }]);
  });

  // ⚠️ Free-moN §2.0: the track crossing an endplate must be perpendicular,
  // straight and level for 4". A curved fascia is not somewhere an endplate can
  // be — that is the standard, not a missing feature.
  it("refuses a curved edge rather than drawing a face that cannot exist", () => {
    const bulged = [
      { x: 0, y: -12, bulge: 0.4 }, { x: 0, y: 12 }, { x: 96, y: 12 }, { x: 96, y: -12 },
    ];
    expect(endplateEdgePose(bulged, { index: 0 })).toBeNull();
  });

  it("returns null rather than guessing when the edge isn't there", () => {
    expect(endplateEdgePose(rect, { index: 9 })).toBeNull();
    expect(endplateEdgePose(rect, { index: -1 })).toBeNull();
    expect(endplateEdgePose([{ x: 0, y: 0 }, { x: 1, y: 1 }], { index: 0 })).toBeNull();
    expect(endplateEdgePose(null, { index: 0 })).toBeNull();
  });

  // ⭐ The bug from FMN-0077: a junction endplate derived onto the module CENTRE
  // LINE instead of the fascia. Bound to an edge, the centre line is not a place
  // an endplate can be.
  it("a bound endplate cannot land on the centre line", () => {
    const poses = deriveEndplatePoses({
      lengthInches: 96,
      outline: rect,
      endplateEdges: { C: { index: 1 } }, // the north fascia
      branches: [{ id: "C", atPos: 48, side: "up" }],
    });
    const c = poses.find((p) => p.id === "C")!;
    expect(c.boundToEdge).toBe(true);
    expect(c.y).toBe(12); // ON the fascia
    expect(c.y).not.toBe(0); // not the centre line
    expect(c.heading).toBe(90);
    // ⛔ SUPERSEDES "a spanless binding takes the whole edge" (was 96). Will,
    // 2026-08-01, modulerepo#275: "The Endplate can be the same or smaller size
    // than the edge." A plate with no authored span keeps its OWN width — this
    // is FMN-0068's endplate C, drawn as its whole 96in fascia until now.
    expect(c.widthInches).toBeCloseTo(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES);
    expect(c.widthInches).toBeLessThan(96);
  });

  // ⚠️ A binding is NOT a manual pose. Treating a derived pose as manual is what
  // pinned plates so they stopped following the module (#182) — the only reason
  // `poseAuthored` had to be invented.
  it("is not 'manual' — it follows the board instead of pinning to a point", () => {
    const poses = deriveEndplatePoses({
      lengthInches: 96, outline: rect, endplateEdges: { A: { index: 0 } },
    });
    const a = poses.find((p) => p.id === "A")!;
    expect(a.boundToEdge).toBe(true);
    expect(a.manual).toBeFalsy();
    // Reshape the board; the endplate moves with it, with no edit to the plate.
    const wider = [
      { x: 0, y: -18 }, { x: 0, y: 18 }, { x: 96, y: 18 }, { x: 96, y: -18 },
    ];
    const moved = deriveEndplatePoses({
      lengthInches: 96,
      outline: wider,
      endplateEdges: { A: { index: 0 } },
      // Authored, so the plate's width is the owner's and the reshaped board
      // does not change it — only where the plate SITS follows the board.
      endplateWidths: { A: 36 },
    }).find((p) => p.id === "A")!;
    expect(moved.widthInches).toBe(36);
    expect(moved.x).toBe(0);
    // ⛔ SUPERSEDES "the plate takes whatever the edge became" (#275): with no
    // authored width it keeps its own, rather than growing with the fascia.
    const unauthored = deriveEndplatePoses({
      lengthInches: 96, outline: wider, endplateEdges: { A: { index: 0 } },
    }).find((p) => p.id === "A")!;
    expect(unauthored.widthInches).toBeCloseTo(FREEMO_ENDPLATE_WIDTH_RECOMMENDED_INCHES);
  });

  // ⚠️ A field the round-trip drops is INVISIBLE — the exact trap that made a
  // whole feature inert earlier today. Prove it survives doc -> state -> doc.
  it("survives the document round-trip", () => {
    const doc: any = {
      module: "RT", version: 1, lengthInches: 96,
      tracks: [{ id: "main", role: "main", lane: 0 }],
      turnouts: [],
      endplates: [
        { id: "A", label: "West", edge: { index: 0 }, tracks: [{ trackId: "main", lane: 0, config: "single" }] },
        { id: "B", label: "East", edge: { index: 2, fromT: 0.25, toT: 0.75 }, tracks: [{ trackId: "main", lane: 0, config: "single" }] },
      ],
      outline: rect,
    };
    const st = docToState(doc, 96, []);
    expect(st.endplateEdges).toEqual({
      A: { index: 0 },
      B: { index: 2, fromT: 0.25, toT: 0.75 },
    });
    const back: any = stateToDoc(st, "RT");
    expect(back.endplates.find((e: any) => e.id === "A").edge).toEqual({ index: 0 });
    expect(back.endplates.find((e: any) => e.id === "B").edge).toEqual({
      index: 2, fromT: 0.25, toT: 0.75,
    });
  });

  it("falls back rather than drawing a lie when the binding no longer resolves", () => {
    const poses = deriveEndplatePoses({
      lengthInches: 96, outline: rect, endplateEdges: { A: { index: 42 } },
    });
    const a = poses.find((p) => p.id === "A")!;
    expect(a.boundToEdge).toBeFalsy();
    expect(a.x).toBe(0); // the ordinary derivation still ran
  });
});

// ─── The track graph (ADR 0001) ──────────────────────────────────────────────
// The spike proved a graph can carry the dispatcher view. This is that model in
// the package, against REAL library parts rather than hand-made fixtures.
describe("track graph", () => {
  // The Atlas #7 is measured, so it can be placed: body 6.00", lead 3.59375".
  const SW = "atlas-c55-n-7";
  const FLEX = "atlas-c55-n-flex";
  const g7 = () => partGeometry(trackPart(SW)!)!;
  const bodyOf = () => {
    const j = g7().joints;
    return j.find((x) => x.id === "through")!.x - j.find((x) => x.id === "throat")!.x;
  };
  const FROG = trackPart(SW)!.frogOffset!.inches;

  const flex = (id: string, x: number, y: number, len: number, rot = 0): TrackPiece => ({
    id, partId: FLEX, x, y, rotationDeg: rot, lengthInches: len,
  });
  const sw = (id: string, x: number, y: number, rot = 0, flipped = false): TrackPiece => ({
    id, partId: SW, x, y, rotationDeg: rot, flipped,
  });

  it("connects two joints that are in the same place, and nothing else", () => {
    const pieces = [flex("a", 0, 0, 10), flex("b", 10, 0, 10), flex("far", 40, 0, 10)];
    const graph = buildTrackGraph(pieces);
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0]).toEqual({ a: "a.b", b: "b.a" });
    // Everything else is an OPEN end — an unfinished layout, said out loud
    // rather than drawn as though it were joined.
    expect(graph.open.sort()).toEqual(["a.a", "b.b", "far.a", "far.b"]);
    expect(graph.conflicts).toEqual([]);
  });

  // ⭐⭐ THE GAP THE SPIKE FOUND. Three ends stacked on a point made the walk
  // silently pick one pair and drop the third piece out of the layout — the
  // same failure that broke the spike's own first fixture. Refusing is the only
  // honest answer: the model cannot know which two were meant.
  it("REFUSES three track ends in one place instead of picking two", () => {
    const pieces = [flex("a", 0, 0, 10), flex("b", 10, 0, 10), flex("c", 10, 0, 7)];
    const graph = buildTrackGraph(pieces);
    expect(graph.conflicts).toHaveLength(1);
    expect(graph.conflicts[0].joints.sort()).toEqual(["a.b", "b.a", "c.a"]);
    expect(graph.conflicts[0].reason).toMatch(/three is a turnout, not a joint/);
    // NONE of them are joined — not two of the three.
    expect(graph.connections).toEqual([]);
    for (const k of ["a.b", "b.a", "c.a"]) expect(graph.open).toContain(k);
  });

  it("says which pieces cannot be placed at all, and why", () => {
    const graph = buildTrackGraph([
      flex("a", 0, 0, 10),
      { id: "ft", partId: "fast-tracks-n-me55-t-6", x: 0, y: 0, rotationDeg: 0 },
      { id: "ft8", partId: "fast-tracks-n-me55-t-8", x: 0, y: 0, rotationDeg: 0 },
      { id: "ghost", partId: "no-such-part", x: 0, y: 0, rotationDeg: 0 },
    ]);
    expect(graph.unplaceable.map((u) => u.piece).sort()).toEqual(["ft", "ft8", "ghost"]);
    // Each part names the reading IT is missing — the #6 was measured at its
    // points (2026-07-31), so its gap is the frog; the #8 still has neither.
    expect(graph.unplaceable.find((u) => u.piece === "ft")!.why).toMatch(/frog offset/);
    expect(graph.unplaceable.find((u) => u.piece === "ft8")!.why).toMatch(/points offset/);
    expect(graph.unplaceable.find((u) => u.piece === "ghost")!.why).toMatch(/no such part/);
  });

  // A passing siding, the commonest module shape there is: two turnouts facing
  // each other with a track between them.
  const siding = (west: number, east: number) => {
    const B = bodyOf();
    const pieces: TrackPiece[] = [
      flex("f0", 0, 0, west - FROG),
      sw("swW", west - FROG, 0),
      flex("f1", west - FROG + B, 0, (east + FROG - B) - (west - FROG + B)),
      sw("swE", east + FROG, 0, 180, true),
      flex("f2", east + FROG, 0, 96 - (east + FROG)),
    ];
    const jw = placedJoints(pieces).find((j) => j.key === "swW.diverge")!;
    const je = placedJoints(pieces).find((j) => j.key === "swE.diverge")!;
    pieces.push({
      id: "sid", partId: FLEX, x: jw.x, y: jw.y, rotationDeg: 0,
      lengthInches: Math.hypot(je.x - jw.x, je.y - jw.y),
    });
    return pieces;
  };

  it("reads a passing siding off the geometry — extent, and both turnouts", () => {
    const pieces = siding(13, 73);
    const graph = buildTrackGraph(pieces);
    expect(graph.conflicts).toEqual([]);
    const w = walkTrackGraph(graph, pieces, { piece: "f0", joint: "a" });
    expect(w.turnouts.map((t) => Math.round(t.pos * 100) / 100).sort((a, b) => a - b)).toEqual([13, 73]);
    const sid = w.routes.find((r) => r.id !== "main")!;
    expect(Math.round(sid.fromPos * 100) / 100).toBe(13);
    // It runs back into the far switch — which is what makes it a siding.
    expect(sid.endsAt).toBe("swE");
    expect(Math.round(sid.toPos * 100) / 100).toBe(73);
    expect(w.warnings).toEqual([]);
  });

  // ⚠️ A SIDING IS FOUND TWICE — once from each of its turnouts, since both
  // queue a diverging branch and the second walks the same rail back the other
  // way. It is ONE track, and both switches diverge onto it. Emitting the doc is
  // what exposed this: the siding appeared twice, on two lanes, with the far
  // turnout pointing at the copy.
  it("finds a siding ONCE, and both its turnouts diverge onto it", () => {
    const pieces = siding(13, 73);
    const w = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "f0", joint: "a" });
    const branches = w.routes.filter((r) => r.id !== "main");
    expect(branches).toHaveLength(1);
    expect(branches[0].pieces).toEqual(["sid"]);
    expect(new Set(w.turnouts.map((t) => t.divergeRoute))).toEqual(new Set([branches[0].id]));
  });

  // ⭐ NO HAND ANYWHERE. A real document calls one of these "left" and the other
  // "right" for the SAME siding; the graph never asks. The side is where the
  // piece is.
  it("takes the side from where the piece IS, never from a hand", () => {
    const above = walkTrackGraph(buildTrackGraph(siding(13, 73)), siding(13, 73), { piece: "f0", joint: "a" });
    const flipAll = siding(13, 73).map((p) =>
      p.partId === SW ? { ...p, flipped: !p.flipped } : p.id === "sid" ? { ...p, y: -p.y } : p);
    const below = walkTrackGraph(buildTrackGraph(flipAll), flipAll, { piece: "f0", joint: "a" });
    const a = above.routes.find((r) => r.id !== "main")!;
    const b = below.routes.find((r) => r.id !== "main")!;
    expect(Math.sign(a.lateral)).toBe(1);
    expect(Math.sign(b.lateral)).toBe(-1);
    // …and the positions are identical either way. Only the side moved.
    expect(Math.round(a.fromPos * 100)).toBe(Math.round(b.fromPos * 100));
  });

  it("re-reads every position when a turnout moves — nothing to reconcile", () => {
    for (const [w, e] of [[13, 73], [20, 60], [8, 90]] as [number, number][]) {
      const pieces = siding(w, e);
      const walk = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "f0", joint: "a" });
      const got = walk.turnouts.map((t) => Math.round(t.pos * 100) / 100).sort((x, y) => x - y);
      expect(got, `${w}/${e}`).toEqual([w, e]);
    }
  });

  // ⭐ THE CASE THE 1-D MODEL CAN ONLY APPROXIMATE. A yard ladder is turnouts on
  // spurs on spurs; the walk just keeps walking, so depth costs nothing.
  it("resolves a nested yard ladder, three deep", () => {
    const B = bodyOf();
    const PITCH = 8; // comfortably above what an Atlas #7 allows
    const pieces: TrackPiece[] = [flex("m0", 0, 0, 8 - FROG), sw("s1", 8 - FROG, 0, 0, true)];
    let prev = "s1";
    for (let r = 2; r <= 3; r++) {
      const d = placedJoints(pieces).find((j) => j.key === `${prev}.diverge`)!;
      const th = placedJoints(pieces).find((j) => j.key === `${prev}.throat`)!;
      const fx = th.x + ((d.x - th.x) * FROG) / B;
      const fy = th.y + ((d.y - th.y) * FROG) / B;
      const skew = Math.hypot(d.x - fx, d.y - fy);
      // ⭐ A LADDER HAS A MINIMUM PITCH, and the graph knows it: the frogs
      // cannot be closer than the diverging rail out of one plus the lead into
      // the next. For a measured Atlas #7 that is ~6.01", so ELM Yard's 5" — a
      // real document's numbers — is NOT buildable from #7s. The 1-D model
      // cannot notice that; this one can only express what fits.
      const minPitch = skew + FROG;
      expect(minPitch, "an Atlas #7 ladder cannot be tighter than this").toBeGreaterThan(5);
      const run = PITCH - skew - FROG;
      pieces.push({ id: `x${r}`, partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: run });
      pieces.push(sw(`s${r}`, d.x + run, d.y, 0, true));
      prev = `s${r}`;
    }
    const graph = buildTrackGraph(pieces);
    expect(graph.conflicts).toEqual([]);
    const w = walkTrackGraph(graph, pieces, { piece: "m0", joint: "a" });
    expect(w.turnouts.map((t) => Math.round(t.pos * 100) / 100).sort((a, b) => a - b)).toEqual([8, 16, 24]);
    // Each turnout sits on a DIFFERENT route — that is what a ladder is.
    expect(new Set(w.turnouts.map((t) => t.onRoute)).size).toBe(3);
  });

  // ⚠️ Positions are arc length along the RAIL. On a curve the difference is
  // inches, and it is the rail a train travels.
  it("measures a curve along the rail, not across the chord", () => {
    const R = 30, segs = 24, sweep = Math.PI / 2;
    const step = (R * sweep) / segs;
    const pieces: TrackPiece[] = [];
    let x = 0, y = 0, h = 0;
    for (let i = 0; i < segs; i++) {
      pieces.push(flex(`c${i}`, x, y, step, (h * 180) / Math.PI));
      x += step * Math.cos(h);
      y += step * Math.sin(h);
      h += sweep / segs;
    }
    const w = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "c0", joint: "a" });
    const arc = step * segs;
    expect(w.routes[0].toPos).toBeCloseTo(arc, 6);
    expect(arc - Math.hypot(x, y)).toBeGreaterThan(4); // the chord loses inches
    // …and the same module laid at an angle measures identically.
    const spun = pieces.map((p) => {
      const t = 37 * (Math.PI / 180);
      return { ...p, x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t), rotationDeg: p.rotationDeg + 37 };
    });
    const w2 = walkTrackGraph(buildTrackGraph(spun), spun, { piece: "c0", joint: "a" });
    expect(w2.routes[0].toPos).toBeCloseTo(w.routes[0].toPos, 9);
  });

  it("reports a piece nothing connects, instead of leaving it out silently", () => {
    const pieces = [flex("m", 0, 0, 20), flex("orphan", 50, 9, 10)];
    const w = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "m", joint: "a" });
    expect(w.warnings.some((s) => /orphan is not reachable/.test(s))).toBe(true);
  });

  it("terminates on a loop rather than walking forever", () => {
    // A ring of flex: every joint meets another, so the walk must be guarded.
    const n = 12, R = 10;
    const pieces: TrackPiece[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const b = ((i + 1) / n) * 2 * Math.PI;
      const p0 = { x: R * Math.cos(a), y: R * Math.sin(a) };
      const p1 = { x: R * Math.cos(b), y: R * Math.sin(b) };
      pieces.push(flex(`r${i}`, p0.x, p0.y, Math.hypot(p1.x - p0.x, p1.y - p0.y),
        (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI));
    }
    const w = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "r0", joint: "a" });
    expect(w.routes[0].pieces.length).toBeLessThanOrEqual(n);
    expect(w.routes[0].toPos).toBeGreaterThan(0);
  });
});

// ─── Graph → document (ADR 0001) ─────────────────────────────────────────────
// ⭐⭐ THE CLAIM THE WHOLE DECISION RESTS ON: the document becomes a DERIVED
// artifact, so `moduleFeatures` — and therefore Free-Dispatcher — is unaffected.
// The spike showed it on one real module; these show it in the package, against
// a hand-authored 1-D document of the same layout.
describe("graph → document", () => {
  const SW = "atlas-c55-n-7";
  const FLEX = "atlas-c55-n-flex";
  const FROG = trackPart(SW)!.frogOffset!.inches;
  const BODY = (() => {
    const j = partGeometry(trackPart(SW)!)!.joints;
    return j.find((x) => x.id === "through")!.x - j.find((x) => x.id === "throat")!.x;
  })();

  const flex = (id: string, x: number, y: number, len: number, rot = 0): TrackPiece => ({
    id, partId: FLEX, x, y, rotationDeg: rot, lengthInches: len,
  });
  const sw = (id: string, x: number, y: number, rot = 0, flipped = false): TrackPiece => ({
    id, partId: SW, x, y, rotationDeg: rot, flipped,
  });

  /** A passing siding on a 96″ main — the commonest module there is. */
  const siding = (west: number, east: number, below = false) => {
    const pieces: TrackPiece[] = [
      flex("f0", 0, 0, west - FROG),
      sw("swW", west - FROG, 0, 0, below),
      flex("f1", west - FROG + BODY, 0, (east + FROG - BODY) - (west - FROG + BODY)),
      sw("swE", east + FROG, 0, 180, !below),
      flex("f2", east + FROG, 0, 96 - (east + FROG)),
    ];
    const jw = placedJoints(pieces).find((j) => j.key === "swW.diverge")!;
    const je = placedJoints(pieces).find((j) => j.key === "swE.diverge")!;
    pieces.push({
      id: "sid", partId: FLEX, x: jw.x, y: jw.y, rotationDeg: 0,
      lengthInches: Math.hypot(je.x - jw.x, je.y - jw.y),
    });
    return pieces;
  };

  const emit = (pieces: TrackPiece[], input: Partial<Parameters<typeof graphToDoc>[1]> = {}) =>
    graphToDoc(pieces, { startAt: { piece: "f0", joint: "a" }, ...input });

  it("emits the ordinary document — length, tracks, turnouts", () => {
    const { doc, warnings } = emit(siding(13, 73));
    expect(warnings).toEqual([]);
    expect(doc.lengthInches).toBe(96);
    expect(doc.tracks).toEqual([
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "sid", role: "siding", lane: 1, fromPos: 13, toPos: 73 },
    ]);
    expect(doc.turnouts).toEqual([
      { id: "swW", pos: 13, onTrack: "main", divergeTrack: "sid", size: 7, partId: SW },
      { id: "swE", pos: 73, onTrack: "main", divergeTrack: "sid", size: 7, partId: SW },
    ]);
  });

  // ⭐⭐ THE PROOF. Same layout, authored both ways; the dispatcher view cannot
  // tell them apart. FD reads `moduleFeatures`, so FD is unaffected.
  it("gives moduleFeatures the SAME drawing as the hand-authored 1-D document", () => {
    const authored: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "sid", role: "siding", lane: 1, fromPos: 13, toPos: 73 },
      ],
      turnouts: [
        { id: "swW", pos: 13, onTrack: "main", divergeTrack: "sid", kind: "left" },
        { id: "swE", pos: 73, onTrack: "main", divergeTrack: "sid", kind: "right" },
      ],
    };
    const a = moduleFeatures(authored);
    const b = moduleFeatures(emit(siding(13, 73)).doc);
    expect(b.extraTracks).toEqual(a.extraTracks);
    expect(b.turnouts).toEqual(a.turnouts);
    expect(b.lengthInches).toBe(a.lengthInches);
  });

  // ⭐ NO HAND IS EMITTED, and it doesn't need one. The 1-D document needs the
  // author to say "left" here and "right" there for ONE siding; the graph reads
  // the side off where the pieces are, and `resolveLane` keeps the lane it is
  // handed because no hand contradicts it.
  it("puts a siding below the main with no hand anywhere", () => {
    const { doc } = emit(siding(13, 73, true));
    expect(doc.turnouts!.every((t) => t.kind === undefined)).toBe(true);
    expect(doc.tracks.find((t) => t.id === "sid")!.lane).toBe(-1);
    expect(moduleFeatures(doc).extraTracks[0].lane).toBe(-1);
    // …and the positions are the same as the above-the-main version. Only the
    // side moved.
    const above = emit(siding(13, 73)).doc;
    expect(doc.turnouts!.map((t) => t.pos)).toEqual(above.turnouts!.map((t) => t.pos));
  });

  // ⭐ THE CASE THE 1-D MODEL DOCUMENTS AS "APPROXIMATE": each rung of a ladder
  // sits on the PREVIOUS rung, not on the main, and the emitted `onTrack` says
  // so — which is exactly what the dispatcher view needs to stack them outward.
  it("names each ladder rung's real host track, and stacks the lanes outward", () => {
    const PITCH = 8;
    const pieces: TrackPiece[] = [flex("f0", 0, 0, 8 - FROG), sw("s1", 8 - FROG, 0, 0, true)];
    let prev = "s1";
    for (let r = 2; r <= 3; r++) {
      const js = placedJoints(pieces);
      const d = js.find((j) => j.key === `${prev}.diverge`)!;
      const th = js.find((j) => j.key === `${prev}.throat`)!;
      const fx = th.x + ((d.x - th.x) * FROG) / BODY;
      const fy = th.y + ((d.y - th.y) * FROG) / BODY;
      const run = PITCH - Math.hypot(d.x - fx, d.y - fy) - FROG;
      pieces.push({ id: `x${r}`, partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: run });
      pieces.push(sw(`s${r}`, d.x + run, d.y, 0, true));
      prev = `s${r}`;
    }
    pieces.push({ id: "stub", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 12 });
    const js = placedJoints(pieces).find((j) => j.key === "s3.diverge")!;
    pieces[pieces.length - 1] = { ...pieces[pieces.length - 1], x: js.x, y: js.y };
    const { doc } = emit(pieces);
    const swById = new Map(doc.turnouts!.map((t) => [t.id, t]));
    expect(swById.get("s1")!.onTrack).toBe("main");
    expect(swById.get("s2")!.onTrack).toBe(swById.get("s1")!.divergeTrack);
    expect(swById.get("s3")!.onTrack).toBe(swById.get("s2")!.divergeTrack);
    // Each rung further from the main than the last.
    expect(doc.tracks.filter((t) => t.role !== "main").map((t) => t.lane)).toEqual([-1, -2, -3]);
  });

  // A stub that reaches nothing is an unfinished layout, and saying so beats
  // emitting a turnout pointing at a track that isn't in the document.
  it("leaves out a turnout whose diverging route goes nowhere, and says why", () => {
    const pieces = [flex("f0", 0, 0, 20 - FROG), sw("s1", 20 - FROG, 0), flex("f1", 20 - FROG + BODY, 0, 40)];
    const { doc, warnings } = emit(pieces);
    expect(doc.turnouts).toEqual([]);
    expect(warnings.join(" ")).toMatch(/s1 is placed but its diverging route goes nowhere/);
    // ⚠️ ONE PROBLEM, ONE SENTENCE. The walk says the same thing in its own
    // words; printed together they read as two separate faults.
    expect(warnings).toHaveLength(1);
  });

  // ⏸️ Industries and signals are CARRIED, not re-derived — where they live in a
  // graph is still an open question (ADR 0001 defers it to persistence), and
  // guessing would be inventing an owner's intent.
  it("carries through everything the graph does not know", () => {
    const base = {
      module: "FMN-0011",
      outline: [{ x: 0, y: -12 }, { x: 96, y: -12 }, { x: 96, y: 12 }, { x: 0, y: 12 }],
      industries: [{ id: "i1", name: "Feed Mill", track: "sid", fromPos: 20, toPos: 32 }],
      endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    };
    const { doc } = emit(siding(13, 73), { base });
    expect(doc.module).toBe("FMN-0011");
    expect(doc.industries).toEqual(base.industries);
    expect(doc.outline).toEqual(base.outline);
    // …but the graph still wins on what it reads.
    expect(doc.lengthInches).toBe(96);
    expect(moduleFeatures(doc).industries).toHaveLength(1);
  });
});

// ─── Anchored features (ADR 0001) ────────────────────────────────────────────
// Will's call, 2026-07-27: an industry holds onto THE PIECE IT SITS BESIDE, not
// a number about the whole module. `pos` is a fine way to read where something
// is and a poor way to hold it.
describe("features anchored to a piece", () => {
  const SW = "atlas-c55-n-7";
  const FLEX = "atlas-c55-n-flex";
  const FROG = trackPart(SW)!.frogOffset!.inches;

  /** A spur off the main at `at`, with a 30″ stub. */
  const spurAt = (at: number): TrackPiece[] => {
    const pieces: TrackPiece[] = [
      { id: "f0", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: at - FROG },
      { id: "s1", partId: SW, x: at - FROG, y: 0, rotationDeg: 0 },
    ];
    const d = placedJoints(pieces).find((j) => j.key === "s1.diverge")!;
    pieces.push({ id: "sp", partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: 30 });
    return pieces;
  };

  const mill = (anchor: GraphAnchor | null) => ({
    id: "i1",
    name: "Feed Mill",
    track: "sp",
    // Deliberately WRONG numbers, so anything that survives them is derived.
    fromPos: 0,
    toPos: 12,
    ...(anchor ? { anchor } : {}),
  });

  const emit = (pieces: TrackPiece[], industries: ReturnType<typeof mill>[]) =>
    graphToDoc(pieces, { startAt: { piece: "f0", joint: "a" }, base: { industries } });

  // ⭐⭐ THE POINT OF THE DECISION. Move the turnout and its spur six inches east
  // and the mill goes with them, because the mill is beside that rail. Nobody
  // re-typed anything: both runs pass the SAME authored numbers in.
  it("moves with its piece", () => {
    const near = emit(spurAt(20), [mill({ piece: "sp", atInches: 4 })]).doc.industries![0];
    const far = emit(spurAt(26), [mill({ piece: "sp", atInches: 4 })]).doc.industries![0];
    expect(far.fromPos - near.fromPos).toBeCloseTo(6, 6);
    expect(far.toPos - near.toPos).toBeCloseTo(6, 6);
    // The span keeps the length it was built to — a dock face is as long as it is.
    expect(near.toPos - near.fromPos).toBeCloseTo(12, 6);
    // …and it is on the spur, named as the graph names it.
    expect(near.track).toBe("sp");
  });

  it("measures from the piece's OWN end, whichever way the route crosses it", () => {
    const forward = spurAt(20);
    // The same 30″ of spur, laid the other way round: its origin end is now the
    // far one and the route enters by `b`.
    const d = placedJoints(forward).find((j) => j.key === "s1.diverge")!;
    const reversed = forward.map((p) =>
      p.id === "sp" ? { ...p, x: d.x + 30, rotationDeg: 180 } : p);
    const a = emit(forward, [mill({ piece: "sp", atInches: 4 })]).doc.industries![0];
    // A span begins at the anchor and runs along the PIECE, so the same 12″ of
    // rail — 4″ in from one end of a 30″ piece — begins 14″ in from the other.
    const b = emit(reversed, [mill({ piece: "sp", atInches: 30 - 4 - 12 })]).doc.industries![0];
    expect(b.fromPos).toBeCloseTo(a.fromPos, 6);
    expect(b.toPos).toBeCloseTo(a.toPos, 6);
  });

  // ❌ NOTHING MIGRATES. An industry with no anchor keeps the numbers its owner
  // typed, exactly — the whole ADR rests on old documents being left alone.
  it("leaves an unanchored industry exactly as authored", () => {
    const { doc, warnings } = emit(spurAt(20), [mill(null)]);
    expect(doc.industries![0].fromPos).toBe(0);
    expect(doc.industries![0].toPos).toBe(12);
    expect(warnings).toEqual([]);
  });

  it("says so when the anchored piece is on no route, and keeps what was typed", () => {
    const pieces = [...spurAt(20), { id: "loose", partId: FLEX, x: 0, y: 40, rotationDeg: 0, lengthInches: 10 }];
    const { doc, warnings } = emit(pieces, [mill({ piece: "loose", atInches: 2 })]);
    expect(doc.industries![0].fromPos).toBe(0);
    expect(warnings.join(" ")).toMatch(/anchored to loose, which is not on any route/);
  });

  it("places a signal the same way", () => {
    const pieces = spurAt(20);
    const { doc } = graphToDoc(pieces, {
      startAt: { piece: "f0", joint: "a" },
      base: { signals: [{ id: "sg1", pos: 0, anchor: { piece: "f0", atInches: 10 } }] },
    });
    expect(doc.signals![0].pos).toBe(10);
    expect(doc.signals![0].track).toBe("main");
  });
});

// An anchor must survive the editor. Dropping it on save would quietly convert
// an anchored industry back into a typed number — the silent migration ADR 0001
// forbids, arriving by the back door.
describe("an anchor round-trips through the editor state", () => {
  it("keeps the anchor on an industry and on a house-track spot", () => {
    const doc: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 48,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "sp", role: "spur", lane: 1, fromPos: 20, toPos: 40 },
      ],
      industries: [{
        id: "i1", name: "Feed Mill", track: "sp", fromPos: 24, toPos: 36,
        anchor: { piece: "p9", atInches: 4 },
        spots: [{ track: "main", fromPos: 10, toPos: 16, anchor: { piece: "p2", atInches: 1.5 } }],
      }],
    };
    const back = stateToDoc(docToState(doc, 48));
    expect(back.industries![0].anchor).toEqual({ piece: "p9", atInches: 4 });
    expect(back.industries![0].spots![0].anchor).toEqual({ piece: "p2", atInches: 1.5 });
  });
});

// ─── A document that carries its graph (ADR 0001) ────────────────────────────
describe("deriveGraphDoc", () => {
  const SW = "atlas-c55-n-7";
  const FLEX = "atlas-c55-n-flex";
  const FROG = trackPart(SW)!.frogOffset!.inches;

  const withSpur = (at: number): NonNullable<ModuleSchematicDoc["graph"]> => {
    const pieces: TrackPiece[] = [
      { id: "f0", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: at - FROG },
      { id: "s1", partId: SW, x: at - FROG, y: 0, rotationDeg: 0 },
    ];
    const d = placedJoints(pieces).find((j) => j.key === "s1.diverge")!;
    pieces.push({ id: "sp", partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: 30 });
    return { pieces, startAt: { piece: "f0", joint: "a" } };
  };

  // ❌ THE NO-MIGRATION RULE, in one line. A document with no graph comes back
  // as the very same object — not a copy, not a re-derivation.
  it("returns a document with no graph completely untouched", () => {
    const doc: ModuleSchematicDoc = {
      version: 1, lengthInches: 48, endplates: [{ id: "A" }, { id: "B" }],
      tracks: [{ id: "main", role: "main", lane: 0, from: "A", to: "B" }],
    };
    const out = deriveGraphDoc(doc);
    expect(out.doc).toBe(doc);
    expect(out.warnings).toEqual([]);
  });

  it("re-reads tracks and turnouts off the pieces", () => {
    const { doc } = deriveGraphDoc({
      version: 1, endplates: [{ id: "A" }, { id: "B" }], tracks: [], graph: withSpur(20),
    });
    expect(doc.tracks.map((t) => t.id)).toEqual(["main", "sp"]);
    expect(doc.turnouts![0]).toMatchObject({ id: "s1", onTrack: "main", divergeTrack: "sp" });
    expect(doc.turnouts![0].pos).toBeCloseTo(20, 6);
    // The graph stays on the document — it is the source, not a build artefact.
    expect(doc.graph!.pieces).toHaveLength(3);
  });

  // ⭐ Re-deriving must never cost an owner the name they gave a siding.
  it("carries the owner's name, capacity and module_tracks link across", () => {
    const { doc } = deriveGraphDoc({
      version: 1,
      endplates: [{ id: "A" }, { id: "B" }],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "sp", role: "spur", lane: 1, fromPos: 99, toPos: 99, trackName: "Mill Spur", capacityFeet: 210, moduleTrackId: 44 },
      ],
      graph: withSpur(20),
    });
    const sp = doc.tracks.find((t) => t.id === "sp")!;
    expect(sp.trackName).toBe("Mill Spur");
    expect(sp.capacityFeet).toBe(210);
    expect(sp.moduleTrackId).toBe(44);
    // …while the POSITIONS are the graph's, not the stale ones.
    expect(sp.fromPos).toBeCloseTo(20, 6);
  });

  it("round-trips the graph through the editor state without touching it", () => {
    const graph = withSpur(20);
    const back = stateToDoc(docToState(
      { version: 1, lengthInches: 48, endplates: [{ id: "A" }, { id: "B" }], tracks: [], graph },
      48,
    ));
    expect(back.graph).toEqual(graph);
  });

  // ⚠️ A piece is placed in real inches on the board. Stretching the module's
  // length must not drag it — and with a graph the length is derived from the
  // pieces anyway.
  it("does not scale pieces when the module's length changes", () => {
    const graph = withSpur(20);
    const state = docToState(
      { version: 1, lengthInches: 48, endplates: [{ id: "A" }, { id: "B" }], tracks: [], graph },
      96,
    );
    expect(state.graph!.pieces.find((p) => p.id === "sp")!.lengthInches).toBe(30);
  });
});

// ─── The shape of a route through a piece ────────────────────────────────────
describe("pieceRoutePaths", () => {
  const SW = "atlas-c55-n-7";
  const FLEX = "atlas-c55-n-flex";

  it("draws flex as one straight run of the length it was cut to", () => {
    const [r] = pieceRoutePaths({ id: "f", partId: FLEX, x: 2, y: 3, rotationDeg: 0, lengthInches: 18 });
    expect(r.points).toEqual([{ x: 2, y: 3 }, { x: 20, y: 3 }]);
  });

  // ⭐ The point of putting this in the package: a diverging route is a CURVE.
  // Drawn as a straight chord it cuts the corner the closure actually turns,
  // and every renderer would have to rebuild that curve for itself.
  it("follows the closure on a diverging route instead of cutting the chord", () => {
    const piece: TrackPiece = { id: "s", partId: SW, x: 0, y: 0, rotationDeg: 0 };
    const paths = pieceRoutePaths(piece);
    const div = paths.find((p) => p.route.includes("diverge"))!;
    const joints = placedJoints([piece]);
    const throat = joints.find((j) => j.joint === "throat")!;
    const end = joints.find((j) => j.joint === "diverge")!;
    // Ends exactly on its own joints — a gap here would be a gap at a
    // connection the graph considers made.
    expect(div.points[0]).toEqual({ x: throat.x, y: throat.y });
    expect(div.points[div.points.length - 1]).toEqual({ x: end.x, y: end.y });
    // …and it is not the chord: halfway along, it is still short of it.
    const mid = div.points[Math.floor(div.points.length / 2)];
    const chordY = throat.y + ((end.y - throat.y) * (mid.x - throat.x)) / (end.x - throat.x);
    expect(mid.y).toBeLessThan(chordY);
  });

  it("goes where the piece goes", () => {
    const piece: TrackPiece = { id: "s", partId: SW, x: 10, y: -4, rotationDeg: 37, flipped: true };
    const joints = placedJoints([piece]);
    for (const { route, points } of pieceRoutePaths(piece)) {
      const a = joints.find((j) => j.joint === route[0])!;
      const b = joints.find((j) => j.joint === route[1])!;
      expect(Math.hypot(points[0].x - a.x, points[0].y - a.y)).toBeLessThan(1e-9);
      const last = points[points.length - 1];
      expect(Math.hypot(last.x - b.x, last.y - b.y)).toBeLessThan(1e-9);
    }
  });
});

// ─── Snapping a piece into place ─────────────────────────────────────────────
describe("snapPiece", () => {
  const SW = "atlas-c55-n-7";
  const FLEX = "atlas-c55-n-flex";

  it("brings a loose end onto an open joint, turning the piece to meet it", () => {
    const main: TrackPiece = { id: "f0", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 20 };
    const sw: TrackPiece = { id: "s1", partId: SW, x: 20, y: 0, rotationDeg: 0 };
    const target = placedJoints([main, sw]).find((j) => j.key === "s1.diverge")!;
    // Dropped near the diverging end, at a careless angle.
    const loose: TrackPiece = {
      id: "sp", partId: FLEX, x: target.x + 0.3, y: target.y - 0.2, rotationDeg: 61, lengthInches: 24,
    };
    const snap = snapPiece(loose, [main, sw]);
    expect(snap).not.toBeNull();
    expect(snap!.to).toBe("s1.diverge");
    // It is now genuinely connected — by the graph's own rule, not by looking close.
    const graph = buildTrackGraph([main, sw, snap!.piece]);
    expect(graph.connections.some((c) => [c.a, c.b].includes("s1.diverge"))).toBe(true);
    expect(graph.conflicts).toEqual([]);
    // The rotation came from the joint, not from the owner: the piece now leaves
    // along the diverging rail.
    expect(snap!.piece.rotationDeg).toBeCloseTo(target.headingDeg, 6);
  });

  // ⛔ THE ADR'S STANDING RULE, enforced where it can still be obeyed. Offering
  // an occupied joint would let an owner stack a third rail end there — and
  // then the graph refuses all three, putting a piece outside the layout until
  // they notice.
  it("never offers a joint that already holds a connection", () => {
    const a: TrackPiece = { id: "a", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 10 };
    const b: TrackPiece = { id: "b", partId: FLEX, x: 10, y: 0, rotationDeg: 0, lengthInches: 10 };
    // Short, so its OTHER end is nowhere near anything — the occupied junction
    // is the only thing in reach, and it is not on offer.
    const third: TrackPiece = { id: "c", partId: FLEX, x: 10.05, y: 0.05, rotationDeg: 0, lengthInches: 4 };
    expect(snapPiece(third, [a, b])).toBeNull();
    // The free ends are still offered, so it can join the other end of the run.
    const atEnd: TrackPiece = { id: "c", partId: FLEX, x: 20.1, y: 0.1, rotationDeg: 0, lengthInches: 10 };
    expect(snapPiece(atEnd, [a, b])!.to).toBe("b.b");
  });

  it("leaves a piece alone when nothing is near", () => {
    const a: TrackPiece = { id: "a", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 10 };
    const far: TrackPiece = { id: "z", partId: FLEX, x: 40, y: 30, rotationDeg: 0, lengthInches: 10 };
    expect(snapPiece(far, [a])).toBeNull();
  });
});

// ─── Bent flex (ADR 0001) ────────────────────────────────────────────────────
// A curve is a length of flex bent to a radius. The rail is genuinely longer
// than the chord it spans, and `pos` means the rail.
describe("a bent run of flex", () => {
  const FLEX = "atlas-c55-n-flex";
  const SW = "atlas-c55-n-7";
  /** A quarter circle at R30: 47.12″ of rail across a 42.43″ chord. */
  const QUARTER = (Math.PI / 2) * 30;

  it("puts its far end on the arc, pointing along it", () => {
    const piece: TrackPiece = {
      id: "c1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: QUARTER, radiusInches: 30,
    };
    const b = placedJoints([piece]).find((j) => j.joint === "b")!;
    expect(b.x).toBeCloseTo(30, 6);
    expect(b.y).toBeCloseTo(30, 6);
    // ⚠️ AND IT POINTS SOMEWHERE ELSE. A far end still claiming to face +x
    // would take the next piece snapped to it in across the rail.
    expect(b.headingDeg).toBeCloseTo(90, 6);
  });

  it("bends the other way for a negative radius", () => {
    const piece: TrackPiece = {
      id: "c1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: QUARTER, radiusInches: -30,
    };
    const b = placedJoints([piece]).find((j) => j.joint === "b")!;
    expect(b.x).toBeCloseTo(30, 6);
    expect(b.y).toBeCloseTo(-30, 6);
    expect(b.headingDeg).toBeCloseTo(270, 6);
  });

  it("draws as an arc that ends on its own joint", () => {
    const piece: TrackPiece = {
      id: "c1", partId: FLEX, x: 5, y: 2, rotationDeg: 20, lengthInches: QUARTER, radiusInches: 30,
    };
    const [{ points }] = pieceRoutePaths(piece);
    expect(points.length).toBeGreaterThan(4); // sampled, not a chord
    const b = placedJoints([piece]).find((j) => j.joint === "b")!;
    const last = points[points.length - 1];
    expect(Math.hypot(last.x - b.x, last.y - b.y)).toBeLessThan(1e-9);
    // The middle of it stands well off the chord.
    const mid = points[Math.floor(points.length / 2)];
    const t = 0.5;
    const chord = { x: points[0].x + (b.x - points[0].x) * t, y: points[0].y + (b.y - points[0].y) * t };
    expect(Math.hypot(mid.x - chord.x, mid.y - chord.y)).toBeGreaterThan(3);
  });

  // ⭐⭐ THE INVARIANT THE WHOLE MODEL RESTS ON. Measuring the chord here would
  // put everything past the curve 4.7″ closer to endplate A than it is.
  it("measures the RAIL, not the chord across it", () => {
    const pieces: TrackPiece[] = [
      { id: "c1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: QUARTER, radiusInches: 30 },
    ];
    const end = placedJoints(pieces).find((j) => j.joint === "b")!;
    pieces.push({
      id: "f2", partId: FLEX, x: end.x, y: end.y, rotationDeg: end.headingDeg, lengthInches: 10,
    });
    const w = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "c1", joint: "a" });
    expect(w.routes[0].toPos).toBeCloseTo(QUARTER + 10, 6);
    expect(QUARTER).toBeGreaterThan(Math.hypot(30, 30) + 4.5); // 47.12 vs 42.43
  });

  it("puts a turnout past a curve at its real distance along the rail", () => {
    const pieces: TrackPiece[] = [
      { id: "c1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: QUARTER, radiusInches: 30 },
    ];
    const end = placedJoints(pieces).find((j) => j.joint === "b")!;
    pieces.push({ id: "s1", partId: SW, x: end.x, y: end.y, rotationDeg: end.headingDeg });
    const w = walkTrackGraph(buildTrackGraph(pieces), pieces, { piece: "c1", joint: "a" });
    // ⭐ Reported at its FROG —  from the tie end, not ,
    // which is measured points→frog and lands on no landmark from the throat.
    const frog = trackPart(SW)!.frogOffset!.inches;
    expect(w.turnouts[0].pos).toBeCloseTo(QUARTER + frog, 6);
  });

  // The snap reads the joint's heading, so a piece brought onto the end of a
  // curve leaves ALONG the curve — no angle typed, on a bend as on a turnout.
  it("takes a snapped piece away along the curve", () => {
    const curve: TrackPiece = {
      id: "c1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: QUARTER, radiusInches: 30,
    };
    const loose: TrackPiece = {
      id: "f2", partId: FLEX, x: 30.2, y: 29.8, rotationDeg: 0, lengthInches: 12,
    };
    const snap = snapPiece(loose, [curve]);
    expect(snap!.to).toBe("c1.b");
    expect(snap!.piece.rotationDeg).toBeCloseTo(90, 6);
  });
});

// ─── Two mains (ADR 0001) ────────────────────────────────────────────────────
// A double-track module's mains are two separate runs — nothing joins them,
// because what would is a crossover and no crossover can be placed yet. So Main
// 2 is its own walk, from its own end of the endplate.
describe("a double-track module", () => {
  const FLEX = "atlas-c55-n-flex";
  const SW = "atlas-c55-n-7";
  const FROG = trackPart(SW)!.frogOffset!.inches;
  const SPACING = FREEMO_TRACK_SPACING_INCHES;

  /** Two parallel runs a track-spacing apart, Main 2 above. */
  const doubleTrack = (): TrackPiece[] => [
    { id: "m1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 96 },
    { id: "m2", partId: FLEX, x: 0, y: SPACING, rotationDeg: 0, lengthInches: 96 },
  ];
  const emit = (pieces: TrackPiece[], start2: { piece: string; joint: string } | null = { piece: "m2", joint: "a" }) =>
    graphToDoc(pieces, { startAt: { piece: "m1", joint: "a" }, start2 });

  it("emits both mains, each running the module", () => {
    const { doc, warnings } = emit(doubleTrack());
    expect(doc.tracks.map((t) => [t.id, t.role, t.lane])).toEqual([
      ["main", "main", 0],
      ["main2", "main", 1],
    ]);
    expect(doc.lengthInches).toBe(96);
    expect(warnings).toEqual([]);
  });

  // ⭐ WHICH SIDE MAIN 2 IS ON IS READ, NOT AUTHORED. The 1-D model carries a
  // `mainsSwapped` flag for this; here it is simply where the track is.
  it("puts Main 2 below when that is where it is, with no flag", () => {
    const below = doubleTrack().map((p) => (p.id === "m2" ? { ...p, y: -SPACING } : p));
    const { doc } = emit(below);
    expect(doc.tracks.find((t) => t.id === "main2")!.lane).toBe(-1);
    expect(doc.mainsSwapped).toBeUndefined(); // nothing had to be declared
  });

  it("leaves Main 2 out when the module is single track", () => {
    const { doc, warnings } = emit(doubleTrack(), null);
    expect(doc.tracks.map((t) => t.id)).toEqual(["main"]);
    // The second run is still there, and now genuinely unreached — nothing
    // starts on it — which is worth saying.
    expect(warnings.join(" ")).toMatch(/m2 is not reachable/);
  });

  // ⚠️ EACH WALK ONLY KNOWS WHAT IT GOT TO. Left alone, walk 1 calls Main 2
  // stray track and walk 2 says the same of Main 1, so an ordinary double-track
  // module reported BOTH its mains as unconnected.
  it("does not call either main unreachable just because the other walk found it", () => {
    const { warnings } = emit(doubleTrack());
    expect(warnings.filter((w) => w.includes("not reachable"))).toEqual([]);
  });

  // ⚠️ THE LANE COLLISION. Main 2 already occupies a lane on its own side, so a
  // siding above the main starts at 2 — ranking branches alone put it on lane 1
  // and the two drew on top of each other.
  it("stacks a siding on Main 2's side OUTSIDE Main 2", () => {
    const pieces = doubleTrack();
    // A turnout on Main 1 with a spur running up past Main 2.
    pieces[0] = { ...pieces[0], lengthInches: 20 - FROG };
    pieces.push({ id: "s1", partId: SW, x: 20 - FROG, y: 0, rotationDeg: 0 });
    const d = placedJoints(pieces).find((j) => j.key === "s1.diverge")!;
    pieces.push({ id: "sp", partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: 30 });
    const { doc } = emit(pieces);
    const spur = doc.tracks.find((t) => t.id === "sp")!;
    expect(doc.tracks.find((t) => t.id === "main2")!.lane).toBe(1);
    expect(spur.lane).toBe(2);
  });

  it("says so when both starts land on the same run", () => {
    const { warnings } = emit(doubleTrack(), { piece: "m1", joint: "b" });
    expect(warnings.join(" ")).toMatch(/they are one run, not two/);
  });

  // A turnout on Main 2 must say it is on Main 2 — the dispatcher view stacks a
  // ladder off its parent, so naming the wrong host puts the whole thing on the
  // wrong side of the module.
  it("names Main 2 as the host of a turnout laid on it", () => {
    const pieces = doubleTrack();
    pieces[1] = { ...pieces[1], lengthInches: 30 - FROG };
    pieces.push({ id: "s2", partId: SW, x: 30 - FROG, y: SPACING, rotationDeg: 0 });
    const d = placedJoints(pieces).find((j) => j.key === "s2.diverge")!;
    pieces.push({ id: "yd", partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: 24 });
    const { doc } = emit(pieces);
    expect(doc.turnouts![0].onTrack).toBe("main2");
    expect(doc.turnouts![0].divergeTrack).toBe("yd");
  });
});

// ─── Crossovers (ADR 0001) ───────────────────────────────────────────────────
// A single crossover needs no new part: it is a turnout on each main with a
// connector between them, which the graph can already hold. What it needs is to
// be RECOGNISED — as a crossover rather than a siding, and once rather than
// twice.
describe("a crossover between the two mains", () => {
  const FLEX = "atlas-c55-n-flex";
  const SW = "atlas-c55-n-7";
  const FROG = trackPart(SW)!.frogOffset!.inches;
  const SPACING = FREEMO_TRACK_SPACING_INCHES;

  /** Two mains with a turnout on each, joined by a connector. */
  const crossover = (): TrackPiece[] => {
    const pieces: TrackPiece[] = [
      { id: "m1a", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 30 - FROG },
      { id: "sw1", partId: SW, x: 30 - FROG, y: 0, rotationDeg: 0 },
      { id: "m2a", partId: FLEX, x: 0, y: SPACING, rotationDeg: 0, lengthInches: 30 - FROG },
      // The Main 2 turnout faces back the other way, so its diverging leg
      // reaches down toward Main 1's.
      { id: "sw2", partId: SW, x: 30 - FROG, y: SPACING, rotationDeg: 0, flipped: true },
    ];
    const a = placedJoints(pieces).find((j) => j.key === "sw1.diverge")!;
    const b = placedJoints(pieces).find((j) => j.key === "sw2.diverge")!;
    pieces.push({
      id: "xo",
      partId: FLEX,
      x: a.x,
      y: a.y,
      rotationDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      lengthInches: Math.hypot(b.x - a.x, b.y - a.y),
    });
    // Each main continues past its turnout.
    for (const [id, sw] of [["m1b", "sw1"], ["m2b", "sw2"]] as const) {
      const th = placedJoints(pieces).find((j) => j.key === `${sw}.through`)!;
      pieces.push({ id, partId: FLEX, x: th.x, y: th.y, rotationDeg: 0, lengthInches: 40 });
    }
    return pieces;
  };
  const emit = (pieces: TrackPiece[]) =>
    graphToDoc(pieces, {
      startAt: { piece: "m1a", joint: "a" },
      start2: { piece: "m2a", joint: "a" },
    });

  it("connects the two mains, and calls it a crossover", () => {
    const { doc, warnings } = emit(crossover());
    const xo = doc.tracks.find((t) => t.id === "xo")!;
    expect(xo.role).toBe("crossover");
    expect(warnings).toEqual([]);
  });

  // ⚠️ FOUND FROM BOTH MAINS. A siding is discovered twice, once from each of
  // its turnouts; a crossover is discovered twice from two different WALKS. Left
  // alone it would be two connectors in the document where the module has one.
  it("emits ONE connector, with both turnouts pointing at it", () => {
    const { doc } = emit(crossover());
    expect(doc.tracks.filter((t) => t.id === "xo")).toHaveLength(1);
    const ends = doc.turnouts!.filter((t) => t.divergeTrack === "xo");
    expect(ends).toHaveLength(2);
    expect(new Set(ends.map((t) => t.onTrack))).toEqual(new Set(["main", "main2"]));
  });

  // ⭐ AND THE DISPATCHER VIEW DRAWS IT AS ONE. `moduleFeatures` decides by the
  // same test — turnouts on two different lanes — so the document and the
  // drawing cannot disagree about what this is.
  it("reaches the operations view as a crossover, not a siding", () => {
    const { doc } = emit(crossover());
    const f = moduleFeatures({
      ...doc,
      endplates: [
        { id: "A", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
        { id: "B", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
      ],
    });
    // A crossover is drawn as a diagonal, so it is NOT in the lane-paralleling
    // extra tracks…
    expect(f.extraTracks.some((t) => t.id === "xo")).toBe(false);
    // …and both mains are there for it to run between.
    expect(f.doubleMain).toBe(true);
  });

  it("still calls a siding a siding — both its turnouts are on one main", () => {
    const pieces: TrackPiece[] = [
      { id: "m1a", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 13 - FROG },
      { id: "sw1", partId: SW, x: 13 - FROG, y: 0, rotationDeg: 0 },
      { id: "mid", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 1 },
    ];
    const B = (() => {
      const j = partGeometry(trackPart(SW)!)!.joints;
      return j.find((x) => x.id === "through")!.x - j.find((x) => x.id === "throat")!.x;
    })();
    pieces[2] = { id: "mid", partId: FLEX, x: 13 - FROG + B, y: 0, rotationDeg: 0, lengthInches: (73 + FROG - B) - (13 - FROG + B) };
    pieces.push({ id: "sw2", partId: SW, x: 73 + FROG, y: 0, rotationDeg: 180, flipped: true });
    const jw = placedJoints(pieces).find((j) => j.key === "sw1.diverge")!;
    const je = placedJoints(pieces).find((j) => j.key === "sw2.diverge")!;
    pieces.push({ id: "sid", partId: FLEX, x: jw.x, y: jw.y, rotationDeg: 0, lengthInches: Math.hypot(je.x - jw.x, je.y - jw.y) });
    const { doc } = graphToDoc(pieces, { startAt: { piece: "m1a", joint: "a" } });
    expect(doc.tracks.find((t) => t.id === "sid")!.role).toBe("siding");
  });
});

// ─── Cutting flex to fit (ADR 0001) ──────────────────────────────────────────
describe("fitFlexBetween", () => {
  const FLEX = "atlas-c55-n-flex";
  const SW = "atlas-c55-n-7";
  const FROG = trackPart(SW)!.frogOffset!.inches;
  const SPACING = FREEMO_TRACK_SPACING_INCHES;

  const twoTurnouts = (): TrackPiece[] => [
    { id: "m1", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 30 - FROG },
    { id: "sw1", partId: SW, x: 30 - FROG, y: 0, rotationDeg: 0 },
    { id: "m2", partId: FLEX, x: 0, y: SPACING, rotationDeg: 0, lengthInches: 30 - FROG },
    { id: "sw2", partId: SW, x: 30 - FROG, y: SPACING, rotationDeg: 0, flipped: true },
  ];

  // ⭐ THE THING THAT MAKES A CROSSOVER BUILDABLE BY HAND.
  it("cuts a run to land exactly on the joint opposite", () => {
    const others = twoTurnouts();
    const a = placedJoints(others).find((j) => j.key === "sw1.diverge")!;
    const b = placedJoints(others).find((j) => j.key === "sw2.diverge")!;
    // ⚠️ Two #7s facing each other across a 1.125″ spacing have their diverging
    // ends almost touching — the legs climb 0.61″ each — so the connector is
    // SHORT. That is the real geometry, and the reason a purpose-built crossover
    // product exists. Laid at the right start, pointing the wrong way and the
    // wrong length.
    const rough: TrackPiece = { id: "xo", partId: FLEX, x: a.x, y: a.y, rotationDeg: 0, lengthInches: 0.3 };
    const fitted = fitFlexBetween(rough, others)!;
    expect(fitted).not.toBeNull();
    const end = placedJoints([fitted]).find((j) => j.joint === "b")!;
    expect(Math.hypot(end.x - b.x, end.y - b.y)).toBeLessThan(JOINT_SNAP_INCHES);
    // …and it is genuinely joined, by the graph's own rule.
    const graph = buildTrackGraph([...others, fitted]);
    expect(graph.connections.some((c) => [c.a, c.b].includes("sw2.diverge"))).toBe(true);
    expect(graph.conflicts).toEqual([]);
  });

  it("leaves a bend alone — an arc meeting a second point is over-constrained", () => {
    const others = twoTurnouts();
    const a = placedJoints(others).find((j) => j.key === "sw1.diverge")!;
    const bent: TrackPiece = {
      id: "xo", partId: FLEX, x: a.x, y: a.y, rotationDeg: 0, lengthInches: 2, radiusInches: 24,
    };
    expect(fitFlexBetween(bent, others)).toBeNull();
  });

  it("will not reach for a joint that already holds a connection", () => {
    const others = twoTurnouts();
    const a = placedJoints(others).find((j) => j.key === "sw1.diverge")!;
    // m1's far end is joined to sw1's throat, so it is not on offer.
    const toward: TrackPiece = {
      id: "x", partId: FLEX, x: a.x, y: a.y, rotationDeg: 180, lengthInches: 0.2,
    };
    const fitted = fitFlexBetween(toward, others, BUILT_IN_TRACK_PARTS, 0.5);
    // Either nothing in reach, or something that is genuinely open — never the
    // occupied junction behind it.
    if (fitted) {
      const end = placedJoints([fitted]).find((j) => j.joint === "b")!;
      expect(Math.hypot(end.x - (30 - FROG), end.y - 0)).toBeGreaterThan(JOINT_SNAP_INCHES);
    }
  });

  it("does nothing for a part that is not flex", () => {
    const others = twoTurnouts();
    expect(fitFlexBetween(others[1], others)).toBeNull();
  });
});

// ─── Hand, at the point of purchase ──────────────────────────────────────────
describe("pieceHand", () => {
  const SW = trackPart("atlas-c55-n-7")!;
  const WYE = trackPart("atlas-c55-n-wye-25") ?? trackPart("atlas-c55-n-wye-35")!;

  // ⚠️ UNFLIPPED IS THE LEFT-HAND PART: a part's frame diverges toward +y, which
  // is the left of the through route looking from the throat — and that is the
  // product whose published geometry these dimensions came from.
  it("calls an unflipped turnout left-hand, and names the part number to order", () => {
    expect(pieceHand(SW, false)).toBe("left");
    expect(piecePartNumber(SW, false)).toBe("2052");
    expect(pieceHand(SW, true)).toBe("right");
    expect(piecePartNumber(SW, true)).toBe("2053");
  });

  // ⭐ A wye splits symmetrically, which is exactly why it is sold as ONE
  // product — so there is no hand to offer, and offering one would invent a
  // choice an owner does not have.
  it("gives a wye no hand at all", () => {
    expect(pieceHand(WYE, false)).toBeNull();
    expect(pieceHand(WYE, true)).toBeNull();
    expect(piecePartNumber(WYE, false)).toBe(WYE.partNumbers?.single);
  });

  // The hand is a label on a product, NOT something the derived document reads:
  // flipping a turnout moves its route, and the lane follows the geometry.
  it("does not put a hand into the document", () => {
    const FLEX = "atlas-c55-n-flex";
    const FROG = SW.frogOffset!.inches;
    const build = (flipped: boolean) => {
      const pieces: TrackPiece[] = [
        { id: "m", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 20 - FROG },
        { id: "s", partId: "atlas-c55-n-7", x: 20 - FROG, y: 0, rotationDeg: 0, flipped },
      ];
      const d = placedJoints(pieces).find((j) => j.key === "s.diverge")!;
      pieces.push({ id: "sp", partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: 20 });
      return graphToDoc(pieces, { startAt: { piece: "m", joint: "a" } }).doc;
    };
    const left = build(false);
    const right = build(true);
    expect(left.turnouts![0].kind).toBeUndefined();
    expect(right.turnouts![0].kind).toBeUndefined();
    // Only the SIDE moved, and it moved because the track did.
    expect(Math.sign(left.tracks.find((t) => t.id === "sp")!.lane)).toBe(1);
    expect(Math.sign(right.tracks.find((t) => t.id === "sp")!.lane)).toBe(-1);
  });
});

// ─── Bumpers (ADR 0001) ──────────────────────────────────────────────────────
// The one piece that is a MODEL CONCEPT as well as a product: it says this end
// of the track is closed on purpose, which is a different thing from track that
// merely stops.
describe("a bumper", () => {
  const FLEX = "atlas-c55-n-flex";
  const SW = "atlas-c55-n-7";
  const BUMPER = "generic-bumper";
  const FROG = trackPart(SW)!.frogOffset!.inches;

  /** A main with a spur, and optionally a bumper on the spur's far end. */
  const spurLayout = (bumper: boolean) => {
    const pieces: TrackPiece[] = [
      { id: "m", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 20 - FROG },
      { id: "s1", partId: SW, x: 20 - FROG, y: 0, rotationDeg: 0 },
    ];
    const d = placedJoints(pieces).find((j) => j.key === "s1.diverge")!;
    pieces.push({ id: "sp", partId: FLEX, x: d.x, y: d.y, rotationDeg: 0, lengthInches: 24 });
    if (bumper) {
      const end = placedJoints(pieces).find((j) => j.key === "sp.b")!;
      // Facing back down the spur, as a bumper does.
      pieces.push({ id: "bmp", partId: BUMPER, x: end.x, y: end.y, rotationDeg: end.headingDeg });
    }
    return pieces;
  };
  const emit = (pieces: TrackPiece[]) => graphToDoc(pieces, { startAt: { piece: "m", joint: "a" } });

  it("is placeable with no dimensions at all", () => {
    const { placeable } = partsPlaceable();
    expect(placeable.some((p) => p.id === BUMPER)).toBe(true);
    expect(trackPart(BUMPER)!.overallLength).toBeUndefined();
  });

  // ⭐ THE POINT. Snapping a bumper on takes the joint, so the end simply is not
  // open any more — nothing has to be flagged, and nothing can disagree.
  it("closes the open end by taking it, not by setting a flag", () => {
    const before = buildTrackGraph(spurLayout(false));
    expect(before.open).toContain("sp.b");
    const after = buildTrackGraph(spurLayout(true));
    expect(after.open).not.toContain("sp.b");
    expect(after.conflicts).toEqual([]);
  });

  // ⚠️ AND IT IS NOT STRAY TRACK. The walk has nowhere to go from a bumper, and
  // an earlier version broke out without recording it — so the piece that says
  // "this end is finished" was itself reported as track nothing connects.
  it("is reached by the walk, and says which track it closed", () => {
    const { doc, warnings } = emit(spurLayout(true));
    expect(warnings).toEqual([]);
    expect(doc.tracks.find((t) => t.id === "sp")!.bumperAt).toBe("to");
  });

  it("leaves a track that merely stops unmarked", () => {
    const { doc } = emit(spurLayout(false));
    expect(doc.tracks.find((t) => t.id === "sp")!.bumperAt).toBeUndefined();
  });

  // ⚠️ A BRANCH'S POSITIONS ARE ARC LENGTH FROM ITS THROAT, so they only ever
  // grow — a spur running physically back toward endplate A still ends at the
  // LARGER number, and its bumper is at `to`. Easy to misread as an x position.
  it("marks `to` even on a spur that physically runs backwards", () => {
    const pieces: TrackPiece[] = [
      { id: "m", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 40 - FROG },
      // Facing west, so its diverging route heads back toward endplate A.
      { id: "s1", partId: SW, x: 40 - FROG, y: 0, rotationDeg: 180, flipped: true },
    ];
    const d = placedJoints(pieces).find((j) => j.key === "s1.diverge")!;
    pieces.push({ id: "sp", partId: FLEX, x: d.x, y: d.y, rotationDeg: 180, lengthInches: 15 });
    const end = placedJoints(pieces).find((j) => j.key === "sp.b")!;
    pieces.push({ id: "bmp", partId: BUMPER, x: end.x, y: end.y, rotationDeg: end.headingDeg });
    const { doc } = graphToDoc(pieces, { startAt: { piece: "m", joint: "a" } });
    const spur = doc.tracks.find((t) => t.id === "sp")!;
    expect(spur.bumperAt).toBe("to");
    expect(spur.fromPos).toBeLessThan(spur.toPos!);
    // It really is running west: its far end sits BEHIND its throat on the board.
    const far = placedJoints(pieces).find((j) => j.key === "sp.b")!;
    const throat = placedJoints(pieces).find((j) => j.key === "s1.throat")!;
    expect(far.x).toBeLessThan(throat.x);
  });

  // A pocket module: the main runs in and stops, on purpose.
  it("closes a MAIN, which is what a pocket module is", () => {
    const pieces: TrackPiece[] = [
      { id: "m", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 16 },
    ];
    const end = placedJoints(pieces).find((j) => j.key === "m.b")!;
    pieces.push({ id: "bmp", partId: BUMPER, x: end.x, y: end.y, rotationDeg: end.headingDeg });
    const { doc, warnings } = graphToDoc(pieces, { startAt: { piece: "m", joint: "a" } });
    expect(doc.tracks.find((t) => t.id === "main")!.bumperAt).toBe("to");
    expect(doc.lengthInches).toBe(16);
    expect(warnings).toEqual([]);
  });

  // Nothing can be attached to the back of a bumper: it has one joint, and the
  // rail stops there.
  it("offers nowhere to continue past it", () => {
    const pieces = spurLayout(true);
    const loose: TrackPiece = {
      id: "x", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 6,
    };
    const bmp = placedJoints(pieces).find((j) => j.piece === "bmp")!;
    // Dropped right where a bumper's far side would be, if it had one.
    const past = { ...loose, x: bmp.x + BUMPER_DRAWN_INCHES, y: bmp.y };
    expect(snapPiece(past, pieces)).toBeNull();
    expect(placedJoints(pieces).filter((j) => j.piece === "bmp")).toHaveLength(1);
  });
});

// ─── Sectional straights and curves (#198) ───────────────────────────────────
// ⚠️ A SECTIONAL PIECE IS NOT FLEX CUT TO LENGTH, even though the rail ends up
// in the same place: its length belongs to the PART, because an owner has a box
// of them and cannot cut one.
describe("sectional track", () => {
  const straight = (inches: number): TrackPart => ({
    id: "x-straight", manufacturer: "X", line: "Code 55", scale: "N",
    name: `${inches}″ Straight`, kind: "straight",
    overallLength: { inches, source: "manufacturer" },
  });
  const curve = (radius: number, arcDegrees: number): TrackPart => ({
    id: "x-curve", manufacturer: "X", line: "Code 55", scale: "N",
    name: `${radius}″ ${arcDegrees}°`, kind: "curve",
    radius: { inches: radius, source: "manufacturer" }, arcDegrees,
  });

  it("places a straight at exactly its own length", () => {
    const geo = partGeometry(straight(5), [straight(5)])!;
    expect(geo.joints.find((j) => j.id === "b")).toMatchObject({ x: 5, y: 0, angleDeg: 0 });
    expect(geo.routes).toEqual([["a", "b"]]);
  });

  // ⭐ THE SAME ARC DEFINITION BENT FLEX USES, so a sectional curve and a bent
  // run of the same radius land in the same place. Two definitions of an arc in
  // one library is a bug waiting for someone to lay one against the other.
  it("puts a curve exactly where bent flex of the same radius would end", () => {
    const part = curve(19, 30);
    const geo = partGeometry(part, [part])!;
    const b = geo.joints.find((j) => j.id === "b")!;
    const bent = flexRunEnd(sectionalArcInches(part), 19);
    expect(b.x).toBeCloseTo(bent.x, 9);
    expect(b.y).toBeCloseTo(bent.y, 9);
    expect(b.angleDeg).toBeCloseTo(30, 9);
  });

  // ⚠️ THE ARC, NEVER THE CHORD. A 19″ 30° section is 9.95″ of rail across a
  // 9.83″ chord; storing the chord would pull everything past it toward
  // endplate A.
  it("measures a curve along its rail", () => {
    const part = curve(19, 30);
    const arc = sectionalArcInches(part);
    expect(arc).toBeCloseTo((19 * 30 * Math.PI) / 180, 9);
    const geo = partGeometry(part, [part])!;
    const b = geo.joints.find((j) => j.id === "b")!;
    expect(arc).toBeGreaterThan(Math.hypot(b.x, b.y));
  });

  it("walks a curve by its arc, so what follows sits where it really is", () => {
    const part = curve(19, 30);
    const lib = [...BUILT_IN_TRACK_PARTS, part];
    const pieces: TrackPiece[] = [{ id: "c", partId: "x-curve", x: 0, y: 0, rotationDeg: 0 }];
    const end = placedJoints(pieces, lib).find((j) => j.joint === "b")!;
    pieces.push({
      id: "f", partId: "atlas-c55-n-flex", x: end.x, y: end.y,
      rotationDeg: end.headingDeg, lengthInches: 10,
    });
    const w = walkTrackGraph(buildTrackGraph(pieces, lib), pieces, { piece: "c", joint: "a" }, lib);
    expect(w.routes[0].toPos).toBeCloseTo(sectionalArcInches(part) + 10, 6);
  });

  // The blocked list is the parts backlog, so it has to name the missing number.
  it("says exactly what a sectional part is missing", () => {
    expect(partGeometryGap({ ...straight(5), overallLength: undefined })).toMatch(/IS its length/);
    expect(partGeometryGap({ ...curve(19, 30), radius: undefined })).toMatch(/radius and an arc/);
    expect(partGeometryGap({ ...curve(19, 30), arcDegrees: undefined })).toMatch(/how far it turns/);
    expect(partGeometryGap(straight(5))).toBeNull();
    expect(partGeometryGap(curve(19, 30))).toBeNull();
  });

  // ⚠️ An admin can type a curve's radius and arc, and the part must come back
  // PLACEABLE — otherwise the palette blames a missing radius that was just
  // entered.
  it("takes a curve entered in the admin editor", () => {
    const [part] = mergeStoredParts(
      [{
        slug: "x-curve-stored", manufacturer: "X", line: "Code 55", name: "19″ 30°",
        kind: "curve", radiusInches: 19, arcDegrees: 30, radiusSource: "manufacturer",
      }],
      [],
    );
    expect(part.radius?.inches).toBe(19);
    expect(part.arcDegrees).toBe(30);
    expect(partGeometryGap(part)).toBeNull();
  });
});

// ⚠️ A stored kind must survive the mapping. This allow-list had three entries
// and turned everything else into a TURNOUT, which was then blocked for having
// no points offset — blaming a measurement that was never going to exist.
describe("a stored part keeps its kind", () => {
  it("maps every kind the library can hold", () => {
    for (const kind of TRACK_PART_KINDS) {
      const [part] = mergeStoredParts(
        [{ slug: `s-${kind}`, manufacturer: "X", line: "L", name: kind, kind }],
        [],
      );
      expect(part.kind, kind).toBe(kind);
    }
  });

  it("still falls back to turnout for a kind it has never heard of", () => {
    const [part] = mergeStoredParts(
      [{ slug: "s-x", manufacturer: "X", line: "L", name: "?", kind: "monorail" }],
      [],
    );
    expect(part.kind).toBe("turnout");
  });
});

// ⚠️ A sectional curve's JOINTS land correctly whether or not the rail between
// them is drawn as an arc, so a chord here looks right until you see the track
// cutting the corner. Found on the deployed app, not by any of the geometry
// tests above.
describe("a sectional curve is DRAWN as an arc", () => {
  const part: TrackPart = {
    id: "x-curve", manufacturer: "X", line: "Code 55", scale: "N", name: "19″ 30°",
    kind: "curve", radius: { inches: 19, source: "manufacturer" }, arcDegrees: 30,
  };
  const lib = [...BUILT_IN_TRACK_PARTS, part];

  it("samples the rail instead of running a chord between its ends", () => {
    const piece: TrackPiece = { id: "c", partId: "x-curve", x: 10, y: 0, rotationDeg: 0 };
    const [path] = pieceRoutePaths(piece, lib);
    expect(path.points.length).toBeGreaterThan(4);
    const b = placedJoints([piece], lib).find((j) => j.joint === "b")!;
    const last = path.points[path.points.length - 1];
    expect(Math.hypot(last.x - b.x, last.y - b.y)).toBeLessThan(1e-9);
    // The middle of the rail stands off the straight line between the ends.
    const mid = path.points[Math.floor(path.points.length / 2)];
    const chordMid = { x: (path.points[0].x + b.x) / 2, y: (path.points[0].y + b.y) / 2 };
    expect(Math.hypot(mid.x - chordMid.x, mid.y - chordMid.y)).toBeGreaterThan(0.2);
  });

  it("bends the other way when the piece is flipped", () => {
    const up = pieceRoutePaths({ id: "c", partId: "x-curve", x: 0, y: 0, rotationDeg: 0 }, lib)[0];
    const down = pieceRoutePaths(
      { id: "c", partId: "x-curve", x: 0, y: 0, rotationDeg: 0, flipped: true }, lib)[0];
    const lastUp = up.points[up.points.length - 1];
    const lastDown = down.points[down.points.length - 1];
    expect(lastUp.y).toBeGreaterThan(0);
    expect(lastDown.y).toBeCloseTo(-lastUp.y, 9);
    expect(lastDown.x).toBeCloseTo(lastUp.x, 9);
  });
});

// ─── Cutting a run to take a piece (Will, 2026-07-27) ────────────────────────
// "When I drop a turnout on the track, it should cut the track there and
// automatically snap to the new joints." Snapping alone cannot: the middle of a
// run has no open joint, so the joints have to be MADE by cutting.
describe("insertIntoRun", () => {
  const FLEX = "atlas-c55-n-flex";
  const SW = "atlas-c55-n-7";
  const body = (() => {
    const j = partGeometry(trackPart(SW)!)!.joints;
    return j.find((x) => x.id === "through")!.x - j.find((x) => x.id === "throat")!.x;
  })();
  const run = (over: Partial<TrackPiece> = {}): TrackPiece => ({
    id: "m", partId: FLEX, x: 0, y: 0, rotationDeg: 0, lengthInches: 40, ...over,
  });
  const turnout = (): TrackPiece => ({ id: "sw", partId: SW, x: 0, y: 0, rotationDeg: 0 });

  it("cuts the run in two and joins both halves to the piece", () => {
    const got = insertIntoRun([run()], turnout(), { x: 12, y: 0 })!;
    expect(got).not.toBeNull();
    const graph = buildTrackGraph(got.pieces);
    // Every joint of the new turnout's run is MADE, not merely near.
    expect(graph.conflicts).toEqual([]);
    expect(graph.connections).toHaveLength(2);
    // …and the lengths still add up to the run that was there.
    const flexTotal = got.pieces
      .filter((p) => p.partId === FLEX)
      .reduce((t, p) => t + (p.lengthInches ?? 0), 0);
    expect(flexTotal + body).toBeCloseTo(40, 6);
  });

  it("walks straight through the result, so the module is the length it was", () => {
    const got = insertIntoRun([run()], turnout(), { x: 12, y: 0 })!;
    const w = walkTrackGraph(buildTrackGraph(got.pieces), got.pieces, { piece: "m", joint: "a" });
    expect(w.routes[0].toPos).toBeCloseTo(40, 6);
    expect(w.turnouts[0].id).toBe("sw");
  });

  // ⚠️ ONLY FLEX CAN BE CUT. A turnout is a moulding: you cannot saw one in half
  // and have two of anything.
  it("refuses to cut a part that is not flex", () => {
    const pieces = [{ id: "sw0", partId: SW, x: 0, y: 0, rotationDeg: 0 }];
    expect(insertIntoRun(pieces, turnout(), { x: 3, y: 0 })).toBeNull();
  });

  // ⚠️ AND THE PIECE HAS TO FIT — a #7 is six inches of the run.
  it("refuses an insertion that would run off the end", () => {
    expect(insertIntoRun([run({ lengthInches: 4 })], turnout(), { x: 2, y: 0 })).toBeNull();
  });

  it("ignores a drop nowhere near the run", () => {
    expect(insertIntoRun([run()], turnout(), { x: 12, y: 20 })).toBeNull();
  });

  // A bent run keeps its radius on both sides of the cut, and the piece sits on
  // the tangent where it landed — a straight turnout in a curve genuinely kinks,
  // which is true of the real thing too.
  it("cuts a bent run and keeps both halves bent", () => {
    const bent = run({ lengthInches: 40, radiusInches: 30 });
    const got = insertIntoRun([bent], turnout(), (() => {
      const mid = flexRunEnd(15, 30);
      return { x: mid.x, y: mid.y };
    })())!;
    expect(got).not.toBeNull();
    for (const p of got.pieces.filter((x) => x.partId === FLEX))
      expect(p.radiusInches).toBe(30);
    expect(buildTrackGraph(got.pieces).connections).toHaveLength(2);
  });

  it("drops the stub when the cut lands at the very start", () => {
    const got = insertIntoRun([run()], turnout(), { x: 0, y: 0 })!;
    expect(got.pieces.some((p) => p.id === "m")).toBe(false);
    expect(buildTrackGraph(got.pieces).connections).toHaveLength(1);
  });
});

// ⚠️ A module whose document PLACES TRACK is asserting that a main exists —
// `pos` means inches from endplate A along it. Refusing a spine there drew the
// board and silently none of its track (FMN-0078's card).
describe("a spine for a module that already has track", () => {
  const base = { lengthInches: 96, geometryType: null };
  it("still gives a blank module no main", () => {
    expect(moduleCenterline({ ...base }).length).toBe(0);
  });
  it("gives one to a module with track on it", () => {
    const c = moduleCenterline({ ...base, hasPlacedTrack: true });
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[c.length - 1].x).toBeCloseTo(96, 6);
  });
  it("still prefers a drawn main when there is one", () => {
    const c = moduleCenterline({
      ...base, hasPlacedTrack: true,
      mainPath: [{ x: 0, y: 0 }, { x: 40, y: 5 }],
    });
    expect(c[c.length - 1].y).toBeCloseTo(5, 6);
  });
});

// ⭐⭐ THE FINDING THAT SHAPED THIS: across the production database not one
// turnout names a part and most state no frog number either. Converting a drawn
// module to pieces is blocked by not knowing WHICH TURNOUT IT IS far more often
// than by any missing measurement — so conversion asks rather than guesses, and
// is offered per module rather than run silently (ADR 0001 amendment).
describe("what a 1-D document would become as pieces", () => {
  const doc = (over: Partial<ModuleSchematicDoc> = {}): ModuleSchematicDoc => ({
    version: 1,
    lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [{ id: "main", role: "main", lane: 0 }],
    ...over,
  });
  const to = (over: Partial<SchematicTurnout> = {}): SchematicTurnout => ({
    id: "sw1", pos: 24, onTrack: "main", divergeTrack: "spur", ...over,
  });

  it("asks nothing of a module with no turnouts", () => {
    const r = moduleConversionReport(doc());
    expect(r.readyWithoutAsking).toBe(true);
    expect(r.unanswered).toEqual([]);
  });

  it("resolves a turnout by its frog number when a part IS that number", () => {
    const r = moduleConversionReport(doc({ turnouts: [to({ size: 7 })] }));
    expect(r.turnouts[0].partId).toBe("atlas-c55-n-7");
    expect(r.turnouts[0].from).toBe("frog-number");
    expect(r.readyWithoutAsking).toBe(true);
  });

  it("⭐ NEVER converts a #6 into the #7 we happen to have measured", () => {
    const r = moduleConversionReport(doc({ turnouts: [to({ size: 6 })] }));
    expect(r.turnouts[0].partId).toBeNull();
    expect(r.turnouts[0].why).toMatch(/no measured #6/);
    expect(r.unanswered).toEqual(["sw1"]);
    // Still offerable — this is a question, and the owner can answer it.
    expect(r.offerable).toBe(true);
  });

  it("says so plainly when the document never said what the turnout is", () => {
    const r = moduleConversionReport(doc({ turnouts: [to()] }));
    expect(r.turnouts[0].why).toMatch(/never says what this turnout is/);
    expect(r.turnouts[0].size).toBeUndefined();
  });

  it("a named part beats a frog number, and carries its provenance", () => {
    const r = moduleConversionReport(
      doc({ turnouts: [to({ size: 7, partId: "atlas-c55-n-10" })] }),
    );
    expect(r.turnouts[0].partId).toBe("atlas-c55-n-10");
    expect(r.turnouts[0].from).toBe("named");
    expect(r.turnouts[0].source).toBeTruthy();
  });

  it("blames the measurement, not the owner, for a named part we cannot place", () => {
    // ⭐ BOTH gaps covered, each by the part that actually has it. The #6 was
    // measured at its points (2026-07-31) so its gap moved on to the frog; the #8
    // nobody has touched still has the original one. Testing only one would let
    // the other message rot.
    const frogGap = moduleConversionReport(
      doc({ turnouts: [to({ partId: "fast-tracks-n-me55-t-6" })] }),
    );
    expect(frogGap.turnouts[0].partId).toBeNull();
    expect(frogGap.turnouts[0].why).toMatch(/no frog offset/);

    const pointsGap = moduleConversionReport(
      doc({ turnouts: [to({ partId: "fast-tracks-n-me55-t-8" })] }),
    );
    expect(pointsGap.turnouts[0].partId).toBeNull();
    expect(pointsGap.turnouts[0].why).toMatch(/no points offset/);
  });

  it("offers only parts that can actually be drawn, exact frog first", () => {
    const r = moduleConversionReport(doc({ turnouts: [to({ size: 10 })] }));
    expect(r.turnouts[0].candidates[0]).toBe("atlas-c55-n-10");
    expect(r.turnouts[0].candidates).not.toContain("fast-tracks-n-me55-t-10");
  });

  // ⚠️ A BLOCKER IS NOT A QUESTION. No answer supplies a shape the model cannot
  // express, so the offer is withheld rather than made and then abandoned.
  it("withholds the offer where there is a diamond", () => {
    const r = moduleConversionReport(
      doc({ crossings: [{ id: "x1", pos: 30, tracks: ["main", "spur"] }] }),
    );
    expect(r.offerable).toBe(false);
    expect(r.blockers[0].kind).toBe("crossing");
  });

  it("withholds the offer on a balloon, whose radii were never recorded", () => {
    const r = moduleConversionReport(doc({ loop: true }));
    expect(r.offerable).toBe(false);
    expect(r.blockers[0].why).toMatch(/inventing/);
  });

  it("does not re-report a module that is already pieces", () => {
    const r = moduleConversionReport(
      doc({ graph: { pieces: [{ id: "p1", partId: "atlas-c55-n-flex", x: 0, y: 0, rotationDeg: 0 }], startAt: { piece: "p1", joint: "a" } } }),
    );
    expect(r.alreadyGraph).toBe(true);
    expect(r.offerable).toBe(false);
  });
});

// ⚠️ FOUND BY RUNNING THE REPORT OVER THE PRODUCTION DATABASE, not by reasoning.
// Four real modules draw named, capacity-bearing tracks that no turnout reaches
// — Idaho Falls Grain Yard has five yard tracks and NO turnouts at all. The 1-D
// model draws them from lane + fromPos and never notices; a piece has to join
// something. Reporting only on turnouts called all four "ready".
describe("track the document draws but nothing connects", () => {
  const doc = (over: Partial<ModuleSchematicDoc> = {}): ModuleSchematicDoc => ({
    version: 1,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [{ id: "main", role: "main", lane: 0 }],
    ...over,
  });

  it("spots a yard track no turnout diverges onto", () => {
    const r = moduleConversionReport(doc({
      tracks: [
        { id: "main", role: "main", lane: 0 },
        { id: "mt15", role: "siding", lane: 2, trackName: "yard 1", capacityFeet: 1760 },
      ],
    }));
    expect(r.orphanTracks.map((t) => t.id)).toEqual(["mt15"]);
    expect(r.orphanTracks[0].trackName).toBe("yard 1");
    expect(r.readyWithoutAsking).toBe(false);
    // Still offerable: the owner can say where it joins. It is a question.
    expect(r.offerable).toBe(true);
  });

  it("a main is reached by definition — it starts at the endplate", () => {
    const r = moduleConversionReport(doc({
      tracks: [
        { id: "main", role: "main", lane: 0 },
        { id: "main2", role: "main", lane: 1 },
      ],
    }));
    expect(r.orphanTracks).toEqual([]);
    expect(r.readyWithoutAsking).toBe(true);
  });

  it("⚠️ being a turnout's HOST does not give a track a way in", () => {
    // Magnolia Yard's shape: sw1 sits ON sid3 and diverges onto sid1, so sid3
    // hosts a turnout and is still joined to nothing itself.
    const r = moduleConversionReport(doc({
      tracks: [
        { id: "main", role: "main", lane: 0 },
        { id: "sid3", role: "siding", lane: 3 },
        { id: "sid1", role: "spur", lane: 1 },
      ],
      turnouts: [
        { id: "sw1", pos: 18, size: 7, onTrack: "sid3", divergeTrack: "sid1" },
      ],
    }));
    expect(r.orphanTracks.map((t) => t.id)).toEqual(["sid3"]);
  });

  it("says nothing about a properly connected module", () => {
    const r = moduleConversionReport(doc({
      tracks: [
        { id: "main", role: "main", lane: 0 },
        { id: "sid", role: "siding", lane: 1 },
      ],
      turnouts: [
        { id: "sw1", pos: 6, size: 7, onTrack: "main", divergeTrack: "sid" },
      ],
    }));
    expect(r.orphanTracks).toEqual([]);
    expect(r.readyWithoutAsking).toBe(true);
  });
});

// ⭐ Rebuilding a REAL owner's module, end to end: 1-D document → pieces →
// document. Blairstown is the case the spike proved by hand; here the pieces are
// placed by the conversion, so the numbers cannot be tuned until they match.
describe("rebuilding a drawn module as pieces", () => {
  const SW = "atlas-c55-n-7";
  const blairstown = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0 },
      { id: "mt5", role: "siding", lane: 1, fromPos: 13, toPos: 73, trackName: "House Track" },
      { id: "spur1", role: "siding", lane: -1, fromPos: 19, toPos: 85, trackName: "Passing Track" },
    ],
    turnouts: [
      { id: "sw1", pos: 13, onTrack: "main", divergeTrack: "mt5" },
      { id: "sw2", pos: 73, onTrack: "main", divergeTrack: "mt5" },
      { id: "sw3", pos: 19, onTrack: "main", divergeTrack: "spur1" },
      { id: "sw4", pos: 85, onTrack: "main", divergeTrack: "spur1" },
    ],
  });
  const derived = (doc: ModuleSchematicDoc, answers: ConversionAnswers = { turnoutPartId: SW }) => {
    const c = docToGraph(doc, answers);
    expect(c.refused).toBeNull();
    return { conv: c, out: graphToDoc(c.graph!.pieces, { startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: doc }) };
  };

  it("puts every turnout back exactly where the document had it", () => {
    const { out } = derived(blairstown());
    const at = Object.fromEntries((out.doc.turnouts ?? []).map((t) => [t.id, t.pos]));
    expect(at["t-sw1"]).toBeCloseTo(13, 6);
    expect(at["t-sw2"]).toBeCloseTo(73, 6);
    expect(at["t-sw3"]).toBeCloseTo(19, 6);
    expect(at["t-sw4"]).toBeCloseTo(85, 6);
  });

  it("puts both sidings back at their recorded extents", () => {
    const { out } = derived(blairstown());
    const mt5 = out.doc.tracks.find((t) => t.id === "mt5")!;
    const spur1 = out.doc.tracks.find((t) => t.id === "spur1")!;
    expect([mt5.fromPos, mt5.toPos]).toEqual([13, 73]);
    expect([spur1.fromPos, spur1.toPos]).toEqual([19, 85]);
    // ⭐ A siding, not a spur — which is only true because BOTH its turnouts
    // reach it. The closing curve is what makes that so.
    expect(mt5.role).toBe("siding");
    expect(mt5.lane).toBe(1);
    expect(spur1.lane).toBe(-1);
  });

  it("⭐ both turnouts of a siding diverge onto the SAME track", () => {
    const { out } = derived(blairstown());
    const onto = (out.doc.turnouts ?? []).filter((t) => t.divergeTrack === "mt5").map((t) => t.id);
    expect(onto.sort()).toEqual(["t-sw1", "t-sw2"]);
    expect(out.doc.tracks.filter((t) => t.id.startsWith("mt5"))).toHaveLength(1);
  });

  it("leaves exactly the two endplate ends open", () => {
    const { conv } = derived(blairstown());
    const g = buildTrackGraph(conv.graph!.pieces);
    expect(g.open).toHaveLength(2);
    expect(g.conflicts).toEqual([]);
  });

  // ⚠️ THE MODULE MAY NOT HAVE ROOM FOR WHAT THE OWNER CHOSE. ELM Yard's east
  // ladder is pitched at 5″; a turnout body plus the curve bringing the next
  // track parallel needs more. The 1-D model never had to notice — it draws a
  // spur at its lane the instant the turnout appears.
  it("says a ladder is too tight for the chosen turnout instead of dropping it", () => {
    const elm: ModuleSchematicDoc = {
      version: 1, lengthInches: 96,
      endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
      tracks: [
        { id: "main", role: "main", lane: 0 },
        { id: "mt20", role: "spur", lane: -1, fromPos: 8, toPos: 45 },
        { id: "mt21", role: "spur", lane: -2, fromPos: 13, toPos: 45 },
        { id: "mt22", role: "spur", lane: -3, fromPos: 18, toPos: 45 },
      ],
      turnouts: [
        { id: "sw1", pos: 8, onTrack: "main", divergeTrack: "mt20" },
        { id: "sw2", pos: 13, onTrack: "mt20", divergeTrack: "mt21" },
        { id: "sw3", pos: 18, onTrack: "mt21", divergeTrack: "mt22" },
      ],
    };
    const c = docToGraph(elm, { turnoutPartId: SW });
    expect(c.refused).toBeNull();
    expect(c.notLaid.map((n) => n.id).sort()).toEqual(["mt21", "mt22"]);
    expect(c.notLaid[0].why).toMatch(/tighter than the chosen turnout/);
    // ⭐ And the track that DOES fit is still laid — a partial rebuild is
    // reported, not abandoned.
    expect(c.graph!.pieces.some((p) => p.id === "t-sw1")).toBe(true);
  });

  it("takes one answer for the whole module, and an override for the odd one out", () => {
    const doc = blairstown();
    const c = docToGraph(doc, { turnoutPartId: SW, overrides: { sw4: "atlas-c55-n-10" } });
    expect(c.refused).toBeNull();
    expect(c.graph!.pieces.find((p) => p.id === "t-sw4")!.partId).toBe("atlas-c55-n-10");
    expect(c.graph!.pieces.find((p) => p.id === "t-sw1")!.partId).toBe(SW);
  });

  it("refuses rather than guess when nothing identifies the turnouts", () => {
    expect(docToGraph(blairstown()).refused).toMatch(/still need identifying/);
  });

  it("a part the document already names beats the module-wide answer", () => {
    const doc = blairstown();
    doc.turnouts![0].partId = "atlas-c55-n-5";
    const c = docToGraph(doc, { turnoutPartId: SW });
    expect(c.graph!.pieces.find((p) => p.id === "t-sw1")!.partId).toBe("atlas-c55-n-5");
  });

  // ⚠️ Straightening a drawn curve would change the owner's module without
  // saying so. Refuse until curved runs are supported.
  it("refuses a mainline that was drawn with bends", () => {
    const doc = blairstown();
    doc.mainPath = [{ x: 0, y: 0 }, { x: 40, y: 4 }, { x: 96, y: 0 }];
    expect(docToGraph(doc, { turnoutPartId: SW }).refused).toMatch(/drawn with bends/);
  });

  // ⭐⭐ NOT ALL TRACK RUNS DOWN THE CENTRE-LINE (Will, 2026-08-01). The
  // conversion used to lay every piece at `x = pos, y = lane, rotation = 0` —
  // the STRAIGHTENED frame, not the board — so on a module whose centre-line
  // curves the pieces came out in a straight line somewhere else entirely.
  describe("laying pieces where the track really is", () => {
    /** A board running due north-east: heading is constant, so nothing bends,
     * but nothing is on the module's +x axis either. */
    const diagonal: PlaceOnTrack = (_id, pos) => ({
      x: (pos * Math.SQRT1_2),
      y: (pos * Math.SQRT1_2),
      headingDeg: 45,
    });
    /** A constant-radius curve: heading turns a fixed amount per inch, which is
     * exactly what a circular arc is. R = arc / θ. */
    const arcAt = (radius: number): PlaceOnTrack => (_id, pos) => {
      const th = pos / radius;
      return {
        x: radius * Math.sin(th),
        y: radius * (1 - Math.cos(th)),
        headingDeg: (th * 180) / Math.PI,
      };
    };

    it("puts the pieces on the track's real line, not the module's axis", () => {
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, diagonal);
      expect(c.refused).toBeNull();
      const flex = c.graph!.pieces.filter((p) => p.id.startsWith("f-"));
      expect(flex.length).toBeGreaterThan(0);
      for (const p of flex) {
        expect(p.rotationDeg).toBeCloseTo(45, 6);
        // On a 45° line the two coordinates are equal. The old lay put every
        // one of these at y = the lane offset, on an axis the track never ran on.
        expect(p.y).toBeCloseTo(p.x, 3);
        expect(p.radiusInches).toBeUndefined();
      }
    });

    it("bends each piece to the radius its own stretch actually has", () => {
      const R = 240;
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, arcAt(R));
      expect(c.refused).toBeNull();
      const flex = c.graph!.pieces.filter((p) => p.id.startsWith("f-") && p.lengthInches! > 1);
      expect(flex.length).toBeGreaterThan(0);
      for (const p of flex) {
        // Derived from the polyline, not invented: turning θ over arc s IS s/θ.
        expect(p.radiusInches).toBeCloseTo(R, 0);
      }
    });

    it("keeps a straight run straight instead of describing it as a vast arc", () => {
      // A hair of turn is float noise, and 1e-3° over 30″ is a 1.7-million-inch
      // radius — a straight piece described in the most alarming way possible.
      const noisy: PlaceOnTrack = (_id, pos) => ({ x: pos, y: 0, headingDeg: 1e-4 * pos });
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, noisy);
      const flex = c.graph!.pieces.filter((p) => p.id.startsWith("f-"));
      expect(flex.every((p) => p.radiusInches === undefined)).toBe(true);
    });

    it("turns a west-facing turnout about the track's heading, not the module's", () => {
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, diagonal);
      const sw = c.graph!.pieces.filter((p) => p.id.startsWith("t-"));
      expect(sw.length).toBeGreaterThan(0);
      // Every turnout faces along the 45° track — either with it or end-for-end.
      for (const p of sw) expect([45, -135]).toContainEqual(Math.round(p.rotationDeg));
      // …and none of them is left sitting on the module's axis.
      expect(sw.every((p) => Math.abs(p.y - p.x) < 1e-3)).toBe(true);
    });

    it("lays a bent mainline now that the radius can be read off the drawing", () => {
      const doc = blairstown();
      doc.mainPath = [{ x: 0, y: 0 }, { x: 40, y: 4 }, { x: 96, y: 0 }];
      // Still refused with no placer — laying it flat would silently straighten
      // the owner's curve, which is what the refusal was protecting against.
      expect(docToGraph(doc, { turnoutPartId: SW }).refused).toMatch(/drawn with bends/);
      expect(
        docToGraph(doc, { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, arcAt(400)).refused,
      ).toBeNull();
    });

    // ⛔⛔ THE BUG THE FIRST ATTEMPT SHIPPED. Every piece was placed by sampling
    // ITS OWN span's start on the polyline. A 30″ piece's real far end and the
    // polyline's point 30″ along are not the same place on a curve, and they
    // differ by far more than JOINT_SNAP_INCHES (0.01″) — so consecutive pieces
    // never shared a joint, the graph fragmented, and a 386″ module walked as
    // 45.5″ with 21 "not reachable from the endplate" warnings.
    it("chains the pieces so consecutive joints coincide exactly", () => {
      const R = 240;
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, arcAt(R));
      expect(c.refused).toBeNull();
      const joints = placedJoints(c.graph!.pieces, BUILT_IN_TRACK_PARTS);
      const main = c.graph!.pieces
        .filter((p) => /^f-main-/.test(p.id))
        .sort((a, b) => Number(a.id.split("-")[2]) - Number(b.id.split("-")[2]));
      expect(main.length).toBeGreaterThan(2);

      let worst = 0;
      let joinsChecked = 0;
      for (let i = 1; i < main.length; i += 1) {
        const b = joints.find((j) => j.piece === main[i - 1].id && j.joint === "b");
        const a = joints.find((j) => j.piece === main[i].id && j.joint === "a");
        if (!b || !a) continue;
        const gap = Math.hypot(b.x - a.x, b.y - a.y);
        // Only CONTIGUOUS cuts chain — a gap of a turnout body's length is the
        // turnout sitting between them, which is not a break.
        if (gap > 1) continue;
        joinsChecked += 1;
        worst = Math.max(worst, gap);
      }
      expect(joinsChecked).toBeGreaterThan(0);
      expect(worst).toBeLessThan(JOINT_SNAP_INCHES);
    });

    // ⭐⭐ THE WELD. Chaining the flex closed flex-to-flex; each BODY was still
    // placed by its own sample, so two adjacent turnouts never met on a curve
    // and the walk stopped at the first (14.78 of 96). Every element of a run
    // is now welded to the one before it, whatever kind it is.
    //
    // ⏳ Still short of the full 96: a siding does not yet weld to the turnout
    // that OPENS it — each run welds internally, and the diverging connection
    // between runs is not part of either. This test PINS the progress so the
    // number has to move when that lands, rather than asserting a completeness
    // that is not there.
    it("welds the bodies too, so the run walks most of the module", () => {
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, arcAt(600));
      const g = graphToDoc(c.graph!.pieces, {
        startAt: c.graph!.startAt,
        start2: c.graph!.start2 ?? null,
        base: blairstown(),
      });
      // Was 14.78 when only the flex chained; ~83.2 now.
      expect(g.doc.lengthInches).toBeGreaterThan(75);
      // ⭐ A derived length far under the module's own is the cheap signal that
      // a chain is broken — it is how the first attempt announced itself (45.5
      // against 386) without ever refusing.
      expect(g.doc.lengthInches).toBeLessThanOrEqual(96);
      // Down from 10; what remains is the run-to-run diverging connection.
      expect((g.warnings ?? []).filter((w) => /not reachable/.test(w)).length).toBeLessThan(5);
    });

    it("falls back to the flat lay when the caller cannot place a track", () => {
      const none: PlaceOnTrack = () => null;
      const c = docToGraph(blairstown(), { turnoutPartId: SW }, BUILT_IN_TRACK_PARTS, none);
      expect(c.refused).toBeNull();
      const flex = c.graph!.pieces.filter((p) => p.id.startsWith("f-"));
      expect(flex.every((p) => p.rotationDeg === 0)).toBe(true);
    });
  });

  it("names track it could not lay rather than losing it quietly", () => {
    const doc = blairstown();
    doc.tracks.push({ id: "yard1", role: "siding", lane: 3, trackName: "yard 1" });
    const c = docToGraph(doc, { turnoutPartId: SW });
    expect(c.notLaid.map((n) => n.id)).toContain("yard1");
  });
});

// ⭐⭐ A DOCUMENT'S `pos` IS THE FROG (Will, 2026-07-27). Pinned here because two
// shipped functions had drifted off it in different directions and neither was
// obviously wrong from the inside: the walk reported `throat + lead` (lead is
// measured POINTS→frog, so from the throat it lands on no landmark at all), and
// `turnoutOccupiedSpan` anchored the moulding on the POINTS, cutting the flex
// `lead` — 3.59″ on an Atlas #7 — away from where the turnout really is.
describe("a turnout's pos is its frog", () => {
  const SEVEN = trackPart("atlas-c55-n-7")!;

  it("the moulding sits frogOffset behind pos and pastFrog ahead of it", () => {
    const e = partExtent(SEVEN)!;
    expect(e.behindFrog).toBeCloseTo(4.21875, 6); // the measured frog offset
    expect(e.pastFrog).toBeCloseTo(1.78125, 6);
    expect(e.behindFrog + e.pastFrog).toBeCloseTo(SEVEN.overallLength!.inches, 6);
    const span = turnoutOccupiedSpan({ pos: 13, extent: e, facing: 1 })!;
    expect(span.fromPos).toBeCloseTo(13 - 4.21875, 6);
    expect(span.toPos).toBeCloseTo(13 + 1.78125, 6);
  });

  it("turned end-for-end the body reflects about the frog, not about the points", () => {
    const e = partExtent(SEVEN)!;
    const span = turnoutOccupiedSpan({ pos: 13, extent: e, facing: -1 })!;
    expect(span.fromPos).toBeCloseTo(13 - 1.78125, 6);
    expect(span.toPos).toBeCloseTo(13 + 4.21875, 6);
  });

  it("the walk reports the frog, and a rebuild puts it back at the same number", () => {
    const doc: ModuleSchematicDoc = {
      version: 1, lengthInches: 60,
      endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
      tracks: [
        { id: "main", role: "main", lane: 0 },
        { id: "s", role: "spur", lane: 1, fromPos: 20, toPos: 40 },
      ],
      turnouts: [{ id: "sw1", pos: 20, onTrack: "main", divergeTrack: "s" }],
    };
    const c = docToGraph(doc, { turnoutPartId: "atlas-c55-n-7" });
    expect(c.refused).toBeNull();
    // The piece's tie end is frogOffset west of pos — nothing else would put the
    // frog on 20.
    expect(c.graph!.pieces.find((p) => p.id === "t-sw1")!.x).toBeCloseTo(20 - 4.21875, 6);
    const out = graphToDoc(c.graph!.pieces, { startAt: c.graph!.startAt, base: doc });
    expect(out.doc.turnouts![0].pos).toBeCloseTo(20, 6);
  });
});

// ⚠️ FOUND DRIVING THE DEPLOYED APP on FMN-0078. A crossover connector runs
// DIAGONALLY between the two mains; it never comes parallel to a lane, so the
// transition curve that straightens a siding onto its lane asked for a 0.3″
// radius here and then reported the crossover as impossible to build.
describe("a crossover connector is laid straight between the mains", () => {
  const doubleMain = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 },
      { id: "main2", role: "main", lane: 1, fromPos: 0, toPos: 96 },
      { id: "xoA", role: "crossover", lane: 1, fromPos: 40, toPos: 42.5, trackName: "Crossover" },
    ],
    turnouts: [
      { id: "sw1", pos: 40, onTrack: "main", divergeTrack: "xoA" },
      { id: "sw2", pos: 42.5, onTrack: "main2", divergeTrack: "xoA" },
    ],
  });

  it("lays the connector, with no transition curve and no wild radius", () => {
    const c = docToGraph(doubleMain(), { turnoutPartId: "atlas-c55-n-7" });
    expect(c.refused).toBeNull();
    expect(c.notLaid).toEqual([]);
    expect(c.warnings).toEqual([]);
    const conn = c.graph!.pieces.find((p) => p.id === "x-xoA")!;
    expect(conn).toBeTruthy();
    // Straight: a crossover connector has no radius at all.
    expect(conn.radiusInches).toBeUndefined();
    expect(conn.lengthInches).toBeGreaterThan(0);
  });

  it("lands exactly on both turnouts' diverging joints", () => {
    const c = docToGraph(doubleMain(), { turnoutPartId: "atlas-c55-n-7" });
    const g = buildTrackGraph(c.graph!.pieces);
    const joined = new Set(g.connections.flatMap((x) => [x.a, x.b]));
    expect(joined.has("x-xoA.a")).toBe(true);
    expect(joined.has("x-xoA.b")).toBe(true);
    expect(g.conflicts).toEqual([]);
  });
});

// ⚠️⚠️ FOUND BY APPLYING THE REBUILD ON THE DEPLOYED APP (FMN-0078). Two Atlas
// #7s 2.5″ apart have overlapping 6″ mouldings. `flexPieces` MERGES overlapping
// occupied spans by design, so nothing complained: the pieces were left
// intersecting and the walk threaded a path through geometry that cannot exist,
// emitting two turnouts at 91.9″ and calling the crossovers sidings. A silently
// wrong module is the worst failure this whole design exists to avoid.
describe("two turnouts cannot share an inch of track", () => {
  const scissors = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 },
      { id: "main2", role: "main", lane: 1, fromPos: 0, toPos: 96 },
      { id: "xoA", role: "crossover", lane: 1, fromPos: 40, toPos: 42.5, trackName: "Crossover" },
      { id: "xoB", role: "crossover", lane: 1, fromPos: 40, toPos: 42.5, trackName: "Crossover" },
    ],
    turnouts: [
      { id: "sw1", pos: 40, name: "Crossover", onTrack: "main", divergeTrack: "xoA" },
      { id: "sw2", pos: 42.5, name: "Crossover", onTrack: "main2", divergeTrack: "xoA" },
      { id: "sw3", pos: 42.5, name: "Crossover", onTrack: "main", divergeTrack: "xoB" },
      { id: "sw4", pos: 40, name: "Crossover", onTrack: "main2", divergeTrack: "xoB" },
    ],
  });

  it("refuses the overlapping pair and says why, instead of emitting nonsense", () => {
    const c = docToGraph(scissors(), { turnoutPartId: "atlas-c55-n-7" });
    expect(c.refused).toBeNull();
    expect(c.notLaid.length).toBeGreaterThan(0);
    // ⭐ It is a CROSSOVER, so the message must not blame the owner's track:
    // a double crossover is one assembly whose point-sets legitimately sit
    // closer than two separate turnouts could.
    expect(c.notLaid[0].why).toMatch(/one assembly, not/);
    expect(c.notLaid[0].why).not.toMatch(/mouldings would overlap/);
    // Neither of the clashing turnouts is laid — half a scissors is not a thing.
    const ids = c.graph!.pieces.map((p) => p.id);
    expect(ids).not.toContain("t-sw1");
    expect(ids).not.toContain("t-sw3");
  });

  it("still lays the two mains, and emits no turnout nobody placed", () => {
    const c = docToGraph(scissors(), { turnoutPartId: "atlas-c55-n-7" });
    const out = graphToDoc(c.graph!.pieces, {
      startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: scissors(),
    });
    expect(out.doc.tracks.filter((t) => t.role === "main")).toHaveLength(2);
    expect(out.doc.turnouts ?? []).toEqual([]);
  });

  it("a pair with room between them is untouched", () => {
    const doc = scissors();
    doc.turnouts = [
      { id: "sw1", pos: 20, onTrack: "main", divergeTrack: "xoA" },
      { id: "sw2", pos: 20, onTrack: "main2", divergeTrack: "xoA" },
    ];
    doc.tracks = doc.tracks.filter((t) => t.id !== "xoB");
    const c = docToGraph(doc, { turnoutPartId: "atlas-c55-n-7" });
    expect(c.notLaid).toEqual([]);
    expect(c.graph!.pieces.map((p) => p.id)).toContain("t-sw1");
  });
});

// ⭐⭐ A DOUBLE CROSSOVER IS ONE ASSEMBLY, NOT FOUR TURNOUTS (Will, 2026-07-28).
// Modelling it as four independent turnouts is what collapsed the FMN-0078
// rebuild: two Atlas #7s 2.5″ apart overlap by 3.5″, so the pieces intersected
// and the walk emitted a module nobody has.
describe("a double crossover is one assembly", () => {
  const six = () => trackPart("fast-tracks-n-me55-c-6")!;

  it("is placeable — its geometry was published all along", () => {
    expect(partGeometryGap(six())).toBeNull();
    const g = partGeometry(six())!;
    expect(g.joints.map((j) => j.id).sort()).toEqual(["a1", "a2", "b1", "b2"]);
    // Four routes: straight on either track, and a crossing each way. That is
    // what makes it one moulding rather than four turnouts near each other.
    expect(g.routes).toHaveLength(4);
    expect(g.routes).toContainEqual(["a1", "b2"]);
    expect(g.routes).toContainEqual(["a2", "b1"]);
  });

  // ⚠️ `piecesPerAssembly` counts BUILDS, not length: the two halves SUPERIMPOSE
  // into the scissors, they do not sit end to end. Doubling gave a #6 a 20.14″
  // body with 6.8″ of plain approach moulded on each end.
  it("takes the published length as the assembly, not half of it", () => {
    const a = crossoverAssembly(six())!;
    expect(six().overallLength!.inches).toBeCloseTo(10.07, 6);
    expect(six().piecesPerAssembly).toBe(2);
    expect(a.lengthInches).toBeCloseTo(10.07, 6);
  });

  /**
   * ⭐ THE APPROACH — start of the moulding to the start of the points, which
   * Will named as the measurement that has to be right (2026-07-28). It is what
   * is left over once the crossing run is taken out, and it is where the through
   * routes are jointed.
   *
   * `minimumLength` corroborates the reading independently: the shortest #6
   * build is 9.31″, which comes out as a 1.38″ approach — i.e. "trim the
   * approach as short as the fixture allows". Under the doubled length a
   * *minimum* build would still carry a 6″ approach, which is not a minimum of
   * anything.
   */
  it("leaves a real tie strip before the points, and it grows with the frog", () => {
    const six6 = crossoverAssembly(six())!;
    expect(six6.approachInches).toBeCloseTo(1.764, 3);
    expect(six6.approachInches).toBeCloseTo(six6.pointsAtInches[0], 6);
    const eight = crossoverAssembly(trackPart("fast-tracks-n-me55-c-8")!)!;
    expect(eight.approachInches).toBeCloseTo(2.448, 3);
    expect(eight.approachInches).toBeGreaterThan(six6.approachInches);
    // Length is the approach at each end plus the crossing between them.
    expect(2 * six6.approachInches + six6.crossingRunInches).toBeCloseTo(six6.lengthInches, 6);
  });

  // ⭐ THE FALSIFIER. The scissors X is where the two crossing routes meet, so
  // it must be twice the frog angle. Fast Tracks publish that angle SEPARATELY,
  // so it is an independent reading — if the derivation were wrong these would
  // not agree.
  it("agrees with the separately published scissors angle", () => {
    for (const id of ["fast-tracks-n-me55-c-6", "fast-tracks-n-me55-c-8"]) {
      const p = trackPart(id)!;
      // Within the published rounding: Fast Tracks quote 19° and 14.3° to the
      // tenth, against exact doubles of 18.92° and 14.26°. A tenth of a degree
      // over a 20″ assembly is 0.035″ — below anything drawable.
      expect(Math.abs(2 * p.actualAngle!.deg - p.secondaryFrogAngle!.deg)).toBeLessThanOrEqual(0.1);
    }
  });

  it("puts the two point-sets on one track a crossing-run apart", () => {
    const a = crossoverAssembly(six())!;
    // W = spacing / tan θ. For a #6 at 1.09″ that is 6.54″ — NOT the 2.5″ my
    // own FMN-0078 fixture claimed, which is why it could never be built.
    expect(a.crossingRunInches).toBeCloseTo(6.542, 3);
    expect(a.pointsAtInches[1] - a.pointsAtInches[0]).toBeCloseTo(a.crossingRunInches, 6);
    // Centred, so the scissors lands in the middle of the assembly.
    expect(a.scissorsAtInches).toBeCloseTo(a.lengthInches / 2, 6);
    expect(a.pointsAtInches[0]).toBeCloseTo(1.764, 3);
  });

  // ⭐ The frog is ONE GAUGE of lateral in from the points, so it sits INSIDE
  // the point-set and the pair closes toward the scissors. This is the number a
  // renderer needs: `pos` marks a frog, so a diverging rail drawn from a generic
  // per-frog lead starts in the wrong place and never meets the assembly.
  it("puts each frog one gauge inside its point-set (#FMN-0078)", () => {
    const a = crossoverAssembly(six())!;
    // ⚠️ 2.1245″, not exactly `gauge × N` = 2.124″ — this part publishes its own
    // MEASURED angle, which is a hair off a true 1:6, and the derivation uses it.
    // That is the point of `gauge / tan θ`: it follows the product, not the ratio.
    expect(a.pointsToFrogInches).toBeCloseTo(0.354 * 6, 2);
    expect(a.pointsToFrogInches).toBeCloseTo(
      0.354 / (a.spacingInches / a.crossingRunInches),
      9,
    );
    expect(a.frogsAtInches[0]).toBeCloseTo(a.pointsAtInches[0] + a.pointsToFrogInches, 6);
    expect(a.frogsAtInches[1]).toBeCloseTo(a.pointsAtInches[1] - a.pointsToFrogInches, 6);
    // ⭐ Frog-to-frog is the crossing run less a gauge at EACH end — the #197
    // formula, reached a second, independent way.
    expect(a.frogsAtInches[1] - a.frogsAtInches[0]).toBeCloseTo(
      (a.spacingInches - 2 * 0.354) / (a.spacingInches / a.crossingRunInches),
      9,
    );
    // The real fixture: FMN-0078 centres this assembly on 41.25″, and its four
    // turnouts are authored at 40.104 / 42.396. Those must BE the frogs.
    const centre = 41.25;
    const start = centre - a.lengthInches / 2;
    expect(start + a.frogsAtInches[0]).toBeCloseTo(40.104, 2);
    expect(start + a.frogsAtInches[1]).toBeCloseTo(42.396, 2);
    // …and the point-sets are what the fixture's connector path already carries.
    expect(start + a.pointsAtInches[0]).toBeCloseTo(37.98, 2);
    expect(start + a.pointsAtInches[1]).toBeCloseTo(44.52, 2);
    // The scissors sits midway between the frogs, so each leg is half the run.
    expect(a.scissorsAtInches - a.frogsAtInches[0]).toBeCloseTo(
      a.frogsAtInches[1] - a.scissorsAtInches,
      6,
    );
  });

  // ⚠️ Drawn as a chord, the rail would leave the railhead for most of the
  // assembly and the X would land nowhere near the middle — the sectional-curve
  // mistake arriving by another door.
  it("draws a crossing route as straight-cross-straight, not a diagonal", () => {
    const piece: TrackPiece = {
      id: "x", partId: "fast-tracks-n-me55-c-6", x: 0, y: 0, rotationDeg: 0,
    };
    const paths = pieceRoutePaths(piece);
    const straight = paths.find((p) => p.route[0] === "a1" && p.route[1] === "b1")!;
    expect(straight.points).toHaveLength(2);
    const crossing = paths.find((p) => p.route[0] === "a1" && p.route[1] === "b2")!;
    expect(crossing.points).toHaveLength(4);
    // It stays on its own track until the point-set, then crosses.
    expect(crossing.points[0].y).toBeCloseTo(0, 6);
    expect(crossing.points[1].y).toBeCloseTo(0, 6);
    expect(crossing.points[1].x).toBeCloseTo(1.764, 3);
    expect(crossing.points[2].y).toBeCloseTo(1.09, 6);
    expect(crossing.points[3].x).toBeCloseTo(10.07, 6);
  });

  it("a placed assembly's four joints land where the graph can join them", () => {
    const piece: TrackPiece = {
      id: "x", partId: "fast-tracks-n-me55-c-6", x: 10, y: 0, rotationDeg: 0,
    };
    const js = placedJoints([piece]);
    expect(js).toHaveLength(4);
    expect(js.find((j) => j.joint === "a1")!.x).toBeCloseTo(10, 6);
    expect(js.find((j) => j.joint === "b1")!.x).toBeCloseTo(20.07, 6);
    expect(js.find((j) => j.joint === "a2")!.y).toBeCloseTo(1.09, 6);
  });
});

// ⭐⭐ Rebuilding a module that has a REAL double crossover. Will, 2026-07-28:
// "the code needs to build the double crossover more carefully so it is as clean
// as possible for the 2D and Dispatcher view."
describe("rebuilding a module with a double crossover", () => {
  const XO = "fast-tracks-n-me55-c-6";
  const doc = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 },
      { id: "main2", role: "main", lane: 1, fromPos: 0, toPos: 96 },
      { id: "xoA", role: "crossover", lane: 1, fromPos: 37.98, toPos: 44.52, trackName: "Crossover", crossoverPartId: XO },
      { id: "xoB", role: "crossover", lane: 1, fromPos: 37.98, toPos: 44.52, trackName: "Crossover", crossoverPartId: XO },
    ],
    turnouts: [
      { id: "sw1", pos: 37.98, size: 6, onTrack: "main", divergeTrack: "xoA" },
      { id: "sw2", pos: 44.52, size: 6, onTrack: "main2", divergeTrack: "xoA" },
      { id: "sw3", pos: 37.98, size: 6, onTrack: "main2", divergeTrack: "xoB" },
      { id: "sw4", pos: 44.52, size: 6, onTrack: "main", divergeTrack: "xoB" },
    ],
  });

  // ⭐ The owner already named the product. Asking "which turnout is this?" about
  // its four point-sets — and refusing for want of a measured #6 TURNOUT, which
  // has nothing to do with it — is what used to happen.
  it("asks nothing: the assembly answers for its own point-sets", () => {
    const c = docToGraph(doc());
    expect(c.refused).toBeNull();
    expect(c.notLaid).toEqual([]);
    expect(c.warnings).toEqual([]);
  });

  it("lays ONE assembly, not four turnouts", () => {
    const c = docToGraph(doc());
    const xo = c.graph!.pieces.filter((p) => p.partId === XO);
    expect(xo).toHaveLength(1);
    expect(c.graph!.pieces.some((p) => p.id.startsWith("t-"))).toBe(false);
    // Centred where the document put it: the mean of the recorded point-sets.
    expect(xo[0].x + 10.07 / 2).toBeCloseTo(41.25, 2);
  });

  // ⚠️ THE PINCH. The assembly is 1.09″ wide, the mains run 1.125″ apart, so
  // Main 2 comes in to meet it and goes back out — by construction, not by a
  // special case. NOT a departure from the standard: §2.0 fixes the spacing AT
  // THE ENDPLATE.
  it("brings Main 2 in to meet the assembly and back out again", () => {
    const c = docToGraph(doc());
    const joints = placedJoints(c.graph!.pieces);
    const westIn = joints.find((j) => j.piece === "f-main2-1" && j.joint === "b")!;
    expect(westIn.y).toBeCloseTo(1.09, 6);
    const east = c.graph!.pieces.find((p) => p.id === "f-main2-2")!;
    expect(east.y).toBeCloseTo(1.09, 6);
    // The ease is real but far below anything drawable.
    expect(Math.abs(c.graph!.pieces.find((p) => p.id === "f-main2-1")!.rotationDeg)).toBeLessThan(3);
    // And it JOINS — a pinch that only looked right would leave an open end.
    const g = buildTrackGraph(c.graph!.pieces);
    expect(g.conflicts).toEqual([]);
    expect(g.open).toHaveLength(4); // two mains, two ends each
  });

  it("gives the dispatcher view four turnouts and both crossing moves", () => {
    const c = docToGraph(doc());
    const out = graphToDoc(c.graph!.pieces, {
      startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: doc(),
    });
    expect(out.warnings).toEqual([]);
    const conns = out.doc.tracks.filter((t) => t.role === "crossover");
    expect(conns).toHaveLength(2);
    for (const t of conns) {
      expect(t.crossoverPartId).toBe(XO);
      expect(t.fromPos).toBeCloseTo(37.98, 1);
      expect(t.toPos).toBeCloseTo(44.52, 1);
    }
    const sws = out.doc.turnouts ?? [];
    expect(sws).toHaveLength(4);
    // Two on each main, at each point-set — which is what a scissors is.
    expect(sws.filter((t) => t.onTrack === "main")).toHaveLength(2);
    expect(sws.filter((t) => t.onTrack === "main2")).toHaveLength(2);
    expect(sws.map((t) => Math.round(t.pos * 100) / 100).sort((a, b) => a - b))
      .toEqual([37.98, 37.98, 44.52, 44.52]);
  });

  it("says so when the document's point-sets do not match the product", () => {
    const d = doc();
    // The old FMN-0078 numbers: 2.5″ apart, where a #6 is 6.54″.
    d.turnouts![1].pos = 40.48;
    d.turnouts![3].pos = 40.48;
    const c = docToGraph(d);
    expect(c.warnings.join(" ")).toMatch(/point-sets .* apart, but a .* is 6\.54/);
  });
});

// ⭐ The panel must not ask about a product the owner has already named. It did:
// FMN-0078's crossovers are #6, so the report demanded a measured #6 TURNOUT —
// which has nothing to do with a #6 crossover — while `docToGraph` went ahead
// and laid the assembly without one. The two have to agree.
describe("a crossover's point-sets are already answered", () => {
  const doc = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 },
      { id: "main2", role: "main", lane: 1, fromPos: 0, toPos: 96 },
      { id: "xoA", role: "crossover", lane: 1, fromPos: 37.98, toPos: 44.52, crossoverPartId: "fast-tracks-n-me55-c-6" },
      { id: "xoB", role: "crossover", lane: 1, fromPos: 37.98, toPos: 44.52, crossoverPartId: "fast-tracks-n-me55-c-6" },
    ],
    turnouts: [
      { id: "sw1", pos: 37.98, size: 6, onTrack: "main", divergeTrack: "xoA" },
      { id: "sw2", pos: 44.52, size: 6, onTrack: "main2", divergeTrack: "xoA" },
      { id: "sw3", pos: 37.98, size: 6, onTrack: "main2", divergeTrack: "xoB" },
      { id: "sw4", pos: 44.52, size: 6, onTrack: "main", divergeTrack: "xoB" },
    ],
  });

  it("asks nothing, and says the assembly is what answered", () => {
    const r = moduleConversionReport(doc());
    expect(r.unanswered).toEqual([]);
    expect(r.readyWithoutAsking).toBe(true);
    for (const t of r.turnouts) {
      expect(t.from).toBe("assembly");
      expect(t.partId).toBe("fast-tracks-n-me55-c-6");
      expect(t.why).toBeNull();
    }
  });

  it("still asks about an ordinary turnout on the same module", () => {
    const d = doc();
    d.tracks.push({ id: "spur", role: "spur", lane: 2, fromPos: 60, toPos: 80 });
    d.turnouts!.push({ id: "sw9", pos: 60, onTrack: "main", divergeTrack: "spur" });
    const r = moduleConversionReport(d);
    expect(r.unanswered).toEqual(["sw9"]);
  });

  // The report and the conversion must not disagree about what is needed.
  it("agrees with what docToGraph actually requires", () => {
    expect(moduleConversionReport(doc()).readyWithoutAsking).toBe(true);
    expect(docToGraph(doc()).refused).toBeNull();
  });
});

// ⭐ The last question ADR 0002 left open: what an owner does when they cannot
// say what a turnout is. Across the production database 35 turnouts state no
// part and no frog number, so "we simply don't convert" blocks most of it.
describe("a placeholder for a turnout nobody has identified", () => {
  const doc = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0 },
      { id: "sp", role: "spur", lane: 1, fromPos: 20, toPos: 60, trackName: "Team Track" },
    ],
    turnouts: [{ id: "sw1", pos: 20, onTrack: "main", divergeTrack: "sp" }],
  });

  it("is the turnout's working geometry — no moulding in front of the points", () => {
    const p = genericTurnoutPart(6);
    expect(p.pointsOffset!.inches).toBe(0);
    // Points offset is the one dimension a frog number cannot yield: the
    // measured #5/#7/#10 read 1.75/0.625/0.5625, which is moulding, not geometry.
    expect(p.frogOffset!.inches).toBeCloseTo(p.lead!.inches, 6);
    expect(p.overallLength!.inches).toBeCloseTo(
      leadInchesForSize(6) + pastFrogInchesForSize(6), 6,
    );
  });

  it("says its shape is derived, and declines to claim a body", () => {
    const p = genericTurnoutPart(6);
    for (const d of [p.pointsOffset, p.lead, p.frogOffset, p.overallLength])
      expect(d!.source).toBe("derived");
    expect(partGeometry(p)!.source).toBe("derived");
    // ⭐ `partExtent` requires MEASURED dimensions, so it returns null and no
    // renderer draws a boundary saying "this is where your turnout ends".
    expect(partExtent(p)).toBeNull();
  });

  // ⛔ THE HALF THAT MATTERS MOST. A stand-in is something an owner CHOOSES.
  it("is never adopted automatically for a bare frog number", () => {
    const d = doc();
    d.turnouts![0].size = 6;
    const r = moduleConversionReport(d);
    expect(r.turnouts[0].partId).toBeNull();
    expect(r.turnouts[0].why).toMatch(/no measured #6/);
    expect(r.turnouts[0].candidates).not.toContain("generic-turnout-6");
    expect(r.unanswered).toEqual(["sw1"]);
    // …and nothing derived from a frog number quietly uses one either.
    expect(turnoutPartForSize(6)?.provisional).toBeFalsy();
    expect(leadInchesForSize(7)).toBeCloseTo(3.59375, 6); // the measured Atlas #7
  });

  it("converts the module when the owner picks one", () => {
    const c = docToGraph(doc(), { turnoutPartId: "generic-turnout-6" });
    expect(c.refused).toBeNull();
    expect(c.notLaid).toEqual([]);
    const piece = c.graph!.pieces.find((p) => p.id === "t-sw1")!;
    expect(piece.partId).toBe("generic-turnout-6");
  });

  it("leaves the document saying it is a stand-in, so it can be corrected", () => {
    const c = docToGraph(doc(), { turnoutPartId: "generic-turnout-6" });
    const out = graphToDoc(c.graph!.pieces, { startAt: c.graph!.startAt, base: doc() });
    const sw = out.doc.turnouts![0];
    expect(sw.partId).toBe("generic-turnout-6");
    expect(sw.size).toBe(6);
    // Round-trips back to a report that still knows it was answered by a
    // placeholder — the owner's uncertainty is not lost by converting.
    const again = moduleConversionReport(out.doc);
    expect(again.turnouts[0].partId).toBe("generic-turnout-6");
    expect(again.turnouts[0].from).toBe("named");
  });
});

// ⚠️⚠️ FOUND BY CONVERTING FMN-0075 ON THE DEPLOYED APP, and now supported. A
// transition module's second main BEGINS at a turnout. Both mains are laid as
// their own runs from endplate A, so that turnout reached nothing, `graphToDoc`
// dropped it, and the module came out with no turnout at all — after a preview
// that promised "1 turnout" and raised no warning. The branch pass never looked,
// because a main is laid before it runs.
describe("a main that begins at a turnout", () => {
  const transition = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 48,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0 },
      { id: "main2", role: "main", lane: 1, fromPos: 9, toPos: 36 },
    ],
    turnouts: [{ id: "sw2", pos: 9, name: "End of Double Track", onTrack: "main", divergeTrack: "main2" }],
  });

  const built = () => {
    const c = docToGraph(transition(), { turnoutPartId: "atlas-c55-n-7" });
    expect(c.refused).toBeNull();
    expect(c.notLaid).toEqual([]);
    return c;
  };

  it("lays the second main off its turnout, and joins it", () => {
    const c = built();
    // ⭐ `start2` is the TURNOUT'S DIVERGING END, not a joint out at the
    // endplate — this main does not cross one.
    expect(c.graph!.start2).toEqual({ piece: "t-sw2", joint: "diverge" });
    const g = buildTrackGraph(c.graph!.pieces);
    expect(g.conflicts).toEqual([]);
    // Main 1's two endplate ends, and Main 2's far end. Nothing dangling.
    expect(g.open).toHaveLength(3);
  });

  it("comes back out as a MAIN, with the turnout that opens it", () => {
    const c = built();
    const out = graphToDoc(c.graph!.pieces, {
      startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: transition(),
    });
    expect(out.warnings).toEqual([]);
    const m2 = out.doc.tracks.find((t) => t.id === "main2")!;
    expect(m2.role).toBe("main");
    expect(m2.lane).toBe(1);
    expect(m2.fromPos).toBeCloseTo(9, 1);
    expect(m2.toPos).toBeCloseTo(36, 1);
    // ⚠️ It does NOT cross the endplates, so it must not claim to: saying A→B
    // would tell the catalogue the module presents two tracks at an end where
    // it presents one.
    expect(m2.from).toBeUndefined();
    expect(m2.to).toBeUndefined();
    // And the turnout is there, opening it — the thing that used to vanish.
    expect(out.doc.turnouts).toHaveLength(1);
    expect(out.doc.turnouts![0].onTrack).toBe("main");
    expect(out.doc.turnouts![0].divergeTrack).toBe("main2");
    expect(out.doc.turnouts![0].pos).toBeCloseTo(9, 6);
  });

  it("does not report the two mains as one run", () => {
    const c = built();
    const out = graphToDoc(c.graph!.pieces, {
      startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: transition(),
    });
    // The collision check is about two STARTS landing on one run; a branch-born
    // Main 2 is inside walk 1 by design.
    expect(out.warnings.join(" ")).not.toMatch(/one run, not two/);
  });

  // ⚠️ THE MIRROR SHAPE, and the commoner one — four production modules. Main 2
  // runs FROM the endplate and ENDS at the turnout (double becoming single), so
  // walk 1 reaches it through the turnout's diverging leg while walk 2 reaches
  // it from the endplate. Treating that as a collision dropped Main 2 and
  // re-emitted it as a spur named after its own closing curve.
  const doubleToSingle = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 48,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "main2", role: "main", lane: 1, fromPos: 0, toPos: 17.4 },
    ],
    turnouts: [{ id: "sw1", pos: 17.4, onTrack: "main", divergeTrack: "main2" }],
  });

  it("closes a main that ENDS at a turnout, and keeps it a main", () => {
    const c = docToGraph(doubleToSingle(), { turnoutPartId: "atlas-c55-n-7" });
    expect(c.refused).toBeNull();
    expect(c.notLaid).toEqual([]);
    const g = buildTrackGraph(c.graph!.pieces);
    expect(g.conflicts).toEqual([]);
    expect(g.open).toHaveLength(3);
    const out = graphToDoc(c.graph!.pieces, {
      startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: doubleToSingle(),
    });
    expect(out.warnings.join(" ")).not.toMatch(/one run, not two/);
    const m2 = out.doc.tracks.find((t) => t.id === "main2")!;
    expect(m2.role).toBe("main");
    expect(m2.fromPos).toBeCloseTo(0, 6);
    expect(m2.toPos).toBeCloseTo(17.4, 1);
    // ⭐ And it is not ALSO emitted as a spur under the branch's own name.
    expect(out.doc.tracks.filter((t) => t.role === "spur" || t.role === "siding")).toEqual([]);
    expect(out.doc.turnouts![0].divergeTrack).toBe("main2");
  });

  /**
   * ⭐⭐ TWO TURNOUTS JOINING THE MAINS, WITH NO CONNECTOR TRACK RECORDED —
   * ELM Yard. Will, 2026-07-28: it might not be a manufactured assembly at all;
   * "the builder/owner used turnouts and a piece of track between the diverging
   * routes." The document does not say which, and the difference is real, so the
   * DISCRETE build is the default because it is what the document literally
   * describes and it invents least.
   *
   * ELM Yard's own numbers agree: its two turnouts are 6.0″ apart, where a #6
   * assembly's crossing run is 6.75″ and a #5's is 5.63″.
   */
  const bareCrossover = (): ModuleSchematicDoc => ({
    version: 1, lengthInches: 96,
    endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
    tracks: [
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
    ],
    turnouts: [
      { id: "sw7", pos: 40, name: "Crossover 1", onTrack: "main", divergeTrack: "main2" },
      { id: "sw8", pos: 34, name: "Crossover 2", onTrack: "main2", divergeTrack: "main" },
    ],
  });

  it("lays two turnouts and cuts a connector between them", () => {
    const c = docToGraph(bareCrossover(), { turnoutPartId: "atlas-c55-n-7" });
    expect(c.refused).toBeNull();
    expect(c.notLaid).toEqual([]);
    // A piece of flex, not a crossover product — because no product was named.
    const conn = c.graph!.pieces.find((p) => p.id.startsWith("xc-"))!;
    expect(conn).toBeTruthy();
    expect(conn.partId).toBe("atlas-c55-n-flex");
    const g = buildTrackGraph(c.graph!.pieces);
    expect(g.conflicts).toEqual([]);
    expect(g.open).toHaveLength(4); // two mains, two ends each
  });

  /**
   * ⭐ A SINGLE CROSSOVER RAISES NO QUESTION, so it says nothing.
   *
   * Will, 2026-07-28: "It might not be a double crossover, but could be a RH or
   * LH single crossover." A single crossover simply IS a turnout on each main
   * with a connector between them — there is no one-piece product it might have
   * been instead, so telling an owner to "name the product" would send them
   * looking for a thing that does not exist.
   */
  it("says nothing about a single crossover — there is nothing to correct", () => {
    const c = docToGraph(bareCrossover(), { turnoutPartId: "atlas-c55-n-7" });
    expect(c.warnings.join(" ")).not.toMatch(/name the product/);
  });

  // ⚠️ A SCISSORS is the one that might be a single moulding (ADR 0003), so the
  // discrete reading of an ambiguous document IS worth disclosing.
  it("discloses the reading only for a scissors — four turnouts, two crossings", () => {
    const doc = bareCrossover();
    doc.turnouts!.push(
      { id: "sw9", pos: 60, name: "Crossover 3", onTrack: "main", divergeTrack: "main2" },
      { id: "sw10", pos: 66, name: "Crossover 4", onTrack: "main2", divergeTrack: "main" },
    );
    const c = docToGraph(doc, { turnoutPartId: "atlas-c55-n-7" });
    const w = c.warnings.join(" ");
    expect(w).toMatch(/a double crossover/);
    expect(w).toMatch(/name the product on a connector track/);
  });

  // ⚠️ Each half must diverge TOWARD the other. Its diverging track is a MAIN,
  // whose ends are the whole module, so the ordinary far-end rule has nothing
  // useful to sign and pointed it away from the turnout it feeds.
  it("faces the two halves at each other", () => {
    const c = docToGraph(bareCrossover(), { turnoutPartId: "atlas-c55-n-7" });
    const out = graphToDoc(c.graph!.pieces, {
      startAt: c.graph!.startAt, start2: c.graph!.start2 ?? null, base: bareCrossover(),
    });
    const conn = out.doc.tracks.find((t) => t.role === "crossover")!;
    expect(conn).toBeTruthy();
    // Its extent is its turnouts' positions — 34→40, not the arc length one
    // walk accumulated, because each walk only knows its OWN turnouts.
    expect(conn.fromPos).toBeCloseTo(34, 1);
    expect(conn.toPos).toBeCloseTo(40, 1);
    // And it lies BETWEEN the mains, not out past them.
    expect(conn.lane).toBe(1);
    expect((out.doc.turnouts ?? []).map((t) => t.divergeTrack)).toEqual([conn.id, conn.id]);
  });

  // ⚠️ An ordinary crossover's turnouts open a CONNECTOR, not a main, and must
  // not be mistaken for this shape.
  it("leaves a crossover alone — its turnouts open a connector, not a main", () => {
    const r = moduleConversionReport({
      version: 1, lengthInches: 96,
      endplates: [{ id: "A", label: "West" }, { id: "B", label: "East" }],
      tracks: [
        { id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 },
        { id: "main2", role: "main", lane: 1, fromPos: 0, toPos: 96 },
        { id: "xoA", role: "crossover", lane: 1, fromPos: 37.98, toPos: 44.52, crossoverPartId: "fast-tracks-n-me55-c-6" },
      ],
      turnouts: [
        { id: "sw1", pos: 37.98, onTrack: "main", divergeTrack: "xoA" },
        { id: "sw2", pos: 44.52, onTrack: "main2", divergeTrack: "xoA" },
      ],
    });
    expect(r.blockers).toEqual([]);
    expect(r.offerable).toBe(true);
  });
});

describe("implicitCrossings", () => {
  /** FMN-0078's shape: a 96″ double main, and a spur dropped off Main 1 that the
   * editor stacked at lane 3 — beyond Main 2 (Will, 2026-07-30). */
  const doubleMain = (extra: Partial<ModuleSchematicDoc> = {}): ModuleSchematicDoc => ({
    version: 1,
    module: "FMN-0078",
    lengthInches: 96,
    endplates: [
      { id: "A", label: "West", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
      { id: "B", label: "East", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
    ],
    tracks: [
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
    ],
    turnouts: [],
    ...extra,
  });

  /** A left-hand turnout on Main 1 throws its route to Main 2's side, so the
   * route has to cross Main 2 — and nothing in the document says so. */
  const crossesMain2 = doubleMain({
    tracks: [
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
      { id: "spur1", role: "spur", lane: 3, fromPos: 60, toPos: 71.5 },
    ],
    turnouts: [{ id: "sw5", pos: 60, onTrack: "main", divergeTrack: "spur1", kind: "left" }],
  });

  /**
   * FMN-0068's real shape: a route to a placed 3rd endplate, pinned UP, off a
   * RIGHT-hand turnout, with Main 2 sitting DOWN at lane −1.
   *
   * ⭐ Its along-module extent is DEGENERATE — `fromPos === toPos` — because the
   * route runs across the board. That is what made `resolveLane` ask the hand
   * which way it throws (it said "down", lane −2) while `branchConnectors` read
   * the endplate's own `side: "up"` and said +2. The crossing check believed the
   * hand and told the owner their route crossed Main 2 when it runs the other way.
   */
  const routeToEndplateUp = (side: "up" | "down"): ModuleSchematicDoc => ({
    version: 1,
    module: "FMN-0068",
    lengthInches: 47.9,
    endplates: [
      { id: "A", label: "West", tracks: [{ trackId: "main", lane: 0, config: "double" }] },
      { id: "B", label: "East", tracks: [{ trackId: "main", lane: 0, config: "single" }] },
      {
        id: "C", label: "Branch 1", kind: "branch", trackId: "branch1",
        at: { pos: 14, side },
        tracks: [{ trackId: "main", lane: 0, config: "single" }],
      },
    ],
    tracks: [
      { id: "main", role: "main", lane: 0, from: "A", to: "B" },
      { id: "main2", role: "main", lane: -1, fromPos: 0, toPos: 36 },
      {
        id: "branch1", role: "branch", lane: 2, fromPos: 27.8, toPos: 27.8,
        trackName: "To endplate C",
        path: [{ x: 26.28, y: 0.61 }, { x: 18, y: 2.35 }, { x: 11.91, y: 8 }, { x: 11.91, y: 12 }],
      },
    ],
    turnouts: [{ id: "sw2", pos: 27.8, onTrack: "main", divergeTrack: "branch1", kind: "right", size: 6 }],
  });

  it("a route pinned to an UP endplate does not report against a DOWN Main 2", () => {
    // Will, 2026-07-31, on the real FMN-0068: "it looks just fine and is joined
    // to the diverging route off of Main 1, not Main 2." The endplate says up,
    // the drawn path goes up; the turnout's HAND is not what decides this.
    expect(implicitCrossings(routeToEndplateUp("up"))).toEqual([]);
  });

  it("...but still reports when the endplate really is on Main 2's side", () => {
    // ⭐ The other half, so this is not just "the check went quiet". Pin the same
    // route DOWN and Main 2 at lane −1 genuinely sits between it and the main.
    const out = implicitCrossings(routeToEndplateUp("down"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      turnoutId: "sw2",
      trackId: "branch1",
      crossesTrackId: "main2",
      lane: -1,
      fromLane: 0,
      toLane: -2,
    });
  });

  it("reports a spur drawn across Main 2", () => {
    expect(implicitCrossings(crossesMain2)).toEqual([
      {
        turnoutId: "sw5",
        trackId: "spur1",
        crossesTrackId: "main2",
        lane: 1,
        fromLane: 0,
        toLane: 3,
        atInches: 60,
      },
    ]);
  });

  it("reports the THROAT, not a position for the diamond", () => {
    // The turnout is at 60; the diamond is some lead beyond it, a distance this
    // document does not carry. Naming one would be inventing a measurement.
    expect(implicitCrossings(crossesMain2)[0].atInches).toBe(60);
  });

  it("says nothing when the same turnout is right-handed", () => {
    // The hand — not the stored lane — decides the drawn side, so a right-hand
    // turnout puts the identical lane-3 spur BELOW the mains, crossing nothing.
    const rh = doubleMain({
      tracks: crossesMain2.tracks,
      turnouts: [{ id: "sw5", pos: 60, onTrack: "main", divergeTrack: "spur1", kind: "right" }],
    });
    expect(moduleFeatures(rh).extraTracks[0].lane).toBe(-3);
    expect(implicitCrossings(rh)).toEqual([]);
  });

  it("is silenced by a crossing the owner has already declared", () => {
    const declared = {
      ...crossesMain2,
      crossings: [{ id: "x1", pos: 63, tracks: ["spur1", "main2"] as [string, string] }],
    };
    expect(implicitCrossings(declared)).toEqual([]);
  });

  it("never reports a crossover — its two mains are adjacent", () => {
    const xo = doubleMain({
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
        { id: "xoA", role: "crossover", lane: 1, fromPos: 40.104, toPos: 42.396 },
      ],
      turnouts: [
        { id: "sw1", pos: 40.104, onTrack: "main", divergeTrack: "xoA", kind: "left" },
        { id: "sw2", pos: 42.396, onTrack: "main2", divergeTrack: "xoA", kind: "right" },
      ],
    });
    expect(implicitCrossings(xo)).toEqual([]);
  });

  it("never reports a double crossover's scissors — that is one assembly", () => {
    // Its two connectors cross each other INSIDE the part; there is no diamond
    // for an owner to author (ADR: a double crossover is one assembly).
    const scissors = doubleMain({
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
        { id: "xoA", role: "crossover", lane: 1, fromPos: 40.104, toPos: 42.396 },
        { id: "xoB", role: "crossover", lane: 1, fromPos: 40.104, toPos: 42.396 },
      ],
      turnouts: [
        { id: "sw1", pos: 40.104, onTrack: "main", divergeTrack: "xoA", kind: "left" },
        { id: "sw2", pos: 42.396, onTrack: "main2", divergeTrack: "xoA", kind: "right" },
        { id: "sw3", pos: 40.104, onTrack: "main2", divergeTrack: "xoB", kind: "right" },
        { id: "sw4", pos: 42.396, onTrack: "main", divergeTrack: "xoB", kind: "left" },
      ],
    });
    expect(implicitCrossings(scissors)).toEqual([]);
  });

  it("never reports a yard ladder — each rung hangs off the track one lane in", () => {
    // ELM Yard's real shape: nothing sits between a rung and its parent.
    const ladder = doubleMain({
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "main2", role: "main", lane: 1, from: "A", to: "B" },
        { id: "yd1", role: "spur", lane: 2, fromPos: 30, toPos: 80 },
        { id: "yd2", role: "spur", lane: 3, fromPos: 36, toPos: 80 },
      ],
      turnouts: [
        { id: "sw1", pos: 30, onTrack: "main2", divergeTrack: "yd1", kind: "right" },
        { id: "sw2", pos: 36, onTrack: "yd1", divergeTrack: "yd2", kind: "left" },
      ],
    });
    expect(implicitCrossings(ladder)).toEqual([]);
  });

  it("does not report a track that isn't there — a siding ending short of the throat", () => {
    const shortSiding: ModuleSchematicDoc = {
      version: 1,
      lengthInches: 96,
      endplates: [
        { id: "A", tracks: [{ trackId: "main", lane: 0, config: "single" }] },
        { id: "B", tracks: [{ trackId: "main", lane: 0, config: "single" }] },
      ],
      tracks: [
        { id: "main", role: "main", lane: 0, from: "A", to: "B" },
        { id: "sid1", role: "siding", lane: 2, fromPos: 0, toPos: 30 },
        { id: "spur1", role: "spur", lane: 3, fromPos: 60, toPos: 71.5 },
      ],
      turnouts: [{ id: "sw1", pos: 60, onTrack: "main", divergeTrack: "spur1", kind: "left" }],
    };
    expect(implicitCrossings(shortSiding)).toEqual([]);
  });
});


describe("crossing geometry (the diamond)", () => {
  /** A crossing as a real product states it: an angle and an end-to-end length.
   * ⚠️ Numbers chosen for the test, not measured off anything — the library
   * ships NO crossing until someone measures one, which is the point. */
  const measured: TrackPart = {
    id: "test-crossing-19", manufacturer: "Test", line: "Code 55", scale: "N",
    name: "19° Crossing", kind: "crossing",
    actualAngle: { deg: 19, source: "manufacturer" },
    overallLength: { inches: 2.5, source: "measured" },
  };
  const byFrog: TrackPart = {
    id: "test-crossing-6", manufacturer: "Test", line: "Code 55", scale: "N",
    name: "#6 Crossing", kind: "crossing",
    frogNumber: 6,
    overallLength: { inches: 6, source: "measured" },
  };

  it("takes its angle from the frog number as atan(1/N), exactly", () => {
    // The SAME frogSlope = 1/N the rest of the library uses — not a second
    // definition of what a #6 means.
    expect(crossingAngleDeg(byFrog)).toBeCloseTo((Math.atan(1 / 6) * 180) / Math.PI, 10);
    expect(crossingAngleDeg(byFrog)).toBeCloseTo(9.4623, 3);
  });

  it("prefers a published angle over the frog number", () => {
    // Atlas and Peco sell a crossing BY its angle; a part that states one is not
    // second-guessed from a ratio it may not have been built to.
    expect(crossingAngleDeg({ ...measured, frogNumber: 6 })).toBe(19);
  });

  it("says what is missing rather than guessing it", () => {
    const bare: TrackPart = {
      id: "x", manufacturer: "m", line: "l", scale: "N", name: "n", kind: "crossing",
    };
    expect(crossingAngleDeg(bare)).toBeNull();
    expect(partGeometryGap(bare)).toMatch(/no crossing angle/);
    expect(partGeometryGap({ ...bare, frogNumber: 6 })).toMatch(/no overall length/);
    expect(partGeometry(bare)).toBeNull();
  });

  it("⭐ has FOUR ends and TWO routes that never meet — the definition of a diamond", () => {
    const g = partGeometry(measured)!;
    expect(g.joints).toHaveLength(4);
    expect(g.routes).toEqual([["a1", "a2"], ["b1", "b2"]]);
    // The falsifier: no route joins the two tracks. A crossover's four ends ARE
    // joined that way, and that difference is the whole distinction.
    const joinsTracks = g.routes.some(([p, q]) => p.startsWith("a") !== q.startsWith("a"));
    expect(joinsTracks).toBe(false);
    expect(g.joints.every((j) => j.role === "crossingEnd")).toBe(true);
  });

  it("crosses at the middle, with both routes the same length", () => {
    const g = partGeometry(measured)!;
    const L = measured.overallLength!.inches;
    const by = (id: string) => g.joints.find((j) => j.id === id)!;
    // Route A along +x from the tie end, as every part in this library is framed.
    expect(by("a1")).toMatchObject({ x: 0, y: 0 });
    expect(by("a2")).toMatchObject({ x: L, y: 0 });
    // Route B is the same length, measured along its own rail...
    expect(Math.hypot(by("b2").x - by("b1").x, by("b2").y - by("b1").y)).toBeCloseTo(L, 10);
    // ...and its midpoint is route A's midpoint: they cross where they cross.
    expect((by("b1").x + by("b2").x) / 2).toBeCloseTo(L / 2, 10);
    expect((by("b1").y + by("b2").y) / 2).toBeCloseTo(0, 10);
  });

  it("leaves each end pointing along its own rail", () => {
    const g = partGeometry(measured)!;
    const by = (id: string) => g.joints.find((j) => j.id === id)!;
    expect(by("a1").angleDeg).toBe(180);
    expect(by("a2").angleDeg).toBe(0);
    expect(by("b1").angleDeg).toBeCloseTo(199, 10);
    expect(by("b2").angleDeg).toBeCloseTo(19, 10);
  });

  it("reports a frog-number angle as DERIVED however well measured the length is", () => {
    // So a caller can tell "we know this crossing" from "we worked its angle
    // out from a ratio".
    expect(partGeometry(byFrog)!.source).toBe("derived");
    expect(partGeometry(measured)!.source).toBe("manufacturer");
  });

  it("places into the graph like any other piece", () => {
    const library = [...BUILT_IN_TRACK_PARTS, measured];
    const joints = placedJoints(
      [{ id: "x1", partId: measured.id, x: 10, y: 4, rotationDeg: 90 }],
      library,
    );
    expect(joints).toHaveLength(4);
    const a1 = joints.find((j) => j.joint === "a1")!;
    const a2 = joints.find((j) => j.joint === "a2")!;
    expect(a1.x).toBeCloseTo(10, 10);
    expect(a1.y).toBeCloseTo(4, 10);
    // Turned 90°, route A runs up the board rather than along it.
    expect(a2.x).toBeCloseTo(10, 10);
    expect(a2.y).toBeCloseTo(4 + measured.overallLength!.inches, 10);
  });

  it("⛔ ships no generic diamond — a placeholder's arm would be a made-up number", () => {
    // A placeholder turnout interpolates from turnouts we HAVE measured; there
    // is no measured crossing to interpolate from. See the note by
    // GENERIC_TURNOUTS: angle is geometry, everything else is tooling.
    expect(BUILT_IN_TRACK_PARTS.filter((p) => p.kind === "crossing")).toEqual([]);
  });
});

describe("a second bend on one edge — the S a length of flex makes", () => {
  const chord: BenchworkPoint[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }];
  const offAxis = (pts: { x: number; y: number }[]) => pts.map((p) => p.y);

  it("⛔ absent bulgeEnd draws EXACTLY what it always drew", () => {
    // The regression that matters: every stored document and benchwork outline
    // keeps its shape, sampled by the same branch as before.
    const arc = samplePath([{ x: 0, y: 0, bulge: 2 }, { x: 12, y: 0 }]);
    expect(arc.length).toBeGreaterThan(2);
    // A circular arc through (0,0) and (12,0) bowing 2 at the middle.
    const mid = arc[Math.floor(arc.length / 2)];
    expect(mid.x).toBeCloseTo(6, 6);
    expect(Math.abs(mid.y)).toBeCloseTo(2, 6);
  });

  it("bows the same distance as the arc when both bends match", () => {
    // `bulge` must not change meaning depending on which branch draws it.
    const cubic = samplePath([{ x: 0, y: 0, bulge: 2, bulgeEnd: 2 }, { x: 12, y: 0 }]);
    const mid = cubic[Math.floor(cubic.length / 2)];
    expect(mid.x).toBeCloseTo(6, 6);
    expect(Math.abs(mid.y)).toBeCloseTo(2, 6);
  });

  it("⭐ equal and opposite bends give an S — it crosses the chord in the middle", () => {
    const s = samplePath([{ x: 0, y: 0, bulge: 2, bulgeEnd: -2 }, { x: 12, y: 0 }]);
    const ys = offAxis(s);
    // Crosses at the midpoint...
    const mid = s[Math.floor(s.length / 2)];
    expect(mid.x).toBeCloseTo(6, 6);
    expect(mid.y).toBeCloseTo(0, 6);
    // ...and the two halves lie on OPPOSITE sides, which is the whole point.
    const firstHalf = ys.slice(1, Math.floor(ys.length / 2));
    const secondHalf = ys.slice(Math.floor(ys.length / 2) + 1, -1);
    expect(Math.min(...firstHalf)).toBeGreaterThan(0);
    expect(Math.max(...secondHalf)).toBeLessThan(0);
  });

  it("⭐ has no corner in it, where two arcs stuck together do", () => {
    /**
     * The reason the S is ONE edge and not two.
     *
     * An absolute threshold would only measure how finely the curve is sampled,
     * so this measures the SHAPE of the turning instead: on a smooth curve every
     * vertex turns by about the same amount, and a corner is one vertex turning
     * far more than its neighbours. `max / mean` says which you have.
     */
    const turns = (pts: { x: number; y: number }[]) => {
      const out: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
        const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
        out.push(Math.abs(((b - a) * 180) / Math.PI));
      }
      return out;
    };
    const peak = (pts: { x: number; y: number }[]) => {
      const t = turns(pts);
      const mean = t.reduce((a, b) => a + b, 0) / t.length;
      return Math.max(...t) / mean;
    };

    // ⚠️ MEASURED, NOT ASSUMED. Two opposing arcs are NOT automatically kinked:
    // over equal chords with equal and opposite bulges they meet at mirrored
    // tangents and are perfectly smooth. That is the one configuration where
    // the old model could draw an S properly.
    const symmetric = samplePath(
      [{ x: 0, y: 0, bulge: 1 }, { x: 6, y: 0, bulge: -1 }, { x: 12, y: 0 }],
      48,
    );
    expect(peak(symmetric)).toBeLessThan(2);

    // ⭐ But it is the ONLY one, and it is not a shape a hand-drag lands on.
    // Move either handle off it and a real corner appears at the join.
    const unevenBulges = samplePath(
      [{ x: 0, y: 0, bulge: 1 }, { x: 6, y: 0, bulge: -2 }, { x: 12, y: 0 }],
      48,
    );
    const unevenChords = samplePath(
      [{ x: 0, y: 0, bulge: 1 }, { x: 4, y: 0, bulge: -1 }, { x: 12, y: 0 }],
      48,
    );
    expect(peak(unevenBulges)).toBeGreaterThan(8);
    expect(peak(unevenChords)).toBeGreaterThan(8);

    // ⭐ One edge with two bends stays smooth at ANY pair of values, which is
    // the property that makes it worth having rather than the S itself.
    for (const [b1, b2] of [[2, -2], [1, -2], [3, -0.5], [2, 2], [0.5, -3]]) {
      const cubic = samplePath([{ x: 0, y: 0, bulge: b1, bulgeEnd: b2 }, { x: 12, y: 0 }], 48);
      expect(peak(cubic), `bulge ${b1}/${b2}`).toBeLessThan(2);
    }
  });

  it("a straight edge is still straight, and a zero far bend still bends near", () => {
    expect(samplePath(chord)).toEqual([{ x: 0, y: 0 }, { x: 12, y: 0 }]);
    // ⚠️ bulgeEnd: 0 is a STATEMENT — this half is straight — not an absence.
    const half = samplePath([{ x: 0, y: 0, bulge: 2, bulgeEnd: 0 }, { x: 12, y: 0 }]);
    const ys = offAxis(half);
    expect(Math.max(...ys)).toBeGreaterThan(0.5); // it bends near the start
    expect(ys[ys.length - 1]).toBeCloseTo(0, 6); // and arrives flat
  });

  it("survives the round trip through trackPath, zero included", () => {
    const kept = trackPath([{ x: 0, y: 0, bulge: 1, bulgeEnd: -1 }, { x: 10, y: 0 }])!;
    expect(kept[0]).toMatchObject({ bulge: 1, bulgeEnd: -1 });
    const zero = trackPath([{ x: 0, y: 0, bulge: 1, bulgeEnd: 0 }, { x: 10, y: 0 }])!;
    expect(zero[0]).toHaveProperty("bulgeEnd", 0);
  });

  it("measures an S by its real length, not its chord", () => {
    const straight = pathLengthInches(chord);
    const s = pathLengthInches([{ x: 0, y: 0, bulge: 2, bulgeEnd: -2 }, { x: 12, y: 0 }]);
    expect(straight).toBeCloseTo(12, 6);
    expect(s).toBeGreaterThan(12.3); // the flex you cut is longer than the gap
  });
});

// ── A turnout's diverging leg, lifted out of the canvas (#226) ────────────────
describe("turnoutDivergingLeg", () => {
  /** A straight main along +x, normals pointing +y — the simplest honest host. */
  const straightHost = (rel: number) => ({ x: rel, y: 0, nx: 0, ny: 1 });

  /**
   * ⭐ PINNED TO WHAT THE CANVAS ACTUALLY DREW. These are read off FMN-0068's
   * rendered SVG on production (web v0.57.1) for `sw2` — a #6 at pos 27.8 facing
   * west — before the geometry was lifted. If the lift changed the drawing, these
   * numbers move; that is the whole point of writing them down.
   */
  const sw2 = () =>
    turnoutDivergingLeg({
      sampleAt: straightHost,
      relFrogInches: 27.8,
      toward: -1,
      side: 1,
      size: 6,
    });

  it("puts the throat a lead back from the frog, at the drawn 3.296875″", () => {
    expect(sw2().leadInches).toBeCloseTo(3.296875, 9);
    expect(sw2().points[0].x).toBeCloseTo(31.096875, 9);
  });

  it("ends the rail a past-frog beyond, at the drawn 26.284375″", () => {
    const leg = sw2();
    expect(leg.pastFrogInches).toBeCloseTo(1.515625, 9);
    expect(leg.railEnd.x).toBeCloseTo(26.284375, 9);
    // The lateral the canvas drew at the rail end.
    expect(leg.railEnd.y).toBeCloseTo(0.6066041666666666, 9);
  });

  it("crosses the rails HALF a gauge off the through route, not a full one", () => {
    // ⚠️ Not the diverging centre-line's position at the lead — that is a full
    // gauge out, which is the definition of the lead. The frog is where the two
    // INNER rails meet.
    const leg = sw2();
    expect(leg.frog.x).toBeCloseTo(27.8, 9);
    expect(leg.frog.y).toBeCloseTo(RAIL_GAUGE_INCHES / 2, 9);
  });

  it("throws to the side it is given", () => {
    const right = turnoutDivergingLeg({ sampleAt: straightHost, relFrogInches: 27.8, toward: -1, side: -1, size: 6 });
    expect(right.railEnd.y).toBeCloseTo(-0.6066041666666666, 9);
    expect(right.railEnd.x).toBeCloseTo(26.284375, 9);
  });

  it("faces the other way when `toward` flips", () => {
    const east = turnoutDivergingLeg({ sampleAt: straightHost, relFrogInches: 27.8, toward: 1, side: 1, size: 6 });
    expect(east.points[0].x).toBeCloseTo(27.8 - 3.296875, 9);
    expect(east.railEnd.x).toBeCloseTo(27.8 + 1.515625, 9);
  });

  it("a wye takes HALF the divergence — it behaves as a #2N", () => {
    const wye = turnoutDivergingLeg({ sampleAt: straightHost, relFrogInches: 20, toward: 1, side: 1, size: 3, wye: true });
    const plain6 = turnoutDivergingLeg({ sampleAt: straightHost, relFrogInches: 20, toward: 1, side: 1, size: 6 });
    expect(wye.leadInches).toBeCloseTo(plain6.leadInches, 9);
    expect(wye.pastFrogInches).toBeCloseTo(plain6.pastFrogInches, 9);
  });

  it("a crossover leg stops where it meets its partner, and is never lengthened", () => {
    const free = turnoutDivergingLeg({ sampleAt: straightHost, relFrogInches: 40, toward: 1, side: 1, size: 6 });
    const met = turnoutDivergingLeg({
      sampleAt: straightHost, relFrogInches: 40, toward: 1, side: 1, size: 6,
      meetAtSpacingInches: 1.09,
    });
    expect(met.spanInches).toBeLessThan(free.spanInches);
    // Half the gap, less a gauge, times N past the lead — exact, not fitted.
    expect(met.spanInches).toBeCloseTo(met.leadInches + (1.09 / 2 - RAIL_GAUGE_INCHES) * 6, 9);
    // A gap too narrow to reach must not EXTEND the body.
    const tiny = turnoutDivergingLeg({
      sampleAt: straightHost, relFrogInches: 40, toward: 1, side: 1, size: 6,
      meetAtSpacingInches: RAIL_GAUGE_INCHES,
    });
    expect(tiny.spanInches).toBeCloseTo(free.spanInches, 9);
  });

  it("an override lead wins over the per-frog rule — a crossover's own point-set", () => {
    const leg = turnoutDivergingLeg({
      sampleAt: straightHost, relFrogInches: 41.25, toward: 1, side: 1, size: 6,
      leadOverrideInches: 2.1245,
    });
    expect(leg.leadInches).toBeCloseTo(2.1245, 9);
    expect(leg.points[0].x).toBeCloseTo(41.25 - 2.1245, 9);
  });

  it("follows a curved host — the leg is walked, not drawn straight", () => {
    // A host that bends: normals rotate with it, so the leg has to pick that up.
    const bent = (rel: number) => {
      const a = rel * 0.02;
      return { x: Math.sin(a) / 0.02, y: (1 - Math.cos(a)) / 0.02, nx: -Math.sin(a), ny: Math.cos(a) };
    };
    const leg = turnoutDivergingLeg({ sampleAt: bent, relFrogInches: 20, toward: 1, side: 1, size: 6 });
    // Not collinear: the middle of the leg is off the chord between its ends.
    const a = leg.points[0], b = leg.railEnd, m = leg.points[8];
    const cross = (b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x);
    expect(Math.abs(cross)).toBeGreaterThan(1e-6);
  });
})
