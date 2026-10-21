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

## Credits

Developer ctaxnagomi, Contribute by ctaxnagomi, Show some love by visit his Github Repo https://github.com/ctaxnagomi/dgui-hypermem give some star

MIT licensed, same as DGUI-HyperMem.
