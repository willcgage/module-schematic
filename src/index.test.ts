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
  MAIN_TRACK_ID,
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
