# module-schematic (pkg)

This package **is the contract** between the two apps in the family. It has no UI and no
opinions of its own — every change here lands on a producer and a consumer:

| Repo | Path | Role |
|---|---|---|
| **MR** | `C:\dev\modulerepo` | Next.js authoring app — **writes** schematics. |
| **pkg** (this repo) | `C:\dev\module-schematic` | `@willcgage/module-schematic` on npm. |
| **FD** | `C:\dev\free-dispatcher` | Electron dispatcher — **reads** schematics. |

A schema change is not done when this repo is green. It's done when MR can author it and FD
can render it. Publishing is Trusted Publishing: release → CI publishes.

## Memory

Durable knowledge for **all three repos** lives in ONE shared store, not one per repo:

    ~/.claude/projects/freemon-family/memory/

`.claude/settings.local.json` sets `autoMemoryDirectory` to it, so this repo reads *and*
writes there natively — no import needed. `modulerepo` and `free-dispatcher` point at the
same directory.

Entries carry a `scope:` field — `mr`, `fd`, `pkg`, `family`, `domain`, `ops`. Changes here
are almost always `family` or `pkg`.
