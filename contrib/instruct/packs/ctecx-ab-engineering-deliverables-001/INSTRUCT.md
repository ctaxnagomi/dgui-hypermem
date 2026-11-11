<!-- owner: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024 -->
<!-- format: ctecx_instruct@1 - wan mohd azizi bin wan hosen, ctaxnagomi, est 2024 -->

# CTECX Task Log - INSTRUCT

- **task_id**: `ctecx-ab-engineering-deliverables-001`
- **owner**: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
- **format_owner**: wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
- **created**: `2026-10-22`
- **status**: `open`
- **format_version**: `ctecx_instruct@1`

## Objective

> Two-role A/B pipeline that turns a site sketch or plan into engineering drawings, priced invoices and print-ready bilingual PDF packs, with optional DGUI HyperMem / JEV gating. Use for gate, fence, fabrication or small-works costing deliverables.

## Important Details

- **Skill:** `ab-engineering-deliverables` - Two-role A/B pipeline that turns a site sketch or plan into engineering drawings, priced invoices and print-ready bilingual PDF packs, with optional DGUI HyperMem / JEV gating. Use for gate, fence, fabrication or small-works costing deliverables.
- **Original owner:** wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
- **Format owner:** wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
- **Format:** `ctecx_instruct@1`
- **Source package:** `contrib/skills/ab-engineering-deliverables`
- **License:** MIT
- **Fidelity rule:** Appendix A carries the full original SKILL.md. If this pack and the appendix disagree, the appendix wins until the owner updates it.
- **Ownership rule:** the owner line must remain in all five parts. Removing it breaks the pack and the owner's attribution.

### Constraints from the skill

**When to use**

- A client hands you a sketch, a photo or a floor plan and expects a priced, drawn deliverable.
- Small works (gate, fence, kerb, fabrication) where a pricebook plus deterministic math is better than an LLM guessing numbers.
- You need the same content as A4 portrait, A4 landscape, bilingual, plus a one-page summary.
- You want every published number traceable to a config row and, optionally, gated by JEV.

**Contracts**

- `plan.json`: `project_name`, `bounding_box_m`, `steel_members[]`, `openings[]`.
- `takeoff.json`: `totals.steel_kg`, `totals.weld_metres`, `totals.paint_m2`.
- `estimate_*.json`: `summary.materials_rm`, `welding_work_rm`, `labour_*`, `grand_total_rm`.
- `INV-00x.json`: `items[]` of `[description, qty, unit, unit_price, amount]`, `total_rm`,
  `steel_grade`.

Keep the JSON keys stable. Anything downstream (HTML, PDF, memory) reads them.

## Work State

### Completed

- `ab-engineering-deliverables` authored by wan mohd azizi bin wan hosen, ctaxnagomi, est 2024.
- Source package: `contrib/skills/ab-engineering-deliverables` (4 files).

### Active

- `ctecx_instruct@1` pack generated on 2026-10-22. Awaiting contributor review and merge.

### Blocked

- None.

## Execution Steps

The steps below are copied from the owner's SKILL.md. Run them exactly. Appendix A is authoritative if anything here is ambiguous.

1. **Decode the sketch (B).** `pipeline/agent_b_design/sketch_analyze.py` sends the image to
   `meta-llama/Llama-3.2-11B-Vision-Instruct` and returns `plan.json`. With `--no-api`, use
   `input/plan_draft.json` or `demo_plan()` instead. Never let the vision model invent prices.
2. **Pricebook first (A).** All rates live in `config/miri_prices.json` with `source` and
   `verified` fields. If a row is `verified: false`, the invoice must say so. Steel grade comes
   from `materials_steel.steel_grade` (for example `Q235B (S275JR equivalent)`) and must be
   confirmed on the mill certificate.
3. **Takeoff then estimate (A).** `steel_calculator.takeoff(plan)` returns kg, weld metres and
   paint area. `cost_estimator.estimate(takeoff, prices, plan)` applies OH (15 percent), SST
   (6 percent) and writes `estimate_<date>.json` plus a markdown report.
4. **Invoices (A).** `gate_invoice.py` emits `INV-001.json` and `INV-002.json` and a master
   materials list. Split scopes so each invoice is defensible: supply plus fabrication in one,
   civil plus site installation in the other. Keep one steel option only; if stainless is not
   offered, say so once and move on.
5. **Drawings (B).** `entrance_plan.py` draws the plan with label lanes at fixed heights so no
   text collides. `door_schematic.py` draws the leaf elevation with LEBAR, TINGGI and kerb
   dimensions. Both are matplotlib at 200 dpi, A4 proportions.
6. **Pack HTML (B).** `pack_pdf.py` builds the print sheets: cover, plan, INV-001, INV-002,
   materials list, plus the simple pack. Print CSS is the hard part: see
   `references/print-css-recipe.md`.
7. **Print.** Do not add a PDF library. Print the HTML with Chrome through the browser tool:

   ```js
   const p = await browser.open("file:///.../print_pack_simple_bm.html");
   await p.waitForSelector("table");
   const out = await p.pdf({preferCSSPageSize: true, printBackground: true});
   ```

   Copy the returned `out.path` over the deliverable name in `output/invoices/`.
8. **Verify before you show it.** Render every page with pymupdf and look at it:

   ```python
   import pymupdf
   doc = pymupdf.open(pdf)
   for i, page in enumerate(doc):
       page.get_pixmap(dpi=110).save(f"check_p{i+1}.png")
   ```

   Check page count, header position, footer position, clipped words, and that the text
   extraction contains the exact strings you expect (`Muka surat 2 / 3`, totals, captions).
   Text extraction also catches em-dashes and stray markdown asterisks.
9. **Gate with JEV (optional).** Before publishing totals, ask `rcc_hall` for a risk verdict
   and store the decision as a DGUI HyperMem memory:

   ```python
   from pipeline import jev_gate
   jev_gate.record_estimate(estimate, plan)   # no-op when DGUI_HYPERMEM_TOKEN is unset
   ```

   The gate posts `/api/add` with `scope`, `tags`, `source` and `corpus_type: "universal"`.
   If the host also exposes `rcc_decide` / `rcc_hall`, call them first and put the verdict
   string into the memory so a later reprint can show why a number was accepted.

## Deliverables

- Skill package files:
  - `CASE_STUDY.md`
  - `README.md`
  - `SKILL.md`
  - `references/print-css-recipe.md`
- Pack files:
  - `INSTRUCT.md`
  - `task.sh`
  - `task.sql`
  - `task.json`
  - `task.assembly`
- Zip: `ctecx_instruct_ctecx-ab-engineering-deliverables-001.zip`

## Verification

1. `bash task.sh test` returns 0.
2. `task.json` manifest hashes match the four content parts.
3. Every part contains the original owner line.
4. Appendix A matches the owner's SKILL.md byte for byte.
5. Install the skill and run its own verification steps.

## Owner

```
wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
Format: ctecx_instruct@1 - wan mohd azizi bin wan hosen, ctaxnagomi, est 2024
```

## Appendix A - Original SKILL.md

````markdown
---
name: ab-engineering-deliverables
description: "Two-role A/B pipeline that turns a site sketch or plan into engineering drawings, priced invoices and print-ready bilingual PDF packs, with optional DGUI HyperMem / JEV gating. Use for gate, fence, fabrication or small-works costing deliverables."
owner: "wan mohd azizi bin wan hosen, ctaxnagomi, est 2024"
license: MIT
---

# A/B Engineering Deliverables

A two-role, deterministic, file-handoff pipeline. AGENT A does the math and the money,
AGENT B does the drawings and the print. No agent framework, no message bus, no hidden
state: every handoff is a JSON or PNG file on disk.

| Role | Folder | Produces |
|---|---|---|
| AGENT A - general work + math | `pipeline/agent_a_general/` | steel takeoff, Miri pricebook costing, invoices, materials list, reports |
| AGENT B - design modelling 2D + 3D | `pipeline/agent_b_design/` | sketch analysis, plan + door drawings, 3D model, renders, PDF packs |

## When to use

- A client hands you a sketch, a photo or a floor plan and expects a priced, drawn deliverable.
- Small works (gate, fence, kerb, fabrication) where a pricebook plus deterministic math is better than an LLM guessing numbers.
- You need the same content as A4 portrait, A4 landscape, bilingual, plus a one-page summary.
- You want every published number traceable to a config row and, optionally, gated by JEV.

## Environment

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # HF_TOKEN for the two AI stages
```

`requirements.txt`: numpy, shapely, trimesh, pillow, matplotlib, huggingface_hub, scipy, python-dotenv.
Add `pymupdf` for PDF verification (not needed at runtime).

Optional gate environment:

```
DGUI_HYPERMEM_URL=https://dgui-hmem.deckergui.my
DGUI_HYPERMEM_TOKEN=<bearer token>
DGUI_HYPERMEM_SCOPE=kolej-vokasional-miri
```

## Steps

1. **Decode the sketch (B).** `pipeline/agent_b_design/sketch_analyze.py` sends the image to
   `meta-llama/Llama-3.2-11B-Vision-Instruct` and returns `plan.json`. With `--no-api`, use
   `input/plan_draft.json` or `demo_plan()` instead. Never let the vision model invent prices.
2. **Pricebook first (A).** All rates live in `config/miri_prices.json` with `source` and
   `verified` fields. If a row is `verified: false`, the invoice must say so. Steel grade comes
   from `materials_steel.steel_grade` (for example `Q235B (S275JR equivalent)`) and must be
   confirmed on the mill certificate.
3. **Takeoff then estimate (A).** `steel_calculator.takeoff(plan)` returns kg, weld metres and
   paint area. `cost_estimator.estimate(takeoff, prices, plan)` applies OH (15 percent), SST
   (6 percent) and writes `estimate_<date>.json` plus a markdown report.
4. **Invoices (A).** `gate_invoice.py` emits `INV-001.json` and `INV-002.json` and a master
   materials list. Split scopes so each invoice is defensible: supply plus fabrication in one,
   civil plus site installation in the other. Keep one steel option only; if stainless is not
   offered, say so once and move on.
5. **Drawings (B).** `entrance_plan.py` draws the plan with label lanes at fixed heights so no
   text collides. `door_schematic.py` draws the leaf elevation with LEBAR, TINGGI and kerb
   dimensions. Both are matplotlib at 200 dpi, A4 proportions.
6. **Pack HTML (B).** `pack_pdf.py` builds the print sheets: cover, plan, INV-001, INV-002,
   materials list, plus the simple pack. Print CSS is the hard part: see
   `references/print-css-recipe.md`.
7. **Print.** Do not add a PDF library. Print the HTML with Chrome through the browser tool:

   ```js
   const p = await browser.open("file:///.../print_pack_simple_bm.html");
   await p.waitForSelector("table");
   const out = await p.pdf({preferCSSPageSize: true, printBackground: true});
   ```

   Copy the returned `out.path` over the deliverable name in `output/invoices/`.
8. **Verify before you show it.** Render every page with pymupdf and look at it:

   ```python
   import pymupdf
   doc = pymupdf.open(pdf)
   for i, page in enumerate(doc):
       page.get_pixmap(dpi=110).save(f"check_p{i+1}.png")
   ```

   Check page count, header position, footer position, clipped words, and that the text
   extraction contains the exact strings you expect (`Muka surat 2 / 3`, totals, captions).
   Text extraction also catches em-dashes and stray markdown asterisks.
9. **Gate with JEV (optional).** Before publishing totals, ask `rcc_hall` for a risk verdict
   and store the decision as a DGUI HyperMem memory:

   ```python
   from pipeline import jev_gate
   jev_gate.record_estimate(estimate, plan)   # no-op when DGUI_HYPERMEM_TOKEN is unset
   ```

   The gate posts `/api/add` with `scope`, `tags`, `source` and `corpus_type: "universal"`.
   If the host also exposes `rcc_decide` / `rcc_hall`, call them first and put the verdict
   string into the memory so a later reprint can show why a number was accepted.

## Contracts

- `plan.json`: `project_name`, `bounding_box_m`, `steel_members[]`, `openings[]`.
- `takeoff.json`: `totals.steel_kg`, `totals.weld_metres`, `totals.paint_m2`.
- `estimate_*.json`: `summary.materials_rm`, `welding_work_rm`, `labour_*`, `grand_total_rm`.
- `INV-00x.json`: `items[]` of `[description, qty, unit, unit_price, amount]`, `total_rm`,
  `steel_grade`.

Keep the JSON keys stable. Anything downstream (HTML, PDF, memory) reads them.

## Pitfalls learned the hard way

- **Never `position: fixed` for print headers.** Chrome prints the header at the bottom of
  page 1 and the footer at the top of page 2. Put a header and footer block inside each sheet
  and make the sheet a flex column with `min-height` equal to the printable height.
- **`page-break-after: always` plus a trailing element** creates a blank page. Give the last
  sheet an explicit `final` class with `page-break-after: auto`.
- **`overflow-wrap: anywhere` on table cells** breaks "Qty" into "Qt y" and "1.94" into
  "1.9 / 4". Use it on paragraphs and list items only, and give invoice tables explicit
  column widths.
- **Fixed-size gallery images**: use a grid with `height` plus `object-fit: contain`.
  Flex rows with mixed portrait and landscape images clip captions.
- **Raw sketch PNGs are 3 to 12 MB.** Downscale to 1500 px JPEG q88 for the PDF; keep the
  originals untouched.
- **Bare `<li>` with negative margins** clips on the right edge. Use a normal indent.
- **Markdown tables**: run the cell text through the bold converter, otherwise `**TOTAL**`
  prints with literal asterisks.

## Credits

Developer ctaxnagomi, Contribute by ctaxnagomi, Show some love by visit his Github Repo https://github.com/ctaxnagomi/dgui-hypermem give some star

MIT licensed contribution to the DGUI-HyperMem project.
````

## Appendix B - Original README.md

````markdown
# ab-engineering-deliverables - DGUI-HyperMem contribution

A skill package contributed to DGUI-HyperMem. It captures the two-role A/B pipeline that
produced a real client deliverable: a sketch-to-invoice pack for a single-door entrance gate
at Kolej Vokasional Miri, Miri, Sarawak.

Why it belongs here: the pipeline is a concrete, working example of using a durable memory
layer with a reasoning gate. Every price, exclusion and steel-grade decision is a small
durable fact that a later revision must not contradict. The skill shows where to call
`rcc_decide` / `rcc_hall` and how to store the verdict with `/api/add`.

## Contents

| Path | What |
|---|---|
| `SKILL.md` | the skill itself: roles, steps, contracts, pitfalls, gate pattern |
| `references/print-css-recipe.md` | the print CSS that survives Chrome `page.pdf()` |
| `CASE_STUDY.md` | the Kolej Vokasional Miri run, end to end |

## Install

Copy the folder into the client skills directory:

```bash
cp -r contrib/skills/ab-engineering-deliverables ~/.config/opencode/skills/
```

Then the skill is available as `ab-engineering-deliverables`.

## Gate environment

```
DGUI_HYPERMEM_URL=https://dgui-hmem.deckergui.my
DGUI_HYPERMEM_TOKEN=<bearer token>
DGUI_HYPERMEM_SCOPE=kolej-vokasional-miri
```

Without a token the gate is a no-op, so the pipeline still runs offline.

## Contributing

To contribute your own skill through an MCP agent, follow
[../../CONTRIBUTING_MCP.md](../../CONTRIBUTING_MCP.md) and start from
[../_template/SKILL.md](../_template/SKILL.md). The protocol makes the CONTRIBUTORS.md row
part of the same change.

This skill also ships as a `ctecx_instruct@1` pack at
[../../instruct/packs/ctecx-ab-engineering-deliverables-001/](../../instruct/packs/ctecx-ab-engineering-deliverables-001/)
with the owner embedded in all five parts.

## Credits

Developer ctaxnagomi, Contribute by ctaxnagomi, Show some love by visit his Github Repo https://github.com/ctaxnagomi/dgui-hypermem give some star

MIT licensed, same as DGUI-HyperMem.
````
