import { describe, it, expect } from "vitest";
import {
  asModuleSchematic,
  moduleFeatures,
  inchesToScaleFeet,
  scaleFeetToInches,
  nextId,
  emptyEditorState,
  stateToDoc,
  docToState,
  buildPassingSiding,
  buildTransition,
  MAIN_TRACK_ID,
  deriveEndplatePoses,
  poseNeedsManual,
  poseOverridesFromDoc,
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
    { id: "sw1", pos: 40, onTrack: "main", divergeTrack: "sid1", kind: "right" },
    { id: "sw2", pos: 356, onTrack: "main", divergeTrack: "sid1", kind: "left" },
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
      { id: "s1", name: "Home", posFrac: 0.5, lane: 0, facing: "AtoB", side: "above" },
    ]);
  });

  it("clamps out-of-range positions into [0,1]", () => {
    const f = moduleFeatures({
      ...oneMile,
      turnouts: [{ id: "x", pos: 999, onTrack: "main", divergeTrack: "sid1" }],
    });
    expect(f.turnouts[0].posFrac).toBe(1);
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
      onTrack: "main",
      divergeTrack: "main2",
      name: "End of Double Track",
    });
    expect(built.controlPoint.turnouts).toEqual([built.turnout.id]);
    expect(built.controlPoint.signals.map((x) => `${x.facing}:${x.side}`)).toEqual([
      "AtoB:above",
      "BtoA:below",
    ]);
    // Not a transition → null
    expect(buildTransition(emptyEditorState(96))).toBeNull();
    expect(buildTransition({ ...emptyEditorState(96), configA: "double" as const, configB: "double" as const })).toBeNull();
  });

  it("Main 2 runs only from the transition turnout to the double end", () => {
    // Single at A, double at B: main2 begins at the turnout.
    const s = { ...emptyEditorState(96), configB: "double" as const };
    const built = buildTransition(s)!;
    s.turnouts.push(built.turnout);
    s.controlPoints.push(built.controlPoint);
    const doc = stateToDoc(s, "FMN-0038");
    const main2 = doc.tracks.find((t) => t.id === "main2")!;
    expect(main2).toMatchObject({ fromPos: built.turnout.pos, toPos: 96 });
    const f = moduleFeatures(doc);
    expect(f.main2Extent).toEqual({
      fromFrac: built.turnout.pos / 96,
      toFrac: 1,
    });
    // Round-trips: the turnout comes back, so the extent re-derives.
    const back = docToState(doc, 96);
    expect(back.turnouts.find((t) => t.divergeTrack === "main2")?.pos).toBe(built.turnout.pos);

    // Double at A instead: main2 ends at the turnout.
    const s2 = { ...emptyEditorState(96), configA: "double" as const };
    const b2 = buildTransition(s2)!;
    s2.turnouts.push(b2.turnout);
    const doc2 = stateToDoc(s2, "M");
    expect(doc2.tracks.find((t) => t.id === "main2")).toMatchObject({
      fromPos: 0,
      toPos: b2.turnout.pos,
    });
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
      { label: "MoPac West", pos: 20, side: "down", config: "single" },
      { label: "MoPac East", pos: 110, side: "up", config: "single" },
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
