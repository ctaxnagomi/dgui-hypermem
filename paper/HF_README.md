---
license: mit
tags:
- deckergui
- whitepaper
- agent-memory
- retrieval-augmented-generation
- reciprocal-rank-fusion
- mcp
- serverless
- cloudflare-workers
- evaluation
pretty_name: DGUI-HyperMem Technical Whitepaper
---

# DGUI-HyperMem: A Reasoning-Augmented Hybrid Memory Service for LLM Agents on Serverless Infrastructure

This dataset hosts the technical whitepaper for **DGUI-HyperMem** (DeckerGUI
HyperMemory), a long-term memory service for LLM agents running entirely on a
serverless edge runtime, together with the offline retrieval evaluation it
reports and the harness that produced every number in it.

## Paper Metadata

- **Title:** DGUI-HyperMem: A Reasoning-Augmented Hybrid Memory Service for LLM Agents on Serverless Infrastructure
- **Author:** Wan Mohd Azizi bin Wan Hosen
- **Affiliation:** CTECX Development & Research
- **Service:** `https://dgui-hypermem.deckergui.my`
- **Subjects:** cs.AI; cs.CL; cs.SE
- **Layout:** arXiv-style, dual column, 10 pages, 4 figures, 3 tables, 16 references
- **License:** MIT

## Abstract

An agent that forgets is an agent that pays twice. This paper describes DGUI-HyperMem (DeckerGUI HyperMemory), a long-term memory service for LLM agents that runs entirely on a serverless edge runtime, is addressed over the Model Context Protocol, and is designed so that an agent's memory is queried *by the agent itself* rather than replayed as prompt text. The system fuses approximate-nearest-neighbour search over a 768-dimensional vector index with BM25 over an external-content FTS5 index by reciprocal rank fusion, then submits the fused shortlist to a reasoning layer that re-ranks and re-scores it. A write path assigns every memory a type, a salience and a durability judgement, suppresses low-signal content behind a calibrated salience gate, and automatically supersedes memories that a newer write contradicts. We contribute a description of the architecture and its exact scoring and gating constants; a privacy argument for why redaction must happen at enqueue rather than at export, motivated by an incident in which a passkey reached a public dataset; and a simulated retrieval evaluation built on the production embedding model. **That evaluation returns a negative result about the deployed configuration:** equal-weight rank fusion is *worse* than the dense channel alone (0.378 against 0.418 nDCG@10), because reciprocal rank fusion discards score magnitudes and so lets a weak lexical channel dilute a strong dense one. Re-weighting the lexical channel to 0.3 recovers the loss and edges past the best single channel (0.422, with recall@10 rising from 0.598 to 0.624), which localises the defect to the weights rather than to the fusion. We also find that the judgement stage is not a precision win but a recall and difficulty trade, and we report it as such. The evaluation is explicitly a simulation of long-horizon engineering-agent memory and **is not a DeepSWE result**; we state the distinction and the threats to validity it carries.

## The headline finding

Eight retrieval configurations, 150 queries per seed over ~870 stored memories,
3 seeds, mean ± population standard deviation:

| Configuration | R@5 | R@10 | MRR@10 | nDCG@10 | P@1 |
| --- | --- | --- | --- | --- | --- |
| Recency only (control) | 0.004 ± 0.006 | 0.011 ± 0.008 | 0.002 ± 0.002 | 0.004 ± 0.003 | 0.000 ± 0.000 |
| FTS5 lexical channel alone | 0.244 ± 0.018 | 0.362 ± 0.017 | 0.191 ± 0.013 | 0.230 ± 0.013 | 0.142 ± 0.021 |
| Vectorize dense channel alone | 0.473 ± 0.036 | 0.598 ± 0.028 | 0.364 ± 0.009 | 0.418 ± 0.005 | 0.282 ± 0.031 |
| Dense + cross-encoder rerank | 0.453 ± 0.036 | 0.620 ± 0.024 | 0.361 ± 0.019 | 0.422 ± 0.014 | 0.276 ± 0.039 |
| **RRF fusion, equal weights (as deployed)** | 0.438 ± 0.022 | 0.587 ± 0.019 | 0.315 ± 0.014 | 0.378 ± 0.013 | 0.227 ± 0.022 |
| **RRF equal + rerank (deployed pipeline)** | 0.427 ± 0.022 | 0.591 ± 0.019 | 0.310 ± 0.015 | 0.375 ± 0.016 | 0.220 ± 0.014 |
| **RRF fusion, lexical weight 0.3** | **0.489 ± 0.019** | **0.624 ± 0.013** | 0.359 ± 0.020 | **0.422 ± 0.016** | 0.262 ± 0.030 |
| RRF weighted + rerank | 0.478 ± 0.026 | 0.629 ± 0.014 | 0.349 ± 0.023 | 0.415 ± 0.021 | 0.244 ± 0.027 |

The deployed configuration is the weakest of the fusion family. Reciprocal rank
fusion is score-blind: each channel contributes `1/(K + rank)` and nothing else,
so a channel that is nearly blind to a paraphrase query still contributes a
full-strength term for whatever it happens to rank highly. Equal weights
therefore let the weak channel dilute the strong one. Dropping the lexical
weight to 0.3 recovers the loss and edges past the best single channel.

The re-ranking stage is reported as a **trade, not a win**: it raises recall@10
and is the largest single improvement anywhere on the *pinpoint* class
(0.159 → 0.212 over the dense channel), while moving nDCG@10 and precision@1
sideways or down.

## Scope and honesty notes

What this evaluation **is not**:

- **Not a DeepSWE score.** The workload is synthetic and templated. Absolute
  numbers should not be compared to any published benchmark; the durable result
  is the relative ordering of the systems, and even that is conditioned on the
  query taxonomy (the *semantic* class is built by substituting synonyms, which
  favours dense retrieval by construction).
- **The reranker is not JEV.** The reasoning stage is represented by a local
  cross-encoder whose logits are squashed into the bounded `noul` slot the
  deployed blend assumes. That column measures the value of the *slot* in the
  architecture, not the quality of the model that fills it.
- **Write-side judgements are generated, not inferred.** Type and salience
  assignment are rule-generated in the harness, so the salience term in the
  scoring blend is exercised but not validated.

## Contents

| File | Description |
| --- | --- |
| `DGUI_HYPERMEM_Technical_Whitepaper.pdf` | Rendered whitepaper, dual column, 10 pages (print-ready) |
| `src/paper.tex` | LaTeX source — the canonical source of the paper |
| `src/results.tex` | The two result tables, generated from `figures/eval-results.json` |
| `src/references.bib` | 16 references, all cited |
| `src/arxiv.sty` | Vendored arXiv-style layout so the build needs no network |
| `figures/eval-results.json` | Raw evaluation output across all 3 seeds |
| `figures/logo-dgui.png`, `figures/logo-ctecx.png` | Title-block marks |
| `eval/evalsim.py` | Seeded corpus and query generator |
| `eval/evalsim_run.py` | Scores the eight configurations, writes the JSON |
| `eval/mkresults.py` | JSON → `results.tex` |
| `eval/verify_prose.py` | Re-derives all 35 numeric claims in §8 from the JSON |

## Rebuilding

The paper is built with a four-pass `pdflatex`/`bibtex` cycle:

```sh
pdflatex -interaction=nonstopmode paper.tex
bibtex   paper
pdflatex -interaction=nonstopmode paper.tex
pdflatex -interaction=nonstopmode paper.tex
```

Four passes, not three: the document uses `hyperref`, so the first pass writes
the bookmark file and the second is what settles the tree. A clean build reports
**0 errors, 0 undefined references, 0 overfull or underfull boxes, 10 pages.**

### Reproducing the evaluation

Offline and CPU-only. It needs the two models the service actually uses, plus a
cross-encoder standing in for the reasoning backend:

```sh
pip install sentence-transformers torch nltk
python -c "import nltk; nltk.download('punkt')"

python eval/evalsim_run.py --n-mem 900 --n-q 150 --seeds 11,12,13 --out figures
python eval/mkresults.py
python eval/verify_prose.py
```

Models: `BAAI/bge-base-en-v1.5` (768d, the production embedding model) for the
dense channel, and `cross-encoder/ms-marco-MiniLM-L-6-v2` as the JEV stand-in.

`eval/verify_prose.py` is the guard that matters. It reads
`figures/eval-results.json` and re-checks every numeric claim made in the
Results section, exiting non-zero on a mismatch, so the prose and the data
cannot drift apart.

## Usage

```python
from huggingface_hub import hf_hub_download

pdf = hf_hub_download(
    repo_id="ctaxnagomi/dgui-hypermem-whitepaper",
    filename="DGUI_HYPERMEM_Technical_Whitepaper.pdf",
    repo_type="dataset",
)
```

## Citation

```bibtex
@misc{dgui_hypermem_2026,
  title        = {{DGUI-HyperMem}: A Reasoning-Augmented Hybrid Memory Service
                  for {LLM} Agents on Serverless Infrastructure},
  author       = {Wan Mohd Azizi bin Wan Hosen},
  year         = {2026},
  note         = {CTECX Development \& Research -- Technical Whitepaper},
  url          = {https://huggingface.co/datasets/ctaxnagomi/dgui-hypermem-whitepaper}
}
```

## Related

- `ctaxnagomi/DGUI_HYPERMEM-JEV` — the reasoning corpus the service exports:
  every judgement it makes, redacted at enqueue, with the instruction, input and
  answer of a real decision. That corpus is what makes the judgement stage
  trainable rather than merely written.
- `github.com/ctaxnagomi/dgui-hypermem` — the service itself (MIT, self-hostable).
- `ctaxnagomi/deckergui-hub-net-whitepaper` — the DeckerGUI ecosystem
  architecture paper.