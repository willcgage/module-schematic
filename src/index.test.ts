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
  trackPath,
  carCapacity,
  N_CAR_LENGTH_INCHES,
  moduleFootprint,
  checkEndplateWidth,
  endplateTrackOffsetFor,
  endplateTrackOffsetInches,
  moduleCenterline,
  MAIN_TRACK_ID,
  MAIN2_TRACK_ID,
  deriveEndplatePoses,
  poseNeedsManual,
  poseOverridesFromDoc,
  endplateLead,
  trackMeetsEndplateIssues,
  ENDPLATE_LEAD_INCHES,
  type ModuleSchematicDoc,
} from "./index";

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
    expect(endplateTrackOffsetFor("double")).toBeCloseTo(0.5625);
    expect(endplateTrackOffsetFor("single")).toBe(0);
    expect(endplateTrackOffsetFor(undefined)).toBe(0);
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

  it("moduleFeatures reports loop, from the flag or a single endplate", () => {
    const doc = stateToDoc({ ...emptyEditorState(96), loop: true }, "M");
    expect(moduleFeatures(doc).loop).toBe(true);
    // legacy-ish doc without the flag but only one endplate
    const implied: ModuleSchematicDoc = {
      version: 1, lengthInches: 96,
      endplates: [{ id: "A" }],
      tracks: [{ id: "main", role: "main", lane: 0, fromPos: 0, toPos: 96 }],
    };
    expect(moduleFeatures(implied).loop).toBe(true);
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

  it("a non-loop module never drops endplate B ('none' coerces to single)", () => {
    const doc = stateToDoc({ ...emptyEditorState(96), configB: "none" }, "M");
    expect(doc.endplates.map((e) => e.id)).toEqual(["A", "B"]);
    expect(doc.endplates[1].tracks?.[0]?.config).toBe("single");
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

  it("branch endplates C, D round-trip and become connector arrows", () => {
    // The Frisco/MoPac case: a second railroad enters at one branch endplate
    // and leaves at another.
    const s = emptyEditorState(120);
    s.branches.push(
      { label: "MoPac West", pos: 20, side: "down", config: "single" },
      { label: "MoPac East", pos: 110, side: "up", config: "single" },
    );
    const doc = stateToDoc(s, "M");
    expect(doc.endplates.map((e) => e.id)).toEqual(["A", "B", "C", "D"]);
    expect(doc.endplates[2]).toMatchObject({ label: "MoPac West", at: { pos: 20, side: "down" } });
    expect(doc.endplates[3]).toMatchObject({ label: "MoPac East", at: { pos: 110, side: "up" } });

    const f = moduleFeatures(doc);
    expect(f.branchConnectors).toEqual([
      { id: "C", label: "MoPac West", posFrac: 20 / 120, side: "down" },
      { id: "D", label: "MoPac East", posFrac: 110 / 120, side: "up" },
    ]);
    expect(f.loop).toBe(false);

    const back = docToState(doc, 120);
    expect(back.branches).toEqual([
      { label: "MoPac West", pos: 20, side: "down", config: "single", kind: "branch", trackId: null },
      { label: "MoPac East", pos: 110, side: "up", config: "single", kind: "branch", trackId: null },
    ]);
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
    expect(back.industries[0].toPos).toBe(27); // 53 → 26.5 → 27
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
