# Case study - Kolej Vokasional Miri single-door entrance gate

A real run of the `ab-engineering-deliverables` skill, kept as a reference for how the A/B
roles and the JEV gate fit together. Client names and drawings are used with the owner's
permission.

## The ask

Kolej Vokasional Miri needed a new pedestrian entrance on the football-field fence. The
driver was access, not decoration: players were driving into the college grounds and parking
inside. The new gate gives them a direct walking route to the field so vehicles stay outside,
at the New Entrance.

Constraints fixed by the site sketch and the client:

- single leaf, width follows the Target A sample gate: **1.24 m**
- leaf height: **1.88 m**
- **300 mm (1 kaki) raised concrete kerb**, so rainwater flows outside the field
- **one material only**: mild steel, the cheapest structural steel in the pricebook
- steel grade code: **Q235B (S275JR equivalent)**, to be confirmed on the mill certificate
- camera-crew tower crane **excluded** (still under review)
- no stainless-steel option

## What AGENT B produced

| Output | Detail |
|---|---|
| `entrance_gate_plan.png` / `_bm.png` | A4 engineering plan: fence line, 1.24 m opening, leaf swing arc, kerb, dimensions, north arrow, scale bar, legend, notes, title block |
| `door_schematic_bm.png` | leaf elevation: LEBAR 1.24 m, TINGGI 1.88 m, kerb 300 mm, 11 infill bars, spear finials, hinge plates, bar schedule |
| `pack_pdf.py` | six print-ready A4 packs, portrait and landscape, EN and BM, plus a simple BM pack and a blank costing form |

## What AGENT A produced

| Invoice | Scope | Total |
|---|---|---|
| INV-001 | gate supply plus fabrication, mild steel | RM 1,654.05 |
| INV-002 | civil kerb plus site installation | RM 1,035.31 |
| | **package total** | **RM 2,689.36** |

Takeoff basis: 45.3 kg steel, 1.94 m weld, 5.4 m2 paint, from `plan.json`. Rates come from
`config/miri_prices.json`; rows flagged `verified: false` stay flagged in the notes instead of
being presented as quoted prices.

## Where the gate sits

The decisions that a later revision must not silently contradict:

1. mild steel is the only option, grade Q235B (S275JR equivalent);
2. the 300 mm kerb is a rainwater device, not a step;
3. the tower crane is excluded until the client resolves it;
4. unverified pricebook rows are acknowledged as budgetary.

Each one is a durable memory. The pipeline posts the estimate with
`jev_gate.record_estimate(estimate, plan)`:

```
POST /api/add
{
  "content": "Kolej Vokasional Miri gate: INV-001 RM 1,654.05, INV-002 RM 1,035.31,
              total RM 2,689.36. Mild steel Q235B (S275JR equivalent), 1.24 x 1.88 m,
              300 mm kerb, tower crane excluded, unverified price rows flagged.",
  "scope": "kolej-vokasional-miri",
  "tags": ["invoice", "mild-steel", "gate", "q235b"],
  "source": "pipeline/run_pipeline.py",
  "corpus_type": "universal"
}
```

On the host side, `rcc_hall` can then score the claim set (risk LOW or HIGH plus a guard
statement) and `rcc_decide` can pick between a verified and an unverified price row before a
reprint. The verdict string goes into the same memory, so the next revision can show why a
number was accepted.

## Verification that caught real defects

Print QA was not cosmetic. Rendering every page with pymupdf caught:

- a fixed-position header printed at the bottom of page 1, and the footer at the top of page 2;
- a blank third page from `page-break-after: always` after the last sheet;
- clipped captions and bullets on the right edge;
- "Qty" printing as "Qt y" and "RM 1,035.31" as "RM 1,035.3 / 1" after an over-broad
  `overflow-wrap: anywhere` rule;
- literal `**PAKEJ JUMLAH**` from a markdown cell that skipped the bold converter.

The working fixes are in `references/print-css-recipe.md`.

## Credits

Developer ctaxnagomi, Contribute by ctaxnagomi, Show some love by visit his Github Repo https://github.com/ctaxnagomi/dgui-hypermem give some star
