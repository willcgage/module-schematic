# @willcgage/module-schematic

Shared **FreeMo module operations-schematic** (track-graph) — the single source of
truth for the structured schematic that the **Module Repository** authors and
**Free-Dispatcher** imports and renders as a straightened CTC dispatcher panel.

Topological and straightened-first: positions are 1-D inches along the module
(from endplate A), lanes are integer track indices (`0` = primary main).

## What's here

- **Doc types** — `ModuleSchematicDoc` and its parts (`SchematicTrack`,
  `SchematicTurnout`, `SchematicSignal`, `SchematicControlPoint`, …).
- **`asModuleSchematic(x)`** — lenient parser (docs arrive as jsonb / `unknown`).
- **`moduleFeatures(doc)`** — pure resolver → positioned drawables (fractions of
  the module length) both renderers draw.
- **N-scale helpers** — `inchesToScaleFeet`, `scaleFeetToInches`, `N_SCALE_RATIO`
  (1:160; 396in = one mile).
- **Editor state machine** — `emptyEditorState`, `stateToDoc`, `docToState`,
  `buildPassingSiding`, `nextId` — what an authoring UI binds to.

Framework-agnostic and side-effect-free: consumable from Next.js (server +
client) and Electron. Ships ESM + CJS + type declarations.

## Usage

```ts
import { asModuleSchematic, moduleFeatures } from "@willcgage/module-schematic";

const doc = asModuleSchematic(row.schematic);
if (doc) {
  const { extraTracks, turnouts, signals, doubleMain } = moduleFeatures(doc);
  // …draw them
}
```

The wire format is documented in the free-dispatcher repo:
`docs/module-schematic-format.md`.

## License

MIT
