# DGUI-HyperMem — technical paper

Dual-column arXiv-style writeup of the DGUI-HyperMem memory service.

## Files

| File | Role |
|---|---|
| `paper.tex` | The paper. 13 sections, 4 TikZ figures, 3 tables. |
| `results.tex` | **Generated** — the two result tables. Do not hand-edit; see below. |
| `references.bib` | 16 entries, all cited. |
| `arxiv.sty` | The `kourgeorge/arxiv-style` layout, vendored so the build is offline-reproducible. |
| `figures/logo-dgui.png`, `figures/logo-ctecx.png` | Title-block marks. Both `\IfFileExists`-guarded. |
| `figures/eval-results.json` | Raw output of the retrieval evaluation, across 3 seeds. |
| `eval/evalsim.py` | Seeded corpus + query generator (4 query classes, 20 supersede chains). |
| `eval/evalsim_run.py` | Scores the 8 retrieval configurations and writes the JSON. |
| `eval/mkresults.py` | JSON → `results.tex`. |
| `eval/verify_prose.py` | Re-derives every number quoted in §8 from the JSON. Exits non-zero on mismatch. |
| `paper.pdf` | Built artifact. |

## Build

```sh
pdflatex -interaction=nonstopmode paper.tex
bibtex   paper
pdflatex -interaction=nonstopmode paper.tex
pdflatex -interaction=nonstopmode paper.tex
```

Four passes, not three: `paper.tex` uses `hyperref`, so the first pass writes
`paper.out` and the second is what settles the bookmark tree.

A clean build reports **0 errors, 0 undefined references, 0 overfull or
underfull boxes, and 10 pages**.

## Reproducing the evaluation

The evaluation is offline and CPU-only. It needs the two real models the
service uses, plus a cross-encoder standing in for the reasoning backend:

```sh
pip install sentence-transformers torch nltk
python -c "import nltk; nltk.download('punkt')"

python eval/evalsim_run.py --n-mem 900 --n-q 150 --seeds 11,12,13
python eval/mkresults.py
python eval/verify_prose.py
```

All three resolve their paths from their own location, so they work from any
working directory and need no arguments.

`evalsim.py` is deterministic given its seed, so the same three seeds
reproduce `figures/eval-results.json` exactly. `verify_prose.py` is the guard
that matters: it reads the JSON and checks the 35 numeric claims made in the
paper's Results section, so a stale table cannot silently disagree with the
prose.

## Environment notes

Two things in this build are specific to the machine it was written on, and
both are noted in `paper.tex`:

- **booktabs** resolves to the 2020 release, which is the only copy in the
  local MiKTeX. `\providecommand{\doublerulesep}{2pt}` must come *before*
  `\usepackage{booktabs}`, because MiKTeX resolves `nicefrac` to the SI-units
  helper rather than the typography package, and booktabs reads `\doublerulesep`
  at load time.
- **`\def\@affiliation`** must be wrapped in `\makeatletter` … `\makeatother`.
  Defined outside that block, TeX reads `\@` as a control symbol and silently
  defines the wrong token, so the title block dies with
  `Undefined control sequence`.

## What the evaluation found

The short version: **the deployed configuration is the worst of the eight we
scored**, and the cause is the fusion weights rather than the fusion.

| configuration | R@5 | R@10 | nDCG@10 | P@1 |
|---|---|---|---|---|
| recency (control) | 0.004 | 0.011 | 0.004 | 0.000 |
| lexical only | 0.244 | 0.362 | 0.230 | 0.142 |
| dense only | 0.473 | 0.598 | 0.418 | 0.282 |
| dense + rerank | 0.453 | 0.620 | 0.422 | 0.276 |
| **RRF equal (deployed)** | 0.438 | 0.587 | 0.378 | 0.227 |
| **RRF equal + rerank (deployed)** | 0.427 | 0.591 | 0.375 | 0.220 |
| RRF, lexical weight 0.3 | 0.489 | 0.624 | 0.422 | 0.262 |
| RRF weighted + rerank | 0.478 | 0.629 | 0.415 | 0.244 |

Reciprocal rank fusion is score-blind, so a lexical channel that is nearly blind
to a paraphrase query still contributes a full-strength term for whatever it
ranks highly. Equal weights therefore let the weak channel dilute the strong
one. Dropping the lexical weight to 0.3 recovers the loss and edges past the
best single channel.

The evaluation is a **simulation**, not a DeepSWE score. The reasoning stage is
represented by a cross-encoder whose logits are squashed into the bounded
`noul` slot the deployed blend assumes; that column measures the value of the
slot in the architecture, not the quality of the model that fills it.